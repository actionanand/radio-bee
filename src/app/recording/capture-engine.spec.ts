import {
  captureRadio,
  CaptureCallbacks,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_MS,
  recordingLimits,
} from './capture-engine';
describe('Bounded output-only capture adapter (controlled API unit tests)', () => {
  let recorder: FakeRecorder,
    samples = 0.05;
  const track = { kind: 'audio', readyState: 'live', enabled: true, muted: false, stop: vi.fn() };
  const callbacks = (): CaptureCallbacks => ({ progress: vi.fn(), finished: vi.fn(), failed: vi.fn() });
  class FakeRecorder {
    static isTypeSupported(type: string) {
      return type.includes('webm');
    }
    state = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly stream: MediaStream) {
      recorder = this;
    }
    start() {
      this.state = 'recording';
    }
    data(size = 512) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) } as BlobEvent);
    }
    stop() {
      this.state = 'inactive';
      this.onstop?.();
    }
  }
  beforeEach(() => {
    vi.useFakeTimers();
    samples = 0.05;
    track.stop.mockClear();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal(
      'MediaStream',
      class {
        constructor(private readonly tracks: (typeof track)[]) {}
        getTracks() {
          return this.tracks;
        }
        getAudioTracks() {
          return this.tracks.filter(t => t.kind === 'audio');
        }
        getVideoTracks() {
          return this.tracks.filter(t => t.kind === 'video');
        }
      },
    );
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        resume = async () => undefined;
        close = async () => {
          this.state = 'closed';
        };
        createAnalyser() {
          return { fftSize: 32, getFloatTimeDomainData: (target: Float32Array) => target.fill(samples) };
        }
        createMediaStreamSource() {
          return { connect: vi.fn() };
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function audio() {
    const element = document.createElement('audio');
    Object.defineProperty(element, 'currentTime', { value: 10, writable: true });
    return Object.assign(element, {
      captureStream: () => ({ getAudioTracks: () => [track], getVideoTracks: () => [], getTracks: () => [track] }),
    });
  }
  it('requires data, advancing source time and real signal energy before reporting success', async () => {
    const element = audio(),
      cb = callbacks();
    const handle = await captureRadio(element, new AbortController().signal, cb);
    recorder.data();
    await vi.advanceTimersByTimeAsync(200);
    expect(cb.progress).toHaveBeenLastCalledWith(0, false);
    element.currentTime = 11;
    await vi.advanceTimersByTimeAsync(600);
    expect(cb.progress).toHaveBeenLastCalledWith(0, true);
    handle.stop();
    expect(cb.finished).toHaveBeenCalledWith(expect.any(Blob), 'manual');
    expect(track.stop).toHaveBeenCalled();
  });
  it('recognizes audible live streams even when currentTime remains fixed', async () => {
    const element = audio(),
      cb = callbacks();
    Object.defineProperty(element, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    const handle = await captureRadio(element, new AbortController().signal, cb);
    recorder.data();
    await vi.advanceTimersByTimeAsync(800);
    expect(cb.progress).toHaveBeenLastCalledWith(0, true);
    expect(element.currentTime).toBe(10);
    handle.stop();
    expect(cb.finished).toHaveBeenCalledWith(expect.any(Blob), 'manual');
  });
  it('classifies an unexpected native recorder stop and preserves already validated audio', async () => {
    const element = audio(),
      cb = callbacks();
    const handle = await captureRadio(element, new AbortController().signal, cb);
    element.currentTime = 11;
    recorder.data();
    await vi.advanceTimersByTimeAsync(800);
    recorder.stop();
    handle.stop();
    expect(cb.finished).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), 'source-ended');
    expect(track.stop).toHaveBeenCalled();
  });
  it('reports real pre-cleanup silence diagnostics without weakening the eight-second rejection', async () => {
    samples = 0;
    const element = audio(),
      cb = callbacks(),
      diagnostic = vi.fn();
    await captureRadio(element, new AbortController().signal, { ...cb, diagnostic });
    recorder.data();
    await vi.advanceTimersByTimeAsync(8000);
    expect(cb.finished).toHaveBeenCalledWith(null, 'no-audio');
    expect(diagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'finished',
        reason: 'no-audio',
        contextState: 'running',
        recorderState: 'recording',
        rms: 0,
        maxRms: 0,
        bytes: 512,
        heard: false,
        tracks: [{ readyState: 'live', muted: false, enabled: true }],
      }),
    );
  });
  it('never lets an observer exception abort genuine capture or cleanup', async () => {
    const element = audio(),
      cb = callbacks();
    const handle = await captureRadio(element, new AbortController().signal, {
      ...cb,
      diagnostic: () => {
        throw Error('Observer failed');
      },
    });
    recorder.data();
    element.currentTime = 11;
    await vi.advanceTimersByTimeAsync(800);
    handle.stop();
    expect(cb.finished).toHaveBeenCalledWith(expect.any(Blob), 'manual');
    expect(track.stop).toHaveBeenCalled();
  });
  it('re-acquires a zero-frame V2 capture once without extending the validation deadline', async () => {
    const element = audio(),
      cb = callbacks();
    Object.defineProperty(element, 'paused', { value: false });
    Object.defineProperty(element, 'readyState', { value: 4 });
    const capture = vi.spyOn(element, 'captureStream');
    samples = 0;
    const handle = await captureRadio(element, new AbortController().signal, cb, {
      MaxDurationMs: MAX_RECORDING_MS,
      MaxBytes: MAX_RECORDING_BYTES,
      retryEmptyCapture: true,
    });
    const obsolete = recorder,
      lateData = obsolete.ondataavailable,
      lateStop = obsolete.onstop;
    await vi.advanceTimersByTimeAsync(2200);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(obsolete.state).toBe('inactive');
    lateData?.({ data: new Blob([new Uint8Array(2048)]) } as BlobEvent);
    lateStop?.();
    expect(cb.finished).not.toHaveBeenCalled();
    samples = 0.1;
    recorder.data();
    await vi.advanceTimersByTimeAsync(800);
    expect(cb.progress).toHaveBeenLastCalledWith(3, true);
    handle.stop();
    expect(cb.finished).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), 'manual');
  });
  it('rejects two starved attempts at the original eight seconds and never loops', async () => {
    const element = audio(),
      cb = callbacks();
    Object.defineProperty(element, 'paused', { value: false });
    Object.defineProperty(element, 'readyState', { value: 4 });
    const capture = vi.spyOn(element, 'captureStream');
    samples = 0;
    await captureRadio(element, new AbortController().signal, cb, {
      MaxDurationMs: MAX_RECORDING_MS,
      MaxBytes: MAX_RECORDING_BYTES,
      retryEmptyCapture: true,
    });
    await vi.advanceTimersByTimeAsync(8000);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(cb.finished).toHaveBeenCalledExactlyOnceWith(null, 'no-audio');
    await vi.advanceTimersByTimeAsync(10000);
    expect(capture).toHaveBeenCalledTimes(2);
  });
  for (const retry of [false, true])
    it(`does not reacquire encoded silent audio or affect V1 (retry=${retry})`, async () => {
      const element = audio(),
        cb = callbacks();
      Object.defineProperty(element, 'paused', { value: false });
      Object.defineProperty(element, 'readyState', { value: 4 });
      const capture = vi.spyOn(element, 'captureStream');
      samples = 0;
      await captureRadio(element, new AbortController().signal, cb, {
        MaxDurationMs: MAX_RECORDING_MS,
        MaxBytes: MAX_RECORDING_BYTES,
        retryEmptyCapture: retry,
      });
      if (retry) recorder.data();
      await vi.advanceTimersByTimeAsync(8000);
      expect(capture).toHaveBeenCalledOnce();
      expect(cb.finished).toHaveBeenCalledWith(null, 'no-audio');
    });
  it('cancels a pending replacement context without starting another recorder', async () => {
    const element = audio(),
      cb = callbacks();
    Object.defineProperty(element, 'paused', { value: false });
    Object.defineProperty(element, 'readyState', { value: 4 });
    samples = 0;
    const abort = new AbortController();
    await captureRadio(element, abort.signal, cb, {
      MaxDurationMs: MAX_RECORDING_MS,
      MaxBytes: MAX_RECORDING_BYTES,
      retryEmptyCapture: true,
    });
    let resume!: () => void;
    const nativeContext = AudioContext;
    vi.stubGlobal(
      'AudioContext',
      class extends nativeContext {
        override resume = () =>
          new Promise<void>(resolve => {
            resume = resolve;
          });
      },
    );
    const original = recorder;
    await vi.advanceTimersByTimeAsync(2200);
    abort.abort();
    resume();
    await Promise.resolve();
    await Promise.resolve();
    expect(recorder).toBe(original);
    expect(cb.finished).toHaveBeenCalledExactlyOnceWith(null, 'manual');
    expect(track.stop).toHaveBeenCalled();
  });
  it('excludes and stops HLS video tracks before constructing an audio recorder', async () => {
    const element = audio(),
      video = { kind: 'video', readyState: 'live', stop: vi.fn() };
    Object.assign(element, {
      captureStream: () => ({
        getAudioTracks: () => [track],
        getVideoTracks: () => [video],
        getTracks: () => [track, video],
      }),
    });
    const handle = await captureRadio(element, new AbortController().signal, callbacks());
    expect(video.stop).toHaveBeenCalledOnce();
    expect(recorder.stream.getTracks()).toEqual([track]);
    expect(recorder.stream.getVideoTracks()).toHaveLength(0);
    handle.stop(true);
  });
  for (const level of [0, 0.00003])
    it(`never exports silence or codec-level noise (${level})`, async () => {
      samples = level;
      const element = audio(),
        cb = callbacks();
      await captureRadio(element, new AbortController().signal, cb);
      recorder.data();
      element.currentTime = 20;
      await vi.advanceTimersByTimeAsync(8000);
      expect(cb.failed).not.toHaveBeenCalled();
      expect(cb.finished).toHaveBeenCalledWith(null, 'no-audio');
    });
  it('reports an encoder error once without overwriting it with an empty-file outcome', async () => {
    const cb = callbacks();
    await captureRadio(audio(), new AbortController().signal, cb);
    recorder.onerror?.();
    expect(cb.failed).toHaveBeenCalledOnce();
    expect(cb.finished).not.toHaveBeenCalled();
  });
  it('discards on abort and stops captured tracks without touching the source player', async () => {
    const element = audio(),
      cb = callbacks(),
      abort = new AbortController();
    await captureRadio(element, abort.signal, cb);
    recorder.data();
    abort.abort();
    expect(track.stop).toHaveBeenCalled();
    expect(cb.finished).toHaveBeenCalledWith(null, 'manual');
    expect(element.currentTime).toBe(10);
  });
  it('bounds duration and buffered bytes', async () => {
    const element = audio(),
      cb = callbacks();
    await captureRadio(element, new AbortController().signal, cb);
    recorder.data();
    element.currentTime = 11;
    await vi.advanceTimersByTimeAsync(600);
    recorder.data(MAX_RECORDING_BYTES + 1);
    expect(recorder.state).toBe('inactive');
    const blob = vi.mocked(cb.finished).mock.calls[0][0];
    expect(blob?.size).toBeLessThanOrEqual(MAX_RECORDING_BYTES);
    const next = callbacks();
    await captureRadio(element, new AbortController().signal, next);
    element.currentTime = 12;
    recorder.data();
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS);
    expect(recorder.state).toBe('inactive');
  });
  it('honors configurable limits and reports automatic segment boundaries', async () => {
    const cb = callbacks(),
      element = audio();
    await captureRadio(element, new AbortController().signal, cb, { MaxDurationMs: 1000, MaxBytes: 4096 });
    element.currentTime = 15;
    recorder.data(512);
    await vi.advanceTimersByTimeAsync(1200);
    expect(recorder.state).toBe('inactive');
    expect(cb.finished).toHaveBeenCalledWith(expect.any(Blob), 'limit');
    expect(recordingLimits({ MaxDurationMs: 2000, MaxBytes: 2048 })).toEqual({ maxMs: 2000, maxBytes: 2048 });
    expect(recordingLimits({ MaxDurationMs: Number.NaN, MaxBytes: -1 })).toEqual({
      maxMs: MAX_RECORDING_MS,
      maxBytes: MAX_RECORDING_BYTES,
    });
  });
  it('rejects unsupported MIME/security failures without asking for microphone access', async () => {
    const element = audio();
    Object.assign(element, {
      captureStream: () => {
        throw new DOMException('CORS', 'SecurityError');
      },
    });
    await expect(captureRadio(element, new AbortController().signal, callbacks())).rejects.toMatchObject({
      name: 'SecurityError',
    });
    vi.spyOn(FakeRecorder, 'isTypeSupported').mockReturnValue(false);
    await expect(captureRadio(audio(), new AbortController().signal, callbacks())).rejects.toThrow(
      'Unsupported capture',
    );
  });
});
