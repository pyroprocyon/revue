// Writes .br and .gz copies next to each text file in the production build. Spring Boot serves a
// copy when the browser accepts it (backend StaticResourceConfig), so the small server CPU never
// compresses a file on each request. `npm run build` runs this after `vite build`.
//
// Plain Node and its zlib module, so the build needs no compression plugin and the app's
// type checking needs no Node types.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const textFile = /\.(?:css|html|js|json|map|mjs|svg|txt|webmanifest|xml)$/;

const buildDir = process.argv[2];
if (!buildDir) {
  console.error('Usage: node scripts/precompress.mjs <build folder>');
  process.exit(1);
}

const entries = await readdir(buildDir, { recursive: true, withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && textFile.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name));

let copies = 0;
await Promise.all(
  files.map(async (file) => {
    const source = await readFile(file);
    const [br, gz] = await Promise.all([
      brotliAsync(source, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
        },
      }),
      gzipAsync(source, { level: constants.Z_BEST_COMPRESSION }),
    ]);
    // A copy that isn't smaller than the file would only waste bytes.
    if (br.length < source.length) {
      await writeFile(`${file}.br`, br);
      copies += 1;
    }
    if (gz.length < source.length) {
      await writeFile(`${file}.gz`, gz);
      copies += 1;
    }
  }),
);
console.log(`Wrote ${copies} compressed copies of ${files.length} files in ${buildDir}.`);
