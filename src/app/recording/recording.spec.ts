import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { currentPublishedFixture } from '../catalog/testing/published-1.3.fixture';
import { validateCatalog } from '../catalog/catalog.validation';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
import { RADIO_RECORDING } from './recording.config';
import {
  CAPTURE_ACCESS,
  CAPTURE_SUPPORT,
  CAPTURE_FACTORY,
  RECORDING_EXPORT,
  RecordingService,
  recordingPermission,
} from './recording.service';
import { CaptureCallbacks, CaptureFactory } from './capture-engine';
import { recordingFilename } from './export-recording';
import { PlayerComponent } from '../player/player';
import { environment } from '../../environments/environment';
import { environment as production } from '../../environments/environment.prod';
import { PlaybackError } from '../player/playback-failure';

function setup(enabled = true, allowProhibitedRecording = false) {
  const c = validateCatalog(structuredClone(currentPublishedFixture));
  const station = c.stations.find(s => s.streams.length)!;
  const other = c.stations.find(s => s.id !== station.id && s.streams.length)!;
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  let callbacks!: CaptureCallbacks;
  const stop = vi.fn();
  const create = vi.fn<CaptureFactory>(async (_audio, _signal, hooks) => {
    callbacks = hooks;
    return { stop };
  });
  const save = vi.fn(async () => undefined);
  const access = vi.fn<(url: string, signal: AbortSignal) => Promise<void>>(async () => undefined);
  const data = { stationName: CatalogService.prototype.stationName, catalog: signal(c), locale: signal('en') };
  TestBed.configureTestingModule({
    providers: [
      { provide: RADIO_RECORDING, useValue: { Enabled: enabled, AllowProhibitedRecording: allowProhibitedRecording } },
      { provide: CatalogService, useValue: data },
      { provide: MEDIA_ENGINE, useValue: { audio, supports: () => true, load: async () => undefined, clear: vi.fn() } },
      { provide: CAPTURE_FACTORY, useValue: create },
      { provide: RECORDING_EXPORT, useValue: { save } },
      { provide: CAPTURE_ACCESS, useValue: { check: access } },
      { provide: CAPTURE_SUPPORT, useValue: { available: () => true } },
    ],
  });
  const player = TestBed.inject(PlayerService);
  return { player, station, other, audio, create, save, stop, access, data, c, hooks: () => callbacks };
}
async function playing(s: ReturnType<typeof setup>) {
  await s.player.play(s.station);
  s.audio.dispatchEvent(new Event('playing'));
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Configured recording and explicit source policy', () => {
  it('ends capture before transient recovery, preserves the completed draft and never restarts capture', async () => {
    vi.useFakeTimers();
    const s = setup();
    // AIR-like single candidate, keeping its real recording consent requirement.
    s.station.streams = [s.station.streams[0]];
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    s.hooks().progress(2, true);
    Object.defineProperty(s.audio, 'error', { value: { code: 2 } });
    s.audio.dispatchEvent(new Event('error'));
    expect(s.stop).toHaveBeenCalledOnce();
    expect(s.player.statusLabel()).toBe('reconnecting');
    const blob = new Blob(['unit draft'], { type: 'audio/webm' });
    s.hooks().finished(blob);
    await vi.advanceTimersByTimeAsync(750);
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.player.state()).toBe('playing');
    expect(s.create).toHaveBeenCalledOnce();
    expect(service.state()).toBe('ready');
    await service.save();
    expect(s.save).toHaveBeenCalledWith(blob, expect.any(String));
  });
  it('distinguishes paused or absent playback from prohibited recording metadata', async () => {
    const s = setup();
    const service = TestBed.inject(RecordingService);
    expect(service.permission()).toBe('unavailable');
    await playing(s);
    expect(service.permission()).toBe('acknowledgment');
    s.player.pause();
    expect(service.permission()).toBe('unavailable');
  });
  it('accepts independently configured recording booleans in both environments without altering RadioApi', () => {
    for (const e of [environment, production]) {
      expect(Object.keys(e.RadioRecording)).toEqual(['Enabled', 'AllowProhibitedRecording']);
      expect(typeof e.RadioRecording.Enabled).toBe('boolean'); // Neither true nor false is a CI release gate.
      expect(typeof e.RadioRecording.AllowProhibitedRecording).toBe('boolean');
      expect(e.RadioApi).toEqual({ AllowUnverified: true, CheckVerificationStatus: false, CheckRightsStatus: false });
    }
  });
  it('does not render or initialize recorder controls when disabled, while playback works', async () => {
    const s = setup(false);
    await playing(s);
    const view = TestBed.createComponent(PlayerComponent);
    view.detectChanges();
    await view.whenStable();
    expect(view.nativeElement.querySelector('app-recording-controls')).toBeNull();
    expect(view.nativeElement.textContent).not.toMatch(/Record|Export|Discard/);
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.create).not.toHaveBeenCalled();
  });
  it('requires acknowledgment for unconfirmed rights and never overrides an explicit prohibition', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(false);
    expect(s.create).not.toHaveBeenCalled();
    const stream = s.station.streams[0];
    expect(recordingPermission(stream)).toBe('acknowledgment');
    stream.directListening!.recording = 'prohibited';
    await service.start(true);
    expect(s.create).not.toHaveBeenCalled();
    stream.directListening!.recording = 'permission-granted';
    stream.directListening!.status = 'restricted';
    expect(recordingPermission(stream)).toBe('blocked');
  });
  it('requires a deliberate opt-in and user acknowledgment before recording a prohibited stream', async () => {
    const s = setup(true, true);
    await playing(s);
    const stream = s.station.streams[0];
    stream.directListening!.recording = 'prohibited';
    const service = TestBed.inject(RecordingService);
    expect(recordingPermission(stream)).toBe('blocked');
    expect(recordingPermission(stream, true)).toBe('acknowledgment');
    expect(service.permission()).toBe('acknowledgment');
    await service.start(false);
    expect(s.create).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.create).toHaveBeenCalledOnce();
  });
  it('does not override a stream restricted for listening', () => {
    const s = setup(true, true);
    const stream = s.station.streams[0];
    stream.directListening!.recording = 'prohibited';
    stream.directListening!.status = 'restricted';
    expect(recordingPermission(stream, true)).toBe('blocked');
  });
  it('starts only on request and claims recording only after genuine-data confirmation', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    expect(s.create).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.create).toHaveBeenCalledWith(s.audio, expect.any(AbortSignal), expect.any(Object));
    s.hooks().progress(1, false);
    expect(service.state()).toBe('starting');
    s.hooks().progress(2, true);
    expect(service.state()).toBe('recording');
    expect(service.seconds()).toBe(2);
    service.stop();
    expect(s.stop).toHaveBeenCalledWith();
    // Unit fixture only. Real capture is checked separately in Chrome.
    const blob = new Blob(['controlled unit data'], { type: 'audio/webm' });
    s.hooks().finished(blob);
    expect(service.state()).toBe('ready');
    await service.save();
    expect(s.save).toHaveBeenCalledWith(blob, expect.stringMatching(/^RadioBee-.*\.webm$/));
  });
  it('discards pending asynchronous capture and ignores stale final data', async () => {
    const s = setup();
    await playing(s);
    let resolve!: (value: { stop: typeof s.stop }) => void;
    s.create.mockImplementationOnce(() => new Promise(r => (resolve = r)));
    const service = TestBed.inject(RecordingService);
    const pending = service.start(true);
    const signal = s.create.mock.calls[0][1];
    service.discard();
    expect(signal.aborted).toBe(true);
    resolve({ stop: s.stop });
    await pending;
    expect(s.stop).toHaveBeenCalledWith(true);
    expect(service.file()).toBeNull();
  });
  it('does not let a discarded attempt rejection change a newly prepared capture', async () => {
    const s = setup();
    await playing(s);
    let reject!: (error: Error) => void;
    s.create.mockImplementationOnce(() => new Promise((_resolve, fail) => (reject = fail)));
    const service = TestBed.inject(RecordingService);
    const old = service.start(true);
    service.discard();
    nativeSource(s);
    vi.mocked(s.audio.play).mockImplementation(async () => {
      s.audio.dispatchEvent(new Event('playing'));
    });
    await service.start(true);
    expect(s.audio.crossOrigin).toBe('anonymous');
    reject(Error('Late discarded failure'));
    await old;
    expect(s.audio.crossOrigin).toBe('anonymous');
    expect(service.state()).toBe('starting');
    expect(s.create).toHaveBeenCalledTimes(2);
  });
  it('reports unsupported/security errors without stopping audio', async () => {
    const s = setup();
    await playing(s);
    s.create.mockRejectedValueOnce(new DOMException('CORS', 'SecurityError'));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(service.state()).toBe('error');
    expect(service.message()).toBe('recordingUnsupported');
    expect(s.player.state()).toBe('playing');
  });
  it('rejects empty capture, handles recorder error and retains a file after export errors', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    s.hooks().finished(null);
    expect(service.file()).toBeNull();
    expect(service.message()).toBe('recordingEmpty');
    await service.start(true);
    s.hooks().failed();
    expect(service.state()).toBe('error');
    await service.start(true);
    const blob = new Blob(['unit data'], { type: 'audio/ogg' });
    s.hooks().finished(blob);
    s.save.mockRejectedValueOnce(Error('Device'));
    await service.save();
    expect(service.file()).toBe(blob);
    expect(service.message()).toBe('recordingSaveError');
    service.discard();
    expect(service.file()).toBeNull();
  });
  for (const action of ['pause', 'stop', 'switch', 'failure'] as const)
    it(`terminates capture synchronously before player ${action}`, async () => {
      const s = setup();
      await playing(s);
      const service = TestBed.inject(RecordingService);
      await service.start(true);
      if (action === 'switch') {
        const next = s.player.play(s.other);
        expect(s.stop).toHaveBeenCalled();
        await next;
      } else if (action === 'failure') s.audio.dispatchEvent(new Event('error'));
      else s.player[action]();
      expect(s.stop).toHaveBeenCalledOnce();
      expect(service.state()).toBe('stopping');
    });
  it('stops on a recording-policy revocation independently of relaxed listening checks', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    const next = structuredClone(s.c);
    next.stations.find(st => st.id === s.station.id)!.streams[0].directListening!.recording = 'prohibited';
    s.data.catalog.set(next);
    TestBed.tick();
    expect(s.stop).toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
  });
  it('discards and unregisters observers on destruction and stops on hidden/pagehide', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(s.stop).toHaveBeenCalled();
    service.discard();
    await service.start(true);
    service.ngOnDestroy();
    expect(service.file()).toBeNull();
    expect(s.create.mock.calls.at(-1)![1].aborted).toBe(true);
  });
  it('produces safe station/timestamp filenames and uses actual output containers', () => {
    const date = new Date('2026-11-07T12:00:00Z');
    expect(recordingFilename('../Station: FM', 'audio/webm;codecs=opus', date)).toBe(
      'RadioBee-Station-FM-2026-11-07T12-00-00-000Z.webm',
    );
    expect(recordingFilename('தமிழ்', 'audio/mp4', date)).toMatch(/தமிழ்.*\.m4a$/);
    expect(recordingFilename('Station', 'audio/ogg', date)).toMatch(/\.ogg$/);
  });
  function nativeSource(s: ReturnType<typeof setup>) {
    Object.defineProperty(s.audio, 'currentSrc', { value: s.station.streams[0].url, configurable: true });
  }
  it('prepares native capture only after a user request and restores the playback mode on stop', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play).mockImplementation(async () => {
      s.audio.dispatchEvent(new Event('playing'));
    });
    const service = TestBed.inject(RecordingService);
    expect(s.access).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.access).toHaveBeenCalledWith(s.station.streams[0].url, expect.any(AbortSignal));
    expect(s.audio.crossOrigin).toBe('anonymous');
    expect(s.create).toHaveBeenCalledOnce();
    service.stop();
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
  });
  it('does not disturb playback or construct a recorder when a CORS check fails', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    s.access.mockRejectedValueOnce(Error('CORS'));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.player.state()).toBe('playing');
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
    expect(s.create).not.toHaveBeenCalled();
    expect(service.message()).toBe('recordingUnsupported');
  });
  it('does not restart playback or make access requests on unsupported recording platforms', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.spyOn(TestBed.inject(CAPTURE_SUPPORT), 'available').mockReturnValue(false);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.access).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    expect(service.message()).toBe('recordingUnsupported');
  });
  for (const action of ['pause', 'stop', 'switch'] as const)
    it(`never restarts after ${action} during capture preparation`, async () => {
      const s = setup();
      await playing(s);
      nativeSource(s);
      let resolve!: () => void;
      s.access.mockImplementationOnce(() => new Promise<void>(r => (resolve = r)));
      const service = TestBed.inject(RecordingService);
      const pending = service.start(true);
      if (action === 'switch') await s.player.play(s.other);
      else s.player[action]();
      resolve();
      await pending;
      expect(s.create).not.toHaveBeenCalled();
      expect(s.audio.getAttribute('crossorigin')).toBeNull();
      expect(s.player.station()?.id).toBe(
        action === 'stop' ? undefined : action === 'switch' ? s.other.id : s.station.id,
      );
      if (action === 'pause') expect(s.player.state()).toBe('paused');
    });
  it('makes one ordinary playback restoration after a failed CORS restart without retry loops', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play)
      .mockRejectedValueOnce(Error('CORS'))
      .mockImplementation(async () => {
        s.audio.dispatchEvent(new Event('playing'));
      });
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.audio.play).toHaveBeenCalledTimes(3); // Initial playback, capture restart, ordinary restoration.
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    expect(service.state()).toBe('error');
  });
  it('does not create a fresh session over the player reconnect scheduled during capture preparation', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.station.streams = [s.station.streams[0]];
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play).mockRejectedValueOnce(new PlaybackError({ kind: 'network', transient: true }));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.audio.play).toHaveBeenCalledTimes(2); // Initial selection and explicit capture preparation.
    expect(s.player.statusLabel()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(750);
    expect(s.audio.play).toHaveBeenCalledTimes(3);
    expect(
      s.player
        .diagnostics()
        .filter(d => d.result === 'attempt')
        .map(d => d.attempt),
    ).toEqual([1, 1, 2]);
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.create).not.toHaveBeenCalled();
    expect(service.state()).toBe('error');
  });
  for (const action of ['pause', 'stop', 'switch'] as const)
    it(`cancels an already-loading CORS restart on ${action}`, async () => {
      const s = setup();
      await playing(s);
      nativeSource(s);
      const service = TestBed.inject(RecordingService);
      const pending = service.start(true);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(s.audio.crossOrigin).toBe('anonymous');
      expect(s.player.state()).toBe('loading');
      if (action === 'switch') await s.player.play(s.other);
      else s.player[action]();
      await pending;
      expect(s.audio.getAttribute('crossorigin')).toBeNull();
      expect(s.create).not.toHaveBeenCalled();
      expect(s.audio.play).toHaveBeenCalledTimes(action === 'switch' ? 3 : 2);
      expect(s.player.station()?.id).toBe(
        action === 'stop' ? undefined : action === 'switch' ? s.other.id : s.station.id,
      );
      if (action === 'pause') expect(s.player.state()).toBe('paused');
    });
});
