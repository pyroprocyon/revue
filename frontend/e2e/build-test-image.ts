import { execFileSync } from 'node:child_process';
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
  execFileSync('docker', ['buildx', 'build', '--load', '--progress=plain', '--tag', image, '.'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600_000,
  });

  return () => {
    execFileSync('docker', ['image', 'rm', image], { cwd: ROOT, stdio: 'inherit', timeout: 30_000 });
  };
}
