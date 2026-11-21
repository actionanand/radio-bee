import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
export const SITE_URL = 'https://actionanand.github.io/radio-bee/';
// Public section entry points only. Station details and individual facets keep Angular's 404 fallback.
export const SHARE_ROUTES = Object.freeze([
  'home',
  'world',
  'languages',
  'genres',
  'artists',
  'networks',
  'broadcasters',
  'favorites',
  'settings',
  'listen-now',
  'privacy',
  'terms',
  'copyright-policy',
  'contact',
]);
const decode = value =>
  value.replace(
    /&(?:amp|quot|apos|lt|gt|#39);/g,
    entity =>
      ({
        '&amp;': '&',
        '&quot;': '"',
        '&apos;': "'",
        '&#39;': "'",
        '&lt;': '<',
        '&gt;': '>',
      })[entity],
  );
function attributes(tag) {
  const result = new Map();
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const key = match[1].toLowerCase();
    assert.ok(!result.has(key), `Duplicate HTML attribute: ${key}`);
    result.set(key, decode(match[2] ?? match[3]));
  }
  return result;
}
export function staticMetadata(html) {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1];
  assert.ok(head, 'Missing static document head');
  const markup = head.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const meta = new Map();
  for (const tag of markup.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag),
      key = attrs.get('property') ?? attrs.get('name');
    if (!key) continue;
    assert.ok(!meta.has(key), `Duplicate metadata: ${key}`);
    meta.set(key, attrs.get('content')?.trim() ?? '');
  }
  const canonicals = (markup.match(/<link\b[^>]*>/gi) ?? []).map(attributes).filter(a => a.get('rel') === 'canonical');
  assert.equal(canonicals.length, 1, 'Expected exactly one canonical URL');
  assert.equal(canonicals[0].get('href'), SITE_URL, 'Canonical must use the shared RadioBee brand URL');
  for (const key of [
    'description',
    'og:type',
    'og:site_name',
    'og:title',
    'og:description',
    'og:url',
    'og:image',
    'og:image:secure_url',
    'og:image:type',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
    'twitter:card',
    'twitter:title',
    'twitter:description',
    'twitter:image',
  ]) {
    assert.ok(meta.get(key), `Missing static metadata: ${key}`);
  }
  assert.equal(meta.get('og:url'), SITE_URL, 'Open Graph URL must match canonical');
  assert.equal(meta.get('og:type'), 'website');
  assert.equal(meta.get('og:site_name'), 'RadioBee');
  assert.ok(['summary', 'summary_large_image'].includes(meta.get('twitter:card')), 'Invalid Twitter card');
  assert.equal(meta.get('twitter:title'), meta.get('og:title'), 'Conflicting brand titles');
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(markup)?.[1];
  assert.equal(decode(title?.trim() ?? ''), meta.get('og:title'), 'Document and OG titles must match');
  assert.equal(meta.get('og:image:secure_url'), meta.get('og:image'), 'Conflicting secure image URL');
  assert.equal(meta.get('twitter:image'), meta.get('og:image'), 'Every preview must use the same brand image');
  assert.match(html, /<base\s+href=["']\/radio-bee\/["']\s*\/?\s*>/i, 'Wrong Pages base href');
  assert.doesNotMatch(meta.get('robots') ?? '', /\b(?:none|noimageindex|nosnippet)\b/i, 'Restrictive crawler metadata');
  return meta;
}
export function checkBrandImage(root, meta) {
  const site = new URL(SITE_URL),
    url = new URL(meta.get('og:image'));
  assert.equal(url.protocol, 'https:', 'Social image must use HTTPS');
  assert.equal(url.origin, site.origin, 'Social image must be part of this deployment');
  assert.ok(!url.username && !url.password && !url.hash, 'Invalid social image URL');
  const pathname = decodeURIComponent(url.pathname);
  assert.ok(pathname.startsWith(site.pathname), 'Social image outside Pages site');
  const relative = pathname.slice(site.pathname.length);
  assert.ok(relative && !relative.includes('\\') && !relative.split('/').includes('..'), 'Unsafe image path');
  const base = realpathSync(root),
    file = realpathSync(path.resolve(base, relative));
  assert.ok(file.startsWith(base + path.sep), 'Image escapes the artifact');
  const size = statSync(file).size;
  assert.ok(size > 1000 && size < 600000, 'Social image must be nontrivial and below the conservative 600 KB budget');
  const bytes = readFileSync(file);
  assert.equal(meta.get('og:image:type'), 'image/png', 'Unsupported social image type: expected the PNG brand asset');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Image is not PNG');
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR', 'Missing PNG dimensions');
  assert.equal(bytes.subarray(-8, -4).toString(), 'IEND', 'Truncated PNG');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  for (const key of ['og:image:width', 'og:image:height'])
    assert.match(meta.get(key), /^[1-9]\d*$/, 'Invalid declared image dimension');
  assert.equal(Number(meta.get('og:image:width')), width, 'Declared image width differs from PNG');
  assert.equal(Number(meta.get('og:image:height')), height, 'Declared image height differs from PNG');
  assert.ok(width >= 300 && height >= 200 && width / height <= 4, 'Social image dimensions are too small or too wide');
  return { url: url.href, path: relative, type: 'image/png', width, height, bytes: size };
}
export function checkSocialArtifacts(root) {
  const index = readFileSync(path.join(root, 'index.html'), 'utf8'),
    meta = staticMetadata(index);
  assert.equal(
    readFileSync(path.join(root, '404.html'), 'utf8'),
    index,
    'Angular 404 fallback must preserve the compiled app shell',
  );
  for (const route of SHARE_ROUTES) {
    const html = readFileSync(path.join(root, route, 'index.html'), 'utf8');
    assert.equal(html, index, `Share route /${route}/ must preserve the compiled Angular shell and metadata`);
    staticMetadata(html);
  }
  const listing = JSON.parse(readFileSync(path.join(root, 'social-routes.json'), 'utf8'));
  assert.deepEqual(
    listing,
    { version: 1, brandUrl: SITE_URL, routes: SHARE_ROUTES },
    'Incorrect share-route artifact manifest',
  );
  return { ...checkBrandImage(root, meta), routes: SHARE_ROUTES.length };
}
