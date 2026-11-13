import { validateV2 } from './catalog-v2';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import { v2Fixture } from './testing/v2.fixture';
import { filterStations, emptyFilters } from './catalog.models';
describe('Artist localization', () => {
  it('switches languages immediately with canonical English and missing/blank fallback', () => {
    const service = TestBed.inject(CatalogService),
      c = validateV2(structuredClone(v2Fixture)),
      a = { id: 'adele', name: 'Adele', aliases: [] };
    c.localization['ta']['artistNames'] = { adele: 'அடெல்' };
    c.localization['sa']['artistNames'] = { adele: 'अडेल' };
    service.catalog.set(c);
    for (const locale of ['en', 'ta', 'sa']) {
      service.locale.set(locale);
      expect(service.artistName(a)).toBe(locale === 'en' ? a.name : c.localization[locale]['artistNames']['adele']);
    }
    expect(service.artistName({ ...a, id: 'unknown' })).toBe('Adele');
    c.localization['sa']['artistNames']['adele'] = ' ';
    expect(service.artistName(a)).toBe('Adele');
    delete c.localization['sa']['artistNames'];
    expect(service.artistName(a)).toBe('Adele');
    service.catalog.set(null);
    expect(service.artistName(a)).toBe('Adele');
  });
  it('searches translated artist names and aliases without changing memberships', () => {
    const c = validateV2(structuredClone(v2Fixture));
    c.artists = [{ id: 'adele', name: 'Adele', aliases: ['Adelle'] }];
    c.stations[0].artistIds = ['adele'];
    c.localization['ta']['artistNames'] = { adele: 'அடெல்' };
    c.localization['sa']['artistNames'] = { adele: 'अडेल' };
    for (const search of ['Adele', 'Adelle', 'அடெல்', 'अडेल'])
      expect(filterStations(c, { ...emptyFilters, search }).map(s => s.id)).toContain(c.stations[0].id);
  });
});
