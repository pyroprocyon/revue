import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const publicDir = new URL('../public/', import.meta.url);
const mark = readFileSync(new URL('favicon.svg', publicDir), 'utf8');
const outputDir = new URL('icons/', publicDir);
mkdirSync(outputDir, { recursive: true });

// Apple and Android apply their own masks. The Android maskable mark needs extra padding.
const icons = [
  { name: 'apple-touch-icon', size: 180, extent: 0.79, radius: 0 },
  { name: 'revue-192', size: 192, extent: 0.79, radius: 220 },
  { name: 'revue-512', size: 512, extent: 0.79, radius: 220 },
  { name: 'revue-maskable-512', size: 512, extent: 0.7, radius: 0 },
];

for (const { name, size, extent, radius } of icons) {
  const side = 1024 * extent;
  const inset = (1024 - side) / 2;
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="background" gradientUnits="userSpaceOnUse" x1="160" y1="0" x2="850" y2="1024">
        <stop stop-color="#fffdf9"/>
        <stop offset=".56" stop-color="#faf9f6"/>
        <stop offset="1" stop-color="#edeaf6"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="${radius}" fill="url(#background)"/>
    <g transform="translate(${inset} ${inset}) scale(${side / 32})">${mark}</g>
  </svg>`;
  const png = new Resvg(artwork).render().asPng();
  writeFileSync(new URL(`${name}.png`, outputDir), png);
}
