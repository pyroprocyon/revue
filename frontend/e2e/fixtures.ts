import { test as base, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
type PilotApp = { origin: string; invitation: () => string };

export const test = base.extend<object, { pilot: PilotApp }>({
  pilot: [async ({ browserName }, provide, worker) => {
    const project = `revue-e2e-${browserName}-${randomUUID().slice(0, 12)}`;
    const environment = { ...process.env, REVUE_E2E_DB_PASSWORD: randomBytes(32).toString('base64url') };
    mkdirSync(worker.project.outputDir, { recursive: true });
    const log = join(worker.project.outputDir, `${project}.log`);

    function compose(args: string[], input?: string): string {
      try {
        return execFileSync('docker', ['compose', '--file', 'frontend/e2e/compose.yaml', '--project-name', project, ...args], {
          cwd: ROOT, env: environment, input, encoding: 'utf8', timeout: 600_000, maxBuffer: 10 * 1024 * 1024,
        });
      } catch (error) {
        if (error instanceof Error && 'output' in error) appendFileSync(log, String(error.output));
        throw new Error(`Disposable E2E stack failed. See ${log}`, { cause: error });
      }
    }

    try {
      appendFileSync(log, compose(['up', '--build', '--detach', '--wait', '--wait-timeout', '120']));
      const address = compose(['port', 'app', '8080']).trim();
      if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('E2E app must bind only to loopback');
      const origin = `http://${address}`;
      await expect.poll(async () => {
        try {
          const response = await fetch(`${origin}/api/v1/public-sets`, { signal: AbortSignal.timeout(2000) });
          const sets: unknown = await response.json();
          return response.ok && Array.isArray(sets) && sets.length > 0;
        } catch { return false; }
      }, { timeout: 60_000, message: 'The production app and starter catalog become ready' }).toBe(true);

      await provide({
        origin,
        invitation() {
          const token = randomBytes(32).toString('base64url');
          const digest = createHash('sha256').update(token).digest('hex');
          // Only generated UUID/digest values enter this SQL; no learner input is interpolated.
          compose(['exec', '-T', 'db', 'psql', '-U', 'e2e', '-d', 'e2e', '-v', 'ON_ERROR_STOP=1'],
            `insert into signup_invites(id,token_hash,created_at,expires_at) values ('${randomUUID()}','${digest}',now(),now()+interval '1 hour');`);
          return `${origin}/register#invite=${token}`;
        },
      });
    } finally {
      try { appendFileSync(log, compose(['logs', '--no-color', '--tail', '150'])); }
      finally { compose(['down', '--volumes', '--remove-orphans', '--rmi', 'local']); }
    }
  }, { scope: 'worker', timeout: 600_000 }],
  baseURL: async ({ pilot }, provide) => { await provide(pilot.origin); },
});

export { expect } from '@playwright/test';
