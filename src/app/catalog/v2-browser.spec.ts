import { TestBed } from '@angular/core/testing';
import { CatalogService, CATALOG_STORAGE } from './catalog.service';
import { FavoritesService, FAVORITES_STORAGE } from './favorites.service';
import { MEDIA_ENGINE } from '../player/media-engine';
import { validateV2 } from './catalog-v2';
import { v2Fixture } from './testing/v2.fixture';
import { V2BrowserComponent } from './v2-browser';

describe('Recovered v2 browser integration', () => {
  it('returns focus to Favorites after removing the final visible favorite', async () => {
    const audio = document.createElement('audio');
    vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    const storage = { get: async () => ({ value: null }), set: async () => undefined };
    TestBed.configureTestingModule({
      providers: [
        { provide: CATALOG_STORAGE, useValue: storage },
        { provide: FAVORITES_STORAGE, useValue: storage },
        {
          provide: MEDIA_ENGINE,
          useValue: { audio, load: async () => undefined, clear: () => undefined, supports: () => true },
        },
      ],
    });
    const data = TestBed.inject(CatalogService);
    data.catalog.set(validateV2(structuredClone(v2Fixture)));
    const favorites = TestBed.inject(FavoritesService);
    await favorites.loaded;
    await favorites.toggle(data.catalog()!.stations[0].id);
    const view = TestBed.createComponent(V2BrowserComponent);
    view.componentInstance.favoritesOnly.set(true);
    view.detectChanges();
    await view.whenStable();
    const host = view.nativeElement as HTMLElement;
    const filter = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      b => b.textContent?.trim() === 'Favorites',
    )!;
    const remove = host.querySelector<HTMLButtonElement>('.station-card .favorite')!;
    remove.focus();
    expect(document.activeElement).toBe(remove);
    remove.click();
    view.detectChanges();
    await view.whenStable();
    expect(host.querySelectorAll('.station-card')).toHaveLength(0);
    expect(document.activeElement).toBe(filter);
  });
});

