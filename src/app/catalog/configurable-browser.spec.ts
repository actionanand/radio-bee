import { TestBed } from '@angular/core/testing';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { FAVORITES_STORAGE } from './favorites.service';
import { RADIO_API_CONFIG } from './radio-api.config';
import { StationBrowserComponent } from './station-browser';
import { currentPublishedFixture } from './testing/published-1.3.fixture';
import { validateCatalog } from './catalog.validation';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';

describe('Cards, player and Listen now share the configured policy', () => {
  for (const AllowUnverified of [false, true])
    for (const CheckVerificationStatus of [false, true])
      for (const CheckRightsStatus of [false, true]) {
        const policy = { AllowUnverified, CheckVerificationStatus, CheckRightsStatus };
        it(`agrees throughout the UI for ${JSON.stringify(policy)}`, async () => {
          const audio = document.createElement('audio');
          vi.spyOn(audio, 'play').mockResolvedValue();
          vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
          const load = vi.fn(async () => undefined),
            storage = { get: async () => ({ value: null }), set: async () => undefined };
          TestBed.configureTestingModule({
            providers: [
              { provide: RADIO_API_CONFIG, useValue: policy },
              { provide: CATALOG_STORAGE, useValue: storage },
              { provide: FAVORITES_STORAGE, useValue: storage },
              { provide: MEDIA_ENGINE, useValue: { audio, load, clear: () => undefined, supports: () => true } },
            ],
          });
          const catalog = validateCatalog(structuredClone(currentPublishedFixture));
          const data = TestBed.inject(CatalogService);
          vi.spyOn(data, 'start').mockResolvedValue();
          data.catalog.set(catalog);
          const view = TestBed.createComponent(StationBrowserComponent);
          view.detectChanges();
          const expected = CheckRightsStatus ? 0 : AllowUnverified ? 25 : 1;
          expect(view.nativeElement.querySelectorAll('button.play')).toHaveLength(expected);
          const browser = view.componentInstance;
          browser.selectCategory('listenNow');
          view.detectChanges();
          expect(browser.count()).toBe(expected);
          const player = TestBed.inject(PlayerService);
          for (const station of browser.stations()) expect(player.eligibility(station).status).toBe('ready');
          if (expected) {
            const station = browser.stations()[0];
            (view.nativeElement.querySelector('button.play') as HTMLButtonElement).click();
            await Promise.resolve();
            await Promise.resolve();
            expect(load).toHaveBeenCalledOnce();
            audio.dispatchEvent(new Event('playing'));
            view.detectChanges();
            expect(player.stateFor(station)).toBe('playing');
          }
          player.stop();
        });
      }
  it('keeps country/language filters combined with Listen now and reacts to explicit restrictions', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        {
          provide: MEDIA_ENGINE,
          useValue: {
            audio: document.createElement('audio'),
            load: async () => undefined,
            clear: () => undefined,
            supports: () => true,
          },
        },
      ],
    });
    const catalog = validateCatalog(structuredClone(currentPublishedFixture)),
      data = TestBed.inject(CatalogService);
    vi.spyOn(data, 'start').mockResolvedValue();
    data.catalog.set(catalog);
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    const browser = view.componentInstance;
    browser.selectCategory('listenNow');
    expect(browser.count()).toBe(25);
    browser.change('country', 'IN');
    expect(browser.controls()).toHaveLength(5);
    browser.change('region', 'in-tn');
    browser.change('country', 'LK');
    browser.change('language', 'ta');
    expect(browser.controls()).toHaveLength(2);
    expect(browser.filters().region).toBe('');
    expect(
      browser
        .stations()
        .map(station => station.id)
        .sort(),
    ).toEqual(['shakthi-srilanka', 'sooriyan-srilanka', 'vasantham-srilanka']);
    const next = structuredClone(catalog);
    next.stations.find(station => station.id === 'vasantham-srilanka')!.streams[0].directListening!.status =
      'restricted';
    data.catalog.set(next);
    expect(browser.count()).toBe(2);
  });
});
