import { Catalog, Station, allStations } from './catalog.models';
export { validateV2, v2Manifest } from './catalog-v2.validation';
function ensure(value: unknown, label: string): asserts value {
  if (!value) throw Error('Invalid v2 catalogue: ' + label);
}
export function ancestry(c: Catalog, id: string | null): Catalog['locations'] {
  const result: Catalog['locations'] = [],
    seen = new Set<string>();
  while (id) {
    ensure(!seen.has(id), 'location cycle');
    seen.add(id);
    const node = c.locations.find(l => l.id === id);
    ensure(node, 'location reference');
    result.unshift(node);
    id = node.parentId;
  }
  return result;
}
/** Canonical membership, independent of active filters and stream eligibility. */
export function locationMembership(c: Catalog): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const station of allStations(c))
    for (const location of ancestry(
      c,
      station.localityId ?? station.districtId ?? station.regionId ?? station.countryCode.toLowerCase(),
    ))
      counts.set(location.id, (counts.get(location.id) ?? 0) + 1);
  return counts;
}
export interface BrowseSelection {
  availability: string;
  location: string;
  language: string;
  genre: string;
  theme: string;
  artist: string;
  network: string;
  broadcaster: string;
  classification: string;
  sort: string;
}
export const initialBrowse: BrowseSelection = {
  availability: '',
  location: '',
  language: '',
  genre: '',
  theme: '',
  artist: '',
  network: '',
  broadcaster: '',
  classification: '',
  sort: 'name',
};
export function browseV2(c: Catalog, f: BrowseSelection): Station[] {
  const name = (rows: { id: string; name: string }[], id: string | null | undefined) =>
    rows.find(r => r.id === id)?.name ?? '';
  const rows = allStations(c).filter(
    s =>
      (!f.availability || (s.discovery ? 'discovery-only' : 'stream-bearing') === f.availability) &&
      (!f.location ||
        ancestry(c, s.localityId ?? s.districtId ?? s.regionId ?? s.countryCode.toLowerCase()).some(
          l => l.id === f.location,
        )) &&
      (!f.language || s.broadcastLanguages.includes(f.language)) &&
      (!f.genre || s.genres.includes(f.genre)) &&
      (!f.theme || s.programmeThemeIds?.includes(f.theme)) &&
      (!f.artist || s.artistIds?.includes(f.artist)) &&
      (!f.network || s.networkId === f.network) &&
      (!f.broadcaster || c.networks.find(n => n.id === s.networkId)?.broadcasterId === f.broadcaster) &&
      (!f.classification || (s.languageProfile?.classification ?? 'unknown') === f.classification),
  );
  const key = (s: Station) => {
    switch (f.sort) {
      case 'country':
        return c.locations.find(l => l.type === 'country' && l.countryCode === s.countryCode)?.name ?? '';
      case 'region':
        return name(c.locations, s.regionId);
      case 'district':
        return name(c.locations, s.districtId);
      case 'network':
        return name(c.networks, s.networkId);
      case 'broadcaster':
        return name(c.broadcasters ?? [], c.networks.find(n => n.id === s.networkId)?.broadcasterId);
      case 'language':
        return c.languages.find(l => l.code === (f.language || s.languageProfile?.primaryLanguage))?.name ?? '';
      case 'genre':
        return f.genre ? name(c.categories, f.genre) : (s.genres.map(id => name(c.categories, id)).sort()[0] ?? '');
      case 'artist':
        return name(c.artists ?? [], s.artistIds?.[0]);
      case 'availability':
        return s.discovery ? 'discovery-only' : 'stream-bearing';
      default:
        return s.name;
    }
  };
  const norm = (v: string) => v.normalize('NFKC').toLowerCase();
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return rows.sort((a, b) => {
    const x = norm(key(a)),
      y = norm(key(b));
    return (!x && !y ? 0 : !x ? 1 : !y ? -1 : compare(x, y)) || compare(a.id, b.id);
  });
}
