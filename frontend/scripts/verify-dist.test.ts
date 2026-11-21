import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { publicFiles, verifyDist } from './verify-dist.mjs';

let root: string;
let dist: string;
let publicDir: string;
const chunk = 'assets/main-12345678.js';
const manifest = { 'index.html': { file: chunk, isEntry: true } };
const homepage = `<script type="module" src="/${chunk}"></script>`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'revue-dist-'));
  dist = join(root, 'dist');
  publicDir = join(root, 'public');
  for (const dir of [dist, publicDir]) {
    for (const name of publicFiles) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), '');
    }
  }
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, chunk), '');
  await writeFile(join(dist, 'index.html'), homepage);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each([
  ['gz', gzipSync],
  ['br', brotliCompressSync],
] as const)('requires the .%s representation to decode to the current plain file', async (suffix, compress) => {
  const encoded = join(dist, 'index.html.' + suffix);
  await writeFile(encoded, compress(homepage));
  await verifyDist(dist, publicDir, manifest);
  await writeFile(encoded, compress('old homepage'));
  await expect(verifyDist(dist, publicDir, manifest)).rejects.toThrow('Compressed bytes differ');
});

it('rejects a hashed-looking asset absent from the manifest', async () => {
  await writeFile(join(dist, 'assets/extra-12345678.js'), '');
  await expect(verifyDist(dist, publicDir, manifest)).rejects.toThrow('Unexpected frontend output');
});

it('requires every declared asset to be present', async () => {
  await rm(join(dist, chunk));
  await expect(verifyDist(dist, publicDir, manifest)).rejects.toThrow('Missing frontend output');
});

it('requires a JavaScript entry for index.html', async () => {
  await rm(join(dist, chunk));
  await expect(verifyDist(dist, publicDir, {})).rejects.toThrow('Missing Vite entry');
});

it.each([
  '<script type="module" src="/assets/old.js"></script>',
  `<!-- ${homepage} -->`,
  `<base href="https://elsewhere.invalid/">${homepage}`,
])('requires the homepage to load its declared local module', async (html) => {
  await writeFile(join(dist, 'index.html'), html);
  await expect(verifyDist(dist, publicDir, manifest)).rejects.toThrow('entry script');
});

it('rejects trailing bytes after a complete Brotli stream', async () => {
  const encoded = Buffer.concat([brotliCompressSync(homepage), Buffer.from('extra bytes')]);
  await writeFile(join(dist, 'index.html.br'), encoded);
  await expect(verifyDist(dist, publicDir, manifest)).rejects.toThrow('Trailing bytes');
});

it('rejects a Vite relative-base build on a direct set visit', async () => {
  await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
  await writeFile(join(root, 'main.js'), 'document.title = "Set";');
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--manifest', '--base=./'], {
    cwd: root,
  });
  const gate = spawnSync(process.execPath, [resolve('scripts/precompress.mjs'), 'dist'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(gate.stderr).toContain('entry script from /sets/published-test-set');
  expect(gate.status).toBe(1);
});
