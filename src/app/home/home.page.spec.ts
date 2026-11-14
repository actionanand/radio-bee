import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';
import { PlayerService } from '../player/player.service';
import { CATALOG_FETCH, CATALOG_STORAGE } from '../catalog/catalog.service';
describe('HomePage', () => {
  it('animates the decorative tuner only while the player is actually playing', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CATALOG_FETCH,
          useValue: async () => {
            throw new Error('Offline test');
          },
        },
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }) } },
      ],
    });
    const fixture = TestBed.createComponent(HomePage);
    const player = TestBed.inject(PlayerService);
    const hero = () => fixture.nativeElement.querySelector('.radio-hero') as HTMLElement;
    const equalizer = () => fixture.nativeElement.querySelector('app-radio-led-equalizer') as HTMLElement;
    for (const state of ['idle', 'loading', 'paused', 'error', 'playing', 'loading'] as const) {
      player.state.set(state);
      fixture.detectChanges();
      expect(hero().getAttribute('data-playback-state')).toBe(state);
      expect(equalizer().getAttribute('data-active')).toBe(String(state === 'playing'));
      expect(equalizer().querySelectorAll('.rb-leds > .rb-led')).toHaveLength(20);
    }
  });
  it('retains RadioBee branding and renders the discovery browser without playback', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CATALOG_FETCH,
          useValue: async () => {
            throw new Error('Offline test');
          },
        },
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }) } },
      ],
    });
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Stay tuned. Stay buzzing.');
    const data = fixture.componentInstance.data;
    data.locale.set('ta');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('இசையில் இணைவோம். இனிமையாய் ஒலிப்போம்.');
    data.locale.set('sa');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('सदा शृणुत। मधुरं गुञ्जत।');
    expect(fixture.nativeElement.querySelector('app-station-browser')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('audio')).toBeNull();
  });
});
