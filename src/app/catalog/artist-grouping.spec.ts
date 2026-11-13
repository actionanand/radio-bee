import { v2Fixture } from './testing/v2.fixture';
import { browseV2, initialBrowse, validateV2 } from './catalog-v2';
import { Catalog, emptyFilters, filterStations } from './catalog.models';

function artistCatalogue(): Catalog {
  const data = structuredClone(v2Fixture) as Catalog;
  data.manifest.files['artists'] = 'artists.json';
  data.artists = [
    { id: 'michael-jackson', name: 'Michael Jackson', aliases: ['MJ'] },
    { id: 'a-r-rahman', name: 'A. R. Rahman', aliases: ['ARR', 'AR Rahman'] },
  ];
  if (!data.categories.some(category => category.id === 'artist-hits'))
    data.categories.push({ id: 'artist-hits', name: 'Artist & Hits' });
  for (const station of data.stations.slice(0, 2)) {
    station.artistIds = ['michael-jackson'];
    if (!station.genres.includes('artist-hits')) station.genres.push('artist-hits');
  }
  return data;
}

describe('Artists directory metadata', () => {
  it('loads optional artist registry and retains old catalogue compatibility', () => {
    expect(validateV2(structuredClone(v2Fixture)).artists).toBeUndefined();
    const catalog = validateV2(artistCatalogue());
    expect(catalog.artists).toHaveLength(2);
    expect(catalog.stations).toHaveLength(71);
    expect(catalog.stations.flatMap(station => station.streams)).toHaveLength(74);
  });

  it('groups two independent station IDs, does not merge their streams, and searches aliases', () => {
    const catalog = validateV2(artistCatalogue());
    const stations = browseV2(catalog, { ...initialBrowse, artist: 'michael-jackson' });
    expect(stations).toHaveLength(2);
    expect(new Set(stations.map(station => station.id)).size).toBe(2);
    expect(filterStations(catalog, { ...emptyFilters, search: 'Michael Jackson' })).toHaveLength(2);
    expect(filterStations(catalog, { ...emptyFilters, search: 'MJ' })).toHaveLength(2);
    expect(browseV2(catalog, { ...initialBrowse, artist: 'a-r-rahman' })).toHaveLength(0);
  });

  it('supports one radio appearing under multiple artists', () => {
    const catalog = artistCatalogue();
    catalog.stations[0].artistIds = ['michael-jackson', 'a-r-rahman'];
    const valid = validateV2(catalog);
    expect(browseV2(valid, { ...initialBrowse, artist: 'michael-jackson' })).toHaveLength(2);
    expect(browseV2(valid, { ...initialBrowse, artist: 'a-r-rahman' })).toHaveLength(1);
  });

  it('rejects dangling artist IDs, duplicates, unadvertised registries, and bad genres', () => {
    const broken = artistCatalogue();
    broken.stations[0].artistIds = ['missing'];
    expect(() => validateV2(broken)).toThrow(/unknown reference/);
    const duplicate = artistCatalogue();
    duplicate.stations[0].artistIds = ['michael-jackson', 'michael-jackson'];
    expect(() => validateV2(duplicate)).toThrow(/duplicate list/);
    const unadvertised = artistCatalogue();
    delete unadvertised.manifest.files['artists'];
    expect(() => validateV2(unadvertised)).toThrow(/advertised artists/);
    const badGenre = artistCatalogue();
    badGenre.stations[0].genres = ['music'];
    expect(() => validateV2(badGenre)).toThrow(/artist membership category/);
  });
});
