import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHARE_ROUTES, SITE_URL, staticMetadata, checkBrandImage } from './social-preview.mjs';
export function generateSocialPages(root = 'www') {
  const base = path.resolve(root),
    html = readFileSync(path.join(base, 'index.html'), 'utf8');
  // Validate before creating anything. These are copies of the real compiled app,
  // not redirects or crawler-only content. The existing absolute base preserves routing.
  checkBrandImage(base, staticMetadata(html));
  for (const route of SHARE_ROUTES) {
    const directory = path.join(base, route);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'index.html'), html);
  }
  writeFileSync(
    path.join(base, 'social-routes.json'),
    JSON.stringify({ version: 1, brandUrl: SITE_URL, routes: SHARE_ROUTES }, null, 2) + '\n',
  );
  console.log(
    `Pages share entries: ${SHARE_ROUTES.length} primary routes; station/facet details remain on Angular fallback.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
  generateSocialPages(process.argv[2] || 'www');
}
