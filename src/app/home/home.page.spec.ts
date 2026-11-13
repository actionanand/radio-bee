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
    const tuner = () => fixture.nativeElement.querySelector('.tuner') as HTMLElement;
    for (const state of ['idle', 'loading', 'paused', 'error', 'playing', 'loading'] as const) {
      player.state.set(state);
      fixture.detectChanges();
      expect(tuner().classList.contains('is-playing')).toBe(state === 'playing');
      expect(tuner().querySelectorAll('.segments[aria-hidden="true"] span')).toHaveLength(24);
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
    expect(fixture.nativeElement.querySelector('app-station-browser')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('audio')).toBeNull();
  });
});
