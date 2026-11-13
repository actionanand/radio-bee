export interface Manifest {
  schemaVersion: number;
  catalogVersion: string;
  publishedOn: string;
  defaultLocale: string;
  locales: string[];
  countries: string[];
  files: Record<string, string>;
  localizationRoot: string;
  counts: {
    networks: number;
    stations: number;
    locations: number;
    streams: number;
    verifiedStreams: number;
    discoveryStations?: number;
    discoverableStations?: number;
    stationsWithStreamCandidates?: number;
    productionEligibleStations?: number;
  };
}
export interface Named {
  id: string;
  name: string;
}
export interface Artist extends Named {
  aliases: string[];
}
export interface Network extends Named {
  broadcasterId?: string;
  logoPath?: string;
  aliases: string[];
  countryCodes: string[];
  kind: string;
  website: string | null;
}
export interface Location extends Named {
  type: 'country' | 'state' | 'district' | 'locality';
  parentId: string | null;
  countryCode: string;
}
export interface Language {
  code: string;
  name: string;
  nativeName: string;
}
export interface Source {
  id: string;
  title: string;
  url: string | null;
  kind: string;
  notes: string;
}
export interface DirectListening {
  status: 'needs-review' | 'restricted' | 'allowed';
  reviewedAt: string;
  sourceId: string;
  notes: string;
  recording: 'unconfirmed' | 'prohibited' | 'permission-granted';
  redistribution: 'unconfirmed' | 'prohibited' | 'permission-granted';
}
export interface Stream {
  id: string;
  url: string;
  format: string;
  verificationStatus: 'verified' | 'unverified' | 'unavailable';
  lastVerifiedAt: string | null;
  sourceId: string;
  rightsStatus: string;
  directListening?: DirectListening;
}
export interface Station extends Named {
  languageProfile?: {
    classification: 'single-language' | 'multilingual' | 'unknown';
    primaryLanguage: string | null;
    coverage: string;
  };
  programmeThemeIds?: string[];
  artistIds?: string[];
  aliases?: string[];
  discovery?: {
    availability: DiscoveryStation['availability'];
    reviewedOn: string;
    websiteKind: DiscoveryStation['websiteKind'];
  };
  logoPath?: string;
  networkId: string;
  countryCode: string;
  regionId: string | null;
  districtId: string | null;
  localityId: string | null;
  broadcastLanguages: string[];
  genres: string[];
  delivery: string;
  coverage: string;
  listingStatus: 'candidate' | 'reviewed';
  frequencyMHz: number | null;
  website: string | null;
  sourceIds: string[];
  streams: Stream[];
  notes: string | null;
}
export interface DiscoveryStation extends Omit<Station, 'streams' | 'discovery'> {
  aliases: string[];
  availability: 'no-direct-stream' | 'temporarily-unavailable' | 'review-pending';
  reviewedOn: string;
  websiteKind: 'official' | 'provider' | null;
}
export function allStations(c: Catalog | null): Station[] {
  if (!c) return [];
  return [
    ...c.stations,
    ...(c.discoveryStations ?? []).map(({ availability, reviewedOn, websiteKind, ...metadata }) => ({
      ...metadata,
      streams: [],
      discovery: { availability, reviewedOn, websiteKind },
    })),
  ];
}
export function catalogCounts(c: Catalog | null) {
  return {
    discoverable: allStations(c).length,
    candidates: c?.stations.filter(s => s.streams.length > 0).length ?? 0,
    approved:
      c?.stations.filter(s =>
        s.streams.some(
          x =>
            x.verificationStatus === 'verified' &&
            x.rightsStatus === 'permission-granted' &&
            (!x.directListening || x.directListening.status === 'allowed'),
        ),
      ).length ?? 0,
  };
}
export type Dictionary = Record<string, Record<string, string>>;
export interface Catalog {
  broadcasters?: Named[];
  artists?: Artist[];
  programmeThemes?: Named[];
  discoveryStations?: DiscoveryStation[];
  manifest: Manifest;
  networks: Network[];
  stations: Station[];
  locations: Location[];
  languages: Language[];
  categories: Named[];
  sources: Source[];
  localization: Record<string, Dictionary>;
}
export interface Filters {
  search: string;
  country: string;
  region: string;
  district: string;
  locality: string;
  language: string;
}
export const emptyFilters: Filters = {
  search: '',
  country: '',
  region: '',
  district: '',
  locality: '',
  language: '',
};
export function filterStations(c: Catalog, f: Filters): Station[] {
  const query = f.search.trim().toLocaleLowerCase();
  return allStations(c).filter(
    s =>
      (!f.country || s.countryCode === f.country) &&
      (f.country !== 'IN' ||
        s.countryCode !== 'IN' ||
        ((!f.region || s.regionId === f.region) &&
          (!f.district || s.districtId === f.district) &&
          (!f.locality || s.localityId === f.locality))) &&
      (!f.language || s.broadcastLanguages.includes(f.language)) &&
      (!query ||
        [
          s.name,
          ...Object.values(c.localization).map(dictionary => dictionary['stationNames']?.[s.id] ?? ''),
          ...(s.aliases ?? []),
          ...(s.artistIds ?? []).flatMap(artistId => {
            const a = c.artists?.find(row => row.id === artistId);
            return a ? [a.name, ...a.aliases] : [];
          }),
          c.networks.find(n => n.id === s.networkId)?.name,
          ...c.locations.filter(l => [s.regionId, s.districtId, s.localityId].includes(l.id)).map(l => l.name),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)),
  );
}
export function groups(c: Catalog, f: Filters) {
  const stations = filterStations(c, f);
  return c.networks
    .map(network => ({ network, stations: stations.filter(s => s.networkId === network.id) }))
    .filter(g => g.stations.length);
}
export function translated(c: Catalog | null, locale: string, section: string, key: string, fallback = key): string {
  return c?.localization[locale]?.[section]?.[key] || c?.localization['en']?.[section]?.[key] || fallback;
}

/** Presentation only: identities, canonical sorting and playback metadata stay unchanged. */
export function stationDisplayName(c: Catalog | null, locale: string, station: Pick<Station, 'id' | 'name'>): string {
  const translated = locale === 'en' ? undefined : c?.localization[locale]?.['stationNames']?.[station.id];
  return typeof translated === 'string' && translated.trim() ? translated.trim() : station.name;
}
