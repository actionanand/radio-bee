import { corruptions } from './testing/v2-invalid.fixture';
import { TestBed } from '@angular/core/testing';
import { CATALOG_FETCH, CATALOG_SEED_URL, CATALOG_STORAGE, CATALOG_URL, CatalogService } from './catalog.service';
import { v2Fixture } from './testing/v2.fixture';

describe('v2 snapshot loading', () => {
  const base = 'https://catalog.test/v2/';
  const key = 'radiobee.catalog.v2:' + base;
  let saved: Map<string, string>;
  let fail: string;
  let requests: string[];
  let snapshot: Record<string, unknown>;
  beforeEach(() => {
    saved = new Map();
    fail = '';
    requests = [];
    snapshot = structuredClone(v2Fixture) as Record<string, unknown>;
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_URL, useValue: base },
        { provide: CATALOG_SEED_URL, useValue: null },
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
            if (fail === 'malformed-index' && url.endsWith('/browse-index.json'))
              throw new SyntaxError('Bad index JSON');
            if (fail && url.endsWith(fail)) throw Error('Offline');
            const manifest = snapshot['manifest'] as { files: Record<string, string> };
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
