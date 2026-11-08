import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { Stream } from '../catalog/catalog.models';
import { currentPublishedFixture } from '../catalog/testing/published-1.3.fixture';
import { validateCatalog } from '../catalog/catalog.validation';
import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { RadioApiConfig, STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { environment as production } from '../../environments/environment.prod';
import { MEDIA_ENGINE, MediaEngine } from './media-engine';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
import { MAX_STREAM_ATTEMPTS, PlayerService } from './player.service';

const candidate = (id: string): Stream => ({
  id,
  url: `https://radio.example/${id}`,
  format: 'mp3',
  verificationStatus: 'unverified',
  rightsStatus: 'unconfirmed',
  lastVerifiedAt: null,
  sourceId: 'test-source',
  directListening: {
    status: 'needs-review',
    reviewedAt: '2026-11-07T00:00:00Z',
    sourceId: 'test-source',
    notes: 'Unit scenario',
    recording: 'unconfirmed',
    redistribution: 'unconfirmed',
  },
});
let active: PlayerService | undefined;
function setup(
  policy: RadioApiConfig = production.RadioApi,
  streams: Stream[] = [candidate('a'), candidate('b')],
  technicalEnabled = false,
) {
  const c = validateCatalog(structuredClone(currentPublishedFixture));
  const station = { ...c.stations[0], id: 'unit-station', streams };
  c.stations = [station];
  const data = { catalog: signal(c) };
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  const load = vi.fn<MediaEngine['load']>(async () => undefined),
    clear = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: LIVE_TEST_ENABLED, useValue: technicalEnabled },
      { provide: RADIO_API_CONFIG, useValue: policy },
      { provide: CatalogService, useValue: data },
      { provide: MEDIA_ENGINE, useValue: { audio, load, clear, supports: () => true } },
    ],
  });
  const player = TestBed.inject(PlayerService);
  active = player;
  return { player, station, data, audio, load, clear, c };
}
async function settle() {
  for (let round = 0; round < 6; round++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  active?.stop();
  active = undefined;
  vi.useRealTimers();
});

