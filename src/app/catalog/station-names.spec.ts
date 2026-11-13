import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import { emptyFilters, filterStations, stationDisplayName } from './catalog.models';
import { validateV2 } from './catalog-v2';
import { v2Fixture } from './testing/v2.fixture';

function catalog() {
  const c = validateV2(structuredClone(v2Fixture));
  c.localization['ta']['stationNames'] = { 'air-nagercoil': 'ஆகாசவாணி நாகர்கோவில்' };
  c.localization['sa']['stationNames'] = { 'air-nagercoil': 'आकाशवाणी नागरकोइल' };
  return c;
}
describe('Station display names', () => {
  for (const locale of ['en', 'ta', 'sa']) {
    it(locale + ': resolves selected names with canonical English fallback', () => {
      const c = catalog(),
        s = c.stations.find(s => s.id === 'air-nagercoil')!;
      expect(stationDisplayName(c, locale, s)).toBe(
        locale === 'en' ? s.name : c.localization[locale]['stationNames'][s.id],
      );
      expect(stationDisplayName(c, locale, { id: 'missing', name: 'Canonical' })).toBe('Canonical');
    });
  }
  it('falls back for missing, blank, whitespace and older dictionaries', () => {
    const c = catalog(),
      s = c.stations[0];
    for (const value of ['', '  ']) {
      c.localization['ta']['stationNames'][s.id] = value;
      expect(stationDisplayName(c, 'ta', s)).toBe(s.name);
    }
    expect(stationDisplayName(null, 'ta', s)).toBe(s.name);
    expect(stationDisplayName(c, 'unknown', s)).toBe(s.name);
  });
  it('searches all scripts and canonical names without modifying identities or aliases', () => {
    const c = catalog(),
      before = JSON.stringify(c.stations);
    for (const search of ['Akashvani Nagercoil', 'நாகர்கோவில்', 'नागरकोइल'])
      expect(filterStations(c, { ...emptyFilters, search }).map(s => s.id)).toContain('air-nagercoil');
    expect(JSON.stringify(c.stations)).toBe(before);
  });
  it('updates the shared service resolver immediately when locale changes', () => {
    const service = TestBed.inject(CatalogService),
      c = catalog(),
      s = c.stations[0];
    service.catalog.set(c);
    for (const locale of ['ta', 'sa', 'en']) {
      service.locale.set(locale);
      expect(service.stationName(s)).toBe(stationDisplayName(c, locale, s));
    }
  });
});
