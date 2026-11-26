import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ACCOUNT_PATH,
  NEW_DECK_PATH,
  PUBLISHED_PATH,
  REVIEW_TOPIC_ROUTE,
  START_TOPIC_ROUTE,
  TODAY_PATH,
} from '../src/shared/navigation/paths.ts';
import { SIGNED_IN_HINT_KEY } from '../src/shared/navigation/signedInHint.ts';

const pages = {
  [ACCOUNT_PATH]: 'features/account/presentation/AccountPage',
  [NEW_DECK_PATH]: 'features/catalog/presentation/NewDeckPage',
  [PUBLISHED_PATH]: 'features/catalog/presentation/PublishedPage',
  [REVIEW_TOPIC_ROUTE]: 'features/study/presentation/ReviewPage',
  [START_TOPIC_ROUTE]: 'features/study/presentation/ReviewPage',
  [TODAY_PATH]: 'features/study/presentation/TodayOverview',
};

function moduleFiles(manifest, entry, visited = new Set()) {
  if (visited.has(entry)) return visited;
  const chunk = manifest[entry];
  if (!chunk) throw new Error(`Missing startup chunk ${entry}`);
  visited.add(entry);
  for (const imported of chunk.imports ?? []) moduleFiles(manifest, imported, visited);
  return visited;
}

function preloadRoute(routes, signedInHint) {
  try {
    if (localStorage.getItem(signedInHint) !== 'true') return;
  } catch {
    return;
  }
  const path = location.pathname.replace(/\/$/, '').toLowerCase();
  const match = routes.find(([pattern]) => new RegExp(pattern).test(path));
  if (!match) return;
  for (const href of match[1]) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.fetchPriority = 'low';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.append(link);
  }
}

export async function writeWorkspacePreloader(dist, manifest) {
  const indexPath = join(dist, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const marker = '<!-- workspace-preloads -->';
  if (!html.includes(marker)) return;
  const initial = moduleFiles(manifest, 'index.html');
  const routes = Object.entries(pages).map(([path, source]) => {
    const pattern = path.replace(':topic', '(?:deck|set)-[1-9][0-9]{0,18}');
    const modules = moduleFiles(manifest, `src/${source}.tsx`).difference(initial);
    return [`^${pattern}$`, [...modules].map((id) => `/${manifest[id].file}`)];
  });
  const script = `(${preloadRoute.toString()})(${JSON.stringify(routes)},${JSON.stringify(SIGNED_IN_HINT_KEY)});\n`;
  await writeFile(indexPath, html.replace(marker, `<script>${script}</script>`));
}
