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
console.log(
  `Production artifact: ${checked} JS/JSON files checked; no expanded/minimal seed or test inventory; Pages base href correct.`,
);
