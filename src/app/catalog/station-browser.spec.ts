import { TestBed } from '@angular/core/testing';
import { fixture } from './catalog.fixture';
import { validateCatalog } from './catalog.validation';
import { emptyFilters, filterStations } from './catalog.models';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { StationBrowserComponent } from './station-browser';

describe('India-only detailed geography', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CATALOG_STORAGE,
          useValue: {
            get: async () => ({ value: null }),
            set: async () => undefined,
          },
        },
      ],
    });
  });
  const catalog = validateCatalog(structuredClone(fixture));
  const stale = { region: 'in-tn', district: 'in-tn-kanyakumari', locality: 'in-tn-kanyakumari-nagercoil' };

  for (const locale of ['en', 'ta', 'sa']) {
    it(`renders and restores the correct controls in ${locale}`, () => {
      const service = TestBed.inject(CatalogService);
      vi.spyOn(service, 'start').mockResolvedValue();
      service.catalog.set(catalog);
      service.locale.set(locale);
      const view = TestBed.createComponent(StationBrowserComponent);
      const browser = view.componentInstance;
      const renderedLabels = (): string[] => {
        view.detectChanges();
        return Array.from(
          view.nativeElement.querySelectorAll('.filters ion-select') as NodeListOf<HTMLElement & { label: string }>,
        ).map(select => select.label);
      };
      const basicLabels = [service.t('catalog', 'countries'), service.t('catalog', 'languages')];
      expect(renderedLabels()).toEqual(basicLabels);
      browser.change('country', 'IN');
      expect(renderedLabels()).toEqual([
        basicLabels[0],
        browser.ui('indiaStates'),
        service.t('catalog', 'districts'),
        service.t('catalog', 'localities'),
        basicLabels[1],
      ]);
      expect(browser.options('region').some(o => o.id === 'in-tn')).toBe(true);
      browser.change('region', stale.region);
      expect(browser.options('country').map(option => option.id)).toEqual(['IN', 'LK']);
      expect(browser.options('district').some(o => o.id === stale.district)).toBe(true);
      browser.change('district', stale.district);
      expect(browser.options('locality').some(o => o.id === stale.locality)).toBe(true);
      browser.change('locality', stale.locality);
      browser.change('language', 'ta');
      browser.change('country', 'LK');
      expect(browser.options('country').map(option => option.id)).toEqual(['IN', 'LK']);
      expect(renderedLabels()).toEqual(basicLabels);
      expect(browser.filters()).toEqual({ ...emptyFilters, country: 'LK', language: 'ta' });
      const ids = browser.grouped().flatMap(g => g.stations.map(s => s.id));
      for (const id of catalog.stations
        .filter(
          station =>
            station.countryCode === 'LK' && station.broadcastLanguages.includes('ta') && station.streams.length,
        )
        .map(station => station.id)) {
        expect(ids).toContain(id);
      }
      expect(browser.options('region')).toEqual([]);
      browser.change('country', 'IN');
      expect(renderedLabels()).toHaveLength(5);
      expect(browser.filters().region).toBe('');
      browser.change('region', stale.region);
      browser.change('country', '');
      expect(renderedLabels()).toEqual(basicLabels);
      expect(browser.filters().region).toBe('');
      browser.change('country', 'US');
      expect(renderedLabels()).toEqual(basicLabels);
      browser.change('region', stale.region);
      expect(browser.filters().region).toBe('');
    });
  }

  it('ignores stale geography outside India, including All Countries, without affecting search or language', () => {
    for (const country of ['', 'LK']) {
      const filters = { ...emptyFilters, country, language: 'ta' };
      expect(filterStations(catalog, { ...filters, ...stale })).toEqual(filterStations(catalog, filters));
    }
    const results = filterStations(catalog, {
      ...emptyFilters,
      country: 'LK',
      language: 'ta',
      search: 'Sooriyan',
      ...stale,
    });
    expect(results.map(s => s.id)).toEqual(['sooriyan-srilanka']);
    const indian = filterStations(catalog, { ...emptyFilters, country: 'IN', ...stale });
    expect(indian.length).toBeGreaterThan(0);
    expect(indian.every(s => s.localityId === stale.locality)).toBe(true);
    // Retain genres as metadata even though no genre control/state exists.
    expect(catalog.stations.find(s => s.id === 'vasantham-srilanka')?.genres).toContain('music');
  });
});
