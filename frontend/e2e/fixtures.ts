import { test as base, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildTestImage } from './build-test-image';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
type PilotApp = { origin: string; signupUrl: string; addSaveableSet: () => void };

export const test = base.extend<object, { appImage: string; pilot: PilotApp }>({
  appImage: [
    async ({ browserName }, provide) => {
      const prebuiltImage = process.env.REVUE_APP_IMAGE;
      if (prebuiltImage) {
        await provide(prebuiltImage);
        return;
      }

      const image = `revue-e2e-app:${browserName}-${randomUUID()}`;
      const removeImage = buildTestImage(image);
      try {
        await provide(image);
      } finally {
        removeImage();
      }
    },
    { scope: 'worker', timeout: 600_000 },
  ],
  pilot: [
    async ({ appImage, browserName }, provide, worker) => {
      const project = `revue-e2e-${browserName}-${randomUUID().slice(0, 12)}`;
      const environment = {
        ...process.env,
        REVUE_APP_IMAGE: appImage,
        REVUE_E2E_DB_PASSWORD: randomBytes(32).toString('base64url'),
      };
      mkdirSync(worker.project.outputDir, { recursive: true });
      const log = join(worker.project.outputDir, `${project}.log`);

      function compose(args: string[], input?: string): string {
        try {
          return execFileSync(
            'docker',
            ['compose', '--file', 'frontend/e2e/compose.yaml', '--project-name', project, ...args],
            {
              cwd: ROOT,
              env: environment,
              input,
              encoding: 'utf8',
              timeout: 600_000,
              maxBuffer: 10 * 1024 * 1024,
            },
          );
        } catch (error) {
          if (error instanceof Error && 'output' in error) appendFileSync(log, String(error.output));
          throw new Error(`Disposable E2E stack failed. See ${log}`, { cause: error });
        }
      }

      try {
        appendFileSync(log, compose(['up', '--no-build', '--detach', '--wait', '--wait-timeout', '120']));
        const address = compose(['port', 'app', '8080']).trim();
        if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('E2E app must bind only to loopback');
        const origin = `http://${address}`;
        await expect
          .poll(
            async () => {
              try {
                const response = await fetch(`${origin}/api/v1/public-sets`, { signal: AbortSignal.timeout(2000) });
                const sets: unknown = await response.json();
                return response.ok && Array.isArray(sets) && sets.length > 0;
              } catch {
                return false;
              }
            },
            { timeout: 60_000, message: 'The production app and starter catalog become ready' },
          )
          .toBe(true);

        let saveableSetAdded = false;

        await provide({
          origin,
          signupUrl: `${origin}/register`,
          addSaveableSet() {
            if (saveableSetAdded) return;
            compose(
              ['exec', '-T', 'db', 'psql', '-U', 'e2e', '-d', 'e2e', '-v', 'ON_ERROR_STOP=1'],
              `
            insert into sets(set_key,title,description,publisher_name,subject,save_allowed,created_at,updated_at)
            values ('published-test-set','Published test set','A test publication.','Revue','History',true,now(),now())
            on conflict (set_key) do nothing;
            insert into cards(set_id,content_key,position,question,answer,explanation,source,created_at,updated_at)
            select id,'published-test-card',0,'Test question','Test answer','','',now(),now()
            from sets where set_key = 'published-test-set'
            on conflict (content_key) do nothing;
          `,
            );
            saveableSetAdded = true;
          },
        });
      } finally {
        try {
          appendFileSync(log, compose(['logs', '--no-color', '--tail', '150']));
        } finally {
          compose(['down', '--volumes', '--remove-orphans']);
        }
      }
    },
    { scope: 'worker', timeout: 600_000 },
  ],
  baseURL: async ({ pilot }, provide) => {
    await provide(pilot.origin);
  },
});

export { expect } from '@playwright/test';

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign out of Revue?' }).getByRole('button', { name: 'Sign out' }).click();
}
