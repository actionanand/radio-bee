import { RadioRecordingConfig } from '../../environments/radio-recording.config';
export const MAX_RECORDING_MS = 60 * 60_000;
export const MAX_RECORDING_BYTES = 80 * 1024 * 1024;
/** Fail closed to bounded capture if the environment contains invalid values. */
export function recordingLimits(config?: Pick<RadioRecordingConfig, 'MaxDurationMs' | 'MaxBytes'>) {
  const duration = config?.MaxDurationMs;
  const bytes = config?.MaxBytes;
  return {
    maxMs:
      typeof duration === 'number' && Number.isFinite(duration) && duration >= 1_000 && duration <= 24 * 60 * 60_000
        ? duration
        : MAX_RECORDING_MS,
    maxBytes:
      typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 1024 && bytes <= 512 * 1024 * 1024
        ? bytes
        : MAX_RECORDING_BYTES,
  };
}
export type CaptureEndReason = 'manual' | 'limit' | 'source-ended' | 'no-audio';
/** Local diagnostics only: never includes audio, stream URLs or device identifiers. */
export interface CaptureDiagnostic {
  at: number;
  phase: 'capturing' | 'finished' | 'error';
  reason?: CaptureEndReason;
  contextState: string;
  tracks: { readyState: MediaStreamTrackState; muted: boolean; enabled: boolean }[];
  recorderState: RecordingState | 'uninitialized';
  mimeType: string;
  bytes: number;
  seconds: number;
  rms: number;
  maxRms: number;
  signalWindows: number;
  heard: boolean;
  captureAttempt: number;
}
export interface CaptureCallbacks {
  diagnostic?(snapshot: CaptureDiagnostic): void;
  progress(seconds: number, genuine: boolean): void;
  finished(blob: Blob | null, reason?: CaptureEndReason): void;
  failed(): void;
}
export interface CaptureHandle {
  stop(discard?: boolean): void;
}
export type CaptureConfig = Pick<RadioRecordingConfig, 'MaxDurationMs' | 'MaxBytes'> & { retryEmptyCapture?: boolean; audioBitrate?: number };
export type CaptureFactory = (
  audio: HTMLAudioElement,
  signal: AbortSignal,
  callbacks: CaptureCallbacks,
  config?: CaptureConfig,
) => Promise<CaptureHandle>;
interface CapturableAudio extends HTMLAudioElement {
  captureStream?: () => MediaStream;
}
export function captureSupported(audio: HTMLAudioElement): boolean {
  return (
    typeof (audio as CapturableAudio).captureStream === 'function' &&
    typeof AudioContext !== 'undefined' &&
    typeof MediaStream !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].some(type => MediaRecorder.isTypeSupported(type))
  );
}
/** Captures only the existing player output. Never requests a microphone, fetches or relays a stream. */
export const EMPTY_CAPTURE_REATTACH_MS = 2_000;
export const CAPTURE_VALIDATION_MS = 8_000;
interface CaptureAttempt {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  recorder?: MediaRecorder;
}
export const captureRadio: CaptureFactory = async (audio, signal, callbacks, config) => {
  const { maxMs, maxBytes } = recordingLimits(config);
  const capture = (audio as CapturableAudio).captureStream;
  const mimeType =
    typeof MediaRecorder === 'undefined'
      ? undefined
      : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type =>
          MediaRecorder.isTypeSupported(type),
        );
  if (!capture || !mimeType || typeof AudioContext === 'undefined' || signal.aborted)
    throw Error('Unsupported capture');
  let active: CaptureAttempt | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ended = false,
    discard = false,
    failed = false,
    bytes = 0,
    heard = false;
  let chunks: Blob[] = [],
    started = 0,
    signalWindows = 0,
    rms = 0,
    maxRms = 0,
    lastDiagnosticSecond = -1;
  let stopReason: CaptureEndReason = 'manual';
  let captureAttempt = 0,
    reattaching = false;
  const initialTime = audio.currentTime;
  const diagnose = (phase: CaptureDiagnostic['phase'], reason?: CaptureEndReason) => {
    try {
      callbacks.diagnostic?.({
        at: Date.now(),
        phase,
        reason,
        contextState: active?.context.state ?? 'uninitialized',
        tracks:
          active?.stream
            .getAudioTracks()
            .map(track => ({ readyState: track.readyState, muted: track.muted, enabled: track.enabled })) ?? [],
        recorderState: active?.recorder?.state ?? 'uninitialized',
        mimeType: active?.recorder?.mimeType || mimeType,
        bytes,
        seconds: started ? Math.floor((performance.now() - started) / 1000) : 0,
        rms,
        maxRms,
        signalWindows,
        heard,
        captureAttempt,
      });
    } catch {
      /* Observation cannot interrupt capture or cleanup. */
    }
  };
  const releaseAttempt = (attempt: CaptureAttempt | undefined, abandon = false) => {
    if (!attempt) return;
    const recorder = attempt.recorder;
    if (abandon && recorder) {
      // Old recorder events must never finish or contaminate a replacement capture.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    attempt.stream.getTracks().forEach(track => track.stop());
    if (attempt.context.state !== 'closed') void attempt.context.close().catch(() => undefined);
  };
  const release = () => {
    clearInterval(timer);
    releaseAttempt(active);
    signal.removeEventListener('abort', abort);
  };
  const stop = (drop = false, reason: CaptureEndReason = 'manual') => {
    if (ended) return;
    stopReason = reason;
    discard ||= drop;
    ended = true;
    diagnose('finished', reason);
    const recorder = active?.recorder;
    if (recorder) {
      if (recorder.state !== 'inactive') recorder.stop();
    } else if (!failed) callbacks.finished(null, stopReason);
    release();
  };
  const abort = () => {
    stop(true);
    chunks = [];
  };
  signal.addEventListener('abort', abort, { once: true });
  const attach = async () => {
    ++captureAttempt;
    const captured = capture.call(audio);
    // Clean up every track even if construction or resume fails.
    captured.getVideoTracks().forEach(track => track.stop());
    const tracks = captured.getAudioTracks();
    if (!tracks.some(track => track.readyState === 'live')) {
      captured.getTracks().forEach(track => track.stop());
      throw Error('No accessible audio');
    }
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch (error) {
      tracks.forEach(track => track.stop());
      throw error;
    }
    const stream = new MediaStream(tracks),
      analyser = context.createAnalyser();
    const attempt: CaptureAttempt = { stream, context, analyser };
    active = attempt;
    context.createMediaStreamSource(stream).connect(analyser);
    await context.resume();
    if (signal.aborted || ended || active !== attempt) {
      releaseAttempt(attempt, true);
      throw Error('Cancelled');
    }
    const requestedBitrate = config?.audioBitrate ?? 128000;
    const bitrate = [64000, 96000, 128000].includes(requestedBitrate) ? requestedBitrate : 128000;
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: bitrate });
    attempt.recorder = recorder;
    recorder.ondataavailable = event => {
      if (active !== attempt || discard || !event.data.size) return;
      if (bytes + event.data.size > maxBytes) {
        stop(false, 'limit');
        return;
      }
      chunks.push(event.data);
      bytes += event.data.size;
    };
    recorder.onstop = () => {
      if (active !== attempt) return;
      if (!ended) {
        ended = true;
        stopReason = 'source-ended';
        diagnose('finished', stopReason);
      }
      release();
      const blob = !discard && heard && bytes > 256 ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null;
      chunks = [];
      if (!failed) callbacks.finished(blob, stopReason);
    };
    recorder.onerror = () => {
      if (active !== attempt || ended) return;
      diagnose('error');
      failed = true;
      discard = true;
      stop(true);
      callbacks.failed();
    };
    recorder.start(1000);
  };
  const reattach = async () => {
    reattaching = true;
    const previous = active;
    active = undefined;
    releaseAttempt(previous, true);
    try {
      await attach();
    } catch {
      if (!ended) stop(true, 'no-audio');
    } finally {
      reattaching = false;
    }
  };
  try {
    await attach();
    if (ended || signal.aborted) throw Error('Cancelled');
    started = performance.now();
    const samples = new Float32Array(active!.analyser.fftSize);
    timer = setInterval(() => {
      if (ended) return;
      const elapsed = performance.now() - started;
      if (active && !reattaching) {
        active.analyser.getFloatTimeDomainData(samples);
        rms = Math.sqrt(samples.reduce((power, sample) => power + sample * sample, 0) / samples.length);
        maxRms = Math.max(maxRms, rms);
        if (rms >= 0.001 && (audio.currentTime > initialTime || audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA))
          ++signalWindows;
        heard ||= signalWindows >= 3;
      }
      callbacks.progress(Math.floor(elapsed / 1000), heard && bytes > 256);
      const second = Math.floor(elapsed / 1000);
      if (second !== lastDiagnosticSecond) {
        lastDiagnosticSecond = second;
        diagnose('capturing');
      }
      // Both attempts share the original deadline. Silence with encoded frames is
      // never mistaken for the zero-frame browser capture failure.
      if (elapsed >= maxMs) stop(false, 'limit');
      else if (elapsed >= CAPTURE_VALIDATION_MS && !heard) stop(true, 'no-audio');
      else if (
        config?.retryEmptyCapture &&
        captureAttempt === 1 &&
        !reattaching &&
        elapsed >= EMPTY_CAPTURE_REATTACH_MS &&
        bytes === 0 &&
        maxRms === 0 &&
        active?.context.state === 'running' &&
        active.stream.getAudioTracks().some(track => track.readyState === 'live' && !track.muted) &&
        !audio.paused &&
        !audio.ended &&
        audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      )
        void reattach();
    }, 200);
    return { stop };
  } catch (error) {
    failed = true;
    stop(true);
    throw error;
  }
};
