import { RadioRecordingConfig } from '../../environments/radio-recording.config';
export const MAX_RECORDING_MS = 60 * 60_000;
export const MAX_RECORDING_BYTES = 80 * 1024 * 1024;
/** Fail closed to bounded capture if the environment contains invalid values. */
export function recordingLimits(config?: Pick<RadioRecordingConfig, 'MaxDurationMs' | 'MaxBytes'>) {
  const duration = config?.MaxDurationMs;
  const bytes = config?.MaxBytes;
  return {
    maxMs: typeof duration === 'number' && Number.isFinite(duration) && duration >= 1_000 && duration <= 24 * 60 * 60_000 ? duration : MAX_RECORDING_MS,
    maxBytes: typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 1024 && bytes <= 512 * 1024 * 1024 ? bytes : MAX_RECORDING_BYTES,
  };
}
export interface CaptureCallbacks {
  progress(seconds: number, genuine: boolean): void;
  finished(blob: Blob | null, reason?: 'manual' | 'limit'): void;
  failed(): void;
}
export interface CaptureHandle {
  stop(discard?: boolean): void;
}
export type CaptureFactory = (
  audio: HTMLAudioElement,
  signal: AbortSignal,
  callbacks: CaptureCallbacks,
  config?: Pick<RadioRecordingConfig, 'MaxDurationMs' | 'MaxBytes'>,
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
  let stream: MediaStream | undefined, context: AudioContext | undefined, recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined,
    ended = false,
    discard = false,
    bytes = 0;
  let failed = false;
  let stopReason: 'manual' | 'limit' = 'manual';
  let signalWindows = 0;
  let heard = false,
    chunks: Blob[] = [],
    started = 0;
  const release = () => {
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    signal.removeEventListener('abort', abort);
  };
  const stop = (drop = false, reason: 'manual' | 'limit' = 'manual') => {
    stopReason = reason;
    if (ended) return;
    discard ||= drop;
    ended = true;
    // Stop captured tracks synchronously before the player can attach another station/source.
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    release();
  };
  const abort = () => {
    stop(true);
    chunks = [];
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    stream = capture.call(audio);
    if (!stream.getAudioTracks().some(track => track.readyState === 'live')) throw Error('No accessible audio');
    // Some HLS containers expose a video track even through HTMLAudioElement. Never record that track.
    const audioTracks = stream.getAudioTracks();
    stream.getVideoTracks().forEach(track => track.stop());
    stream = new MediaStream(audioTracks);
    context = new AudioContext();
    const analyser = context.createAnalyser();
    context.createMediaStreamSource(stream).connect(analyser);
    // AudioContext.resume() can remain pending after asynchronous permission
    // checks have lost the browser's user activation. Never leave the UI at
    // "Waiting for stream audio… 0 s" indefinitely.
    let resumeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.resume(),
        new Promise<never>((_, reject) => {
          resumeTimeout = setTimeout(() => reject(Error('Audio capture context timed out')), 4000);
        }),
      ]);
    } finally {
      clearTimeout(resumeTimeout);
    }
    if (signal.aborted || ended) throw Error('Cancelled');
    if (context.state !== 'running') throw Error('Audio capture context unavailable');
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
    recorder.ondataavailable = event => {
      if (discard || !event.data.size) return;
      if (bytes + event.data.size > maxBytes) {
        stop(false, 'limit');
        return;
      }
      chunks.push(event.data);
      bytes += event.data.size;
    };
    recorder.onstop = () => {
      release();
      const blob = !discard && heard && bytes > 256 ? new Blob(chunks, { type: recorder?.mimeType || mimeType }) : null;
      chunks = [];
      if (!failed) callbacks.finished(blob, stopReason);
    };
    recorder.onerror = () => {
      failed = true;
      discard = true;
      stop(true);
      callbacks.failed();
    };
    started = performance.now();
    recorder.start(1000);
    const samples = new Float32Array(analyser.fftSize);
    timer = setInterval(() => {
      if (ended) return;
      const elapsed = performance.now() - started;
      analyser.getFloatTimeDomainData(samples);
      // Live radio streams can expose a stationary/non-finite playback
      // position even while audio is audible. Require real analyser energy
      // and encoded data rather than a changing HTMLAudioElement.currentTime.
      const rms = Math.sqrt(samples.reduce((power, sample) => power + sample * sample, 0) / samples.length);
      if (rms >= 0.001) signalWindows++;
      else signalWindows = 0;
      // Three real observations above -60 dBFS: tiny codec noise or one click is insufficient proof.
      heard ||= signalWindows >= 3;
      callbacks.progress(Math.floor(elapsed / 1000), heard && bytes > 256);
      if (elapsed >= maxMs) stop(false, 'limit');
      else if (elapsed >= 8000 && !heard) {
        stop(true);
      }
    }, 200);
    return { stop };
  } catch (error) {
    stop(true);
    throw error;
  }
};
