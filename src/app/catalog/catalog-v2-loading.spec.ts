import { corruptions } from './testing/v2-invalid.fixture';
import { TestBed } from '@angular/core/testing';
import { CATALOG_FETCH, CATALOG_RETRY_DELAYS, CATALOG_SEED_URL, CATALOG_STORAGE, CATALOG_URL, CatalogService } from './catalog.service';
import { v2Fixture } from './testing/v2.fixture';

describe('v2 snapshot loading', () => {
  const base = 'https://catalog.test/v2/';
  const key = 'radiobee.catalog.v2:' + base;
  let saved: Map<string, string>;
  let fail: string;
  let requests: string[];
  let snapshot: Record<string, unknown>;
  let transientHomeFailures: number;
  let transientManifestFailures: number;
  let permanentHomeFailure: boolean;
  beforeEach(() => {
    saved = new Map();
    fail = '';
    requests = [];
    transientHomeFailures = 0;
    transientManifestFailures = 0;
    permanentHomeFailure = false;
    snapshot = structuredClone(v2Fixture) as Record<string, unknown>;
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_URL, useValue: base },
        { provide: CATALOG_SEED_URL, useValue: null },
        { provide: CATALOG_RETRY_DELAYS, useValue: [0, 0, 0] },
        {
          provide: CATALOG_STORAGE,
          useValue: {
            get: async ({ key }: { key: string }) => ({ value: saved.get(key) ?? null }),
            set: async ({ key, value }: { key: string; value: string }) => {
              saved.set(key, value);
            },
          },
        },
        {
          provide: CATALOG_FETCH,
          useValue: async (url: string) => {
            requests.push(url);
            if (url.endsWith('/index.json') && transientManifestFailures-- > 0) throw Error('Offline');
            if (url.endsWith('/home-stations.json') && transientHomeFailures-- > 0) throw Error('Offline');
            if (url.endsWith('/home-stations.json') && permanentHomeFailure)
              throw Error('Catalogue host is not deployed (404).');
            if (fail === 'malformed-index' && url.endsWith('/browse-index.json'))
              throw new SyntaxError('Bad index JSON');
            if (fail && url.endsWith(fail)) throw Error('Offline');
            const manifest = snapshot['manifest'] as { files: Record<string, string> };
            if (url.endsWith('/home-stations.json')) {
              const ids = (snapshot['stations'] as { id: string }[]).slice(0, 13).map(s => s.id).reverse();
              return { schemaVersion: 2, count: ids.length, stationIds: ids };
            }
            if (url.endsWith('/index.json')) return structuredClone(manifest);
            const entry = Object.entries(manifest.files).find(([, file]) => url.endsWith('/' + file));
            if (entry) return structuredClone(snapshot[entry[0]]);
            const locale = url.split('/').at(-1)!.replace('.json', '');
            return structuredClone((snapshot['localization'] as Record<string, unknown>)[locale]);
          },
        },
      ],
    });
  });
  it('fetches advertised metadata and keeps v1 and v2 cache namespaces separate', async () => {
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(service.error()).toBe('');
    expect(service.catalog()?.stations).toHaveLength(71);
    expect(service.catalog()?.discoveryStations).toHaveLength(46);
    expect(service.catalog()?.broadcasters).toHaveLength(10);
    expect(requests.some(url => url.endsWith('/programme-themes.json'))).toBe(true);
    expect(saved.has(key)).toBe(true);
    expect([...saved.keys()].some(k => k.startsWith('radiobee.catalog.v1:'))).toBe(false);
  });
  it('loads the Home selection only from the API in its published order', async () => {
    const service = TestBed.inject(CatalogService);
    await service.start();
    const ids = (snapshot['stations'] as { id: string }[]).slice(0, 13).map(s => s.id).reverse();
    expect(requests).toContain(base + 'home-stations.json');
    expect(service.homeStationIds()).toEqual(ids);
    expect(service.catalog()?.stations).toHaveLength(71);
  });
  it('retries temporary Home API failures and uses the API order when a retry succeeds', async () => {
    transientHomeFailures = 2;
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(requests.filter(url => url.endsWith('/home-stations.json'))).toHaveLength(3);
    expect(service.homeStationIds()).toHaveLength(13);
    expect(service.homeSelectionWarning()).toBe('');
    expect(service.error()).toBe('');
  });
  it('retries a transient catalogue manifest request before reporting an empty Home', async () => {
    transientManifestFailures = 2;
    const service = TestBed.inject(CatalogService);
    await service.start();
    // First manifest: 3 attempts, and the final consistency check: 1.
    expect(requests.filter(url => url.endsWith('/index.json'))).toHaveLength(4);
    expect(service.catalog()?.stations).toHaveLength(71);
    expect(service.homeStationIds()).toHaveLength(13);
  });
  it('preserves last validated Home stations after three failed retries', async () => {
    const service = TestBed.inject(CatalogService);
    await service.start();
    const priorIds = service.homeStationIds();
    fail = 'home-stations.json';
    const priorRequests = requests.filter(url => url.endsWith('/home-stations.json')).length;
    await service.refresh();
    expect(requests.filter(url => url.endsWith('/home-stations.json'))).toHaveLength(priorRequests + 4);
    expect(service.error()).toBe('');
    expect(service.homeStationIds()).toEqual(priorIds);
    expect(service.homeSelectionWarning()).toContain('last successfully validated');
    expect(service.catalog()?.stations).toHaveLength(71);
    expect(JSON.parse(saved.get(key)!).homeStationIds).toEqual(priorIds);
  });
  it('shows no invented Home stations after all attempts fail on first launch', async () => {
    fail = 'home-stations.json';
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(requests.filter(url => url.endsWith('/home-stations.json'))).toHaveLength(4);
    expect(service.homeStationIds()).toEqual([]);
    expect(service.homeSelectionWarning()).toContain('Home');
    expect(service.catalog()?.stations).toHaveLength(71);
  });
  it('does not retry permanent Home HTTP errors', async () => {
    permanentHomeFailure = true;
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(requests.filter(url => url.endsWith('/home-stations.json'))).toHaveLength(1);
    expect(service.homeStationIds()).toEqual([]);
    expect(service.homeSelectionWarning()).toContain('Home');
  });
  it('restores last validated Home IDs from cache during an offline Android startup', async () => {
    const ids = (snapshot['stations'] as { id: string }[]).slice(0, 13).map(s => s.id).reverse();
    saved.set(key, JSON.stringify({
      catalog: snapshot, updatedAt: '2026-11-10T12:00:00Z', homeStationIds: ids,
    }));
    fail = 'index.json';
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(service.cached()).toBe(true);
    expect(service.homeStationIds()).toEqual(ids);
    expect(service.catalog()?.stations).toHaveLength(71);
  });
  it('ignores invalid cached Home IDs without discarding a valid catalogue', async () => {
    saved.set(key, JSON.stringify({
      catalog: snapshot, updatedAt: '2026-11-10T12:00:00Z', homeStationIds: ['made-up-station'],
    }));
    fail = 'index.json';
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(service.catalog()?.stations).toHaveLength(71);
    expect(service.homeStationIds()).toEqual([]);
    expect(service.storageWarning()).toBe('');
  });
  it('retains the complete previous snapshot when one advertised file fails', async () => {
    const service = TestBed.inject(CatalogService);
    await service.start();
    const good = service.catalog(),
      cache = saved.get(key),
      serialized = JSON.stringify(good);
    fail = 'broadcasters.json';
    await service.refresh();
    expect(service.catalog()).toBe(good);
    expect(JSON.stringify(service.catalog())).toBe(serialized);
    expect(saved.get(key)).toBe(cache);
    expect(service.error()).toContain('Offline');
  });
  for (const corruption of corruptions.filter(c => c.cache))
    it('keeps last-known-good catalogue and cache after ' + corruption.name, async () => {
      const service = TestBed.inject(CatalogService);
      await service.start();
      const good = service.catalog(),
        cache = saved.get(key),
        serialized = JSON.stringify(good);
      corruption.mutate(snapshot);
      await service.refresh();
      expect(service.error()).not.toBe('');
      expect(service.catalog()).toBe(good);
      expect(JSON.stringify(service.catalog())).toBe(serialized);
      expect(saved.get(key)).toBe(cache);
    });
  it('rejects a malformed cached snapshot when offline', async () => {
    corruptions[0].mutate(snapshot);
    saved.set(key, JSON.stringify({ catalog: snapshot, updatedAt: '2026-11-10T12:00:00Z' }));
    fail = 'index.json';
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(service.catalog()).toBeNull();
    expect(service.cached()).toBe(false);
    expect(service.storageWarning()).toContain('Saved catalogue could not be read');
  });
  it('loads a validated v2 cached snapshot offline without using a client seed', async () => {
    saved.set(key, JSON.stringify({ catalog: snapshot, updatedAt: '2026-11-10T12:00:00Z' }));
    fail = 'index.json';
    const service = TestBed.inject(CatalogService);
    await service.start();
    expect(service.catalog()?.manifest.schemaVersion).toBe(2);
    expect(service.catalog()?.discoveryStations).toHaveLength(46);
    expect(service.cached()).toBe(true);
    expect(service.developmentSeed()).toBe(false);
  });
});

it('derives canonical facets after discarding a malformed optional index', async () => {
  const snapshot = structuredClone(v2Fixture) as Record<string, unknown>;
  const manifest = snapshot['manifest'] as { files: Record<string, string> };
  TestBed.configureTestingModule({
    providers: [
      { provide: CATALOG_URL, useValue: 'https://catalog.test/v2/' },
      { provide: CATALOG_SEED_URL, useValue: null },
      { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
      {
        provide: CATALOG_FETCH,
        useValue: async (url: string) => {
          if (url.endsWith('/browse-index.json')) throw new SyntaxError('Bad index JSON');
          if (url.endsWith('/index.json')) return structuredClone(manifest);
          const entry = Object.entries(manifest.files).find(([, file]) => url.endsWith('/' + file));
          if (entry) return structuredClone(snapshot[entry[0]]);
          return (snapshot['localization'] as Record<string, unknown>)[url.split('/').at(-1)!.replace('.json', '')];
        },
      },
    ],
  });
  const service = TestBed.inject(CatalogService);
  await service.start();
  expect(service.error()).toBe('');
  expect(service.catalog()?.stations).toHaveLength(71);
  expect(Object.hasOwn(service.catalog()!, 'browseIndex')).toBe(false);
});
