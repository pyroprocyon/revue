import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

export const publicFiles = new Set([
  'favicon.ico',
  'favicon.svg',
  'manifest.json',
  'fonts/inter-LICENSE.txt',
  'icons/apple-touch-icon.png',
  'icons/revue-192.png',
  'icons/revue-512.png',
  'icons/revue-maskable-512.png',
]);

async function inventory(dir) {
  const names = new Set();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) throw new Error(`Unexpected file type: ${entry.name}`);
    names.add(relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  return names;
}

export async function verifyDist(dist, publicDir, manifest) {
  const publicInput = await inventory(publicDir);
  if (publicInput.symmetricDifference(publicFiles).size) throw new Error('Public asset inventory changed');

  await verifyEntryScript(dist, manifest['index.html']);
  const expected = new Set([...publicFiles, 'index.html']);
  for (const { file, assets = [], css = [] } of Object.values(manifest)) {
    for (const name of [file, ...assets, ...css]) {
      if (!/^assets\/[^/]+\.(?:js|css|woff2)$/.test(name)) throw new Error(`Unexpected Vite asset: ${name}`);
      expected.add(name);
    }
  }

  const output = await inventory(dist);
  for (const name of expected) {
    if (!output.has(name)) throw new Error(`Missing frontend output: ${name}`);
  }
  await Promise.all([...output.difference(expected)].map((name) => verifyCompressed(dist, expected, name)));
}

async function verifyEntryScript(dist, entry) {
  if (!entry?.isEntry || !/^assets\/[^/]+\.js$/.test(entry.file)) throw new Error('Missing Vite entry for index.html');
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const origin = 'https://build.invalid';
  const expected = new URL(entry.file, origin).href;
  for (const route of ['/', '/sets/published-test-set']) {
    const { document } = new JSDOM(html, { url: new URL(route, origin).href }).window;
    const scripts = document.querySelectorAll('script[type="module"][src]');
    if (![...scripts].some((script) => script.src === expected))
      throw new Error(`Homepage does not load its entry script from ${route}`);
  }
}

async function verifyCompressed(dist, expected, name) {
  const plain = name.replace(/\.(?:gz|br)$/, '');
  if (!expected.has(plain)) throw new Error(`Unexpected frontend output: ${name}`);
  const [encoded, original] = await Promise.all([readFile(join(dist, name)), readFile(join(dist, plain))]);
  const decompress = name.endsWith('.gz') ? gunzipSync : brotliDecompressSync;
  const { buffer: decoded, engine } = decompress(encoded, { info: true });
  if (engine.bytesWritten !== encoded.length) throw new Error(`Trailing bytes in compressed file: ${name}`);
  if (!decoded.equals(original)) throw new Error(`Compressed bytes differ: ${name}`);
}
