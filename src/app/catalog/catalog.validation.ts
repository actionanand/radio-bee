import { Catalog, Manifest } from './catalog.models';
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
  let streams = 0;
  let verified = 0;
  const streamIds = new Set<string>();
  for (const s of table('stations').values()) {
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
