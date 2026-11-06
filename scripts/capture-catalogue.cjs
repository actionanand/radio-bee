// Read a public catalogue into a client-local aggregate for reproducible review. Never edits the data checkout.
const fs = require('fs'),
  path = require('path');
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const base = 'https://actionanand.github.io/radio-bee-data/v1/';
const output = path.resolve(process.argv[2] || 'tmp/stage6-catalogue.json');
if (!output.startsWith(path.resolve('tmp') + path.sep)) throw Error('Output must stay in client tmp/');
async function get(file) {
  if (!/^[a-z0-9./-]+\.json$/.test(file) || file.split('/').includes('..')) throw Error('Invalid catalogue path');
  const response = await fetch(new URL(file, base), { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!response.ok) throw Error(`Catalogue ${file}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  const manifest = await get('index.json');
  const names = ['networks', 'stations', 'locations', 'languages', 'categories', 'sources'];
  const values = await Promise.all(names.map(name => get(manifest.files[name])));
  const locales = ['en', 'ta', 'sa'];
  const dictionaries = await Promise.all(locales.map(locale => get(manifest.localizationRoot + locale + '.json')));
  const final = await get('index.json');
  if (JSON.stringify(manifest) !== JSON.stringify(final)) throw Error('Catalogue changed during capture; retry');
  const catalog = {
    manifest,
    ...Object.fromEntries(names.map((name, i) => [name, values[i]])),
    localization: Object.fromEntries(locales.map((locale, i) => [locale, dictionaries[i]])),
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
  console.log(
    `Captured ${manifest.catalogVersion}: ${catalog.stations.length} stations, ${catalog.stations.flatMap(station => station.streams).length} candidates`,
  );
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
