import { TestBed } from '@angular/core/testing';
import { fixture } from './catalog.fixture';
import { validateCatalog } from './catalog.validation';
import { emptyFilters, filterStations } from './catalog.models';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { StationBrowserComponent } from './station-browser';
import { StationCardComponent } from './station-card';

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

  it('limits language and location to one line each without a radio-type spacer', () => {
    const service = TestBed.inject(CatalogService);
    vi.spyOn(service, 'start').mockResolvedValue();
    service.catalog.set(catalog);
    service.locale.set('en');
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    const card = view.nativeElement.querySelector('.station-card') as HTMLElement;
    expect(card).toBeTruthy();
    const language = card.querySelector('.language-summary app-ellipsis-text .clamped') as HTMLElement;
    const location = card.querySelector('.location app-ellipsis-text .clamped') as HTMLElement;
    expect(language).toBeTruthy();
    expect(location).toBeTruthy();
    expect(language.style.blockSize).toBe('1lh');
    expect(location.style.blockSize).toBe('1lh');
    expect(card.querySelector('.frequency')).toBeNull();
    expect(card.textContent).not.toContain('Online radio');
  });

  it('uses commas for metadata and one-line title ellipsis in shared station cards', () => {
    const service = TestBed.inject(CatalogService);
    vi.spyOn(service, 'start').mockResolvedValue();
    service.catalog.set(catalog);
    service.locale.set('en');
    const station = catalog.stations.find(s => s.id === 'luminous-radio')!;
    const view = TestBed.createComponent(StationCardComponent);
    view.componentRef.setInput('station', {
      ...station,
      name: 'An exceptionally long station title that should occupy a single line',
    });
    view.detectChanges();
    const card = view.nativeElement as HTMLElement;
    const title = card.querySelector('.card-copy h3 app-ellipsis-text .clamped') as HTMLElement;
    const languages = card.querySelector('.language-summary .clamped') as HTMLElement;
    const location = card.querySelector('.location .clamped') as HTMLElement;
    expect(title.textContent).toContain('An exceptionally long station title');
    expect(title.style.blockSize).toBe('1lh');
    expect(languages.textContent).toContain(', ');
    expect(languages.textContent).not.toContain(' · ');
    expect(location.textContent).toContain(', ');
    expect(location.textContent).not.toContain(' · ');
    expect(languages.style.blockSize).toBe('1lh');
    expect(location.style.blockSize).toBe('1lh');
  });

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
