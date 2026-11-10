import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const root = path.resolve(process.argv[2] || '/mnt/c/AR_Files/code/radio-bee-data/dist/v2');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const manifest = read('index.json');
if (manifest.schemaVersion !== 2) throw Error('Expected actual v2 build');
const snapshot = {
  manifest,
  localization: Object.fromEntries(['en', 'ta', 'sa'].map(l => [l, read(`i18n/${l}.json`)])),
};
for (const [key, file] of Object.entries(manifest.files)) snapshot[key] = read(file);
const json = JSON.stringify(snapshot);
const hash = createHash('sha256').update(json).digest('hex');
writeFileSync(
  'src/app/catalog/testing/v2.fixture.ts',
  `// GENERATED test-only actual v2 snapshot; SHA256 ${hash}. Never application data.\nexport const v2Fixture: unknown = ${json};\n`,
);
