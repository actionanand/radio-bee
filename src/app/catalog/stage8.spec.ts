import { TestBed } from '@angular/core/testing';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { currentPublishedFixture } from './testing/published-1.3.fixture';
import { validateCatalog } from './catalog.validation';
import { StationBrowserComponent } from './station-browser';
import { StationDetailsContentComponent } from './station-details-content';
import { FAVORITES_STORAGE, FavoritesService } from './favorites.service';
import { MEDIA_ENGINE } from '../player/media-engine';
import { THEME_STORAGE } from '../theme/theme.service';
describe('Internet-only browsing and independent Details metadata', () => {
  function setup(saved: string[] = []) {
    const write = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: FAVORITES_STORAGE, useValue: { get: async () => ({ value: JSON.stringify(saved) }), set: write } },
        { provide: THEME_STORAGE, useValue: { get: async () => ({ value: null }), set: async () => undefined } },
        { provide: MEDIA_ENGINE, useValue: null },
      ],
    });
    const data = TestBed.inject(CatalogService),
      catalog = validateCatalog(structuredClone(currentPublishedFixture));
    vi.spyOn(data, 'start').mockResolvedValue();
    data.catalog.set(catalog);
    return { data, catalog, write };
  }
  it('shows only candidate-bearing records and responds to reduced/updated catalogues dynamically', () => {
    const { data, catalog } = setup();
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    const candidates = catalog.stations.filter(s => s.streams.length);
    expect(view.componentInstance.count()).toBe(candidates.length);
    expect(view.nativeElement.querySelectorAll('.station-card').length).toBe(candidates.length);
    expect(view.nativeElement.textContent).not.toContain('MHz');
    data.catalog.set({ ...catalog, stations: candidates.slice(0, 3) });
    view.detectChanges();
    expect(view.componentInstance.count()).toBe(3);
    data.catalog.set({ ...catalog, stations: [] });
    view.detectChanges();
    expect(view.componentInstance.count()).toBe(0);
  });
  it('never merges unrelated programmes merely because they share a network', () => {
    const { data, catalog } = setup();
    const a = catalog.stations.find(s => s.streams.length)!;
    data.catalog.set({
      ...catalog,
      stations: [
        a,
        {
          ...a,
          id: 'other-programme',
          name: 'Different programme',
          streams: [{ ...a.streams[0], id: 'different', url: 'https://broadcaster.example/another' }],
        },
      ],
    });
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    expect(view.componentInstance.count()).toBe(2);
  });
  it('preserves missing favorite IDs and permits explicit removal independently of new catalogue counts', async () => {
    const { catalog, write } = setup(['retired-id']);
    const favorites = TestBed.inject(FavoritesService);
    await favorites.loaded;
    const view = TestBed.createComponent(StationBrowserComponent);
    view.componentInstance.selectCategory('favorites');
    view.detectChanges();
    expect(view.componentInstance.count()).toBe(0);
    expect(favorites.has('retired-id')).toBe(true);
    expect(write).not.toHaveBeenCalled();
    await favorites.toggle(catalog.stations[0].id);
    expect(write).toHaveBeenCalled();
    expect(favorites.has('retired-id')).toBe(true);
  });
  for (const locale of ['en', 'ta', 'sa'])
    it(`renders source-backed candidate details and omits missing geography in ${locale}`, () => {
      const { data, catalog } = setup();
      data.locale.set(locale);
      const located = catalog.stations.find(s => s.regionId)!;
      const view = TestBed.createComponent(StationDetailsContentComponent);
      view.componentRef.setInput('station', {
        ...located,
        listingStatus: 'candidate',
        delivery: 'fm',
        frequencyMHz: 101.1,
      });
      view.detectChanges();
      expect(view.componentInstance.fields().some(f => f.label === 'region')).toBe(true);
      expect(view.componentInstance.fields().some(f => f.label === 'network')).toBe(true);
      expect(view.nativeElement.textContent).toContain('101.1 MHz');
      view.componentRef.setInput('station', {
        ...located,
        localityId: null,
        districtId: null,
        regionId: null,
        frequencyMHz: null,
      });
      view.detectChanges();
      expect(
        view.componentInstance.fields().some(f => ['region', 'district', 'city', 'frequency'].includes(f.label)),
      ).toBe(false);
      expect(view.componentInstance.fields().every(f => f.value.trim())).toBe(true);
    });
  it('uses Ionic selects and dispatches country changes through dependent-filter resets', () => {
    setup();
    const view = TestBed.createComponent(StationBrowserComponent);
    view.detectChanges();
    expect(view.nativeElement.querySelector('select')).toBeNull();
    const country = view.nativeElement.querySelector('[data-filter="country"]') as HTMLElement;
    country.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'IN' } }));
    view.detectChanges();
    expect(view.nativeElement.querySelectorAll('.filters ion-select')).toHaveLength(5);
    view.componentInstance.change('region', 'in-tn');
    country.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'LK' } }));
    view.detectChanges();
    expect(view.nativeElement.querySelectorAll('.filters ion-select')).toHaveLength(2);
    expect(view.componentInstance.filters().region).toBe('');
  });
  it('labels Ionic select dialogs and corrects only their visual list semantics', () => {
    setup();
    const view = TestBed.createComponent(StationBrowserComponent);
    expect(view.componentInstance.selectOptions('Theme').htmlAttributes).toEqual({
      role: 'dialog',
      'aria-label': 'Theme',
      lang: 'en',
    });
    const overlay = document.createElement('ion-popover');
    overlay.className = 'radio-select-popover';
    overlay.innerHTML = '<ion-select-popover><ion-list role="list"></ion-list></ion-select-popover>';
    document.body.append(overlay);
    overlay.dispatchEvent(new CustomEvent('ionPopoverWillPresent', { bubbles: true }));
    expect(overlay.querySelector('ion-list')?.getAttribute('role')).toBe('presentation');
    overlay.remove();
  });
});
