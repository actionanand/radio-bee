import { TestBed } from '@angular/core/testing';
import { discoveryContractFixture } from './testing/discovery-contract.fixture';
import { Catalog, allStations, catalogCounts, emptyFilters, filterStations } from './catalog.models';
import { validateCatalog } from './catalog.validation';
import { CatalogService, CATALOG_FETCH, CATALOG_STORAGE, CATALOG_URL } from './catalog.service';
import { FavoritesService, FAVORITES_STORAGE } from './favorites.service';
import { StationBrowserComponent } from './station-browser';
import { StationDetailsService } from './station-details.service';
import { RADIO_API_CONFIG } from './radio-api.config';
import { environment as production } from '../../environments/environment.prod';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
import { streamEligibility, eligibleStreams } from './stream-eligibility';
import { uiLabel } from './catalog.ui';
const current = () => validateCatalog(structuredClone(discoveryContractFixture));
const requiredIds = [
  'tamilosai-nagercoil',
  'isai-murasu-nagercoil',
  'christian-samy-fm',
  'annai-kuzhithurai',
  'asr-kanyakumari',
  'kumari-tamil-kanyakumari',
  'suryan-nagercoil',
  'hello-nagercoil',
];
let incoming: Catalog, failDiscovery: boolean, saved: Map<string, string>, load: ReturnType<typeof vi.fn>;
beforeEach(() => {
  incoming = current();
  failDiscovery = false;
  saved = new Map();
  load = vi.fn(async () => undefined);
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  const storage = {
    get: async ({ key }: { key: string }) => ({ value: saved.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      saved.set(key, value);
    },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CATALOG_URL, useValue: 'https://catalog.test/v1/' },
      { provide: CATALOG_STORAGE, useValue: storage },
      { provide: FAVORITES_STORAGE, useValue: storage },
      { provide: RADIO_API_CONFIG, useValue: production.RadioApi },
      { provide: MEDIA_ENGINE, useValue: { audio, load, clear: () => undefined, supports: () => true } },
      {
        provide: CATALOG_FETCH,
        useValue: vi.fn(async (url: string) => {
          if (url.endsWith('index.json')) return incoming.manifest;
          for (const name of [
            'networks',
            'stations',
            'locations',
            'languages',
            'categories',
            'sources',
            'discoveryStations',
          ] as const) {
            if (url.endsWith('/' + incoming.manifest.files[name])) {
              if (name === 'discoveryStations' && failDiscovery) throw Error('Discovery unavailable');
              return incoming[name];
            }
          }
          const locale = url.split('/').at(-1)!.split('.')[0];
          return incoming.localization[locale];
        }),
      },
    ],
  });
});
afterEach(() => TestBed.inject(PlayerService).stop());
it('loads the optional public discovery file, separates counts, and retains cached metadata atomically', async () => {
  const data = TestBed.inject(CatalogService);
  await data.refresh();
  expect(data.error()).toBe('');
  expect(catalogCounts(data.catalog())).toEqual({ discoverable: 14, candidates: 3, approved: 0 });
  const previous = data.catalog();
  failDiscovery = true;
  await data.refresh();
  expect(data.catalog()).toBe(previous);
  expect(data.error()).toContain('Discovery unavailable');
  const cached = JSON.parse([...saved.values()][0]) as { catalog: unknown };
  expect(allStations(validateCatalog(cached.catalog))).toHaveLength(14);
});
it('rejects a manifest change during fetch without replacing a complete cached snapshot', async () => {
  const data = TestBed.inject(CatalogService);
  await data.refresh();
  const previous = data.catalog();
  const fetch = vi.mocked(TestBed.inject(CATALOG_FETCH)),
    original = fetch.getMockImplementation()!;
  let manifests = 0;
  fetch.mockImplementation(async url =>
    url.endsWith('index.json') && ++manifests === 2 ? { ...incoming.manifest, catalogVersion: '1.5.1' } : original(url),
  );
  await data.refresh();
  expect(data.catalog()).toBe(previous);
  expect(data.error()).toContain('changed during loading');
});
it('accepts legacy v1 snapshots without discovery fields', () => {
  const c = current();
  delete c.discoveryStations;
  delete c.manifest.files['discoveryStations'];
  for (const k of [
    'discoveryStations',
    'discoverableStations',
    'stationsWithStreamCandidates',
    'productionEligibleStations',
  ])
    delete (c.manifest.counts as unknown as Record<string, unknown>)[k];
  expect(allStations(validateCatalog(c))).toHaveLength(3);
});
it('rejects raw research fields, duplicate IDs/AIR aliases, stale counts and unsafe official links', () => {
  for (const mutate of [
    (c: Catalog) => Object.assign(c.discoveryStations![0], { streams: [] }),
    (c: Catalog) => Object.assign(c.discoveryStations![0], { candidateUrl: 'https://test.example/live' }),
    (c: Catalog) => (c.discoveryStations![0].id = 'air-nagercoil'),
    (c: Catalog) => {
      Object.assign(c.discoveryStations![0], { networkId: 'akashvani', name: 'Kumari FM', aliases: [] });
    },
    (c: Catalog) => (c.discoveryStations![0].website = 'https://private.localhost/'),
    (c: Catalog) => (c.discoveryStations![0].website = 'https://example.org/audio.mp3'),
    (c: Catalog) => c.manifest.counts.discoverableStations!++,
  ]) {
    const c = current();
    mutate(c);
    expect(() => validateCatalog(c)).toThrow();
  }
});
it('keeps AIR aliases one card and maps regional networks/geography without Sooriyan substitutions', () => {
  const c = current();
  for (const name of ['AIR Nagercoil', 'Akashvani Nagercoil', 'Kumari FM'])
    expect(filterStations(c, { ...emptyFilters, search: name }).map(s => s.id)).toEqual(['air-nagercoil']);
  const local = filterStations(c, { ...emptyFilters, country: 'IN', region: 'in-tn', district: 'in-tn-kanyakumari' });
  for (const id of requiredIds) expect(local.some(s => s.id === id)).toBe(true);
  expect(
    filterStations(c, { ...emptyFilters, country: 'IN', locality: 'in-tn-kanyakumari-parakunnu' }).map(s => s.id),
  ).toEqual(['annai-kuzhithurai']);
  expect(c.discoveryStations!.find(s => s.id === 'suryan-coimbatore')?.networkId).toBe('suryan-in');
  expect(c.discoveryStations!.find(s => s.id === 'hello-coimbatore')?.networkId).toBe('hello-fm');
  expect(c.discoveryStations!.find(s => s.id === 'mirchi-coimbatore')?.networkId).toBe('mirchi');
  expect(c.discoveryStations!.find(s => s.id === 'christian-samy-fm')?.networkId).toBe('asr-digital');
});
for (const locale of ['en', 'ta', 'sa'])
  it(`renders discovery metadata and the explicitly requested ISKCON trial in ${locale}`, async () => {
    const data = TestBed.inject(CatalogService);
    vi.spyOn(data, 'start').mockResolvedValue();
    data.catalog.set(current());
    data.locale.set(locale);
    const view = TestBed.createComponent(StationBrowserComponent);
    view.componentInstance.selectCategory('kanyakumari');
    view.detectChanges();
    for (const id of requiredIds) {
      const article = view.nativeElement.querySelector(`[data-station-id="${id}"]`) as HTMLElement;
      expect(article).toBeTruthy();
      expect(article.querySelector('button.play')).toBeNull();
      const station = allStations(data.catalog()).find(station => station.id === id)!;
      const status =
        station.discovery?.availability === 'temporarily-unavailable'
          ? 'temporarilyUnavailable'
          : station.discovery?.availability === 'review-pending'
            ? 'streamReviewPending'
            : 'noDirectStream';
      expect(article.querySelector('.discovery-actions .unavailable')?.textContent?.trim()).toBe(uiLabel(locale, status));
      expect(article.querySelector('.frequency')).toBeNull();
    }
    const annai = view.nativeElement.querySelector('[data-station-id="annai-kuzhithurai"]') as HTMLElement;
    expect(annai.querySelector('a')).toBeNull();
    (annai.querySelector('button.details-button') as HTMLButtonElement).click();
    expect(TestBed.inject(StationDetailsService).station()?.id).toBe('annai-kuzhithurai');
    const favorites = TestBed.inject(FavoritesService);
    await favorites.loaded;
    (annai.querySelector('button.favorite') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(favorites.has('annai-kuzhithurai')).toBe(true);
    view.componentInstance.selectCategory('listenNow');
    view.detectChanges();
    expect(view.nativeElement.querySelector('[data-station-id="annai-kuzhithurai"]')).toBeNull();
  });
it('cannot play discovery streams through permissive flags, forged caller payloads or the technical boundary', async () => {
  const c = current(),
    data = TestBed.inject(CatalogService);
  data.catalog.set(c);
  const station = allStations(c).find(s => s.id === 'annai-kuzhithurai')!;
  const forged = { ...station, streams: [c.stations.find(s => s.id === 'sooriyan-srilanka')!.streams[0]] };
  for (const available of [true, false]) {
    expect(streamEligibility(forged, { available, supports: () => true }, production.RadioApi).status).toBe('noStream');
    expect(eligibleStreams(forged, { available, supports: () => true }, production.RadioApi)).toEqual([]);
  }
  const player = TestBed.inject(PlayerService);
  await player.play(forged);
  await player.playTechnical(forged.id);
  expect(load).not.toHaveBeenCalled();
  expect(player.captureSource()).toBeNull();
  expect(player.station()).toBeNull();
});
it('preserves favourites and one identity across metadata-to-stream and reverse refresh transitions', async () => {
  const data = TestBed.inject(CatalogService);
  await data.refresh();
  const favorites = TestBed.inject(FavoritesService);
  await favorites.loaded;
  await favorites.toggle('annai-kuzhithurai');
  const next = structuredClone(incoming),
    row = next.discoveryStations!.find(s => s.id === 'annai-kuzhithurai')!;
  const { availability, reviewedOn, websiteKind, aliases, ...metadata } = row;
  void availability;
  void reviewedOn;
  void websiteKind;
  void aliases;
  next.discoveryStations = next.discoveryStations!.filter(s => s.id !== row.id);
  const stream = {
    ...next.stations.find(s => s.id === 'sooriyan-srilanka')!.streams[0],
    id: 'unit-restoration',
    url: 'https://fixture.example/restored',
  };
  next.stations.push({ ...metadata, streams: [stream] });
  next.manifest.counts.stations++;
  next.manifest.counts.streams++;
  next.manifest.counts.discoveryStations!--;
  next.manifest.counts.stationsWithStreamCandidates!++;
  incoming = next;
  await data.refresh();
  expect(data.error()).toBe('');
  expect(allStations(data.catalog()).filter(s => s.id === row.id)).toHaveLength(1);
  expect(allStations(data.catalog()).find(s => s.id === row.id)?.discovery).toBeUndefined();
  expect(favorites.has(row.id)).toBe(true);
  incoming = current();
  await data.refresh();
  expect(allStations(data.catalog()).find(s => s.id === row.id)?.streams).toEqual([]);
  expect(favorites.has(row.id)).toBe(true);
});
it('preserves both Sooriyan alternatives and the normal Web/Android engine playback path', async () => {
  const c = current(),
    data = TestBed.inject(CatalogService);
  data.catalog.set(c);
  const s = c.stations.find(s => s.id === 'sooriyan-srilanka')!;
  const before = JSON.stringify(s);
  expect(s.streams).toHaveLength(2);
  expect(s.streams.some(x => x.url === 'https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden')).toBe(
    true,
  );
  for (const format of ['mp3', 'aac', 'hls'])
    expect(streamEligibility(s, { available: true, supports: f => f === format }, production.RadioApi).status).toBe(
      format === 'mp3' ? 'ready' : 'incompatibleStream',
    );
  const player = TestBed.inject(PlayerService);
  await player.play(s);
  expect(load).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledWith(player.eligibility(s).stream);
  expect(JSON.stringify(s)).toBe(before);
});
