import { Catalog, Manifest, catalogCounts } from './catalog.models';
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid catalogue: ${message}`);
}
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value), 'expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function choice(value: unknown, values: string[]) {
  check(typeof value === 'string' && values.includes(value), 'unsupported enum');
}
function nullable(value: unknown) {
  check(value === null || text(value), 'expected nullable string');
}
function https(value: unknown) {
  if (value === null) return;
  check(text(value), 'URL');
  const url = new URL(value);
  check(url.protocol === 'https:' && !url.username && !url.password, 'HTTPS URL required');
}
export function relativePath(base: string, file: string): string {
  check(text(file) && !file.startsWith('/') && !file.includes('..') && !file.includes('\\'), 'unsafe manifest path');
  const root = new URL(base);
  const url = new URL(file, root);
  check(
    root.protocol === 'https:' && url.origin === root.origin && url.pathname.startsWith(root.pathname),
    'path outside catalogue',
  );
  return url.href;
}
export function validateManifest(value: unknown): Manifest {
  const m = record(value);
  check(m['schemaVersion'] === 1, 'unsupported schemaVersion');
  check(
    typeof m['catalogVersion'] === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(m['catalogVersion']),
    'catalogVersion',
  );
  check(
    typeof m['publishedOn'] === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(m['publishedOn']) &&
      Number.isFinite(Date.parse(m['publishedOn'])),
    'publishedOn',
  );
  check(strings(m['locales']) && ['en', 'ta', 'sa'].every(l => (m['locales'] as string[]).includes(l)), 'locales');
  check(m['defaultLocale'] === 'en' && strings(m['countries']), 'default locale / countries');
  const files = record(m['files']);
  for (const key of ['networks', 'stations', 'locations', 'languages', 'categories', 'sources']) {
    check(text(files[key]), `file ${key}`);
    relativePath('https://catalog.invalid/v1/', files[key]);
  }
  if (files['discoveryStations'] !== undefined) {
    check(files['discoveryStations'] === 'discovery-stations.json', 'discovery file');
    const discoveryCounts = record(m['counts']);
    for (const k of [
      'discoveryStations',
      'discoverableStations',
      'stationsWithStreamCandidates',
      'productionEligibleStations',
    ])
      check(Number.isSafeInteger(discoveryCounts[k]) && Number(discoveryCounts[k]) >= 0, 'discovery count ' + k);
  }
  check(text(m['localizationRoot']), 'localizationRoot');
  relativePath('https://catalog.invalid/v1/', m['localizationRoot']);
  const counts = record(m['counts']);
  for (const key of ['networks', 'stations', 'locations', 'streams', 'verifiedStreams'])
    check(Number.isSafeInteger(counts[key]) && Number(counts[key]) >= 0, `count ${key}`);
  return value as Manifest;
}
export function validateCatalog(value: unknown): Catalog {
  const data = record(value);
  const manifest = validateManifest(data['manifest']);
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  for (const key of ['networks', 'stations', 'locations', 'languages', 'categories', 'sources']) {
    const rows = data[key];
    check(Array.isArray(rows), key);
    const table = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const r = record(row);
      const id = r[key === 'languages' ? 'code' : 'id'];
      check(text(id) && !table.has(id), `duplicate/missing ${key} ID`);
      check(text(r[key === 'sources' ? 'title' : 'name']), `missing ${key} name`);
      table.set(id, r);
    }
    tables.set(key, table);
  }
  const table = (key: string) => tables.get(key)!;
  const ref = (key: string, id: unknown) => {
    check(text(id) && table(key).has(id), `${key} reference ${String(id)}`);
    return table(key).get(id)!;
  };
  for (const n of table('networks').values()) {
    check(n['logoPath'] === undefined || typeof n['logoPath'] === 'string', 'network logoPath');
    check(strings(n['aliases']) && strings(n['countryCodes']), 'network arrays');
    check(
      n['countryCodes'].every(c => manifest.countries.includes(c)),
      'network country',
    );
    choice(n['kind'], ['public', 'broadcaster', 'online']);
    https(n['website']);
  }
  for (const l of table('languages').values()) check(text(l['nativeName']), 'native language name');
  for (const s of table('sources').values()) {
    https(s['url']);
    check(text(s['kind']) && typeof s['notes'] === 'string', 'source fields');
  }
  const levels = ['country', 'state', 'district', 'locality'];
  for (const l of table('locations').values()) {
    choice(l['type'], levels);
    check(text(l['countryCode']) && manifest.countries.includes(l['countryCode']), 'location country');
    if (l['type'] === 'country') check(l['parentId'] === null, 'country parent');
    else {
      const parent = ref('locations', l['parentId']);
      check(
        parent['type'] === levels[levels.indexOf(String(l['type'])) - 1] && parent['countryCode'] === l['countryCode'],
        'location hierarchy',
      );
    }
  }
  const discovery = data['discoveryStations'] ?? [];
  check(Array.isArray(discovery), 'discovery stations');
  check(!discovery.length || !!manifest.files['discoveryStations'], 'unadvertised discovery');
  check(!manifest.files['discoveryStations'] || Array.isArray(data['discoveryStations']), 'missing discovery payload');
  const discoveryIds = new Set<string>(),
    names = new Map<string, string>();
  const identity = (network: unknown, name: string) =>
    String(network) + '|' + name.normalize('NFKC').trim().toLowerCase();
  for (const s of table('stations').values()) {
    names.set(identity(s['networkId'], String(s['name'])), String(s['id']));
    check(s['aliases'] === undefined || strings(s['aliases']), 'station aliases');
    for (const a of (s['aliases'] as string[] | undefined) ?? []) {
      const key = identity(s['networkId'], a);
      check(!names.has(key) || names.get(key) === s['id'], 'duplicate programme alias');
      names.set(key, String(s['id']));
    }
  }
  const fields = [
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
    'aliases',
    'availability',
    'reviewedOn',
    'websiteKind',
  ];
  const discoveryRecords = discovery.map((value): Record<string, unknown> => {
    const r = record(value);
    check(
      fields.every(k => Object.hasOwn(r, k)) && Object.keys(r).every(k => fields.includes(k)),
      'metadata-only discovery fields',
    );
    check(
      text(r['id']) &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r['id']) &&
        !discoveryIds.has(r['id']) &&
        !table('stations').has(r['id']),
      'duplicate discovery ID',
    );
    discoveryIds.add(r['id']);
    check(
      text(r['name']) && strings(r['aliases']) && new Set(r['aliases']).size === r['aliases'].length,
      'discovery aliases',
    );
    for (const name of [r['name'], ...r['aliases']]) {
      const k = identity(r['networkId'], name);
      check(!names.has(k) || names.get(k) === r['id'], 'duplicate programme alias');
      names.set(k, r['id']);
    }
    choice(r['availability'], ['no-direct-stream', 'temporarily-unavailable', 'review-pending']);
    check(
      text(r['reviewedOn']) &&
        /^\d{4}-\d{2}-\d{2}$/.test(r['reviewedOn']) &&
        Number.isFinite(Date.parse(r['reviewedOn'])),
      'discovery review date',
    );
    check(
      strings(r['sourceIds']) && r['sourceIds'].length > 0 && strings(r['genres']) && r['genres'].length > 0,
      'discovery provenance',
    );
    if (r['website'] === null) check(r['websiteKind'] === null, 'discovery website kind');
    else {
      https(r['website']);
      choice(r['websiteKind'], ['official', 'provider']);
      const url = new URL(String(r['website'])),
        host = url.hostname.toLowerCase().replace(/\.$/, '');
      check(
        !url.search &&
          !/\.(mp3|m3u8|aac)(\/|$)/i.test(url.pathname) &&
          !/\/(api|proxy|webdio)(\/|$)/i.test(url.pathname),
        'website is not audio/API',
      );
      check(
        host.includes('.') &&
          !host.includes(':') &&
          !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
          !['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa', 'onion', 'invalid'].some(
            n => host === n || host.endsWith('.' + n),
          ),
        'public discovery website',
      );
    }
    return { ...r, streams: [] };
  });
  let streams = 0;
  let verified = 0;
  const streamIds = new Set<string>();
  for (const s of [...table('stations').values(), ...discoveryRecords]) {
    check(s['logoPath'] === undefined || typeof s['logoPath'] === 'string', 'station logoPath');
    const network = ref('networks', s['networkId']);
    check(
      text(s['countryCode']) &&
        manifest.countries.includes(s['countryCode']) &&
        (network['countryCodes'] as string[]).includes(s['countryCode']),
      'station country',
    );
    let parent: unknown = [...table('locations').values()].find(
      l => l['type'] === 'country' && l['countryCode'] === s['countryCode'],
    )?.['id'];
    for (const [field, type] of [
      ['regionId', 'state'],
      ['districtId', 'district'],
      ['localityId', 'locality'],
    ]) {
      nullable(s[field]);
      if (s[field] !== null) {
        const location = ref('locations', s[field]);
        check(
          location['type'] === type && location['countryCode'] === s['countryCode'] && location['parentId'] === parent,
          'station hierarchy',
        );
      }
      parent = s[field];
    }
    for (const [field, target] of [
      ['broadcastLanguages', 'languages'],
      ['genres', 'categories'],
      ['sourceIds', 'sources'],
    ]) {
      check(strings(s[field]), field);
      for (const id of s[field]) ref(target, id);
    }
    choice(s['listingStatus'], ['candidate', 'reviewed']);
    choice(s['delivery'], ['fm', 'am', 'online']);
    choice(s['coverage'], ['local', 'regional', 'national', 'global']);
    check(
      s['frequencyMHz'] === null ||
        (typeof s['frequencyMHz'] === 'number' && Number.isFinite(s['frequencyMHz']) && s['frequencyMHz'] > 0),
      'frequency',
    );
    https(s['website']);
    nullable(s['notes']);
    check(Array.isArray(s['streams']), 'streams');
    for (const value of s['streams']) {
      const stream = record(value);
      check(text(stream['id']) && !streamIds.has(stream['id']), 'stream id');
      streamIds.add(stream['id']);
      https(stream['url']);
      check(text(stream['url']), 'stream URL');
      ref('sources', stream['sourceId']);
      choice(stream['format'], ['mp3', 'aac', 'hls', 'unknown']);
      choice(stream['verificationStatus'], ['verified', 'unverified', 'unavailable']);
      choice(stream['rightsStatus'], ['unconfirmed', 'permission-granted']);
      if (stream['directListening'] !== undefined) {
        const listening = record(stream['directListening']);
        choice(listening['status'], ['needs-review', 'restricted', 'allowed']);
        check(
          text(listening['reviewedAt']) && Number.isFinite(Date.parse(listening['reviewedAt'])),
          'listening review timestamp',
        );
        ref('sources', listening['sourceId']);
        check(text(listening['notes']), 'listening review notes');
        choice(listening['recording'], ['unconfirmed', 'prohibited', 'permission-granted']);
        choice(listening['redistribution'], ['unconfirmed', 'prohibited', 'permission-granted']);
      }
      nullable(stream['lastVerifiedAt']);
      if (stream['verificationStatus'] === 'verified') {
        check(
          text(stream['lastVerifiedAt']) && Number.isFinite(Date.parse(stream['lastVerifiedAt'])),
          'verification timestamp',
        );
        verified++;
      }
      streams++;
    }
  }
  for (const key of ['networks', 'stations', 'locations'] as const)
    check(table(key).size === manifest.counts[key], `incomplete ${key}`);
  check(streams === manifest.counts.streams && verified === manifest.counts.verifiedStreams, 'stream counts');
  if (manifest.files['discoveryStations']) {
    const counts = catalogCounts(value as Catalog);
    check(
      discovery.length === manifest.counts.discoveryStations &&
        counts.discoverable === manifest.counts.discoverableStations &&
        counts.candidates === manifest.counts.stationsWithStreamCandidates &&
        counts.approved === manifest.counts.productionEligibleStations,
      'discovery counts',
    );
  }
  const locales = record(data['localization']);
  for (const locale of ['en', 'ta', 'sa']) {
    const dictionary = record(locales[locale]);
    check(Object.keys(dictionary).length, 'empty localization');
    for (const section of Object.values(dictionary)) {
      const entries = record(section);
      check(
        Object.values(entries).every(v => typeof v === 'string'),
        'translation text',
      );
    }
  }
  check(text(record(record(locales['en'])['catalog'])['title']), 'English catalogue labels');
  return value as Catalog;
}
