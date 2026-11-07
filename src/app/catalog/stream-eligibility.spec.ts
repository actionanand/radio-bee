import { STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import {
  streamEligibility as configuredEligibility,
  technicalStreamEligibility,
  PlayerCapabilities,
} from './stream-eligibility';
import { Station, Stream, emptyFilters, filterStations } from './catalog.models';
import { fixture } from './catalog.fixture';
import { validateCatalog } from './catalog.validation';
const streamEligibility: typeof configuredEligibility = (station, player) =>
  configuredEligibility(station, player, STRICT_RADIO_API_CONFIG);
const approved: Stream = {
  id: 'test',
  url: 'https://media.example.test/live.mp3',
  format: 'mp3',
  verificationStatus: 'verified',
  rightsStatus: 'permission-granted',
  lastVerifiedAt: '2026-11-03T10:00:00Z',
  sourceId: 'test',
};
const supported: PlayerCapabilities = { available: true, supports: () => true };
describe('Shared stream eligibility', () => {
  it('reports no streams', () => expect(streamEligibility({ streams: [] }, supported).status).toBe('noStream'));
  for (const status of ['needs-review', 'restricted', 'allowed'] as const)
    for (const rightsStatus of ['unconfirmed', 'permission-granted']) {
      it(`preserves direct-listening ${status} and separately enforces rights ${rightsStatus}`, () => {
        const stream: Stream = {
          ...approved,
          rightsStatus,
          directListening: {
            status,
            reviewedAt: '2026-11-06T00:00:00Z',
            sourceId: 'test',
            notes: 'Unit policy scenario',
            recording: 'prohibited',
            redistribution: 'prohibited',
          },
        };
        expect(streamEligibility({ streams: [stream] }, supported).status).toBe(
          status === 'allowed' && rightsStatus === 'permission-granted' ? 'ready' : 'permissionPending',
        );
        expect(technicalStreamEligibility({ streams: [stream] }, supported).status).toBe(
          status === 'restricted' ? 'permissionPending' : 'ready',
        );
      });
    }
  for (const verificationStatus of ['unverified', 'unavailable', 'verified'] as const)
    for (const rightsStatus of ['unconfirmed', 'permission-granted']) {
      it(`${verificationStatus} / ${rightsStatus}`, () => {
        const status = streamEligibility(
          { streams: [{ ...approved, verificationStatus, rightsStatus }] },
          supported,
        ).status;
        expect(status).toBe(
          verificationStatus === 'unavailable'
            ? 'streamUnavailable'
            : verificationStatus === 'unverified'
              ? 'verificationPending'
              : rightsStatus === 'unconfirmed'
                ? 'permissionPending'
                : 'ready',
        );
      });
    }
  for (const url of [
    '',
    'not a URL',
    'http://radio.test/live.mp3',
    'javascript:alert(1)',
    'https://user:pass@radio.test/live',
  ])
    it(`rejects URL ${url}`, () =>
      expect(streamEligibility({ streams: [{ ...approved, url }] }, supported).status).toBe('invalidStream'));
  for (const format of ['unknown', 'wav', 'html'])
    it(`rejects format ${format}`, () =>
      expect(streamEligibility({ streams: [{ ...approved, format }] }, supported).status).toBe('incompatibleStream'));
  for (const format of ['mp3', 'aac', 'hls'])
    it(`checks platform support for ${format}`, () => {
      expect(streamEligibility({ streams: [{ ...approved, format }] }, supported).status).toBe('ready');
      expect(
        streamEligibility({ streams: [{ ...approved, format }] }, { available: true, supports: () => false }).status,
      ).toBe('incompatibleStream');
      expect(
        streamEligibility({ streams: [{ ...approved, format }] }, { available: false, supports: () => true }).status,
      ).toBe('playerUnavailable');
    });
  it('chooses an eligible alternative instead of enabling a blocked stream', () => {
    const denied = { ...approved, id: 'denied', rightsStatus: 'unconfirmed' };
    const result = streamEligibility({ streams: [denied, approved] }, supported);
    expect(result.stream?.id).toBe('test');
    expect(
      streamEligibility({ streams: [denied, { ...approved, verificationStatus: 'unavailable' }] }, supported).status,
    ).toBe('permissionPending');
  });
  it('blocks technically verified Vasantham with unconfirmed rights but keeps Tamil discovery', () => {
    const c = validateCatalog(structuredClone(fixture));
    const station = c.stations.find(s => s.id === 'vasantham-srilanka')!;
    station.streams = station.streams.map(s => ({ ...s, verificationStatus: 'verified', format: 'mp3' }));
    expect(streamEligibility(station, supported)).toEqual({ status: 'permissionPending', stream: null });
    expect(
      filterStations(c, { ...emptyFilters, country: 'LK', language: 'ta' }).some((s: Station) => s.id === station.id),
    ).toBe(true);
  });
});
