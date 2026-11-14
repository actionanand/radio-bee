import { RADIO_RECORDING } from '../recording/recording.config';
import { RADIO_API_CONFIG } from './radio-api.config';
import { STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { StationArtworkComponent, artworkCandidates, FALLBACK_ARTWORK, logoUrl } from './station-artwork';
import { CATALOG_STORAGE, CatalogService, CATALOG_URL, CATALOG_FETCH } from './catalog.service';
import { StationCardComponent } from './station-card';
import { uiLabel } from './catalog.ui';
import { validateCatalog } from './catalog.validation';
import { fixture } from './catalog.fixture';
import { FAVORITES_STORAGE, FavoritesService } from './favorites.service';
import { inCategory } from './discovery';
import { StationBrowserComponent } from './station-browser';
import { publishedFixture } from './testing/published-1.2.fixture';
import { PlayerComponent } from '../player/player';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';

const base = 'https://actionanand.github.io/radio-bee-data/v1/';
// Retain the Stage 3–6 strict-policy contract; Stage 7 separately tests the new environment defaults.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: RADIO_API_CONFIG, useValue: STRICT_RADIO_API_CONFIG }] });
});
describe('Station artwork', () => {
  it('retries once per successful catalogue snapshot, not on locale changes, stale errors or failed refreshes', async () => {
    const snapshot = validateCatalog(structuredClone(fixture));
    snapshot.stations[0].logoPath = 'assets/logos/stations/retry.webp';
    snapshot.networks.find(network => network.id === snapshot.stations[0].networkId)!.logoPath =
      'assets/logos/networks/retry.png';
    let offline = true;
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_URL, useValue: base },
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        {
          provide: CATALOG_FETCH,
          useValue: async (url: string) => {
            if (offline) throw Error('Offline');
            const file = url.slice(base.length);
            if (file === 'index.json') return snapshot.manifest;
            if (file.startsWith('i18n/')) return snapshot.localization[file.slice(5, -5)];
            return snapshot[
              file.replace('.json', '') as
                'networks' | 'stations' | 'locations' | 'languages' | 'categories' | 'sources'
            ];
          },
        },
      ],
    });
    const data = TestBed.inject(CatalogService);
    data.catalog.set(snapshot);
    const view = TestBed.createComponent(StationArtworkComponent);
    view.componentRef.setInput('station', snapshot.stations[0]);
    view.detectChanges();
    const image = () => view.nativeElement.querySelector('img') as HTMLImageElement;
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(image().src).toBe(base + 'assets/logos/stations/retry.webp');
      image().dispatchEvent(new Event('error'));
      view.detectChanges();
      const network = image().src;
      view.componentInstance.failed(base + 'assets/logos/stations/retry.webp');
      view.detectChanges();
      expect(image().src).toBe(network);
      image().dispatchEvent(new Event('error'));
      view.detectChanges();
      expect(view.componentInstance.source()).toBe(FALLBACK_ARTWORK);
      for (let repeat = 0; repeat < 3; repeat++) {
        image().dispatchEvent(new Event('error'));
        view.detectChanges();
      }
      expect(view.componentInstance.source()).toBe(FALLBACK_ARTWORK);
      if (attempt === 0) {
        await data.setLocale('ta');
        await data.refresh();
        view.detectChanges();
        expect(data.catalog()).toBe(snapshot);
        expect(view.componentInstance.source()).toBe(FALLBACK_ARTWORK);
        const recreated = TestBed.createComponent(StationArtworkComponent);
        recreated.componentRef.setInput('station', snapshot.stations[0]);
        recreated.detectChanges();
        expect(recreated.componentInstance.source()).toBe(FALLBACK_ARTWORK);
        recreated.destroy();
        offline = false;
        await data.refresh();
        view.detectChanges();
        expect(data.catalog()).not.toBe(snapshot);
      }
    }
  });
  it('selects station, network and bundled artwork in order, supporting old data', () => {
    expect(
      artworkCandidates(
        base,
        { logoPath: 'assets/logos/stations/station.webp' },
        { logoPath: 'assets/logos/networks/network.png' },
      ),
    ).toEqual([
      base + 'assets/logos/stations/station.webp',
      base + 'assets/logos/networks/network.png',
      FALLBACK_ARTWORK,
    ]);
    expect(artworkCandidates(base, {}, { logoPath: 'assets/logos/networks/network.png' })).toEqual([
      base + 'assets/logos/networks/network.png',
      FALLBACK_ARTWORK,
    ]);
    expect(artworkCandidates(base, {})).toEqual([FALLBACK_ARTWORK]);
    expect(validateCatalog(structuredClone(fixture)).stations.length).toBe(81);
  });
  it('rejects injection, traversal, unsupported image formats and untrusted origins', () => {
    for (const path of [
      '../logo.png',
      'assets/logos/../logo.png',
      'assets/logos/%2e%2e/logo.png',
      '//evil.test/a.png',
      'https://evil.test/a.png',
      'data:image/png;base64,a',
      'assets/logos/a.svg',
      'assets/logos/a.png?url=evil',
      'assets\\logos\\a.png',
      'assets/logos/a.png#x',
    ])
      expect(logoUrl(base, path)).toBeNull();
    expect(logoUrl('http://unsafe.test/', 'assets/logos/a.png')).toBeNull();
  });
  it('falls through actual loading errors without changing station metadata', () => {
    const catalog = validateCatalog(structuredClone(fixture));
    const station = { ...catalog.stations[0], logoPath: 'assets/logos/stations/station.webp' };
    catalog.networks.find(network => network.id === station.networkId)!.logoPath = 'assets/logos/networks/network.png';
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { catalog: signal(catalog) } },
        { provide: CATALOG_URL, useValue: base },
      ],
    });
    const view = TestBed.createComponent(StationArtworkComponent);
    view.componentRef.setInput('station', station);
    view.detectChanges();
    const image = () => view.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image().src).toContain('station.webp');
    image().dispatchEvent(new Event('error'));
    view.detectChanges();
    expect(image().src).toContain('network.png');
    image().dispatchEvent(new Event('error'));
    view.detectChanges();
    expect(image().src).toContain(FALLBACK_ARTWORK);
    expect(image().getAttribute('width')).toBe('240');
    expect(image().getAttribute('loading')).toBe('lazy');
    expect(view.nativeElement.textContent).toContain('AN');
    expect(station.logoPath).toBe('assets/logos/stations/station.webp');
  });
});

