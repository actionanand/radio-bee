import { RADIO_API_CONFIG } from './radio-api.config';
import { STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { TestBed } from '@angular/core/testing';
import { play, pause, heartOutline, informationCircleOutline } from 'ionicons/icons';
import { CatalogService, CATALOG_STORAGE, CATALOG_FETCH, CATALOG_URL } from './catalog.service';
import { FAVORITES_STORAGE } from './favorites.service';
import { publishedFixture } from './testing/published-1.2.fixture';
import { currentPublishedFixture } from './testing/published-1.3.fixture';
import { validateCatalog } from './catalog.validation';
import { StationCardComponent } from './station-card';
import { StationBrowserComponent } from './station-browser';
import { StationDetailsContentComponent } from './station-details-content';
import { StationDetailsService } from './station-details.service';
import { stationWebsite } from './station-website';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
import { uiLabel } from './catalog.ui';

// Retain the Stage 3–6 strict-policy contract; Stage 7 separately tests the new environment defaults.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: RADIO_API_CONFIG, useValue: STRICT_RADIO_API_CONFIG }] });
});
describe('Stage 6 catalogue controls', () => {
  function setup() {
    const catalog = validateCatalog(structuredClone(publishedFixture));
    const station = catalog.stations.find(station => station.id === 'vasantham-srilanka')!;
    station.streams[0].rightsStatus = 'permission-granted'; // Synthetic unit-test scenario only.
    const audio = document.createElement('audio');
    vi.spyOn(audio, 'play').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    const load = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: MEDIA_ENGINE, useValue: { audio, load, clear: () => undefined, supports: () => true } },
      ],
    });
    const data = TestBed.inject(CatalogService);
    vi.spyOn(data, 'start').mockResolvedValue();
    data.catalog.set(catalog);
    return { catalog, station, audio, load, data, player: TestBed.inject(PlayerService) };
  }
  it('renders genuine Ionicons and synchronizes the same card control with playing, pause and retry', async () => {
    const { station, audio, player, load } = setup();
    const view = TestBed.createComponent(StationCardComponent);
    view.componentRef.setInput('station', station);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    const icon = (selector: string) => (root.querySelector(selector) as HTMLElement & { icon: string }).icon;
    const button = root.querySelector<HTMLButtonElement>('.play')!;
    expect(icon('.play ion-icon')).toBe(play);
    expect(icon('.favorite ion-icon')).toBe(heartOutline);
    expect(icon('.details-button ion-icon')).toBe(informationCircleOutline);
    await player.toggle(station);
    view.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Connecting');
    audio.dispatchEvent(new Event('playing'));
    view.detectChanges();
    expect(icon('.play ion-icon')).toBe(pause);
    expect(button.textContent).toContain('Pause');
    button.click();
    view.detectChanges();
    expect(icon('.play ion-icon')).toBe(play);
    await player.toggle(station);
    expect(load).toHaveBeenCalledOnce();
    audio.dispatchEvent(new Event('error'));
    view.detectChanges();
    expect(button.textContent).toContain('Retry');
    expect(root.querySelector('.play')).toBe(button);
    player.stop();
  });
  it('combines Listen now with filters and recomputes eligibility on catalogue refresh', () => {
    const { data, catalog, station } = setup();
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    const browser = view.componentInstance;
    browser.change('country', 'LK');
    browser.change('language', 'ta');
    browser.change('search', 'Vasantham');
    browser.selectCategory('listenNow');
    expect(browser.stations().map(station => station.id)).toEqual([station.id]);
    browser.selectCategory('all');
    expect(browser.filters()).toMatchObject({ country: 'LK', language: 'ta', search: 'Vasantham' });
    browser.selectCategory('listenNow');
    const next = structuredClone(catalog);
    next.stations.find(candidate => candidate.id === station.id)!.streams[0].rightsStatus = 'unconfirmed';
    data.catalog.set(next);
    expect(browser.count()).toBe(0);
  });
  it('toggles one details selection and restores the trigger focus after dismissal', async () => {
    const { station } = setup();
    const service = TestBed.inject(StationDetailsService);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.addEventListener('click', event => service.open(station.id, event));
    trigger.click();
    expect(service.isOpen()).toBe(true);
    trigger.click();
    expect(service.isOpen()).toBe(false);
    service.dismissed(service.sessions()[0].token);
    await Promise.resolve();
    expect(document.activeElement).toBe(trigger);
    expect(service.station()).toBeNull();
    trigger.remove();
  });
  for (const locale of ['en', 'ta', 'sa']) {
    it(`limits details to listener metadata and localized Ionic controls in ${locale}`, () => {
      const { data, catalog } = setup();
      data.locale.set(locale);
      const station = catalog.stations.find(station => station.id === 'sooriyan-srilanka')!;
      const view = TestBed.createComponent(StationDetailsContentComponent);
      view.componentRef.setInput('station', station);
      view.detectChanges();
      const root = view.nativeElement as HTMLElement;
      expect(root.querySelector('button')?.getAttribute('aria-label')).toBe(uiLabel(locale, 'close'));
      expect(root.querySelector('button ion-icon')).toBeTruthy();
      expect(root.querySelector('a')?.href).toBe('https://www.sooriyanfm.lk/');
      expect(root.textContent).not.toMatch(/rightsStatus|verificationStatus|sourceId|unverified|https:\/\//);
      for (const stream of station.streams) expect(root.textContent).not.toContain(stream.url);
      const closed = vi.fn();
      view.componentInstance.closed.subscribe(closed);
      root.querySelector('button')!.click();
      expect(closed).toHaveBeenCalledOnce();
    });
  }
});

