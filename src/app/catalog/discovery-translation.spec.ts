import { stationDisplayName, filterStations, type Catalog } from './catalog.models';

describe('V2 metadata-only station localization', () => {
  const station = { id: 'stage43-lankasri-fm-gb', name: 'Lankasri FM' };
  const catalogue = {
    localization: {
      en: { discoveryNames: { [station.id]: 'Lankasri FM' } },
      ta: { discoveryNames: { [station.id]: 'லங்காசிறி எஃப்.எம்.' } },
      sa: { discoveryNames: { [station.id]: 'लङ्काश्री एफ्.एम्.' } },
    },
  } as unknown as Catalog;

  it('renders Tamil and Sanskrit discovery labels without renaming catalogue IDs', () => {
    expect(stationDisplayName(catalogue, 'en', station)).toBe(station.name);
    expect(stationDisplayName(catalogue, 'ta', station)).toBe('லங்காசிறி எஃப்.எம்.');
    expect(stationDisplayName(catalogue, 'sa', station)).toBe('लङ्काश्री एफ्.एम्.');
    expect(stationDisplayName(catalogue, 'fr', station)).toBe(station.name);
    expect(station.id).toBe('stage43-lankasri-fm-gb');
  });

  it('never displays missing translations as raw IDs', () => {
    expect(stationDisplayName(catalogue, 'sa', { id: 'not-translated', name: 'Official Brand' })).toBe('Official Brand');
  });
});
