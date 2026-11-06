import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';
import { CATALOG_FETCH, CATALOG_STORAGE } from '../catalog/catalog.service';
describe('HomePage', () => {
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