describe('Metadata-only website validation', () => {
  for (const locale of ['en', 'ta', 'sa'])
    it(`keeps broadcaster links exclusively inside details for named and future stations in ${locale}`, () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: MEDIA_ENGINE, useValue: null },
          { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        ],
      });
      const catalog = validateCatalog(structuredClone(currentPublishedFixture));
      // UI-only shapes test the universal rule; these are not proposed catalogue records or rights grants.
      const cases = [
        { id: 'air-nagercoil', website: 'https://akashvani.gov.in/' },
        { id: 'sooriyan-srilanka', website: 'https://www.sooriyanfm.lk/' },
        { id: 'vasantham-srilanka', website: 'https://www.vasanthamfm.lk/' },
        { id: 'j1-hits', website: 'https://www.j1fm.tokyo/' },
        { id: 'j1-gold', website: 'https://www.j1fm.tokyo/' },
        { id: 'future-station', website: 'https://future.example/listen' },
      ];
      const stations = cases.map(item => ({
        ...(catalog.stations.find(station => station.id === item.id) ?? catalog.stations[0]),
        ...item,
      }));
      catalog.stations = stations;
      const data = TestBed.inject(CatalogService);
      data.catalog.set(catalog);
      data.locale.set(locale);
      for (const station of stations) {
        const card = TestBed.createComponent(StationCardComponent);
        card.componentRef.setInput('station', station);
        card.detectChanges();
        expect(card.nativeElement.querySelector('a')).toBeNull();
        expect(card.nativeElement.textContent).not.toContain(station.website);
        expect(card.nativeElement.querySelector('button.play')).toBeNull();
        expect(card.nativeElement.querySelector('.unavailable')).toBeTruthy();
        const details = TestBed.createComponent(StationDetailsContentComponent);
        details.componentRef.setInput('station', station);
        details.detectChanges();
        const link = details.nativeElement.querySelector('a') as HTMLAnchorElement;
        expect(link.href).toBe(station.website);
        expect(link.rel).toContain('noopener');
        card.destroy();
        details.destroy();
      }
    });
  it('accepts HTTPS broadcaster pages and rejects credentials, media and API endpoints', () => {
    expect(stationWebsite({ website: 'https://www.sooriyanfm.lk/' })).toBe('https://www.sooriyanfm.lk/');
    for (const website of [
      null,
      'http://station.test',
      'javascript:alert(1)',
      'https://user:secret@station.test',
      'https://station.test/live.m3u8',
      'https://api.station.test/player',
      'https://station.test/api/listen',
    ]) {
      expect(stationWebsite({ website })).toBeNull();
    }
    const station = validateCatalog(structuredClone(publishedFixture)).stations.find(
      station => station.streams.length,
    )!;
    expect(stationWebsite({ ...station, website: station.streams[0].url })).toBeNull();
  });
});

