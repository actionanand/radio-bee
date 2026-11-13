import { validateV2, browseV2, initialBrowse, locationMembership } from '../catalog/catalog-v2';
import { v2Fixture } from '../catalog/testing/v2.fixture';
import { allStations } from '../catalog/catalog.models';
import {
  Crumb,
  collapseLocationCrumbs,
  geographicCrumbs,
  continentCountries,
  continentFor,
  featuredStations,
  geographicScope,
  locationUrl,
  nearbyStations,
} from './directory.model';
import { directoryText } from './directory.labels';
describe('Directory metadata navigation', () => {
  const data = () => validateV2(structuredClone(v2Fixture));
  it('maps every published country exactly once without using language as geography', () => {
    const c = data(),
      codes = Object.values(continentCountries).flat();
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...c.manifest.countries].sort());
    expect(continentFor('IN')).toBe('asia');
    expect(continentFor('LK')).toBe('asia');
    expect(continentFor('MU')).toBe('africa');
    expect(continentFor('CA')).toBe('north-america');
    expect(continentFor('AU')).toBe('oceania');
    expect(continentFor('ZZ')).toBe('other');
  });
  it('displays only the API-selected Home radios in their exact order', () => {
    const c = data();
    const ids = ['oli-968-sg', 'air-nagercoil', 'sooriyan-srilanka'];
    const before = JSON.stringify(c);
    expect(featuredStations(c, ids).map(s => s.id)).toEqual(ids);
    expect(JSON.stringify(c)).toBe(before);
    const shuffled = { ...c, stations: [...c.stations].reverse(), discoveryStations: [...c.discoveryStations!].reverse() };
    expect(featuredStations(shuffled, ids).map(s => s.id)).toEqual(ids);
  });
  it('shows no hardcoded fallback stations if API selection is missing', () => {
    const c = data();
    expect(featuredStations(c)).toEqual([]);
    expect(featuredStations(c, [])).toEqual([]);
    expect(featuredStations(c, ['missing-id'])).toEqual([]);
    expect(featuredStations(c, ['air-nagercoil']).map(s => s.id)).toEqual(['air-nagercoil']);
  });
  it('uses the number of Home stations supplied by API without limiting to ten', () => {
    const c = data();
    const ids = allStations(c).slice(0, 13).map(s => s.id).reverse();
    expect(featuredStations(c, ids).map(s => s.id)).toEqual(ids);
    expect(featuredStations(c, ids)).toHaveLength(13);
    expect(allStations(c)).toHaveLength(117);
  });
  it('keeps all 10 district identities including 2 candidate-bearing and 8 discovery-only', () => {
    const c = data(),
      district = 'in-tn-kanyakumari',
      stations = browseV2(c, { ...initialBrowse, location: district });
    expect(stations).toHaveLength(10);
    expect(stations.filter(s => s.streams.length)).toHaveLength(2);
    expect(stations.filter(s => s.discovery)).toHaveLength(8);
    expect(locationMembership(c).get(district)).toBe(10);
    const nagercoil = stations.find(s => s.id === 'air-nagercoil')!;
    expect(nearbyStations(c, nagercoil)).toHaveLength(9);
  });
  it('builds shareable canonical paths and rejects invented or conflicting ancestors', () => {
    const c = data(),
      path = locationUrl(c, 'in-tn-kanyakumari');
    expect(path).toEqual(['/world', 'asia', 'in', 'in-tn', 'in-tn-kanyakumari']);
    expect(geographicScope(c, path.slice(1)).valid).toBe(true);
    expect(geographicScope(c, ['europe', 'in', 'in-tn']).valid).toBe(false);
    expect(geographicScope(c, ['asia', 'in', 'missing']).valid).toBe(false);
    expect(geographicScope(c, ['asia', 'in', 'in-tn-kanyakumari']).valid).toBe(false);
  });
  it('supports localities without districts and leaves unpublished continent mappings explicit', () => {
    const c = data();
    expect(locationUrl(c, 'ca-on-toronto')).toEqual(['/world', 'north-america', 'ca', 'ca-on', 'ca-on-toronto']);
    expect(geographicScope(c, ['north-america', 'ca', 'ca-on', 'ca-on-toronto']).valid).toBe(true);
    expect(geographicScope(c, ['asia', 'ca', 'ca-on']).valid).toBe(false);
  });
  it('collapses only a consecutive equal district/locality label, retaining the district URL', () => {
    const crumbs: Crumb[] = [
      { name: 'India', url: ['/in'], kind: 'country' },
      { name: 'Chennai', url: ['/district'], kind: 'district' },
      { name: '  CHENNAI  ', url: ['/locality'], kind: 'locality' },
    ];
    const original = JSON.stringify(crumbs);
    expect(collapseLocationCrumbs(crumbs).map(c => c.url)).toEqual([['/in'], ['/district']]);
    expect(JSON.stringify(crumbs)).toBe(original);
  });
  it('does not collapse distinct labels, equal country/state labels, or non-consecutive locations', () => {
    const crumbs: Crumb[] = [
      { name: 'Same', url: ['/country'], kind: 'country' },
      { name: 'Same', url: ['/state'], kind: 'state' },
      { name: 'Chennai', url: ['/district'], kind: 'district' },
      { name: 'Other', url: ['/middle'], kind: 'locality' },
      { name: 'Chennai', url: ['/last'], kind: 'locality' },
    ];
    expect(collapseLocationCrumbs(crumbs)).toHaveLength(5);
  });
  for (const name of ['சென்னை', 'चेन्नै'])
    it('normalizes repeated non-Latin displayed labels: ' + name, () => {
      expect(
        collapseLocationCrumbs([
          { name, url: ['/district'], kind: 'district' },
          { name: '  ' + name + '  ', url: ['/locality'], kind: 'locality' },
        ]).map(c => c.url),
      ).toEqual([['/district']]);
    });
  it('keeps canonical Chennai locations and all assignments intact when shortening navigation', () => {
    const c = data(),
      before = JSON.stringify(c);
    const crumbs = geographicCrumbs(
      c,
      'asia',
      'in-tn-chennai-chennai',
      key => key,
      (_, name) => name,
    );
    expect(crumbs.map(crumb => crumb.name)).toEqual(['asia', 'India', 'Tamil Nadu', 'Chennai']);
    expect(crumbs.at(-1)!.url).toEqual(['/world', 'asia', 'in', 'in-tn', 'in-tn-chennai']);
    expect(c.locations.filter(l => l.id.startsWith('in-tn-chennai'))).toHaveLength(2);
    expect(JSON.stringify(c)).toBe(before);
  });
  for (const locale of ['en', 'ta', 'sa'])
    it('localizes navigation and details labels in ' + locale, () => {
      for (const key of [
        'home',
        'world',
        'languages',
        'genres',
        'featured',
        'selectionInfo',
        'menu',
        'closeMenu',
        'about',
        'documentedLanguages',
      ] as const)
        expect(directoryText(locale, key).trim().length).toBeGreaterThan(0);
      if (locale !== 'en') expect(directoryText(locale, 'featured')).not.toBe('Featured Radios');
    });
});
