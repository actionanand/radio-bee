// Explicit one-way extraction from the validated data build; never run by the app or CI network checks.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const root = path.resolve(process.argv[2] || '../radio-bee-data/dist/v1');
const read = f => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const manifest = read('index.json');
const full = {
  manifest,
  ...Object.fromEntries(
    ['networks', 'stations', 'locations', 'languages', 'categories', 'sources', 'discoveryStations'].map(k => [
      k,
      read(manifest.files[k]),
    ]),
  ),
  localization: Object.fromEntries(['en', 'ta', 'sa'].map(l => [l, read(manifest.localizationRoot + l + '.json')])),
};
const hash = createHash('sha256').update(JSON.stringify(full)).digest('hex');
const data = structuredClone(full);
data.stations = data.stations.filter(s => !['IN', 'LK'].includes(s.countryCode));
data.discoveryStations = data.discoveryStations.filter(s => !['IN', 'LK'].includes(s.countryCode));
const rows = [...data.stations, ...data.discoveryStations],
  countries = new Set(rows.map(s => s.countryCode));
data.manifest.countries = data.manifest.countries.filter(c => countries.has(c));
data.networks = data.networks.filter(n => rows.some(s => s.networkId === n.id));
const geo = new Set(
  rows.flatMap(s => [s.countryCode.toLowerCase(), s.regionId, s.districtId, s.localityId]).filter(Boolean),
);
data.locations = data.locations.filter(l => geo.has(l.id));
const sources = new Set(
  rows.flatMap(s => [
    ...s.sourceIds,
    ...(s.streams || []).flatMap(x => [x.sourceId, x.directListening?.sourceId].filter(Boolean)),
  ]),
);
data.sources = data.sources.filter(s => sources.has(s.id));
Object.assign(data.manifest.counts, {
  networks: data.networks.length,
  stations: data.stations.length,
  locations: data.locations.length,
  streams: data.stations.reduce((n, s) => n + s.streams.length, 0),
  verifiedStreams: data.stations.flatMap(s => s.streams).filter(s => s.verificationStatus === 'verified').length,
  discoveryStations: data.discoveryStations.length,
  discoverableStations: rows.length,
  stationsWithStreamCandidates: data.stations.length,
  productionEligibleStations: 0,
});
for (const dict of Object.values(data.localization))
  for (const [section, entries] of Object.entries(dict)) {
    const ids =
      section === 'stations'
        ? new Set(rows.map(s => s.id))
        : section === 'regions'
          ? geo
          : section === 'networks'
            ? new Set(data.networks.map(n => n.id))
            : null;
    if (ids) dict[section] = Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id)));
  }
writeFileSync(
  'src/app/catalog/testing/worldwide-contract.fixture.ts',
  '// GENERATED from radio-bee-data ' +
    manifest.catalogVersion +
    '; source SHA256 ' +
    hash +
    '.\n// Regenerate with scripts/generate-worldwide-fixture.mjs; never hand-edit station metadata.\nexport const worldwideContractFixture: unknown = ' +
    JSON.stringify(data, null, 2) +
    ';\n',
);
console.log('Generated ' + rows.length + ' worldwide fixture rows from authoritative built data.');
