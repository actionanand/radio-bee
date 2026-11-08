import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { validateCatalog } from '../catalog/catalog.validation';
import { currentPublishedFixture } from '../catalog/testing/published-1.3.fixture';
import { Stream } from '../catalog/catalog.models';
import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { environment } from '../../environments/environment.prod';
import { createMediaEngine, HlsAdapter, MEDIA_ENGINE } from './media-engine';
import { PlayerService } from './player.service';
import { PlaybackFailure } from './playback-failure';
import { RECOVERY_RANDOM } from './recovery-policy';

function adapter() {
  let attached = () => {},
    manifest = () => {},
    fatal: (failure?: PlaybackFailure) => void = () => {};
  const value: HlsAdapter = {
    onAttached: callback => {
      attached = callback;
    },
    onManifest: callback => {
      manifest = callback;
    },
    onFatal: callback => {
      fatal = callback;
    },
    attachMedia: vi.fn(),
    loadSource: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    value,
    attached: () => attached(),
    manifest: () => manifest(),
    fatal: (failure?: PlaybackFailure) => fatal(failure),
  };
}
function setup() {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  const first = adapter(),
    second = adapter();
  const create = vi.fn().mockReturnValueOnce(first.value).mockReturnValue(second.value);
  const engine = createMediaEngine({ isSupported: () => true, create });
  if (!engine) throw Error('Controlled supported engine expected');
  const c = validateCatalog(structuredClone(currentPublishedFixture));
  const stream: Stream = {
    ...c.stations.find(s => s.streams.length)!.streams[0],
    id: 'hls',
    url: 'https://example.test/radio.m3u8',
    format: 'hls',
  };
  const station = {
    ...c.stations[0],
    id: 'hls-test',
    streams: [stream, { ...stream, id: 'alternate', url: 'https://example.test/alternate.m3u8' }],
  };
  const other = {
    ...station,
    id: 'mp3-test',
    streams: [{ ...stream, id: 'mp3', url: 'https://example.test/live.mp3', format: 'mp3' }],
  };
  c.stations = [station, other];
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogService, useValue: { catalog: signal(c) } },
      { provide: RADIO_API_CONFIG, useValue: environment.RadioApi },
      { provide: MEDIA_ENGINE, useValue: engine },
      { provide: RECOVERY_RANDOM, useValue: () => 0 },
    ],
  });
  return { player: TestBed.inject(PlayerService), engine, station, other, first, second, create, play };
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => {
  TestBed.inject(PlayerService).stop();
  // Destroy the service while the controlled media API is still installed.
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HLS adapter and real PlayerService integration', () => {
  for (const phase of ['initialization', 'runtime'] as const)
    it(`retries one HLS URL after a transient ${phase} failure without duplicate error/promise recovery`, async () => {
      vi.useFakeTimers();
      const s = setup();
      s.station.streams = [s.station.streams[0]];
      const pending = s.player.play(s.station);
      if (phase === 'runtime') {
        s.first.manifest();
        await pending;
        s.engine.audio.dispatchEvent(new Event('playing'));
      }
      s.first.fatal({ kind: phase === 'runtime' ? 'segment' : 'manifest', transient: true });
      await settle();
      expect(s.create).toHaveBeenCalledOnce();
      expect(s.player.diagnostics().filter(d => d.result === 'scheduled')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(s.create).toHaveBeenCalledTimes(2);
      s.first.fatal();
      s.first.manifest();
      s.first.attached();
      s.second.attached();
      s.second.manifest();
      await pending;
      await settle();
      expect(s.second.value.loadSource).toHaveBeenCalledWith(s.station.streams[0].url);
      expect(s.player.state()).toBe('loading');
      s.engine.audio.dispatchEvent(new Event('playing'));
      expect(s.player.state()).toBe('playing');
    });
  for (const phase of ['initialization', 'runtime'] as const)
    it(`falls back after ${phase} failure preserving one audio element, volume and mute`, async () => {
      const { player, engine, station, first, second, create, play } = setup();
      player.setVolume(0.3);
      player.toggleMute();
      const audio = engine.audio;
      const pending = player.play(station);
      if (phase === 'runtime') {
        first.manifest();
        await pending;
        audio.dispatchEvent(new Event('playing'));
      }
      first.fatal();
      await settle();
      expect(create).toHaveBeenCalledTimes(2);
      expect(first.value.destroy).toHaveBeenCalledOnce();
      first.attached();
      first.fatal();
      first.manifest();
      expect(first.value.loadSource).not.toHaveBeenCalled();
      second.attached();
      second.manifest();
      await pending;
      await settle();
      expect(second.value.loadSource).toHaveBeenCalledWith(station.streams[1].url);
      expect(engine.audio).toBe(audio);
      expect(audio.volume).toBe(0.3);
      expect(audio.muted).toBe(true);
      audio.dispatchEvent(new Event('playing'));
      expect(player.state()).toBe('playing');
      const calls = play.mock.calls.length;
      player.pause();
      await player.resume();
      expect(play.mock.calls.length).toBe(calls + 1);
      expect(create).toHaveBeenCalledTimes(2);
    });
  for (const action of ['pause', 'stop', 'switch'] as const)
    for (const phase of ['queued', 'initializing'] as const)
      it(`cancels ${phase} HLS URL fallback on ${action} without stale playback`, async () => {
        const { player, engine, station, other, first, second, create, play } = setup();
        const pending = player.play(station);
        first.fatal();
        if (phase === 'initializing') await settle();
        if (action === 'switch') await player.play(other);
        else player[action]();
        const calls = play.mock.calls.length;
        first.attached();
        first.manifest();
        first.fatal();
        second.attached();
        second.manifest();
        second.fatal();
        await pending;
        await settle();
        expect(play.mock.calls.length).toBe(calls);
        expect(create).toHaveBeenCalledTimes(phase === 'queued' ? 1 : 2);
        expect(player.state()).toBe(action === 'pause' ? 'paused' : action === 'stop' ? 'idle' : 'loading');
        expect(engine.audio.getAttribute('src')).toBe(action === 'switch' ? other.streams[0].url : null);
        if (action === 'switch') expect(player.station()?.id).toBe(other.id);
      });
});
