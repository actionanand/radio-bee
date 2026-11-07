import { TestBed } from '@angular/core/testing';
import { eligibleStreams, streamEligibility } from './stream-eligibility';
import { Stream, DirectListening } from './catalog.models';
import { RADIO_API_CONFIG } from './radio-api.config';
import { RadioApiConfig } from '../../environments/radio-api.config';
import { environment } from '../../environments/environment';
import { environment as production } from '../../environments/environment.prod';
import { environment as live } from '../../environments/environment.live-test';
import { currentPublishedFixture } from './testing/published-1.3.fixture';
import { validateCatalog } from './catalog.validation';

const supported = { available: true, supports: () => true };
const base: Stream = {
  id: 'candidate',
  url: 'https://radio.example/live',
  format: 'mp3',
  verificationStatus: 'verified',
  rightsStatus: 'permission-granted',
  sourceId: 'source',
  lastVerifiedAt: '2026-11-07T00:00:00Z',
};
const review = (status: DirectListening['status']): DirectListening => ({
  status,
  sourceId: 'source',
  reviewedAt: '2026-11-07T00:00:00Z',
  notes: 'Test review',
  recording: 'prohibited',
  redistribution: 'prohibited',
});
export const policies: RadioApiConfig[] = [];
for (const AllowUnverified of [false, true])
  for (const CheckVerificationStatus of [false, true])
    for (const CheckRightsStatus of [false, true])
      policies.push({ AllowUnverified, CheckVerificationStatus, CheckRightsStatus });

describe('Environment-controlled stream policy', () => {
  it('uses exactly the requested defaults in all environments and exposes a frozen injectable policy', () => {
    const expected = { AllowUnverified: true, CheckVerificationStatus: false, CheckRightsStatus: false };
    for (const env of [environment, production, live]) expect(env.RadioApi).toEqual(expected);
    const config = TestBed.inject(RADIO_API_CONFIG);
    expect(config).toEqual(expected);
    expect(Object.isFrozen(config)).toBe(true);
  });
  for (const policy of policies) {
    it(`checks all metadata combinations under ${JSON.stringify(policy)}`, () => {
      for (const verificationStatus of ['verified', 'unverified', 'unavailable'] as const)
        for (const rightsStatus of ['unconfirmed', 'permission-granted'])
          for (const status of [undefined, 'needs-review', 'restricted', 'allowed'] as const) {
            const stream = {
              ...base,
              verificationStatus,
              rightsStatus,
              directListening: status ? review(status) : undefined,
            };
            const verificationAllowed =
              !policy.CheckVerificationStatus ||
              verificationStatus === 'verified' ||
              (verificationStatus === 'unverified' && policy.AllowUnverified);
            const rightsAllowed =
              !policy.CheckRightsStatus || (rightsStatus === 'permission-granted' && (!status || status === 'allowed'));
            expect(
              streamEligibility({ streams: [stream] }, supported, policy).status === 'ready',
              JSON.stringify(stream),
            ).toBe(status !== 'restricted' && verificationAllowed && rightsAllowed);
          }
    });
    it(`never bypasses technical checks under ${JSON.stringify(policy)}`, () => {
      for (const url of [
        'not a URL',
        'http://radio.example/live',
        'javascript:alert(1)',
        'https://user:secret@radio.example/live',
        'https://user@radio.example/live',
      ])
        expect(streamEligibility({ streams: [{ ...base, url }] }, supported, policy).status).toBe('invalidStream');
      for (const format of ['unknown', 'html', 'wav'])
        expect(streamEligibility({ streams: [{ ...base, format }] }, supported, policy).status).toBe(
          'incompatibleStream',
        );
      expect(streamEligibility({ streams: [base] }, { available: false, supports: () => true }, policy).status).toBe(
        'playerUnavailable',
      );
      expect(streamEligibility({ streams: [base] }, { available: true, supports: () => false }, policy).status).toBe(
        'incompatibleStream',
      );
      expect(
        streamEligibility({ streams: [{ ...base, directListening: review('restricted') }] }, supported, policy).status,
      ).toBe('permissionPending');
    });
  }
  it('offers exactly 25 published candidate stations and leaves all 63 no-stream stations unavailable', () => {
    const catalog = validateCatalog(structuredClone(currentPublishedFixture));
    const before = JSON.stringify(catalog);
    expect(catalog.stations.filter(station => streamEligibility(station, supported).status === 'ready')).toHaveLength(
      25,
    );
    expect(
      catalog.stations.filter(station => streamEligibility(station, supported).status === 'noStream'),
    ).toHaveLength(63);
    const sooriyan = catalog.stations.find(station => station.id === 'sooriyan-srilanka')!;
    expect(sooriyan.streams[0].id).toBe('sooriyan-candidate');
    expect(eligibleStreams(sooriyan, supported, environment.RadioApi, { sources: catalog.sources })[0].id).toBe(
      'sooriyan-official-candidate',
    );
    expect(JSON.stringify(catalog)).toBe(before);
  });
  it('uses observed playback history without rewriting metadata or bypassing restrictions', () => {
    const first = { ...base, id: 'first' },
      second = { ...base, id: 'second', url: 'https://other.example/live' };
    const outcomes = new Map<string, 'playing' | 'failed'>([
      [first.url, 'failed'],
      [second.url, 'playing'],
    ]);
    expect(eligibleStreams({ streams: [first, second] }, supported, environment.RadioApi, { outcomes })).toEqual([
      second,
      first,
    ]);
    second.directListening = review('restricted');
    expect(eligibleStreams({ streams: [first, second] }, supported, environment.RadioApi, { outcomes })).toEqual([
      first,
    ]);
  });
});
