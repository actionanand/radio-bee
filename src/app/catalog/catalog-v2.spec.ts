import { v2Fixture } from './testing/v2.fixture';
import { ancestry, browseV2, initialBrowse, validateV2 } from './catalog-v2';
describe('Actual generated v2 contract', () => {
  const data = () => validateV2(structuredClone(v2Fixture));
  it('loads all canonical records without relabelling v1', () => {
    const c = data();
    expect(c.manifest.schemaVersion).toBe(2);
    expect(browseV2(c, initialBrowse)).toHaveLength(117);
    expect(c.stations).toHaveLength(71);
    expect(() => validateV2({ ...c, manifest: { ...c.manifest, schemaVersion: 1 } })).toThrow();
  });
  it('traverses localities that skip district nodes', () => {
    const c = data();
    const toronto = c.locations.find(l => l.id === 'ca-on-toronto')!;
    expect(ancestry(c, toronto.id).map(l => l.id)).toEqual(['ca', 'ca-on', 'ca-on-toronto']);
  });
  it('intersects language and genre with ancestor geography', () => {
    const c = data();
    const rows = browseV2(c, { ...initialBrowse, location: 'in-tn', language: 'ta', genre: 'music' });
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        s =>
          s.countryCode === 'IN' &&
          s.regionId === 'in-tn' &&
          s.broadcastLanguages.includes('ta') &&
          s.genres.includes('music'),
      ),
    ).toBe(true);
  });
  it('never treats unknown language profiles as single-language', () => {
    const c = data();
    expect(browseV2(c, { ...initialBrowse, classification: 'unknown' })).toHaveLength(87);
    expect(browseV2(c, { ...initialBrowse, classification: 'single-language' })).toHaveLength(11);
  });
  it('separates stream candidates from discovery without implying playback approval', () => {
    const c = data();
    expect(browseV2(c, { ...initialBrowse, availability: 'stream-bearing' })).toHaveLength(71);
    const discovery = browseV2(c, { ...initialBrowse, availability: 'discovery-only' });
    expect(discovery).toHaveLength(46);
    expect(discovery.every(s => s.streams.length === 0)).toBe(true);
  });
  it('keeps streams and identities unchanged while filtering and sorting', () => {
    const c = data(),
      before = JSON.stringify(c);
    for (const sort of ['country', 'network', 'broadcaster', 'language', 'genre', 'availability']) {
      const rows = browseV2(c, { ...initialBrowse, sort });
      expect(new Set(rows.map(s => s.id)).size).toBe(117);
    }
    expect(JSON.stringify(c)).toBe(before);
  });
});

it('rejects broadcaster associations without source evidence', () => {
  const c = validateV2(structuredClone(v2Fixture));
  const network = c.networks.find(n => n.broadcasterId)!;
  delete (network as unknown as Record<string, unknown>)['broadcasterSourceIds'];
  expect(() => validateV2(c)).toThrow(/sourced broadcaster/);
});
