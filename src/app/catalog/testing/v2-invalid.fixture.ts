// Mutation recipes only: the authoritative station inventory is the generated v2 fixture.
type Row = Record<string, unknown>;
export type Snapshot = Record<string, unknown>;
export const object = (value: unknown) => value as Row;
export const rows = (snapshot: Snapshot, key: string) => snapshot[key] as Row[];
const manifest = (c: Snapshot) => object(c['manifest']);
const counts = (c: Snapshot) => object(manifest(c)['counts']);
const streams = (c: Snapshot, index = 0) => rows(c, 'stations')[index]['streams'] as Row[];
const station = (c: Snapshot) => rows(c, 'stations')[0];
const sibling = (c: Snapshot) =>
  rows(c, 'stations').find(s => s['networkId'] === station(c)['networkId'] && s['id'] !== station(c)['id'])!;
export interface Corruption {
  name: string;
  mutate: (c: Snapshot) => void;
  cache?: boolean;
}
export const corruptions: Corruption[] = [
  {
    name: 'duplicate stream IDs',
    cache: true,
    mutate: c => {
      streams(c, 1)[0]['id'] = streams(c)[0]['id'];
    },
  },
  {
    name: 'HTTP station website',
    cache: true,
    mutate: c => {
      station(c)['website'] = 'http://broadcaster.example/listen';
    },
  },
  {
    name: 'missing publication date',
    cache: true,
    mutate: c => {
      delete manifest(c)['publishedOn'];
    },
  },
  {
    name: 'impossible calendar date',
    mutate: c => {
      manifest(c)['publishedOn'] = '2026-02-30';
    },
  },
  {
    name: 'migration to unknown station',
    cache: true,
    mutate: c => {
      object((object(c['stationMigrations'])['removed'] as unknown[])[0])['canonicalId'] = 'missing-station';
    },
  },
  {
    name: 'network country conflict',
    cache: true,
    mutate: c => {
      rows(c, 'networks').find(n => n['id'] === station(c)['networkId'])!['countryCodes'] = ['GB'];
    },
  },
  {
    name: 'duplicate programme names',
    cache: true,
    mutate: c => {
      sibling(c)['name'] = String(station(c)['name']).toUpperCase();
    },
  },
  {
    name: 'programme name collides with later alias',
    mutate: c => {
      station(c)['aliases'] = [String(sibling(c)['name']).toUpperCase()];
    },
  },
  {
    name: 'programme alias collides with prior name',
    mutate: c => {
      sibling(c)['aliases'] = [station(c)['name']];
    },
  },
  {
    name: 'duplicate discovery programme',
    mutate: c => {
      const d = rows(c, 'discoveryStations').find(s => s['networkId'] === station(c)['networkId'])!;
      d['name'] = station(c)['name'];
    },
  },
  {
    name: 'shared URL across programme identities',
    mutate: c => {
      streams(c, 1)[0]['url'] = streams(c)[0]['url'];
    },
  },
  {
    name: 'wrong schema version',
    mutate: c => {
      manifest(c)['schemaVersion'] = 1;
    },
  },
  {
    name: 'invalid semantic version',
    mutate: c => {
      manifest(c)['catalogVersion'] = '2.future';
    },
  },
  {
    name: 'missing disclaimer',
    mutate: c => {
      delete manifest(c)['disclaimer'];
    },
  },
  {
    name: 'unknown manifest field',
    mutate: c => {
      manifest(c)['debug'] = true;
    },
  },
  {
    name: 'duplicate countries',
    mutate: c => {
      (manifest(c)['countries'] as unknown[]).push('IN');
    },
  },
  {
    name: 'unsupported default locale',
    mutate: c => {
      manifest(c)['defaultLocale'] = 'ta';
    },
  },
  {
    name: 'duplicate locale list',
    mutate: c => {
      manifest(c)['locales'] = ['en', 'ta', 'sa', 'en'];
    },
  },
  {
    name: 'swapped canonical files',
    mutate: c => {
      object(manifest(c)['files'])['stations'] = 'sources.json';
    },
  },
  {
    name: 'foreign version reference',
    mutate: c => {
      object(manifest(c)['files'])['stations'] = '../v1/stations.json';
    },
  },
  {
    name: 'unknown advertised file',
    mutate: c => {
      object(manifest(c)['files'])['research'] = 'stations.json';
    },
  },
  {
    name: 'invalid optional reference',
    mutate: c => {
      object(manifest(c)['files'])['broadcasters'] = 'networks.json';
    },
  },
  {
    name: 'unsafe locale root',
    mutate: c => {
      manifest(c)['localizationRoot'] = '../i18n/';
    },
  },
  {
    name: 'unknown count field',
    mutate: c => {
      counts(c)['debug'] = 1;
    },
  },
  {
    name: 'incorrect candidate count',
    cache: true,
    mutate: c => {
      counts(c)['stationsWithStreamCandidates'] = 0;
    },
  },
  {
    name: 'incorrect approved count',
    mutate: c => {
      counts(c)['productionEligibleStations'] = 71;
    },
  },
  {
    name: 'duplicate source ID',
    mutate: c => {
      rows(c, 'sources')[1]['id'] = rows(c, 'sources')[0]['id'];
    },
  },
  {
    name: 'missing source title',
    mutate: c => {
      rows(c, 'sources')[0]['title'] = '';
    },
  },
  {
    name: 'HTTP source URL',
    mutate: c => {
      rows(c, 'sources')[0]['url'] = 'http://example.com';
    },
  },
  {
    name: 'unknown station provenance',
    mutate: c => {
      station(c)['sourceIds'] = ['missing'];
    },
  },
  {
    name: 'duplicate languages',
    mutate: c => {
      station(c)['broadcastLanguages'] = ['ta', 'ta'];
    },
  },
  {
    name: 'missing language native name',
    mutate: c => {
      rows(c, 'languages')[0]['nativeName'] = '';
    },
  },
  {
    name: 'invalid frequency',
    mutate: c => {
      station(c)['frequencyMHz'] = -1;
    },
  },
  {
    name: 'invalid listing status',
    mutate: c => {
      station(c)['listingStatus'] = 'published';
    },
  },
  {
    name: 'credentials in website',
    mutate: c => {
      station(c)['website'] = 'https://user:pass@example.com';
    },
  },
  {
    name: 'empty stream collection',
    mutate: c => {
      station(c)['streams'] = [];
    },
  },
  {
    name: 'HTTP stream URL',
    mutate: c => {
      streams(c)[0]['url'] = 'http://example.com/live.mp3';
    },
  },
  {
    name: 'credentials in stream URL',
    mutate: c => {
      streams(c)[0]['url'] = 'https://user:pass@example.com/live.mp3';
    },
  },
  {
    name: 'unsupported stream format',
    mutate: c => {
      streams(c)[0]['format'] = 'html';
    },
  },
  {
    name: 'invalid rights enum',
    mutate: c => {
      streams(c)[0]['rightsStatus'] = 'approved';
    },
  },
  {
    name: 'missing stream provenance',
    mutate: c => {
      streams(c)[0]['sourceId'] = 'missing';
    },
  },
  {
    name: 'missing verified timestamp',
    mutate: c => {
      const s = streams(c)[0];
      s['verificationStatus'] = 'verified';
      s['lastVerifiedAt'] = null;
    },
  },
  {
    name: 'unverified stream with timestamp',
    mutate: c => {
      const s = streams(c)[0];
      s['verificationStatus'] = 'unverified';
      s['lastVerifiedAt'] = '2026-11-10T00:00:00Z';
    },
  },
  {
    name: 'invalid direct-listening timestamp',
    mutate: c => {
      object(streams(c)[0]['directListening'])['reviewedAt'] = 'yesterday';
    },
  },
  {
    name: 'invalid direct-listening notes',
    mutate: c => {
      object(streams(c)[0]['directListening'])['notes'] = '';
    },
  },
  {
    name: 'wrong geographic parent level',
    mutate: c => {
      const d = rows(c, 'locations').find(l => l['type'] === 'district')!;
      d['parentId'] = 'in';
    },
  },
  {
    name: 'geographic cycle',
    mutate: c => {
      const d = rows(c, 'locations').find(l => l['type'] === 'state')!;
      d['parentId'] = d['id'];
    },
  },
  {
    name: 'conflicting explicit state ancestry',
    mutate: c => {
      station(c)['regionId'] = 'in-mh';
    },
  },
  {
    name: 'district field points to a country',
    mutate: c => {
      station(c)['districtId'] = 'in';
    },
  },
  {
    name: 'unadvertised broadcaster payload',
    mutate: c => {
      delete object(manifest(c)['files'])['broadcasters'];
    },
  },
  {
    name: 'missing advertised broadcaster registry',
    mutate: c => {
      delete c['broadcasters'];
    },
  },
  {
    name: 'HTTP broadcaster website',
    mutate: c => {
      rows(c, 'broadcasters')[0]['website'] = 'http://example.com';
    },
  },
  {
    name: 'missing broadcaster relationship evidence',
    mutate: c => {
      delete rows(c, 'networks').find(n => n['broadcasterId'])!['broadcasterSourceIds'];
    },
  },
  {
    name: 'unknown broadcaster relationship',
    mutate: c => {
      rows(c, 'networks').find(n => n['broadcasterId'])!['broadcasterId'] = 'missing';
    },
  },
  {
    name: 'duplicate programme theme ID',
    mutate: c => {
      rows(c, 'programmeThemes')[1]['id'] = rows(c, 'programmeThemes')[0]['id'];
    },
  },
  {
    name: 'unknown content theme',
    mutate: c => {
      station(c)['programmeThemeIds'] = ['missing'];
    },
  },
  {
    name: 'content theme without devotional genre',
    mutate: c => {
      station(c)['genres'] = ['music'];
      station(c)['programmeThemeIds'] = [rows(c, 'programmeThemes')[0]['id']];
    },
  },
  {
    name: 'invalid profile classification',
    mutate: c => {
      object(station(c)['languageProfile'])['classification'] = 'bilingual';
    },
  },
  {
    name: 'undocumented primary language',
    mutate: c => {
      object(station(c)['languageProfile'])['primaryLanguage'] = 'zzz';
    },
  },
  {
    name: 'missing profile review date',
    mutate: c => {
      delete object(station(c)['languageProfile'])['reviewedOn'];
    },
  },
  {
    name: 'empty sourced language profile',
    mutate: c => {
      object(station(c)['languageProfile'])['sourceIds'] = [];
    },
  },
  {
    name: 'contradictory language classification',
    mutate: c => {
      const s = rows(c, 'stations').find(s => (s['broadcastLanguages'] as unknown[]).length > 1)!;
      object(s['languageProfile'])['classification'] = 'single-language';
    },
  },
  {
    name: 'unknown geography provenance',
    mutate: c => {
      object(station(c)['geographyEvidence'])['sourceIds'] = ['missing'];
    },
  },
  {
    name: 'discovery record contains streams',
    mutate: c => {
      rows(c, 'discoveryStations')[0]['streams'] = [];
    },
  },
  {
    name: 'discovery record contains an audio listening link',
    mutate: c => {
      const s = rows(c, 'discoveryStations')[0];
      s['website'] = 'https://example.com/live.mp3';
      s['websiteKind'] = 'official';
    },
  },
  {
    name: 'discovery site points to localhost',
    mutate: c => {
      const s = rows(c, 'discoveryStations')[0];
      s['website'] = 'https://localhost';
      s['websiteKind'] = 'official';
    },
  },
  {
    name: 'discovery has no source evidence',
    mutate: c => {
      rows(c, 'discoveryStations')[0]['sourceIds'] = [];
    },
  },
  {
    name: 'duplicate removed station mapping',
    mutate: c => {
      const m = object(c['stationMigrations'])['removed'] as unknown[];
      m.push(structuredClone(m[0]));
    },
  },
  {
    name: 'migration old ID still playable',
    mutate: c => {
      object((object(c['stationMigrations'])['removed'] as unknown[])[0])['oldId'] = station(c)['id'];
    },
  },
  {
    name: 'migration to a removed chain',
    mutate: c => {
      const m = object(c['stationMigrations'])['removed'] as Row[];
      m[0]['canonicalId'] = m[1]['oldId'];
    },
  },
  {
    name: 'migration unavailable but has provenance',
    mutate: c => {
      const m = object(c['stationMigrations'])['removed'] as Row[];
      m[0]['canonicalId'] = null;
      m[0]['sourceId'] = rows(c, 'sources')[0]['id'];
    },
  },
  {
    name: 'empty English localization',
    mutate: c => {
      object(c['localization'])['en'] = {};
    },
  },
  {
    name: 'missing English title',
    mutate: c => {
      object(object(object(c['localization'])['en'])['catalog'])['title'] = '';
    },
  },
  {
    name: 'nontext Tamil translation',
    mutate: c => {
      object(object(object(c['localization'])['ta'])['catalog'])['title'] = 42;
    },
  },
];
for (const key of [
  'networks',
  'stations',
  'locations',
  'streams',
  'verifiedStreams',
  'discoveryStations',
  'discoverableStations',
  'stationsWithStreamCandidates',
  'productionEligibleStations',
]) {
  corruptions.push({
    name: 'missing count ' + key,
    mutate: c => {
      delete counts(c)[key];
    },
  });
  for (const invalid of [-1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])
    corruptions.push({
      name: `invalid count ${key}: ${String(invalid)}`,
      mutate: c => {
        counts(c)[key] = invalid;
      },
    });
}

corruptions.push({
  name: 'malformed unused registry identity',
  mutate: c => {
    rows(c, 'categories').push({ id: 'not an id', name: 'Unused' });
  },
});
corruptions.push({
  name: 'HTTP network website',
  mutate: c => {
    rows(c, 'networks')[0]['website'] = 'http://example.com';
  },
});

corruptions.push({
  name: 'empty source provenance notes',
  mutate: c => {
    rows(c, 'sources')[0]['notes'] = '';
  },
});
