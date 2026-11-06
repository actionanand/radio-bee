import { TestBed } from '@angular/core/testing';
import { fixture } from './catalog.fixture';
import { validateCatalog } from './catalog.validation';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { StationBrowserComponent } from './station-browser';
import { Stream, Station } from './catalog.models';
import { StreamStatus } from './stream-eligibility';
import { uiLabel } from './catalog.ui';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';

const approved: Stream = {
  id: 'test',
  url: 'https://owned.test/live.mp3',
  format: 'mp3',
  verificationStatus: 'verified',
  rightsStatus: 'permission-granted',
  lastVerifiedAt: '2026-11-03T00:00:00Z',
  sourceId: 'test',
};
const cases: { status: StreamStatus; streams: Stream[] }[] = [
  { status: 'noStream', streams: [] },
  { status: 'verificationPending', streams: [{ ...approved, verificationStatus: 'unverified' }] },
  { status: 'permissionPending', streams: [{ ...approved, rightsStatus: 'unconfirmed' }] },
  { status: 'streamUnavailable', streams: [{ ...approved, verificationStatus: 'unavailable' }] },
  { status: 'invalidStream', streams: [{ ...approved, url: 'http://unsafe.test/live' }] },
  { status: 'incompatibleStream', streams: [{ ...approved, format: 'unknown' }] },
  { status: 'playerUnavailable', streams: [approved] },
  { status: 'ready', streams: [approved] },
];
describe('Station card playback availability', () => {
  for (const locale of ['en', 'ta', 'sa'])
    for (const scenario of cases) {
      it(`${locale}: ${scenario.status} renders only appropriate controls and keeps details accessible`, () => {
        const audio = document.createElement('audio');
        TestBed.configureTestingModule({
          providers: [
            { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
            {
              provide: MEDIA_ENGINE,
              useValue:
                scenario.status === 'playerUnavailable'
                  ? null
                  : { audio, supports: () => true, load: async () => undefined, clear: () => undefined },
            },
          ],
        });
        const data = TestBed.inject(CatalogService);
        vi.spyOn(data, 'start').mockResolvedValue();
        const c = validateCatalog(structuredClone(fixture));
        const station: Station = { ...c.stations[0], id: 'sooriyan-srilanka', streams: scenario.streams };
        c.stations = [station];
        data.catalog.set(c);
        data.locale.set(locale);
        const player = TestBed.inject(PlayerService);
        const play = vi.spyOn(player, 'play').mockResolvedValue();
        const view = TestBed.createComponent(StationBrowserComponent);
        view.detectChanges();
        const article = view.nativeElement.querySelector('article') as HTMLElement;
        expect(article.textContent).toContain(uiLabel(locale, scenario.status));
        const buttons = article.querySelectorAll<HTMLButtonElement>('button.play');
        expect(article.querySelector('button.favorite')).toBeTruthy();
        const broadcaster = article.querySelector<HTMLAnchorElement>('a');
        if (scenario.status === 'ready') {
          expect(broadcaster).toBeNull();
          expect(buttons.length).toBe(1);
          expect(buttons[0].disabled).toBe(false);
          buttons[0].click();
          expect(play).toHaveBeenCalledWith(station);
        } else {
          expect(broadcaster?.href).toBe('https://www.sooriyanfm.lk/');
          expect(broadcaster?.getAttribute('aria-label')).toContain(uiLabel(locale, 'broadcasterPage'));
          expect(broadcaster?.rel).toContain('noopener');
          expect(buttons.length).toBe(0);
          expect(play).not.toHaveBeenCalled();
        }
        const details = article.querySelector('details')!;
        expect(details).toBeTruthy();
        details.querySelector('summary')!.click();
        expect(details.open).toBe(true);
      });
    }
});
