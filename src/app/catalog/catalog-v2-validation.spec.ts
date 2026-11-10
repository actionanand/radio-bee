import { validateV2 } from './catalog-v2';
import { v2Fixture } from './testing/v2.fixture';
import { corruptions, object, rows, Snapshot } from './testing/v2-invalid.fixture';

describe('Strict v2 snapshot validation', () => {
  for (const corruption of corruptions)
    it('rejects ' + corruption.name, () => {
      const snapshot = structuredClone(v2Fixture) as Snapshot;
      corruption.mutate(snapshot);
      expect(() => validateV2(snapshot)).toThrow();
    });
  it('accepts the real contract without mutating stream/policy metadata', () => {
    const snapshot = structuredClone(v2Fixture),
      before = JSON.stringify(snapshot);
    const catalog = validateV2(snapshot);
    expect(catalog.stations).toHaveLength(71);
    expect(catalog.discoveryStations).toHaveLength(46);
    expect(catalog.stations.flatMap(s => s.streams)).toHaveLength(74);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('retains canonical fallback for stale or malformed index objects', () => {
    for (const index of [null, {}, 'not an index', { schemaVersion: 1 }]) {
      const snapshot = structuredClone(v2Fixture) as Snapshot;
      snapshot['browseIndex'] = index;
      expect(Object.hasOwn(validateV2(snapshot), 'browseIndex')).toBe(false);
    }
  });
  it('accepts absent optional registries and index with their memberships absent', () => {
    const c = structuredClone(v2Fixture) as Snapshot;
    for (const key of ['broadcasters', 'programmeThemes', 'browseIndex']) {
      delete object(object(c['manifest'])['files'])[key];
      delete c[key];
    }
    for (const n of rows(c, 'networks'))
      for (const key of ['broadcasterId', 'broadcasterRelationship', 'broadcasterSourceIds']) delete n[key];
    for (const s of [...rows(c, 'stations'), ...rows(c, 'discoveryStations')]) delete s['programmeThemeIds'];
    expect(validateV2(c).stations).toHaveLength(71);
  });
});
function scheduledSnapshot(): Snapshot {
  const c = structuredClone(v2Fixture) as Snapshot,
    s = rows(c, 'stations')[0],
    p = object(s['languageProfile']);
  const source = rows(c, 'sources').find(s => /^(official|publisher)(-|$)/.test(String(s['kind'])))!;
  p['sourceIds'] = [...new Set([...(p['sourceIds'] as string[]), String(source['id'])])];
  p['programmingPattern'] = 'scheduled';
  p['schedules'] = [
    {
      id: 'morning',
      title: 'Morning programme',
      languages: [(s['broadcastLanguages'] as string[])[0]],
      days: [1, 2],
      startLocal: '09:00',
      endLocal: '10:00',
      timeZone: 'Asia/Kolkata',
      sourceIds: [source['id']],
      reviewedOn: '2026-11-10',
    },
  ];
  return c;
}
it('accepts a sourced, language-consistent programme schedule', () => {
  expect(validateV2(scheduledSnapshot()).stations).toHaveLength(71);
});
for (const issue of [
  'duplicate identity',
  'invalid timezone',
  'invalid days',
  'equal times',
  'unknown source',
  'undocumented language',
])
  it('rejects schedule ' + issue, () => {
    const c = scheduledSnapshot(),
      p = object(rows(c, 'stations')[0]['languageProfile']),
      q = (p['schedules'] as Record<string, unknown>[])[0];
    if (issue === 'duplicate identity') (p['schedules'] as unknown[]).push(structuredClone(q));
    if (issue === 'invalid timezone') q['timeZone'] = 'Invalid/Nowhere';
    if (issue === 'invalid days') q['days'] = [0, 8];
    if (issue === 'equal times') q['endLocal'] = q['startLocal'];
    if (issue === 'unknown source') q['sourceIds'] = ['missing'];
    if (issue === 'undocumented language') q['languages'] = ['zzz'];
    expect(() => validateV2(c)).toThrow();
  });
