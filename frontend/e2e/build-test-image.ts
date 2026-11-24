import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default function checkPrebuiltTestImage() {
  const prebuiltImage = process.env.REVUE_APP_IMAGE;
  if (prebuiltImage) {
    execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', prebuiltImage], {
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: 30_000,
    });
  }
}

export function buildTestImage(image: string) {
  const mavenHome = process.env.MAVEN_USER_HOME || join(homedir(), '.m2');
  const wrapperDists = join(mavenHome, 'wrapper', 'dists');
  const args = ['buildx', 'build', '--load', '--progress=plain', '--tag', image];

  if (existsSync(wrapperDists)) args.push('--build-context', `maven-wrapper-dists=${wrapperDists}`);
  execFileSync('docker', [...args, '.'], { cwd: ROOT, stdio: 'inherit', timeout: 600_000 });

  return () => {
    execFileSync('docker', ['image', 'rm', image], { cwd: ROOT, stdio: 'inherit', timeout: 30_000 });
  };
}
