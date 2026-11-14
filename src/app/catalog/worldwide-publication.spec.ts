import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { worldwideContractFixture } from './testing/worldwide-contract.fixture';
import { allStations, catalogCounts, emptyFilters, filterStations, Station } from './catalog.models';
import { validateCatalog } from './catalog.validation';
import { CatalogService } from './catalog.service';
import { StationCardComponent } from './station-card';
import { FavoritesService } from './favorites.service';
import { StationDetailsService } from './station-details.service';
import { PlayerService } from '../player/player.service';
import { streamEligibility } from './stream-eligibility';
import { TECHNICAL_RADIO_API_CONFIG, STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { environment } from '../../environments/environment';
const catalogue = () => validateCatalog(structuredClone(worldwideContractFixture));
const capabilities = { available: true, supports: () => true };
it('loads the published worldwide contract with all requested country filters and separate counts', () => {
  const c = catalogue();
  expect(catalogCounts(c)).toEqual({ discoverable: 20, candidates: 10, approved: 0 });
  for (const countryCode of ['GB', 'CA', 'US', 'AU', 'SG', 'AE', 'MY', 'CH', 'DE', 'NO', 'NZ', 'ZA']) {
    const matches = filterStations(c, { ...emptyFilters, country: countryCode });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(s => s.countryCode === countryCode)).toBe(true);
  }
  expect(new Set(allStations(c).map(s => s.id)).size).toBe(20);
});
it('allows decoded unverified candidates under trial policy while preserving strict rights and express restrictions', () => {
  const c = catalogue();
  for (const s of c.stations) {
    expect(streamEligibility(s, capabilities, TECHNICAL_RADIO_API_CONFIG).status).toBe('ready');
    expect(streamEligibility(s, capabilities, STRICT_RADIO_API_CONFIG).status).not.toBe('ready');
    expect(streamEligibility(s, capabilities, { ...TECHNICAL_RADIO_API_CONFIG, AllowUnverified: false }).status).toBe(
      'verificationPending',
    );
    expect(s.streams[0].rightsStatus).toBe('unconfirmed');
  }
  const s = structuredClone(c.stations[0]);
  s.streams[0].directListening!.status = 'restricted';
  expect(streamEligibility(s, capabilities, TECHNICAL_RADIO_API_CONFIG).status).toBe('permissionPending');
  const ibc = c.stations.find(s => s.id === 'ibc-tamil-uk')!;
  expect(ibc.streams[0].directListening?.recording).toBe('prohibited');
  for (const s of allStations(c).filter(s => s.discovery))
    expect(streamEligibility(s, capabilities, TECHNICAL_RADIO_API_CONFIG).status).toBe('noStream');
});
for (const locale of ['en', 'ta', 'sa'])
  it(locale + ': app renders trial listening and metadata-only worldwide cards without false approval', () => {
    const c = catalogue(),
      selected = signal(locale);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: {
            stationName: CatalogService.prototype.stationName,
            catalog: signal(c),
            locale: selected,
            t: (_section: string, _id: string, fallback: string) => fallback,
          },
        },
        { provide: FavoritesService, useValue: { has: () => false, toggle: vi.fn() } },
        { provide: StationDetailsService, useValue: { isOpen: () => false, station: () => null, open: vi.fn() } },
        {
          provide: PlayerService,
          useValue: {
            stateFor: () => 'idle',
            eligibility: (s: Station) => streamEligibility(s, capabilities, TECHNICAL_RADIO_API_CONFIG),
            toggle: vi.fn(),
          },
        },
      ],
    });
    const view = TestBed.createComponent(StationCardComponent);
    view.componentRef.setInput(
      'station',
      c.stations.find(s => s.id === 'oli-968-sg'),
    );
    view.detectChanges();
    expect(view.nativeElement.querySelector('button.play')).not.toBeNull();
    expect(environment.hideStreamReviewNotices).toBe(true);
    expect(view.nativeElement.querySelector('.trial-label')).toBeNull();
    expect(view.nativeElement.textContent).toContain('Singapore');
    const technicallyVerified = structuredClone(c.stations.find(s => s.id === 'oli-968-sg')!);
    technicallyVerified.streams[0].verificationStatus = 'verified';
    technicallyVerified.streams[0].lastVerifiedAt = '2026-11-08T00:00:00.000Z';
    view.componentRef.setInput('station', technicallyVerified);
    view.detectChanges();
    expect(view.nativeElement.querySelector('.trial-label')).toBeNull();
    expect(view.nativeElement.querySelector('button.play')).not.toBeNull();
    view.componentRef.setInput(
      'station',
      allStations(c).find(s => s.id === 'atbc-au'),
    );
    view.detectChanges();
    expect(view.nativeElement.querySelector('button.play')).toBeNull();
    expect(view.nativeElement.querySelector('button.details-button')).not.toBeNull();
    view.destroy();
  });