describe('Localized station presentation', () => {
  for (const locale of ['en', 'ta', 'sa'])
    it(`keeps localized station details and compact metadata without a delivery label in ${locale}`, () => {
      TestBed.configureTestingModule({
        providers: [
          { provide: MEDIA_ENGINE, useValue: null },
          { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        ],
      });
      const catalog = validateCatalog(structuredClone(fixture));
      const data = TestBed.inject(CatalogService);
      data.catalog.set(catalog);
      data.locale.set(locale);
      const view = TestBed.createComponent(StationCardComponent);
      const station = { ...catalog.stations[0], delivery: 'online', frequencyMHz: null };
      view.componentRef.setInput('station', station);
      view.detectChanges();
      const card = view.nativeElement as HTMLElement;
      const language = card.querySelector('.language-summary .clamped') as HTMLElement;
      const location = card.querySelector('.location .clamped') as HTMLElement;
      expect(language.textContent?.trim()).toBeTruthy();
      expect(location.textContent?.trim()).toBeTruthy();
      expect(language.style.blockSize).toBe('1lh');
      expect(location.style.blockSize).toBe('1lh');
      expect(card.querySelector('.details-button')?.textContent?.trim()).toBe(uiLabel(locale, 'details'));
      expect(card.querySelector('.frequency')).toBeNull();

      view.componentRef.setInput('station', { ...station, delivery: 'fm' });
      view.detectChanges();
      expect(card.querySelector('.frequency')).toBeNull();
      expect(card.textContent).not.toContain(uiLabel(locale, 'onlineRadio'));
    });
});
describe('Persistent favorites', () => {
  it('restores IDs across service instances and persists additions/removals', async () => {
    let value: string | null = null;
    const storage = {
      get: async () => ({ value }),
      set: async (options: { value: string }) => {
        value = options.value;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: FAVORITES_STORAGE, useValue: storage }] });
    let service = TestBed.inject(FavoritesService);
    await service.loaded;
    await service.toggle('sooriyan-srilanka');
    await service.toggle('air-nagercoil');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: FAVORITES_STORAGE, useValue: storage }] });
    service = TestBed.inject(FavoritesService);
    await service.loaded;
    expect(service.has('sooriyan-srilanka')).toBe(true);
    expect(service.has('air-nagercoil')).toBe(true);
    await service.toggle('air-nagercoil');
    expect(JSON.parse(value!)).toEqual(['sooriyan-srilanka']);
  });
  it('keeps session favorites and warns when storage fails', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FAVORITES_STORAGE,
          useValue: {
            get: async () => ({ value: 'invalid' }),
            set: async () => {
              throw Error('quota');
            },
          },
        },
      ],
    });
    const service = TestBed.inject(FavoritesService);
    await service.loaded;
    await service.toggle('station');
    expect(service.has('station')).toBe(true);
    expect(service.warning()).toBe(true);
  });
  it('preserves toggles performed while the saved favorites are still loading', async () => {
    let finish!: (value: { value: string }) => void;
    const set = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FAVORITES_STORAGE,
          useValue: {
            get: () =>
              new Promise(resolve => {
                finish = resolve;
              }),
            set,
          },
        },
      ],
    });
    const service = TestBed.inject(FavoritesService);
    const first = service.toggle('new');
    const second = service.toggle('new');
    finish({ value: JSON.stringify(['old', 'new']) });
    await Promise.all([first, second]);
    expect(service.has('old')).toBe(true);
    expect(service.has('new')).toBe(false);
    expect(set).toHaveBeenLastCalledWith({ key: 'radiobee.favorites.v1', value: '["old"]' });
  });
});
describe('Published 1.2 catalogue discovery', () => {
  it('validates 88 stations and 18 networks with optional logos and unchanged stream permissions', () => {
    const catalog = validateCatalog(structuredClone(publishedFixture));
    expect(catalog.manifest.catalogVersion).toBe('1.2.0');
    expect(catalog.stations).toHaveLength(88);
    expect(catalog.networks).toHaveLength(18);
    const original = JSON.stringify(catalog.stations.map(station => station.streams));
    catalog.stations[0].logoPath = 'assets/logos/stations/station.webp';
    catalog.networks[0].logoPath = 'assets/logos/networks/network.png';
    expect(() => validateCatalog(catalog)).not.toThrow();
    expect(JSON.stringify(catalog.stations.map(station => station.streams))).toBe(original);
  });
  it('builds categories from geography/language without confusing Sri Lanka with Indian regions', () => {
    const catalog = validateCatalog(structuredClone(publishedFixture));
    for (const category of ['kanyakumari', 'sriLanka', 'chennai', 'otherTamil'] as const)
      expect(catalog.stations.filter(station => inCategory(station, category, false)).length).toBeGreaterThan(0);
    const sooriyan = catalog.stations.find(station => station.id === 'sooriyan-srilanka')!;
    expect(inCategory(sooriyan, 'sriLanka', false)).toBe(true);
    expect(inCategory(sooriyan, 'otherTamil', false)).toBe(false);
    expect(inCategory(sooriyan, 'favorites', true)).toBe(true);
  });
  it('keeps search, favorites, grouping and India-only advanced filtering integrated', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
      ],
    });
    const data = TestBed.inject(CatalogService);
    vi.spyOn(data, 'start').mockResolvedValue();
    data.catalog.set(validateCatalog(structuredClone(publishedFixture)));
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    const browser = view.componentInstance;
    await browser.theme.loaded;
    await view.whenStable();
    expect(view.nativeElement.querySelectorAll('.station-card')).toHaveLength(
      data.catalog()!.stations.filter(station => station.streams.length).length,
    );
    browser.selectCategory('sriLanka');
    browser.change('search', 'Sooriyan');
    view.detectChanges();
    expect(browser.stations().map(station => station.id)).toEqual(['sooriyan-srilanka']);
    await browser.favorites.toggle('sooriyan-srilanka');
    browser.selectCategory('favorites');
    view.detectChanges();
    expect(browser.count()).toBe(1);
    const favorite = view.nativeElement.querySelector('button.favorite') as HTMLButtonElement;
    favorite.focus();
    favorite.click();
    view.detectChanges();
    expect(browser.count()).toBe(0);
    expect(document.activeElement).toBe(view.nativeElement.querySelector('[data-category="favorites"]'));
    await browser.favorites.toggle('sooriyan-srilanka');
    browser.byNetwork.set(true);
    view.detectChanges();
    expect(view.nativeElement.querySelectorAll('.network-title')).toHaveLength(1);
    expect(view.nativeElement.querySelector('button.play')).toBeNull();
    expect(view.nativeElement.querySelector('.external')).toBeNull();
    expect(view.nativeElement.querySelector('.details-button')).toBeTruthy();
    browser.selectCategory('all');
    browser.change('country', 'IN');
    browser.change('region', 'in-tn');
    browser.change('country', 'LK');
    expect(browser.filters().region).toBe('');
    expect(browser.controls()).toHaveLength(2);
  });
});
describe('Mini-player controls', () => {
  it('shows artwork and invokes the existing player for play, pause, stop, mute and volume', async () => {
    const catalog = validateCatalog(structuredClone(fixture));
    const station = catalog.stations.find(station => station.streams.length)!;
    station.streams[0] = {
      ...station.streams[0],
      verificationStatus: 'verified',
      rightsStatus: 'permission-granted',
      format: 'mp3',
    };
    const audio = document.createElement('audio');
    vi.spyOn(audio, 'play').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    const clear = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: RADIO_RECORDING, useValue: { Enabled: true, AllowProhibitedRecording: false } },
        {
          provide: CatalogService,
          useValue: {
            stationName: CatalogService.prototype.stationName,
            catalog: signal(catalog),
            locale: signal('en'),
          },
        },
        { provide: MEDIA_ENGINE, useValue: { audio, clear, supports: () => true, load: async () => undefined } },
      ],
    });
    const player = TestBed.inject(PlayerService);
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const view = TestBed.createComponent(PlayerComponent);
    try {
      view.detectChanges();
      await view.whenStable();
      expect(view.nativeElement.querySelector('app-recording-controls')).not.toBeNull();
      expect(view.isStable()).toBe(true);
      const button = (name: string) =>
        Array.from(view.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
          button => button.textContent!.trim() === name,
        )!;
      expect(view.nativeElement.querySelector('app-station-artwork')).toBeTruthy();
      const primary = button('Pause');
      primary.focus();
      primary.click();
      view.detectChanges();
      await view.whenStable();
      expect(player.state()).toBe('paused');
      expect(button('Play')).toBe(primary);
      expect(document.activeElement).toBe(primary);
      button('Play').click();
      await Promise.resolve();
      await Promise.resolve();
      audio.dispatchEvent(new Event('playing'));
      view.detectChanges();
      await view.whenStable();
      expect(player.state()).toBe('playing');
      expect(button('Pause')).toBe(primary);
      expect(document.activeElement).toBe(primary);
      button('Mute').click();
      expect(audio.muted).toBe(true);
      const volume = view.nativeElement.querySelector('input') as HTMLInputElement;
      volume.value = '0.3';
      volume.dispatchEvent(new Event('input'));
      expect(audio.volume).toBe(0.3);
      const search = document.createElement('input');
      search.type = 'search';
      document.body.append(search);
      button('Stop').click();
      view.detectChanges();
      await view.whenStable();
      expect(player.state()).toBe('idle');
      expect(view.nativeElement.querySelector('section')).toBeNull();
      expect(clear).toHaveBeenCalled();
      expect(document.activeElement).toBe(search);
      search.remove();
    } finally {
      view.destroy();
    }
  });
});
