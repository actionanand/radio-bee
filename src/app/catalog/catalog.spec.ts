import { TestBed } from '@angular/core/testing';
import { fixture } from './catalog.fixture';
import { Catalog, emptyFilters, filterStations, groups, streamLabel, translated } from './catalog.models';
import { validateCatalog, validateManifest, relativePath } from './catalog.validation';
import { CatalogService, CATALOG_FETCH, CATALOG_STORAGE, CATALOG_URL, CATALOG_SEED_URL } from './catalog.service';
import { environment as production } from '../../environments/environment.prod';
import { StationBrowserComponent } from './station-browser';
const catalog = () => validateCatalog(structuredClone(fixture));
describe('Catalogue contract', () => {
  it('disables seed fallback in production', () => {
    expect(production.catalogSeedUrl).toBeNull();
  });
  it('accepts the real version 1 starter and rejects incompatible or incomplete data', () => {
    const c = catalog();
    expect(c.stations.length).toBe(81);
    expect(() => validateManifest({ ...c.manifest, schemaVersion: 2 })).toThrow();
    expect(() => validateManifest({ ...c.manifest, catalogVersion: 'bad' })).toThrow();
    expect(() => validateCatalog({ ...c, stations: c.stations.slice(1) })).toThrow();
    expect(() => relativePath('https://example.test/v1/', '../secret')).toThrow();
  });
  it('rejects unknown network, language, source and malformed geographic references', () => {
    for (const mutate of [
      (c: Catalog) => (c.stations[0].networkId = 'missing'),
      (c: Catalog) => (c.stations[0].broadcastLanguages = ['missing']),
      (c: Catalog) => (c.stations[0].sourceIds = ['missing']),
      (c: Catalog) => (c.stations[0].localityId = 'in'),
    ]) {
      const c = catalog();
      mutate(c);
      expect(() => validateCatalog(c)).toThrow();
    }
    const c = catalog();
    c.locations[0].parentId = 'cycle';
    expect(() => validateCatalog(c)).toThrow();
  });
  it('filters every facet and never assigns nationwide listings to a city', () => {
    const c = catalog();
    const first = c.stations[0];
    for (const [key, value] of Object.entries({
      country: first.countryCode,
      region: first.regionId,
      district: first.districtId,
      locality: first.localityId,
      language: first.broadcastLanguages[0],
      search: 'Nagercoil',
    })) {
      const result = filterStations(c, { ...emptyFilters, country: 'IN', [key]: value });
      expect(result.some(s => s.id === first.id)).toBe(true);
      expect(result.length).toBeLessThan(c.stations.length);
    }
    const local = filterStations(c, { ...emptyFilters, country: 'IN', locality: first.localityId ?? '' });
    expect(local.every(s => s.localityId === first.localityId)).toBe(true);
    expect(filterStations(c, { ...emptyFilters, search: 'no such station xyz' })).toEqual([]);
    expect(filterStations(c, { ...emptyFilters, country: 'LK', region: 'in-tn' })).toEqual(
      c.stations.filter(s => s.countryCode === 'LK'),
    );
  });
  it('groups by actual network and preserves distinct Suryan / Sooriyan IDs', () => {
    const g = groups(catalog(), emptyFilters);
    expect(g.length).toBe(16);
    expect(g.some(g => g.network.id === 'suryan-in')).toBe(true);
    expect(g.some(g => g.network.id === 'sooriyan-lk')).toBe(true);
    expect(g.every(g => g.stations.every(s => s.networkId === g.network.id))).toBe(true);
  });
  it('uses locale labels with English fallback and leaves original names unchanged', () => {
    const c = catalog();
    expect(translated(c, 'ta', 'catalog', 'title')).toContain('வானொலி');
    expect(translated(c, 'sa', 'catalog', 'title')).toContain('केन्द्र');
    delete c.localization['ta']['catalog']['title'];
    expect(translated(c, 'ta', 'catalog', 'title')).toBe(c.localization['en']['catalog']['title']);
    expect(c.stations[0].name).toBe('Akashvani Nagercoil');
    expect(c.stations.every(s => s.streams.every(s => s.verificationStatus !== 'verified'))).toBe(true);
    expect(streamLabel(c.stations.find(s => s.streams.length)!)).toBe('streamUnverified');
    expect(streamLabel(c.stations[0])).toBe('noStream');
  });
});
describe('Catalogue loading and cache', () => {
  let saved: Map<string, string>;
  let requests: string[];
  let fail: string;
  let c: Catalog;
  beforeEach(() => {
    saved = new Map();
    requests = [];
    fail = '';
    c = catalog();
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_URL, useValue: 'https://catalog.test/v1/' },
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
            if (fail && (fail === 'all' || url.endsWith(fail))) throw new Error('Offline');
            if (url.endsWith('index.json')) return c.manifest;
            for (const name of ['networks', 'stations', 'locations', 'languages', 'categories', 'sources'] as const)
              if (url.endsWith(c.manifest.files[name])) return c[name];
            const locale = url.split('/').at(-1)!.split('.')[0];
            return c.localization[locale];
          },
        },
      ],
    });
  });
  it('loads manifest first, persists complete data and does not refetch on navigation', async () => {
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(requests[0]).toMatch(/index.json$/);
    expect(s.catalog()?.stations.length).toBe(81);
    expect(saved.size).toBe(1);
    await s.start();
    expect(requests.length).toBe(10);
  });
  it('retains last good snapshot after partial download and validation failure', async () => {
    const s = TestBed.inject(CatalogService);
    await s.start();
    const good = s.catalog();
    const old = [...saved.values()][0];
    fail = 'stations.json';
    await s.refresh();
    expect(s.catalog()).toBe(good);
    expect([...saved.values()][0]).toBe(old);
    fail = '';
    c = { ...c, stations: [] };
    await s.refresh();
    expect(s.catalog()).toBe(good);
  });
  it('starts offline using a validated stored snapshot and retains its timestamp', async () => {
    saved.set(
      'radiobee.catalog.v1:https://catalog.test/v1/',
      JSON.stringify({ catalog: c, updatedAt: '2026-11-03T10:00:00Z' }),
    );
    fail = 'all';
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(s.cached()).toBe(true);
    expect(s.catalog()?.stations.length).toBe(81);
    expect(s.updatedAt()).toBe('2026-11-03T10:00:00Z');
    expect(s.error()).toContain('last successfully');
  });
  it('shows a recoverable error without data on first offline launch', async () => {
    fail = 'all';
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(s.catalog()).toBeNull();
    expect(s.loading()).toBe(false);
    expect(s.error()).toContain('No saved catalogue');
  });
  it('persists UI language independently from broadcast filters and clears descendant filters', async () => {
    const s = TestBed.inject(CatalogService);
    await s.start();
    await s.setLocale('ta');
    expect(saved.get('radiobee.ui-language')).toBe('ta');
    const browser = TestBed.runInInjectionContext(() => new StationBrowserComponent());
    browser.change('country', 'IN');
    browser.change('region', 'in-tn');
    browser.change('district', 'in-tn-kanyakumari');
    browser.change('locality', 'in-tn-kanyakumari-nagercoil');
    expect(browser.count()).toBeGreaterThan(0);
    browser.change('country', 'LK');
    expect(browser.filters().region).toBe('');
    expect(browser.filters().locality).toBe('');
    expect(browser.filters().language).toBe('');
  });
  it('renders unverified stations with no playback controls', async () => {
    const s = TestBed.inject(CatalogService);
    await s.start();
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    expect(view.nativeElement.querySelector('audio')).toBeNull();
    expect(view.nativeElement.querySelector('video')).toBeNull();
    expect(view.nativeElement.textContent).toContain('Stage 3');
    expect(view.nativeElement.textContent).toContain('Stream not verified');
  });
  it('rejects corrupt cache and incomplete localization without publishing partial data', async () => {
    saved.set('radiobee.catalog.v1:https://catalog.test/v1/', 'broken JSON');
    fail = 'ta.json';
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(s.catalog()).toBeNull();
    expect(s.error()).toContain('No saved catalogue');
  });
  it('labels a development snapshot and never writes it to the live cache', async () => {
    TestBed.overrideProvider(CATALOG_SEED_URL, { useValue: 'seed.json' });
    TestBed.overrideProvider(CATALOG_FETCH, {
      useValue: async (url: string) => {
        if (url === 'seed.json') return c;
        throw new Error('Catalogue host is not deployed (404).');
      },
    });
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(s.developmentSeed()).toBe(true);
    expect(s.error()).toContain('DEVELOPMENT SEED');
    expect(saved.size).toBe(0);
    expect(s.updatedAt()).toBe('');
  });
  it('treats a timeout as a recoverable refresh error and preserves valid cached data', async () => {
    saved.set(
      'radiobee.catalog.v1:https://catalog.test/v1/',
      JSON.stringify({ catalog: c, updatedAt: '2026-11-03T10:00:00Z' }),
    );
    TestBed.overrideProvider(CATALOG_FETCH, {
      useValue: async () => {
        throw new DOMException('Request timed out', 'TimeoutError');
      },
    });
    const s = TestBed.inject(CatalogService);
    await s.start();
    expect(s.catalog()?.stations.length).toBe(81);
    expect(s.error()).toContain('timed out');
    expect(s.loading()).toBe(false);
  });
});
