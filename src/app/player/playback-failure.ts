import Hls, { ErrorData } from 'hls.js';
export type FailureKind =
  | 'network'
  | 'manifest'
  | 'segment'
  | 'decoder'
  | 'unsupported'
  | 'invalid'
  | 'autoplay'
  | 'cancelled'
  | 'restricted'
  | 'revoked'
  | 'timeout'
  | 'ended'
  | 'unknown';
export interface PlaybackFailure {
  readonly kind: FailureKind;
  readonly transient: boolean;
  readonly hls?: { readonly type: string; readonly details: string; readonly fatal: boolean; readonly status?: number };
}
export class PlaybackError extends Error {
  constructor(readonly failure: PlaybackFailure) {
    super('Media playback failure');
    this.name = 'PlaybackError';
  }
}
export function safeFailure(failure: PlaybackFailure): PlaybackFailure {
  const { kind, transient, hls } = failure;
  return {
    kind,
    transient,
    ...(hls
      ? {
          hls: {
            type: Object.values<string>(Hls.ErrorTypes).includes(hls.type) ? hls.type : 'unknown',
            details: Object.values<string>(Hls.ErrorDetails).includes(hls.details) ? hls.details : 'unknown',
            fatal: hls.fatal === true,
            ...(Number.isInteger(hls.status) && hls.status! >= 0 && hls.status! <= 599 ? { status: hls.status } : {}),
          },
        }
      : {}),
  };
}
export function hlsFailure(data: Pick<ErrorData, 'type' | 'details' | 'fatal' | 'response'>): PlaybackFailure {
  // Whitelist library enums; never retain response URLs, response bodies or error messages.
  const type = Object.values(Hls.ErrorTypes).includes(data.type) ? data.type : 'unknown';
  const details = Object.values(Hls.ErrorDetails).includes(data.details) ? data.details : 'unknown';
  const code = data.response?.code;
  const status = typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 599 ? code : undefined;
  const hls = { type, details, fatal: data.fatal, ...(status === undefined ? {} : { status }) };
  if (status === 401 || status === 403) return { kind: 'restricted', transient: false, hls };
  if (
    [Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR, Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR].includes(
      data.details,
    )
  )
    return { kind: 'unsupported', transient: false, hls };
  if (type === Hls.ErrorTypes.NETWORK_ERROR) {
    const download = [
      Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
      Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT,
      Hls.ErrorDetails.LEVEL_LOAD_ERROR,
      Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT,
      Hls.ErrorDetails.AUDIO_TRACK_LOAD_ERROR,
      Hls.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT,
      Hls.ErrorDetails.FRAG_LOAD_ERROR,
      Hls.ErrorDetails.FRAG_LOAD_TIMEOUT,
      Hls.ErrorDetails.KEY_LOAD_ERROR,
      Hls.ErrorDetails.KEY_LOAD_TIMEOUT,
    ].includes(data.details);
    const transient =
      download && (status === undefined || status === 0 || status === 408 || status === 429 || status >= 500);
    const kind =
      details.startsWith('manifest') || details.startsWith('level') || details.startsWith('audioTrack')
        ? 'manifest'
        : details.startsWith('frag') || details.startsWith('key')
          ? 'segment'
          : 'network';
    return { kind, transient, hls };
  }
  return { kind: type === Hls.ErrorTypes.MEDIA_ERROR ? 'decoder' : 'unknown', transient: false, hls };
}
export function playbackFailure(cause: unknown, media?: MediaError | null): PlaybackFailure {
  if (cause instanceof PlaybackError) return cause.failure;
  const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : '';
  if (name === 'NotAllowedError') return { kind: 'autoplay', transient: false };
  if (name === 'AbortError') return { kind: 'cancelled', transient: false };
  if (name === 'NotSupportedError') return { kind: 'unsupported', transient: false };
  if (name === 'SecurityError') return { kind: 'restricted', transient: false };
  switch (media?.code) {
    case 1:
      return { kind: 'cancelled', transient: false };
    case 2:
      return { kind: 'network', transient: true };
    case 3:
      return { kind: 'decoder', transient: false };
    case 4:
      return { kind: 'unsupported', transient: false };
    default:
      return { kind: 'unknown', transient: false };
  }
}
