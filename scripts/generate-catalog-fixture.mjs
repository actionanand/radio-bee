// Explicit one-way, test-only extraction from a validated data build. Never run by the app.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'linux') throw Error('Use WSL2 Linux Node');
const root = path.resolve(process.argv[2] || '../radio-bee-data/dist/v1');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const manifest = read('index.json');
const data = Object.fromEntries(
  ['networks', 'stations', 'locations', 'languages', 'categories', 'sources', 'discoveryStations'].map(key => [
    key,
    read(manifest.files[key]),
  ]),
);
const ids = [
  'suryan-coimbatore',
  'hello-coimbatore',
  'mirchi-coimbatore',
  'tamilosai-nagercoil',
  'isai-murasu-nagercoil',
  'christian-samy-fm',
  'annai-kuzhithurai',
  'asr-kanyakumari',
  'kumari-tamil-kanyakumari',
  'iskcon-nagercoil',
  'suryan-nagercoil',
  'hello-nagercoil',
];
const digest = createHash('sha256')
  .update(JSON.stringify({ manifest, ...data }))
  .digest('hex');
data.stations = data.stations.filter(s => ['air-nagercoil', 'sooriyan-srilanka', 'iskcon-nagercoil'].includes(s.id));
data.discoveryStations = data.discoveryStations.filter(s => ids.includes(s.id));
const rows = [...data.stations, ...data.discoveryStations];
data.networks = data.networks.filter(n => rows.some(s => s.networkId === n.id));
const locations = new Set(
  rows.flatMap(s => [s.countryCode.toLowerCase(), s.regionId, s.districtId, s.localityId]).filter(Boolean),
);
data.locations = data.locations.filter(l => locations.has(l.id));
const sources = new Set(
  rows.flatMap(s => [
    ...s.sourceIds,
    ...(s.streams || []).flatMap(x => [x.sourceId, x.directListening?.sourceId].filter(Boolean)),
  ]),
);
data.sources = data.sources.filter(s => sources.has(s.id));
manifest.counts = {
  ...manifest.counts,
  networks: data.networks.length,
  stations: data.stations.length,
  locations: data.locations.length,
  streams: data.stations.reduce((n, s) => n + s.streams.length, 0),
  verifiedStreams: data.stations.flatMap(s => s.streams).filter(s => s.verificationStatus === 'verified').length,
  discoveryStations: data.discoveryStations.length,
  discoverableStations: rows.length,
  stationsWithStreamCandidates: data.stations.length,
  productionEligibleStations: 0,
};
const localization = Object.fromEntries(
  ['en', 'ta', 'sa'].map(locale => [locale, read(`${manifest.localizationRoot}${locale}.json`)]),
);
for (const dictionary of Object.values(localization))
  for (const [section, entries] of Object.entries(dictionary)) {
    const selected =
      section === 'stations'
        ? new Set(rows.map(s => s.id))
        : section === 'regions'
          ? locations
          : section === 'networks'
            ? new Set(data.networks.map(n => n.id))
            : null;
    if (selected) dictionary[section] = Object.fromEntries(Object.entries(entries).filter(([id]) => selected.has(id)));
  }
writeFileSync(
  'src/app/catalog/testing/discovery-contract.fixture.ts',
  `// GENERATED test subset from radio-bee-data ${manifest.catalogVersion}; source SHA256 ${digest}.\n// Regenerate with scripts/generate-catalog-fixture.mjs; never edit station metadata here.\nexport const discoveryContractFixture: unknown = ${JSON.stringify({ manifest, ...data, localization }, null, 2)};\n`,
);
console.log(`Generated ${rows.length}-record test subset; production data remains authoritative.`);
