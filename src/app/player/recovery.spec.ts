import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Hls from 'hls.js';
import { CatalogService } from '../catalog/catalog.service';
import { validateCatalog } from '../catalog/catalog.validation';
import { currentPublishedFixture } from '../catalog/testing/published-1.3.fixture';
import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { environment } from '../../environments/environment.prod';
import { Stream } from '../catalog/catalog.models';
import { MEDIA_ENGINE, MediaEngine } from './media-engine';
import { PlayerService } from './player.service';
import { PlaybackError, PlaybackFailure, hlsFailure, playbackFailure } from './playback-failure';
import { RECOVERY_POLICY, RECOVERY_RANDOM, recoveryDelay } from './recovery-policy';

const network: PlaybackFailure = { kind: 'network', transient: true };
function setup(count = 1) {
  vi.useFakeTimers();
  const c = validateCatalog(structuredClone(currentPublishedFixture));
  const base = c.stations.find(s => s.streams.length)!.streams[0];
  const streams = Array.from({ length: count }, (_, i): Stream => ({
    ...base,
    id: `stream-${i}`,
    url: `https://owned.test/${i}`,
    format: 'mp3',
    rightsStatus: 'unconfirmed',
    verificationStatus: 'unverified',
    directListening: undefined,
  }));
  const station = { ...c.stations[0], id: 'radio', streams };
  const other = { ...station, id: 'other', streams: [{ ...streams[0], url: 'https://owned.test/other' }] };
  c.stations = [station, other];
  const catalog = signal(c),
    audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  const load = vi.fn<MediaEngine['load']>().mockResolvedValue(undefined),
    clear = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogService, useValue: { catalog } },
      { provide: RADIO_API_CONFIG, useValue: environment.RadioApi },
      { provide: RECOVERY_RANDOM, useValue: () => 0 },
      {
        provide: MEDIA_ENGINE,
        useValue: { audio, load, clear, supports: (format: string) => ['mp3', 'aac', 'hls'].includes(format) },
      },
    ],
  });
  const player = TestBed.inject(PlayerService);
  return { player, audio, load, clear, station, other, catalog, c };
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Bounded recovery sessions', () => {
  it('cancels a rebuffer watchdog on a native media pause', async () => {
    const s = setup();
    await s.player.play(s.station);
    s.audio.dispatchEvent(new Event('playing'));
    s.audio.dispatchEvent(new Event('waiting'));
    s.audio.dispatchEvent(new Event('pause'));
    await vi.advanceTimersByTimeAsync(100000);
    expect(s.player.state()).toBe('paused');
    expect(s.load).toHaveBeenCalledOnce();
  });
  it('recovers an AIR-like single URL, and waits for genuine playing after successful load', async () => {
    const s = setup();
    s.load.mockRejectedValueOnce(new PlaybackError(network));
    await s.player.play(s.station);
    expect(s.player.statusLabel()).toBe('reconnecting');
    expect(s.player.error()).toBe('');
    await vi.advanceTimersByTimeAsync(499);
    expect(s.load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.load).toHaveBeenCalledTimes(2);
    expect(s.player.state()).toBe('loading');
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.player.state()).toBe('playing');
    expect(s.player.diagnostics().at(-1)?.result).toBe('playing');
  });
  it('exhausts exactly two attempts for persistent single-URL failure; manual Retry resets the budget', async () => {
    const s = setup();
    s.load.mockRejectedValue(new PlaybackError(network));
    await s.player.play(s.station);
    await vi.advanceTimersByTimeAsync(100000);
    expect(s.load).toHaveBeenCalledTimes(2);
    expect(s.player.state()).toBe('error');
    expect(
      s.player
        .diagnostics()
        .filter(row => row.result === 'failure')
        .map(row => row.retryAllowed),
    ).toEqual([true, false]);
    s.load.mockResolvedValue(undefined);
    await s.player.resume();
    expect(s.load).toHaveBeenCalledTimes(3);
    expect(s.player.diagnostics().at(-1)?.attempt).toBe(1);
  });
  it('tries ranked fresh alternatives before repeating a transient URL and caps six actual attempts', async () => {
    const s = setup(4);
    s.load.mockRejectedValue(new PlaybackError(network));
    await s.player.play(s.station);
    await vi.advanceTimersByTimeAsync(100000);
    expect(s.load.mock.calls.map(([stream]) => stream.id)).toEqual([
      'stream-0',
      'stream-1',
      'stream-2',
      'stream-0',
      'stream-1',
      'stream-2',
    ]);
    expect(s.player.state()).toBe('error');
    expect(s.player.diagnostics().at(-1)?.retryAllowed).toBe(false);
  });
  it('uses an alternative immediately, then a delayed same-URL attempt if both initial URLs fail', async () => {
    const s = setup(2);
    s.load.mockRejectedValueOnce(new PlaybackError(network)).mockRejectedValueOnce(new PlaybackError(network));
    await s.player.play(s.station);
    expect(s.load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(s.load.mock.calls[2][0].id).toBe('stream-0');
  });
  for (const kind of ['autoplay', 'restricted', 'cancelled'] as const)
    it(`does not retry or select alternatives after ${kind}`, async () => {
      const s = setup(3);
      s.load.mockRejectedValue(new PlaybackError({ kind, transient: false }));
      await s.player.play(s.station);
      await vi.advanceTimersByTimeAsync(100000);
      expect(s.load).toHaveBeenCalledOnce();
      expect(s.player.state()).toBe(kind === 'cancelled' ? 'paused' : 'error');
    });
  for (const action of ['pause', 'stop', 'switch', 'destroy'] as const)
    it(`cancels backoff on ${action} without late playback`, async () => {
      const s = setup();
      s.load.mockRejectedValueOnce(new PlaybackError(network));
      await s.player.play(s.station);
      if (action === 'switch') await s.player.play(s.other);
      else if (action === 'destroy') TestBed.resetTestingModule();
      else s.player[action]();
      await vi.advanceTimersByTimeAsync(100000);
      expect(s.load).toHaveBeenCalledTimes(action === 'switch' ? 3 : 1); // Switched station has its own startup timeout budget.
      if (action !== 'switch') expect(s.audio.play).not.toHaveBeenCalled();
      expect(s.load.mock.calls.filter(([stream]) => stream.url === s.station.streams[0].url)).toHaveLength(1);
    });
  it('revalidates pending retries after catalogue restriction or removal', async () => {
    const s = setup();
    s.load.mockRejectedValueOnce(new PlaybackError(network));
    await s.player.play(s.station);
    s.catalog.set({ ...s.c, stations: [{ ...s.station, streams: [] }, s.other] });
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(10000);
    expect(s.load).toHaveBeenCalledOnce();
    expect(s.player.error()).toBe('playbackPermissionChanged');
  });
  for (const invalid of ['restricted', 'format', 'url'] as const)
    it(`never loads ${invalid} candidates`, async () => {
      const s = setup();
      const stream = s.station.streams[0];
      if (invalid === 'restricted')
        stream.directListening = {
          status: 'restricted',
          sourceId: stream.sourceId,
          reviewedAt: '2026-11-08',
          notes: '',
          recording: 'unconfirmed',
          redistribution: 'unconfirmed',
        };
      else if (invalid === 'format') stream.format = 'html';
      else stream.url = 'http://owned.test/live';
      await s.player.play(s.station);
      await vi.advanceTimersByTimeAsync(100000);
      expect(s.load).not.toHaveBeenCalled();
    });
  it('bounds unresolved startup promises, ignores stale resolutions, and uses a separate rebuffer timeout', async () => {
    const s = setup();
    let release!: () => void;
    s.load.mockImplementationOnce(() => new Promise<void>(resolve => (release = resolve)));
    const pending = s.player.play(s.station);
    await vi.advanceTimersByTimeAsync(20500);
    release();
    await pending;
    expect(s.load).toHaveBeenCalledTimes(2);
    expect(s.audio.play).toHaveBeenCalledOnce();
    s.audio.dispatchEvent(new Event('playing'));
    s.audio.dispatchEvent(new Event('waiting'));
    expect(s.player.statusLabel()).toBe('buffering');
    await vi.advanceTimersByTimeAsync(12000);
    expect(s.player.state()).toBe('error');
  });
  it('preserves one audio element, volume and mute across network-error recovery and pause/resume', async () => {
    const s = setup();
    s.player.setVolume(0.23);
    s.player.toggleMute();
    await s.player.play(s.station);
    s.audio.dispatchEvent(new Event('playing'));
    Object.defineProperty(s.audio, 'error', { value: { code: 2 } });
    s.audio.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(500);
    expect(s.audio.volume).toBe(0.23);
    expect(s.audio.muted).toBe(true);
    s.audio.dispatchEvent(new Event('playing'));
    s.player.pause();
    await s.player.resume();
    expect(s.load).toHaveBeenCalledTimes(2);
    expect(s.player.diagnostics().filter(d => d.result === 'attempt')).toHaveLength(2);
  });
  it('bounds diagnostics and strips URL/query/error text from HLS metadata', async () => {
    const s = setup();
    s.load.mockRejectedValue(
      new PlaybackError({
        kind: 'network',
        transient: false,
        hls: { type: 'https://secret.test/?token=private', details: 'private', fatal: true },
      }),
    );
    for (let i = 0; i < 50; i++) await s.player.play(s.station);
    expect(s.player.diagnostics()).toHaveLength(RECOVERY_POLICY.maxDiagnostics);
    expect(JSON.stringify(s.player.diagnostics())).not.toMatch(/private|secret|owned.test|https:/);
  });
  it('bounds deterministic jitter including invalid random inputs', () => {
    expect([0, 1, -1, 9, NaN].map(recoveryDelay)).toEqual([500, 750, 500, 750, 500]);
  });
});