describe('Published catalogue compatibility', () => {
  for (const invalid of [
    { status: 'approved' },
    { reviewedAt: 'not-a-date' },
    { sourceId: 'missing-policy-source' },
    { notes: '' },
    { recording: 'allowed' },
    { redistribution: 'allowed' },
  ])
    it(`rejects malformed directListening metadata ${JSON.stringify(invalid)}`, () => {
      const catalog = validateCatalog(structuredClone(currentPublishedFixture));
      const stream = catalog.stations.find(station => station.streams.length)!.streams[0];
      Object.assign(stream.directListening!, invalid);
      expect(() => validateCatalog(catalog)).toThrow();
    });
  for (const snapshot of [publishedFixture, currentPublishedFixture]) {
    it('keeps all 88 listings discoverable without promoting unconfirmed stream rights', () => {
      const catalog = validateCatalog(structuredClone(snapshot));
      expect(catalog.stations).toHaveLength(88);
      expect(
        catalog.stations.flatMap(station => station.streams).every(stream => stream.rightsStatus === 'unconfirmed'),
      ).toBe(true);
    });
  }
  it('loads the current 1.3.0 publication using the unchanged HTTPS catalogue loader', async () => {
    const snapshot = validateCatalog(structuredClone(currentPublishedFixture));
    let saved = '';
    TestBed.configureTestingModule({
      providers: [
        // Explicit v1 fixture/loader contract; development and production now default to v2.
        { provide: CATALOG_URL, useValue: 'https://actionanand.github.io/radio-bee-data/v1/' },
        {
          provide: CATALOG_STORAGE,
          useValue: {
            get: async () => ({ value: null }),
            set: async (options: { value: string }) => {
              saved = options.value;
            },
          },
        },
        {
          provide: CATALOG_FETCH,
          useValue: async (url: string) => {
            const file = new URL(url).pathname.split('/v1/')[1];
            return file === 'index.json'
              ? snapshot.manifest
              : file.startsWith('i18n/')
                ? snapshot.localization[file.slice(5, -5)]
                : snapshot[file.replace('.json', '') as 'stations'];
          },
        },
      ],
    });
    const data = TestBed.inject(CatalogService);
    await data.start();
    expect(data.error()).toBe('');
    expect(data.catalog()?.manifest.catalogVersion).toBe('1.3.0');
    expect(data.catalog()?.stations).toHaveLength(88);
    expect(data.catalog()?.stations.flatMap(station => station.streams)).toHaveLength(26);
    expect(
      data
        .catalog()
        ?.stations.flatMap(station => station.streams)
        .every(stream => stream.directListening?.status === 'needs-review'),
    ).toBe(true);
    expect(
      data
        .catalog()
        ?.stations.flatMap(station => station.streams)
        .map(stream => stream.directListening),
    ).toEqual(snapshot.stations.flatMap(station => station.streams).map(stream => stream.directListening));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        // Explicit v1 fixture/loader contract; development and production now default to v2.
        { provide: CATALOG_URL, useValue: 'https://actionanand.github.io/radio-bee-data/v1/' },
        {
          provide: CATALOG_STORAGE,
          useValue: {
            get: async (options: { key: string }) => ({
              value: options.key.startsWith('radiobee.catalog.') ? saved : null,
            }),
            set: async () => undefined,
          },
        },
        {
          provide: CATALOG_FETCH,
          useValue: async () => {
            throw Error('Offline');
          },
        },
      ],
    });
    const offline = TestBed.inject(CatalogService);
    await offline.start();
    expect(offline.cached()).toBe(true);
    expect(
      offline
        .catalog()
        ?.stations.flatMap(station => station.streams)
        .map(stream => stream.directListening),
    ).toEqual(snapshot.stations.flatMap(station => station.streams).map(stream => stream.directListening));
  });
});
