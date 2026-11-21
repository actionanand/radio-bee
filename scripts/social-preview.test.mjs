import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { SHARE_ROUTES, SITE_URL, staticMetadata, checkSocialArtifacts } from './social-preview.mjs';
import { generateSocialPages } from './generate-social-pages.mjs';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const source = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8').replace(
  '<base href="/" />',
  '<base href="/radio-bee/" />',
);
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'radiobee-social-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'assets/icon'), { recursive: true });
  copyFileSync(
    new URL('../src/assets/icon/radio-bee.png', import.meta.url),
    path.join(root, 'assets/icon/radio-bee.png'),
  );
  writeFileSync(path.join(root, 'index.html'), source);
  writeFileSync(path.join(root, '404.html'), source);
  generateSocialPages(root);
  return root;
}
test('all agreed section pages preserve the actual shell and the same static brand metadata', t => {
  const root = fixture(t),
    result = checkSocialArtifacts(root);
  assert.equal(result.routes, 14);
  assert.equal(result.type, 'image/png');
  assert.equal(result.width, 1254);
  assert.equal(result.height, 1254);
  assert.equal(existsSync(path.join(root, 'radios')), false);
  assert.equal(existsSync(path.join(root, 'artists/specific-artist')), false);
  for (const route of SHARE_ROUTES) assert.equal(readFileSync(path.join(root, route, 'index.html'), 'utf8'), source);
});
test('every primary sidebar section and existing legal/contact page is covered', () => {
  const shell = readFileSync(new URL('../src/app/directory/directory-shell.ts', import.meta.url), 'utf8');
  for (const match of shell.matchAll(/path:\s*'\/([^']+)'/g))
    assert.ok(SHARE_ROUTES.includes(match[1]), `Missing sidebar route ${match[1]}`);
  for (const route of ['privacy', 'terms', 'copyright-policy', 'contact']) assert.ok(SHARE_ROUTES.includes(route));
});
for (const [name, change] of [
  ['missing OG title', s => s.replace(/<meta property="og:title"[^>]*>/, '')],
  ['duplicate OG title', s => s.replace('</head>', '<meta property="og:title" content="Other title"></head>')],
  [
    'JavaScript-only tags',
    s =>
      s.replace(
        /<meta property="og:title"[^>]*>/,
        '<script>const injected = `<meta property="og:title" content="RadioBee">`;</script>',
      ),
  ],
  [
    'wrong canonical',
    s => s.replace('rel="canonical" href="' + SITE_URL + '"', 'rel="canonical" href="https://example.com/"'),
  ],
  ['conflicting Twitter brand', s => s.replace(/(<meta name="twitter:title" content=")[^"]+/, '$1Other')],
  [
    'relative social image',
    s =>
      s.replace(
        /https:\/\/actionanand.github.io\/radio-bee\/assets\/icon\/radio-bee.png/g,
        'assets/icon/radio-bee.png',
      ),
  ],
  [
    'external image origin',
    s =>
      s.replace(
        /https:\/\/actionanand.github.io\/radio-bee\/assets\/icon\/radio-bee.png/g,
        'https://example.com/radio-bee/assets/icon/radio-bee.png',
      ),
  ],
  [
    'image outside site',
    s => s.replace(/\/radio-bee\/assets\/icon\/radio-bee.png/g, '/other/assets/icon/radio-bee.png'),
  ],
  [
    'wrong dimensions',
    s => s.replace('property="og:image:width" content="1254"', 'property="og:image:width" content="1200"'),
  ],
  [
    'invalid dimensions',
    s => s.replace('property="og:image:width" content="1254"', 'property="og:image:width" content="NaN"'),
  ],
  [
    'wrong image MIME type',
    s => s.replace('property="og:image:type" content="image/png"', 'property="og:image:type" content="image/jpeg"'),
  ],
  ['wrong routing base', s => s.replace('/radio-bee/" />', '/wrong/" />')],
])
  test(`rejects ${name} before publishing`, t => {
    const root = fixture(t),
      broken = change(source);
    assert.notEqual(broken, source, 'Test mutation must apply');
    writeFileSync(path.join(root, 'index.html'), broken);
    writeFileSync(path.join(root, '404.html'), broken);
    assert.throws(() => generateSocialPages(root));
  });
test('rejects a missing social image', t => {
  const root = fixture(t);
  rmSync(path.join(root, 'assets/icon/radio-bee.png'));
  assert.throws(() => checkSocialArtifacts(root));
});
test('rejects a file whose contents do not match image/png', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'assets/icon/radio-bee.png'), Buffer.alloc(2000));
  assert.throws(() => checkSocialArtifacts(root), /not PNG/);
});
test('rejects a truncated PNG and an oversized asset', t => {
  const root = fixture(t),
    file = path.join(root, 'assets/icon/radio-bee.png'),
    bytes = readFileSync(file);
  writeFileSync(file, bytes.subarray(0, bytes.length - 12));
  assert.throws(() => checkSocialArtifacts(root), /Truncated/);
  writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(600000)]));
  assert.throws(() => checkSocialArtifacts(root), /budget/);
});
test('rejects missing section pages, inconsistent metadata and a changed 404 fallback', t => {
  const root = fixture(t);
  rmSync(path.join(root, 'artists/index.html'));
  assert.throws(() => checkSocialArtifacts(root));
  generateSocialPages(root);
  writeFileSync(path.join(root, 'home/index.html'), source.replace('og:title', 'og:wrong'));
  assert.throws(() => checkSocialArtifacts(root));
  generateSocialPages(root);
  writeFileSync(path.join(root, '404.html'), 'wrong fallback');
  assert.throws(() => checkSocialArtifacts(root), /404 fallback/);
});
test('Pages and PR workflows generate and validate social pages before artifact publishing', () => {
  for (const filename of ['gh-pages.yml', 'pr-validation.yml']) {
    const workflow = readFileSync(new URL('../.github/workflows/' + filename, import.meta.url), 'utf8');
    assert.ok(workflow.includes('node scripts/generate-social-pages.mjs'));
    assert.ok(workflow.includes('node scripts/check-web-artifact.mjs'));
    assert.ok(workflow.includes('scripts/social-preview.test.mjs'));
    if (filename === 'gh-pages.yml')
      assert.ok(
        workflow.indexOf('node scripts/check-web-artifact.mjs') <
          workflow.indexOf('uses: actions/upload-pages-artifact@v4'),
      );
  }
});
test('static HTTP serves all agreed routes with a final 200 and keeps unknown/detail paths at 404', async t => {
  const root = fixture(t);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname.replace(/^\/radio-bee\//, '');
    let file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!url.pathname.endsWith('/')) return res.writeHead(301, { Location: url.pathname + '/' + url.search }).end();
      file = path.join(file, 'index.html');
    }
    if (!existsSync(file))
      return res.writeHead(404, { 'Content-Type': 'text/html' }).end(readFileSync(path.join(root, '404.html')));
    res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : 'text/html' }).end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/radio-bee/`;
  for (const route of SHARE_ROUTES) {
    const response = await fetch(base + route + '?language=ta');
    assert.equal(response.status, 200);
    assert.equal(staticMetadata(await response.text()).get('og:image'), staticMetadata(source).get('og:image'));
  }
  for (const route of ['radios/not-generated', 'artists/not-generated', 'does-not-exist'])
    assert.equal((await fetch(base + route)).status, 404);
  assert.equal((await fetch(base + 'assets/icon/radio-bee.png')).headers.get('content-type'), 'image/png');
});
