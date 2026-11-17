import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const root = path.resolve(process.argv[2] || 'www');
assert.equal(
  existsSync(path.join(root, 'assets/catalog-development-seed.json')),
  false,
  'Production must not publish the development seed',
);
const files = directory =>
  readdirSync(directory).flatMap(name => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
let checked = 0;
for (const file of files(root).filter(file => /\.(js|json)$/.test(file))) {
  assert.doesNotMatch(
    readFileSync(file, 'utf8'),
    /Tamilosai FM|Christian Samy FM|offline-example|catalog-development-seed\.json/,
    `Catalogue fixture leaked into ${file}`,
  );
  checked++;
}
assert.match(readFileSync(path.join(root, 'index.html'), 'utf8'), /<base href="\/radio-bee\/">/);
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const socialImageUrl = 'https://actionanand.github.io/radio-bee/assets/social/radio-bee-og.png';
assert.ok(html.includes(`property="og:image" content="${socialImageUrl}"`), 'Missing absolute OG image URL');
assert.ok(html.includes(`name="twitter:image" content="${socialImageUrl}"`), 'Missing Twitter Card image URL');
assert.match(html, /name="twitter:card" content="summary_large_image"/);
assert.match(html, /property="og:title" content="RadioBee - Stay tuned\. Stay buzzing\."/);
const ogImagePath = path.join(root, 'assets/social/radio-bee-og.png');
assert.ok(existsSync(ogImagePath), 'Social preview image missing from production assets');
const ogImage = readFileSync(ogImagePath);
assert.equal(ogImage.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'OG image must be PNG');
assert.equal(ogImage.readUInt32BE(16), 1200, 'OG image width must be 1200');
assert.equal(ogImage.readUInt32BE(20), 630, 'OG image height must be 630');
assert.ok(ogImage.length < 600_000, 'OG image must remain below 600 KB');
console.log(
  `Production artifact: ${checked} JS/JSON files checked; no expanded/minimal seed or test inventory; Pages base href correct.`,
);
