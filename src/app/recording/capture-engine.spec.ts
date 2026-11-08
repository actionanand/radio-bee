import { captureRadio, CaptureCallbacks, MAX_RECORDING_BYTES } from './capture-engine';
describe('Bounded output-only capture adapter (controlled API unit tests)', () => {
  let recorder: FakeRecorder,
    samples = 0.05;
  const track = { kind: 'audio', readyState: 'live', stop: vi.fn() };
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
    expect(cb.finished).toHaveBeenCalledWith(expect.any(Blob));
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
      expect(cb.finished).toHaveBeenCalledWith(null);
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
    expect(cb.finished).toHaveBeenCalledWith(null);
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
    await vi.advanceTimersByTimeAsync(120000);
    expect(recorder.state).toBe('inactive');
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
