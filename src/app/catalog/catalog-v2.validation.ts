import { Catalog, Manifest, catalogCounts } from './catalog.models';
import { relativePath } from './catalog.validation';

type Row = Record<string, unknown>;
function check(value: unknown, label: string): asserts value {
  if (!value) throw Error('Invalid v2 catalogue: ' + label);
}
function object(value: unknown): Row {
  check(value && typeof value === 'object' && !Array.isArray(value), 'expected object');
  return value as Row;
}
function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): Row {
  const row = object(value);
  check(
    required.every(key => Object.hasOwn(row, key)) &&
      Object.keys(row).every(key => [...required, ...optional].includes(key)),
    'record fields',
  );
  return row;
}
function text(value: unknown): string {
  check(typeof value === 'string' && value.trim().length > 0, 'nonempty text');
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result), 'identity format');
  return result;
}
function nullable(value: unknown): string | null {
  return value === null ? null : text(value);
}
function strings(value: unknown, minimum = 0): string[] {
  check(Array.isArray(value) && value.length >= minimum, 'list');
  const result = value.map(text);
  check(new Set(result).size === result.length, 'duplicate list value');
  return result;
}
function choice(value: unknown, values: readonly string[]): string {
  const result = text(value);
  check(values.includes(result), 'unsupported enum');
  return result;
}
function date(value: unknown): void {
  const result = text(value);
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(result) &&
      Number.isFinite(Date.parse(result)) &&
      new Date(result).toISOString().slice(0, 10) === result,
    'calendar date',
  );
}
function timestamp(value: unknown): void {
  const result = text(value);
  date(result.slice(0, 10));
  check(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(result) &&
      Number.isFinite(Date.parse(result)),
    'timestamp',
  );
}
function https(value: unknown, allowNull = true): URL | null {
  if (allowNull && value === null) return null;
  const input = text(value),
    url = new URL(input);
  check(
    input === input.trim() && url.protocol === 'https:' && !!url.hostname && !url.username && !url.password,
    'HTTPS URL required',
  );
  return url;
}
function logo(row: Row): void {
  if (row['logoPath'] !== undefined)
    check(
      /^assets\/logos\/(stations|networks)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(webp|png)$/.test(text(row['logoPath'])),
      'logo path',
    );
}
const files: Record<string, string> = {
  networks: 'networks.json',
  stations: 'stations.json',
  locations: 'locations.json',
  languages: 'languages.json',
  categories: 'categories.json',
  sources: 'sources.json',
  stationMigrations: 'station-migrations.json',
  discoveryStations: 'discovery-stations.json',
  broadcasters: 'broadcasters.json',
  programmeThemes: 'programme-themes.json',
  browseIndex: 'browse-index.json',
  artists: 'artists.json',
};
const optionalFiles = ['broadcasters', 'programmeThemes', 'browseIndex', 'artists'];
const countKeys = [
  'networks',
  'stations',
  'locations',
  'streams',
  'verifiedStreams',
  'discoveryStations',
  'discoverableStations',
  'stationsWithStreamCandidates',
  'productionEligibleStations',
];
export function v2Manifest(value: unknown): Manifest {
  const m = shape(value, [
    'schemaVersion',
    'catalogVersion',
    'publishedOn',
    'defaultLocale',
    'locales',
    'countries',
    'counts',
    'files',
    'localizationRoot',
    'disclaimer',
  ]);
  check(
    m['schemaVersion'] === 2 && /^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text(m['catalogVersion'])),
    'schema/version',
  );
  date(m['publishedOn']);
  text(m['disclaimer']);
  check(
    m['defaultLocale'] === 'en' &&
      JSON.stringify(m['locales']) === JSON.stringify(['en', 'ta', 'sa']) &&
      m['localizationRoot'] === 'i18n/',
    'locales',
  );
  check(
    strings(m['countries']).every(code => /^[A-Z]{2}$/.test(code)),
    'countries',
  );
  const counts = shape(m['counts'], countKeys);
  for (const key of countKeys) check(Number.isSafeInteger(counts[key]) && Number(counts[key]) >= 0, 'count ' + key);
  const refs = shape(
    m['files'],
    Object.keys(files).filter(key => !optionalFiles.includes(key)),
    optionalFiles,
  );
  for (const [key, file] of Object.entries(refs)) {
    check(file === files[key], 'file ' + key);
    relativePath('https://catalog.invalid/v2/', text(file));
  }
  return value as Manifest;
}
function table(value: unknown, key = 'id'): Map<string, Row> {
  check(Array.isArray(value), 'table');
  const result = new Map<string, Row>();
  for (const valueRow of value) {
    const row = object(valueRow),
      identity = key === 'id' ? id(row[key]) : text(row[key]);
    check(!result.has(identity), 'duplicate ' + key);
    result.set(identity, row);
  }
  return result;
}
function ref(rows: Map<string, Row>, value: unknown): Row {
  const result = rows.get(text(value));
  check(result, 'unknown reference ' + String(value));
  return result;
}
function refs(value: unknown, rows: Map<string, Row>, minimum = 0): string[] {
  const result = strings(value, minimum);
  result.forEach(key => ref(rows, key));
  return result;
}
const stationFields = [
  'id',
  'name',
  'networkId',
  'countryCode',
  'regionId',
  'districtId',
  'localityId',
  'broadcastLanguages',
  'genres',
  'delivery',
  'coverage',
  'listingStatus',
  'frequencyMHz',
  'website',
  'sourceIds',
  'notes',
];
const stationOptional = ['languageProfile', 'geographyEvidence', 'programmeThemeIds', 'artistIds'];
function metadata(s: Row, sources: Map<string, Row>, languages: Map<string, Row>, themes: Map<string, Row>): void {
  const tags = strings(s['broadcastLanguages']);
  if (s['programmeThemeIds'] !== undefined) {
    const membership = refs(s['programmeThemeIds'], themes);
    check(!membership.length || strings(s['genres']).includes('devotional'), 'content theme genre');
  }
  if (s['geographyEvidence'] !== undefined) {
    const g = shape(s['geographyEvidence'], ['confidence', 'evidenceType', 'sourceIds', 'reviewedOn', 'notes']);
    choice(g['confidence'], ['high', 'medium', 'low', 'unknown']);
    choice(g['evidenceType'], [
      'publisher',
      'official',
      'directory-corroborated',
      'user-corroborated',
      'legacy-catalogue',
      'unknown',
    ]);
    refs(g['sourceIds'], sources, g['confidence'] === 'unknown' ? 0 : 1);
    date(g['reviewedOn']);
    text(g['notes']);
  }
  if (s['languageProfile'] === undefined) return;
  const p = shape(
    s['languageProfile'],
    ['classification', 'programmingPattern', 'coverage', 'primaryLanguage', 'sourceIds', 'reviewedOn', 'notes'],
    ['schedules'],
  );
  choice(p['classification'], ['single-language', 'multilingual', 'unknown']);
  choice(p['programmingPattern'], ['continuous', 'mixed', 'scheduled', 'unknown']);
  choice(p['coverage'], ['complete', 'partial', 'unknown']);
  const evidence = refs(p['sourceIds'], sources, p['classification'] === 'unknown' ? 0 : 1);
  date(p['reviewedOn']);
  text(p['notes']);
  if (p['primaryLanguage'] !== null) {
    ref(languages, p['primaryLanguage']);
    check(tags.includes(text(p['primaryLanguage'])), 'primary language');
  }
  check(
    (p['classification'] !== 'single-language' || tags.length === 1) &&
      (tags.length <= 1 || p['classification'] === 'multilingual') &&
      (p['coverage'] !== 'complete' || tags.length > 0),
    'language classification',
  );
  if (p['schedules'] === undefined) return;
  check(Array.isArray(p['schedules']), 'schedule array');
  const ids = new Set<string>();
  for (const value of p['schedules']) {
    const q = shape(value, [
      'id',
      'title',
      'languages',
      'days',
      'startLocal',
      'endLocal',
      'timeZone',
      'sourceIds',
      'reviewedOn',
    ]);
    const key = id(q['id']);
    check(!ids.has(key), 'duplicate programme schedule');
    ids.add(key);
    text(q['title']);
    check(
      strings(q['languages'], 1).every(code => tags.includes(code)),
      'schedule languages',
    );
    const days = q['days'];
    check(
      Array.isArray(days) &&
        days.length > 0 &&
        new Set(days).size === days.length &&
        days.every(day => Number.isInteger(day) && day >= 1 && day <= 7),
      'schedule days',
    );
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    check(
      time.test(text(q['startLocal'])) &&
        time.test(text(q['endLocal'])) &&
        q['startLocal'] !== q['endLocal'] &&
        p['programmingPattern'] === 'scheduled',
      'schedule times',
    );
    check(
      refs(q['sourceIds'], sources, 1).every(
        key => evidence.includes(key) && /^(publisher|official)(-|$)/.test(text(ref(sources, key)['kind'])),
      ),
      'schedule provenance',
    );
    date(q['reviewedOn']);
    const zone = text(q['timeZone']);
    check(zone.includes('/'), 'IANA timezone');
    new Intl.DateTimeFormat('en', { timeZone: zone });
  }
}
export function validateV2(value: unknown): Catalog {
  const raw = object(value),
    manifest = v2Manifest(raw['manifest']);
  const networks = table(raw['networks']),
    locations = table(raw['locations']),
    languages = table(raw['languages'], 'code'),
    categories = table(raw['categories']),
    sources = table(raw['sources']),
    stations = table(raw['stations']),
    discovery = table(raw['discoveryStations']);
  for (const key of ['broadcasters', 'programmeThemes', 'artists']) {
    check(manifest.files[key] ? Array.isArray(raw[key]) : raw[key] === undefined, 'advertised ' + key);
  }
  const broadcasters = table(raw['broadcasters'] ?? []),
    themes = table(raw['programmeThemes'] ?? []),
    artists = table(raw['artists'] ?? []);
  for (const row of sources.values()) {
    shape(row, ['id', 'title', 'url', 'kind', 'notes']);
    text(row['title']);
    text(row['kind']);
    text(row['notes']);
    https(row['url']);
  }
  for (const row of languages.values()) {
    shape(row, ['code', 'name', 'nativeName']);
    check(/^[a-z]{2,3}$/.test(text(row['code'])), 'language code');
    text(row['name']);
    text(row['nativeName']);
  }
  for (const row of categories.values()) {
    shape(row, ['id', 'name']);
    text(row['name']);
  }
  for (const b of broadcasters.values()) {
    shape(b, ['id', 'name', 'aliases', 'website', 'sourceIds', 'reviewedOn', 'notes']);
    id(b['id']);
    text(b['name']);
    strings(b['aliases']);
    https(b['website'], false);
    refs(b['sourceIds'], sources, 1);
    date(b['reviewedOn']);
    text(b['notes']);
  }
  for (const t of themes.values()) {
    shape(t, ['id', 'name', 'description']);
    id(t['id']);
    text(t['name']);
    text(t['description']);
  }
  for (const a of artists.values()) {
    shape(a, ['id', 'name', 'aliases']);
    id(a['id']);
    text(a['name']);
    strings(a['aliases']);
  }
  for (const n of networks.values()) {
    shape(
      n,
      ['id', 'name', 'aliases', 'countryCodes', 'kind', 'website'],
      ['logoPath', 'broadcasterId', 'broadcasterSourceIds', 'broadcasterRelationship'],
    );
    text(n['name']);
    strings(n['aliases']);
    check(
      strings(n['countryCodes'], 1).every(code => manifest.countries.includes(code)),
      'network country',
    );
    choice(n['kind'], ['public', 'broadcaster', 'online']);
    https(n['website']);
    logo(n);
    if (['broadcasterId', 'broadcasterSourceIds', 'broadcasterRelationship'].some(key => key in n)) {
      check(
        ['broadcasterId', 'broadcasterSourceIds', 'broadcasterRelationship'].every(key => Object.hasOwn(n, key)),
        'sourced broadcaster relationship',
      );
      ref(broadcasters, n['broadcasterId']);
      refs(n['broadcasterSourceIds'], sources, 1);
      choice(n['broadcasterRelationship'], ['public-broadcaster', 'licensed-operator', 'publisher-operator']);
    }
  }
  const levels = ['country', 'state', 'district', 'locality'];
  const chain = (key: string): Row[] => {
    const result: Row[] = [],
      seen = new Set<string>();
    let next: string | null = key;
    while (next) {
      check(!seen.has(next), 'geographic cycle');
      seen.add(next);
      const node = ref(locations, next);
      result.unshift(node);
      next = nullable(node['parentId']);
    }
    return result;
  };
  const countries = new Set<string>();
  for (const l of locations.values()) {
    shape(l, ['id', 'name', 'type', 'parentId', 'countryCode']);
    text(l['name']);
    const type = choice(l['type'], levels),
      country = text(l['countryCode']);
    check(manifest.countries.includes(country), 'location country');
    if (type === 'country') {
      check(l['parentId'] === null && l['id'] === country.toLowerCase() && !countries.has(country), 'country root');
      countries.add(country);
    } else {
      const parent = ref(locations, l['parentId']);
      check(
        parent['countryCode'] === country &&
          (type === 'locality'
            ? ['country', 'state', 'district'].includes(text(parent['type']))
            : parent['type'] === levels[levels.indexOf(type) - 1]),
        'geographic hierarchy',
      );
    }
    check(chain(text(l['id']))[0]['type'] === 'country', 'geographic ancestry');
  }
  check(
    manifest.countries.every(country => countries.has(country)),
    'country roots',
  );
  const programmeNames = new Map<string, string>(),
    streamIds = new Set<string>(),
    streamUrls = new Set<string>();
  for (const [isDiscovery, rows] of [
    [false, stations],
    [true, discovery],
  ] as const)
    for (const s of rows.values()) {
      shape(
        s,
        [...stationFields, ...(isDiscovery ? ['aliases', 'availability', 'reviewedOn', 'websiteKind'] : ['streams'])],
        [...stationOptional, ...(isDiscovery ? [] : ['aliases', 'logoPath'])],
      );
      const key = id(s['id']);
      check(!isDiscovery || !stations.has(key), 'duplicate station ID');
      const name = text(s['name']);
      const n = ref(networks, s['networkId']);
      check(
        manifest.countries.includes(text(s['countryCode'])) &&
          strings(n['countryCodes']).includes(text(s['countryCode'])),
        'station network/country',
      );
      const aliases = s['aliases'] === undefined ? [] : strings(s['aliases']);
      for (const label of [name, ...aliases]) {
        const identity = text(s['networkId']) + '|' + label.normalize('NFKC').trim().toLowerCase();
        check(!programmeNames.has(identity) || programmeNames.get(identity) === key, 'duplicate programme identity');
        programmeNames.set(identity, key);
      }
      for (const [field, type] of [
        ['regionId', 'state'],
        ['districtId', 'district'],
        ['localityId', 'locality'],
      ])
        if (nullable(s[field]) !== null) {
          const l = ref(locations, s[field]);
          check(l['type'] === type && l['countryCode'] === s['countryCode'], 'station location type/country');
        }
      const ancestry = chain(
        text(s['localityId'] ?? s['districtId'] ?? s['regionId'] ?? text(s['countryCode']).toLowerCase()),
      );
      check(ancestry[0]['countryCode'] === s['countryCode'], 'station country ancestry');
      for (const [field, type] of [
        ['regionId', 'state'],
        ['districtId', 'district'],
        ['localityId', 'locality'],
      ])
        check((ancestry.find(l => l['type'] === type)?.['id'] ?? null) === s[field], 'station ancestry');
      refs(s['broadcastLanguages'], languages);
      refs(s['genres'], categories, 1);
      refs(s['sourceIds'], sources, isDiscovery ? 1 : 0);
      choice(s['delivery'], ['fm', 'am', 'online']);
      choice(s['coverage'], ['local', 'regional', 'national', 'global']);
      choice(s['listingStatus'], ['candidate', 'reviewed']);
      check(
        s['frequencyMHz'] === null ||
          (typeof s['frequencyMHz'] === 'number' &&
            Number.isFinite(s['frequencyMHz']) &&
            s['frequencyMHz'] >= 65 &&
            s['frequencyMHz'] <= 110),
        'frequency',
      );
      const website = https(s['website']);
      nullable(s['notes']);
      metadata(s, sources, languages, themes);
      if (s['artistIds'] !== undefined) {
        refs(s['artistIds'], artists, 1);
        check(strings(s['genres']).includes('artist-hits'), 'artist membership category');
      }
      if (isDiscovery) {
        choice(s['availability'], ['no-direct-stream', 'temporarily-unavailable', 'review-pending']);
        date(s['reviewedOn']);
        if (!website) check(s['websiteKind'] === null, 'discovery website kind');
        else {
          choice(s['websiteKind'], ['official', 'provider']);
          const host = website.hostname.toLowerCase().replace(/\.$/, '');
          check(
            !website.search &&
              !/\.(mp3|m3u8|aac)(\/|$)/i.test(website.pathname) &&
              !/\/(api|proxy|webdio)(\/|$)/i.test(website.pathname) &&
              host.includes('.') &&
              !host.includes(':') &&
              !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
              !['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa', 'onion', 'invalid'].some(
                suffix => host === suffix || host.endsWith('.' + suffix),
              ),
            'public discovery website',
          );
        }
        continue;
      }
      logo(s);
      check(Array.isArray(s['streams']) && s['streams'].length > 0, 'nonempty stream collection');
      for (const valueStream of s['streams']) {
        const stream = shape(
          valueStream,
          ['id', 'url', 'format', 'verificationStatus', 'lastVerifiedAt', 'sourceId', 'rightsStatus'],
          ['directListening'],
        );
        const streamId = id(stream['id']);
        check(!streamIds.has(streamId), 'duplicate stream ID');
        streamIds.add(streamId);
        const url = https(stream['url'], false)!;
        check(!streamUrls.has(url.href), 'duplicate programme stream URL');
        streamUrls.add(url.href);
        ref(sources, stream['sourceId']);
        choice(stream['format'], ['mp3', 'aac', 'hls', 'unknown']);
        const verification = choice(stream['verificationStatus'], ['verified', 'unverified', 'unavailable']);
        choice(stream['rightsStatus'], ['unconfirmed', 'permission-granted']);
        if (stream['lastVerifiedAt'] !== null) timestamp(stream['lastVerifiedAt']);
        check(verification !== 'verified' || stream['lastVerifiedAt'] !== null, 'verified timestamp');
        check(verification !== 'unverified' || stream['lastVerifiedAt'] === null, 'unverified timestamp');
        if (stream['directListening'] !== undefined) {
          const d = shape(stream['directListening'], [
            'status',
            'reviewedAt',
            'sourceId',
            'notes',
            'recording',
            'redistribution',
          ]);
          choice(d['status'], ['needs-review', 'restricted', 'allowed']);
          timestamp(d['reviewedAt']);
          ref(sources, d['sourceId']);
          text(d['notes']);
          choice(d['recording'], ['unconfirmed', 'prohibited', 'permission-granted']);
          choice(d['redistribution'], ['unconfirmed', 'prohibited', 'permission-granted']);
        }
      }
    }
  const migrations = shape(raw['stationMigrations'], ['schemaVersion', 'removed']);
  check(migrations['schemaVersion'] === 1 && Array.isArray(migrations['removed']), 'migration document format');
  const removed = new Set<string>();
  for (const valueMigration of migrations['removed']) {
    const m = shape(valueMigration, ['oldId', 'canonicalId', 'sourceId', 'reason']);
    const old = id(m['oldId']);
    check(!removed.has(old) && !stations.has(old), 'removed station identity');
    removed.add(old);
    text(m['reason']);
    if (m['canonicalId'] === null) check(m['sourceId'] === null, 'unavailable migration provenance');
    else {
      ref(stations, m['canonicalId']);
      ref(sources, m['sourceId']);
    }
  }
  const localization = shape(raw['localization'], manifest.locales);
  for (const locale of manifest.locales) {
    const dictionary = object(localization[locale]);
    check(Object.keys(dictionary).length, 'empty localization');
    for (const section of Object.values(dictionary))
      check(
        Object.values(object(section)).every(v => typeof v === 'string'),
        'translation text',
      );
  }
  text(object(object(localization['en'])['catalog'])['title']);
  const c = value as Catalog,
    counts = catalogCounts(c);
  const expected: Record<string, number> = {
    networks: networks.size,
    stations: stations.size,
    locations: locations.size,
    streams: streamIds.size,
    verifiedStreams: c.stations.flatMap(s => s.streams).filter(s => s.verificationStatus === 'verified').length,
    discoveryStations: discovery.size,
    discoverableStations: counts.discoverable,
    stationsWithStreamCandidates: counts.candidates,
    productionEligibleStations: counts.approved,
  };
  for (const key of countKeys)
    check(object(raw['manifest'])['counts'] && object(manifest.counts)[key] === expected[key], 'count mismatch ' + key);
  // Index payloads are hints. Canonical validation and whole-snapshot caching never trust them.
  const { browseIndex, ...canonical } = raw;
  void browseIndex;
  return canonical as unknown as Catalog;
}