describe('Configurable player and bounded fallback', () => {
  for (const AllowUnverified of [false, true])
    for (const CheckVerificationStatus of [false, true])
      for (const CheckRightsStatus of [false, true]) {
        const policy = { AllowUnverified, CheckVerificationStatus, CheckRightsStatus };
        it(`uses the same injected policy for eligibility and play ${JSON.stringify(policy)}`, async () => {
          const { player, station, load } = setup(policy);
          const expected = (!CheckVerificationStatus || AllowUnverified) && !CheckRightsStatus;
          expect(player.eligibility(station).status === 'ready').toBe(expected);
          await player.play(station);
          expect(load).toHaveBeenCalledTimes(expected ? 1 : 0);
        });
      }
  it('plays relaxed metadata without rewriting it and waits for a real playing event', async () => {
    const { player, station, c, audio, load } = setup();
    const before = JSON.stringify(c);
    await player.toggle(station);
    expect(load).toHaveBeenCalledWith(station.streams[0]);
    expect(player.state()).toBe('loading');
    audio.dispatchEvent(new Event('playing'));
    expect(player.stateFor(station)).toBe('playing');
    await player.toggle(station);
    expect(player.state()).toBe('paused');
    await player.toggle(station);
    expect(load).toHaveBeenCalledOnce();
    expect(JSON.stringify(c)).toBe(before);
  });
  it('falls back after a load rejection, using a different eligible URL', async () => {
    const { player, station, load, audio } = setup();
    load.mockRejectedValueOnce(Error('Bad endpoint'));
    await player.play(station);
    expect(load.mock.calls.map(([stream]) => stream.url)).toEqual(station.streams.map(stream => stream.url));
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('playing');
    expect(player.eligibility(station).stream?.id).toBe('b');
  });
  it('handles post-start media errors and preserves mute/volume across fallback', async () => {
    const { player, station, load, audio } = setup();
    player.setVolume(0.35);
    player.toggleMute();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    audio.dispatchEvent(new Event('error'));
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0].id).toBe('b');
    expect(audio.volume).toBe(0.35);
    expect(audio.muted).toBe(true);
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('playing');
  });
  it('never exceeds the URL budget and gives an explicit Retry a fresh bounded budget', async () => {
    const { player, station, load } = setup(production.RadioApi, ['a', 'b', 'c', 'd'].map(candidate));
    load.mockRejectedValue(Error('Offline'));
    await player.play(station);
    expect(load).toHaveBeenCalledTimes(MAX_STREAM_ATTEMPTS);
    expect(player.state()).toBe('error');
    expect(new Set(load.mock.calls.map(([stream]) => stream.url)).size).toBe(MAX_STREAM_ATTEMPTS);
    await player.resume();
    expect(load).toHaveBeenCalledTimes(2 * MAX_STREAM_ATTEMPTS);
    expect(new Set(load.mock.calls.slice(MAX_STREAM_ATTEMPTS).map(([stream]) => stream.url)).size).toBe(
      MAX_STREAM_ATTEMPTS,
    );
  });
  it('deduplicates URLs even when the catalogue supplies multiple candidate IDs', async () => {
    const a = candidate('a'),
      alias = { ...a, id: 'alias' },
      b = candidate('b');
    const { player, station, load } = setup(production.RadioApi, [a, alias, b]);
    load.mockRejectedValueOnce(Error('Offline'));
    await player.play(station);
    expect(load.mock.calls.map(([stream]) => stream.id)).toEqual(['a', 'b']);
  });
  for (const action of ['stop', 'pause'] as const)
    it(`cancels queued fallback on ${action}`, async () => {
      const { player, station, load, audio } = setup();
      await player.play(station);
      audio.dispatchEvent(new Event('error'));
      player[action]();
      await settle();
      expect(load).toHaveBeenCalledOnce();
      expect(player.state()).toBe(action === 'stop' ? 'idle' : 'paused');
      if (action === 'pause') {
        await player.resume();
        expect(load).toHaveBeenCalledTimes(2);
        expect(load.mock.calls[1][0].id).toBe('b');
      }
    });
  it('does not let a queued fallback take over a newly selected station', async () => {
    const { player, station, load, audio, data, c } = setup();
    const other = { ...station, id: 'another', streams: [candidate('another')] };
    data.catalog.set({ ...c, stations: [station, other] });
    await player.play(station);
    audio.dispatchEvent(new Event('error'));
    await player.play(other);
    await settle();
    expect(load.mock.calls.map(([stream]) => stream.id)).toEqual(['a', 'another']);
    expect(player.station()?.id).toBe('another');
  });
  for (const action of ['stop', 'pause'] as const)
    it(`cancels pending asynchronous initialization on ${action}`, async () => {
      const { player, station, load, audio } = setup();
      let complete!: () => void;
      load.mockImplementationOnce(() => new Promise<void>(resolve => (complete = resolve)));
      const pending = player.play(station);
      player[action]();
      complete();
      await pending;
      expect(audio.play).not.toHaveBeenCalled();
      expect(player.state()).toBe(action === 'stop' ? 'idle' : 'paused');
    });
  it('bounds timeout recovery and reports an understandable terminal error', async () => {
    vi.useFakeTimers();
    const { player, station, load } = setup();
    await player.play(station);
    await vi.advanceTimersByTimeAsync(82000);
    expect(load).toHaveBeenCalledTimes(4);
    expect(player.state()).toBe('error');
    expect(player.error()).toBe('playbackTimeout');
    await vi.advanceTimersByTimeAsync(100000);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it('does not use alternate URLs to bypass browser gesture restrictions', async () => {
    const { player, station, load, audio } = setup();
    vi.mocked(audio.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    await player.play(station);
    expect(load).toHaveBeenCalledOnce();
    expect(player.error()).toBe('playbackBlocked');
    await player.resume();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('continues on ignored editorial changes, but switches/stops on explicit restrictions', async () => {
    const { player, station, audio, data, c, load } = setup();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const next = structuredClone(c);
    next.stations[0].streams[0].verificationStatus = 'unavailable';
    data.catalog.set(next);
    TestBed.tick();
    expect(player.state()).toBe('playing');
    expect(load).toHaveBeenCalledOnce();
    const restricted = structuredClone(next);
    restricted.stations[0].streams[0].directListening!.status = 'restricted';
    data.catalog.set(restricted);
    TestBed.tick();
    await settle();
    expect(load.mock.calls[1][0].id).toBe('b');
    audio.dispatchEvent(new Event('playing'));
    const allRestricted = structuredClone(restricted);
    allRestricted.stations[0].streams[1].directListening!.status = 'restricted';
    data.catalog.set(allRestricted);
    TestBed.tick();
    expect(player.state()).toBe('error');
    expect(player.error()).toBe('playbackPermissionChanged');
    expect(player.canResume()).toBe(false);
  });
  it('revalidates strict policy on refresh and never falls back to an unverified disallowed alternative', async () => {
    const first = { ...candidate('a'), verificationStatus: 'verified' as const, rightsStatus: 'permission-granted' };
    first.directListening!.status = 'allowed';
    const { player, station, audio, data, c, load } = setup(STRICT_RADIO_API_CONFIG, [first, candidate('b')]);
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const next = structuredClone(c);
    next.stations[0].streams[0].rightsStatus = 'unconfirmed';
    data.catalog.set(next);
    TestBed.tick();
    await settle();
    expect(player.state()).toBe('error');
    expect(load).toHaveBeenCalledOnce();
    expect(player.eligibility(station).status).not.toBe('ready');
  });
  it('re-resolves catalogue IDs and ignores forged stream URLs or forged permission fields', async () => {
    const { player, station, load } = setup();
    await player.play({ ...station, streams: [{ ...candidate('evil'), url: 'https://evil.example/stream' }] });
    expect(load.mock.calls[0][0].url).toBe(station.streams[0].url);
    player.stop();
    load.mockClear();
    await player.play({ ...station, id: 'https://evil.example/stream' });
    expect(load).not.toHaveBeenCalled();
  });
  it('falls back if resuming a retained source fails without reloading that paused source', async () => {
    const { player, station, audio, load } = setup();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    player.pause();
    vi.mocked(audio.play).mockRejectedValueOnce(Error('Media connection lost'));
    await player.resume();
    expect(load.mock.calls.map(([stream]) => stream.id)).toEqual(['a', 'b']);
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('playing');
  });
  it('cleans up the old URL and loads updated eligible metadata on catalogue refresh', async () => {
    const { player, station, audio, load, data, c } = setup();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const next = structuredClone(c);
    next.stations[0].streams[0].url = 'https://radio.example/new-live';
    data.catalog.set(next);
    TestBed.tick();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0].url).toBe('https://radio.example/new-live');
  });
  it('keeps a paused station paused when refresh removes its source, then resumes an eligible alternative on request', async () => {
    const { player, station, audio, load, data, c } = setup();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    player.pause();
    const next = structuredClone(c);
    next.stations[0].streams.splice(0, 1);
    data.catalog.set(next);
    TestBed.tick();
    await settle();
    expect(load).toHaveBeenCalledOnce();
    expect(player.state()).toBe('paused');
    await player.resume();
    expect(load.mock.calls[1][0].id).toBe('b');
  });
  it('does not bypass injected strict policy through the local technical entry point', async () => {
    const { player, station, load } = setup(STRICT_RADIO_API_CONFIG, undefined, true);
    expect(player.technicalEligibility(station.id).status).toBe(player.eligibility(station).status);
    await player.playTechnical(station.id);
    expect(load).not.toHaveBeenCalled();
  });
  it('hands card Retry back to the normal candidate pool after a pinned technical selection is revoked', async () => {
    const streams = ['a', 'b'].map(id => ({
      ...candidate(id),
      verificationStatus: 'verified' as const,
      rightsStatus: 'permission-granted',
    }));
    for (const stream of streams) stream.directListening!.status = 'allowed';
    const { player, station, audio, data, c, load } = setup(STRICT_RADIO_API_CONFIG, streams, true);
    await player.playTechnical(station.id, 'b');
    audio.dispatchEvent(new Event('playing'));
    player.pause();
    const next = structuredClone(c);
    next.stations[0].streams[1].directListening!.status = 'restricted';
    data.catalog.set(next);
    TestBed.tick();
    expect(player.eligibility(station).status).toBe('ready');
    await player.toggle(station);
    expect(load.mock.calls.at(-1)![0].id).toBe('a');
    expect(player.technicalTest()).toBe(false);
  });
});