describe('Structured media classification', () => {
  for (const code of [1, 2, 3, 4])
    it(`classifies native media code ${code}`, () => {
      expect(playbackFailure(undefined, { code } as MediaError).kind).toBe(
        ['cancelled', 'network', 'decoder', 'unsupported'][code - 1],
      );
    });
  for (const status of [0, 408, 429, 500, 503, 401, 403, 404])
    for (const details of [Hls.ErrorDetails.MANIFEST_LOAD_ERROR, Hls.ErrorDetails.FRAG_LOAD_ERROR])
      it(`classifies ${details} HTTP ${status} without retaining response data`, () => {
        const result = hlsFailure({
          type: Hls.ErrorTypes.NETWORK_ERROR,
          details,
          fatal: true,
          response: { code: status, url: 'https://secret/?token=x', text: 'private' },
        });
        expect(result.transient).toBe([0, 408, 429, 500, 503].includes(status));
        expect(result.hls?.status).toBe(status);
        expect(JSON.stringify(result)).not.toMatch(/secret|private/);
      });
  it('never guesses transient failures from generic error messages or parsing/codec errors', () => {
    expect(playbackFailure(Error('connection reset')).transient).toBe(false);
    for (const details of [
      Hls.ErrorDetails.MANIFEST_PARSING_ERROR,
      Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR,
    ])
      expect(hlsFailure({ type: Hls.ErrorTypes.NETWORK_ERROR, details, fatal: true }).transient).toBe(false);
    expect(
      hlsFailure({ type: Hls.ErrorTypes.MEDIA_ERROR, details: Hls.ErrorDetails.FRAG_PARSING_ERROR, fatal: true }).kind,
    ).toBe('decoder');
  });
});