async function browser(locale = 'en') {
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  const storage = { get: async () => ({ value: null }), set: async () => undefined };
  TestBed.configureTestingModule({
    providers: [
      { provide: CATALOG_STORAGE, useValue: storage },
      { provide: FAVORITES_STORAGE, useValue: storage },
      {
        provide: MEDIA_ENGINE,
        useValue: { audio, load: async () => undefined, clear: () => undefined, supports: () => true },
      },
    ],
  });
  const data = TestBed.inject(CatalogService);
  data.catalog.set(validateV2(structuredClone(v2Fixture)));
  await data.setLocale(locale);
  const favorites = TestBed.inject(FavoritesService);
  await favorites.loaded;
  const view = TestBed.createComponent(V2BrowserComponent);
  view.detectChanges();
  await view.whenStable();
  return { view, data, favorites, component: view.componentInstance, host: view.nativeElement as HTMLElement };
}
describe('v2 review usability regressions', () => {
  it('keeps Search, UI Language and Theme outside collapsed advanced filters', async () => {
    const { host } = await browser();
    for (const selector of ['input[type=search]', '[data-control=locale]', '[data-control=theme]']) {
      const control = host.querySelector(selector)!;
      expect(control).not.toBeNull();
      expect(control.closest('details')).toBeNull();
    }
    expect(host.querySelector('details')!.open).toBe(false);
  });
  it('offers counted populated regions but not Maharashtra or Delhi; retains all location records', async () => {
    const { view, component, data, host } = await browser();
    component.set('location', 'in');
    view.detectChanges();
    const options = [...host.querySelectorAll<HTMLOptionElement>('[data-control=location] option')];
    expect(options.some(o => o.value === 'in-mh' || o.value === 'in-dl')).toBe(false);
    expect(options.find(o => o.value === 'in-tn')?.textContent).toMatch(/·\s*\d+/);
    expect(data.catalog()!.locations.some(l => l.id === 'in-mh')).toBe(true);
    expect(data.catalog()!.locations.some(l => l.id === 'in-dl')).toBe(true);
    component.set('location', 'in-mh');
    expect(component.selection().location).toBe('in');
    expect(data.catalog()!.locations.filter(l => !component.population().has(l.id))).toHaveLength(40);
  });
  it('keeps valid sparse locality paths available', async () => {
    const { component } = await browser();
    component.set('location', 'ca');
    component.set('location', 'ca-on');
    expect(component.children().some(l => l.id === 'ca-on-toronto')).toBe(true);
    component.set('location', 'ca-on-toronto');
    expect(component.trail().map(l => l.id)).toEqual(['ca', 'ca-on', 'ca-on-toronto']);
    expect(component.rows().length).toBeGreaterThan(0);
  });
  for (const [locale, empty, clear] of [
    ['en', 'No stations match', 'Clear filters'],
    ['ta', 'நிலையங்கள் இல்லை', 'வடிகட்டிகளை நீக்கு'],
    ['sa', 'न लब्धानि', 'शोधकान् पुनः स्थापय'],
  ]) {
    it(locale + ': announces empty results, resets every filter and returns focus to visible Search', async () => {
      const { view, component, favorites, host } = await browser(locale);
      const id = TestBed.inject(CatalogService).catalog()!.stations[0].id;
      await favorites.toggle(id);
      component.set('location', 'in-tn');
      component.set('language', 'ta');
      component.set('genre', 'music');
      component.set('sort', 'country');
      component.query.set('does-not-exist-xyz');
      component.listenNowOnly.set(true);
      component.favoritesOnly.set(true);
      component.grouping.set('broadcaster');
      view.detectChanges();
      await view.whenStable();
      expect(component.rows()).toHaveLength(0);
      expect(host.textContent).toContain(empty);
      const reset = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === clear)!;
      expect(reset.closest('details')).toBeNull();
      reset.click();
      view.detectChanges();
      await view.whenStable();
      expect(component.rows()).toHaveLength(117);
      expect(component.query()).toBe('');
      expect(component.selection().location).toBe('');
      expect(component.selection().language).toBe('');
      expect(component.selection().genre).toBe('');
      expect(component.selection().sort).toBe('name');
      expect(component.grouping()).toBe('none');
      expect(component.listenNowOnly()).toBe(false);
      expect(component.favoritesOnly()).toBe(false);
      expect(component.hasFilters()).toBe(false);
      expect(favorites.has(id)).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('input[type=search]'));
    });
    it(locale + ': visibly exposes catalogue storage and Favorites persistence warnings', async () => {
      const { view, data, favorites, host } = await browser(locale);
      data.storageWarning.set('Catalogue loaded, but could not be saved for offline use.');
      favorites.warning.set(true);
      view.detectChanges();
      const warnings = [...host.querySelectorAll('[data-warning]')];
      expect(warnings).toHaveLength(2);
      expect(
        warnings.every(w => w.getAttribute('role') === 'status' && !w.closest('details') && !!w.textContent?.trim()),
      ).toBe(true);
      if (locale !== 'en') expect(warnings.every(w => !w.textContent?.includes('could not be saved'))).toBe(true);
      data.storageWarning.set('');
      favorites.warning.set(false);
      view.detectChanges();
      expect(host.querySelectorAll('[data-warning]')).toHaveLength(0);
    });
  }
  it('clears removed geographic selection after a valid catalogue refresh', async () => {
    const { view, component, data } = await browser();
    component.set('location', 'ca-on-toronto');
    view.detectChanges();
    const next = structuredClone(data.catalog()!);
    for (const s of [...next.stations, ...(next.discoveryStations ?? [])])
      if (s.localityId === 'ca-on-toronto') s.localityId = null;
    next.locations = next.locations.filter(l => l.id !== 'ca-on-toronto');
    next.manifest.counts.locations--;
    data.catalog.set(validateV2(next));
    view.detectChanges();
    expect(component.selection().location).toBe('');
    expect(component.trail()).toHaveLength(0);
    expect(component.rows()).toHaveLength(117);
  });
});
