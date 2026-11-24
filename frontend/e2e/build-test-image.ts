import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function buildTestImage() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const prebuiltImage = process.env.REVUE_APP_IMAGE;
  if (prebuiltImage) {
    execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', prebuiltImage], {
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: 30_000,
    });
    return;
  }

  const image = `revue-e2e-app:${randomUUID()}`;
  const mavenHome = process.env.MAVEN_USER_HOME || join(homedir(), '.m2');
  const wrapperDists = join(mavenHome, 'wrapper', 'dists');
  const args = ['buildx', 'build', '--load', '--progress=plain', '--tag', image];

  if (existsSync(wrapperDists)) args.push('--build-context', `maven-wrapper-dists=${wrapperDists}`);
  execFileSync('docker', [...args, '.'], { cwd: root, stdio: 'inherit', timeout: 600_000 });
  process.env.REVUE_APP_IMAGE = image;

  return () => {
    execFileSync('docker', ['image', 'rm', image], { cwd: root, stdio: 'inherit', timeout: 30_000 });
  };
}
