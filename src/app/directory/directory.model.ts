import { Catalog, Station, allStations } from '../catalog/catalog.models';
import { ancestry } from '../catalog/catalog-v2';

export const continentCountries: Readonly<Record<string, readonly string[]>> = {
  africa: ['MU', 'ZA'],
  asia: ['AE', 'BH', 'IN', 'KW', 'LK', 'MY', 'QA', 'SG'],
  europe: ['CH', 'DE', 'FR', 'GB', 'IE', 'NO'],
  'north-america': ['CA', 'US'],
  oceania: ['AU', 'NZ'],
};
export type ContinentId = 'africa' | 'asia' | 'europe' | 'north-america' | 'oceania' | 'other';
export function continentFor(country: string): ContinentId {
  return (Object.keys(continentCountries).find(key => continentCountries[key].includes(country)) ??
    'other') as ContinentId;
}
export interface Crumb {
  name: string;
  url: string[];
  current?: boolean;
  kind?: 'world' | 'continent' | 'country' | 'state' | 'district' | 'locality' | 'station';
}
const normalizedCrumbName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
/** Presentation only: preserve district navigation when its following locality has the same displayed name. */
export function collapseLocationCrumbs(crumbs: readonly Crumb[]): Crumb[] {
  const result: Crumb[] = [];
  for (const crumb of crumbs) {
    const previous = result.at(-1);
    if (
      previous?.kind === 'district' &&
      crumb.kind === 'locality' &&
      normalizedCrumbName(previous.name) === normalizedCrumbName(crumb.name)
    )
      continue;
    result.push({ ...crumb });
  }
  return result;
}
export function geographicCrumbs(
  c: Catalog,
  continent: ContinentId | null,
  location: string,
  text: (key: ContinentId | 'world') => string,
  place: (id: string, name: string) => string,
): Crumb[] {
  return collapseLocationCrumbs([
    continent
      ? { name: text(continent), url: ['/world', continent], kind: 'continent' }
      : { name: text('world'), url: ['/world'], kind: 'world' },
    ...ancestry(c, location).map(l => ({ name: place(l.id, l.name), url: locationUrl(c, l.id), kind: l.type })),
  ]);
}
export function locationUrl(c: Catalog, id: string): string[] {
  const chain = ancestry(c, id);
  return ['/world', continentFor(chain[0].countryCode), ...chain.map(l => l.id)];
}
export function stationAncestry(c: Catalog, s: Station) {
  return ancestry(c, s.localityId ?? s.districtId ?? s.regionId ?? s.countryCode.toLowerCase());
}
export function geographicScope(
  c: Catalog,
  segments: string[],
): { valid: boolean; continent: ContinentId | null; location: string } {
  if (!segments.length) return { valid: true, continent: null, location: '' };
  const continent = segments[0] as ContinentId;
  if (![...Object.keys(continentCountries), 'other'].includes(continent))
    return { valid: false, continent: null, location: '' };
  if (segments.length === 1) return { valid: true, continent, location: '' };
  const location = segments.at(-1)!;
  if (!c.locations.some(l => l.id === location)) return { valid: false, continent, location: '' };
  const chain = ancestry(c, location);
  return {
    valid:
      continentFor(chain[0].countryCode) === continent &&
      JSON.stringify(chain.map(l => l.id)) === JSON.stringify(segments.slice(1)),
    continent,
    location,
  };
}
export const compareNames = (a: Station, b: Station) => {
  const x = a.name.normalize('NFKC').toLowerCase(),
    y = b.name.normalize('NFKC').toLowerCase();
  return (x < y ? -1 : x > y ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};
/** Home is exclusively selected and ordered by the published API, never a hardcoded list. */
export function featuredStations(c: Catalog, stationIds: readonly string[] = []): Station[] {
  const byId = new Map(allStations(c).map(station => [station.id, station]));
  return stationIds.map(id => byId.get(id)).filter((station): station is Station => station !== undefined);
}
export function nearbyStations(c: Catalog, s: Station): Station[] {
  const location = s.districtId ?? s.localityId;
  return location
    ? allStations(c)
        .filter(other => other.id !== s.id && stationAncestry(c, other).some(l => l.id === location))
        .sort(compareNames)
    : [];
}
