import { InjectionToken } from '@angular/core';
import Hls, { HlsConfig, RetryConfig } from 'hls.js';
import { Stream } from '../catalog/catalog.models';
import { PlaybackError, PlaybackFailure, hlsFailure, playbackFailure } from './playback-failure';
export const HLS_INITIALIZATION_MS = 15_000;
// No nested manifest retries. One short playlist/segment retry remains inside hls.js.
const shortRetry: RetryConfig = {
  maxNumRetry: 1,
  retryDelayMs: 250,
  maxRetryDelayMs: 250,
  shouldRetry: (_config, count, _timeout, response) =>
    count < 1 &&
    (response?.code === 0 || response?.code === 408 || response?.code === 429 || (response?.code ?? 0) >= 500),
};
export const HLS_LOAD_CONFIG: Partial<HlsConfig> = {
  manifestLoadPolicy: {
    default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 8000, timeoutRetry: null, errorRetry: null },
  },
  playlistLoadPolicy: {
    default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 8000, timeoutRetry: null, errorRetry: shortRetry },
  },
  fragLoadPolicy: {
    default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 10000, timeoutRetry: null, errorRetry: shortRetry },
  },
  keyLoadPolicy: {
    default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 8000, timeoutRetry: null, errorRetry: shortRetry },
  },
};
export interface MediaEngine {
  audio: HTMLAudioElement;
  supports(format: string): boolean;
  load(stream: Stream): Promise<void>;
  clear(): void;
  failure?(): PlaybackFailure | null;
}
export interface HlsAdapter {
  onAttached(callback: () => void): void;
  onManifest(callback: () => void): void;
  onFatal(callback: (failure?: PlaybackFailure) => void): void;
  loadSource(url: string): void;
  attachMedia(audio: HTMLAudioElement): void;
  destroy(): void;
}
export interface HlsFactory {
  isSupported(): boolean;
  create(): HlsAdapter;
}
export const defaultHlsFactory: HlsFactory = {
  isSupported: () => Hls.isSupported(),
  create: () => {
    const instance = new Hls({ enableWorker: true, ...HLS_LOAD_CONFIG });
    return {
      onAttached: callback => instance.on(Hls.Events.MEDIA_ATTACHED, callback),
      onManifest: callback => instance.on(Hls.Events.MANIFEST_PARSED, callback),
      onFatal: callback =>
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) callback(hlsFailure(data));
        }),
      loadSource: url => instance.loadSource(url),
      attachMedia: audio => instance.attachMedia(audio),
      destroy: () => instance.destroy(),
    };
  },
};
// Prefer MediaSource where supported; native HLS remains the path for native-only platforms.
// The optional selection parameter supports controlled diagnostics, never a different permissions policy.
export function createMediaEngine(factory: HlsFactory = defaultHlsFactory, preferHlsJs = true): MediaEngine | null {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio();
  if (
    !audio.canPlayType('audio/mpeg') &&
    !audio.canPlayType('audio/aac') &&
    !audio.canPlayType('application/vnd.apple.mpegurl') &&
    !factory.isSupported()
  )
    return null;
  audio.preload = 'none';
  let hls: HlsAdapter | null = null;
  let cancel: (() => void) | null = null;
  let generation = 0;
  let lastFailure: PlaybackFailure | null = null;
  let initialization: ReturnType<typeof setTimeout> | undefined;
  const nativeHls = () => !!audio.canPlayType('application/vnd.apple.mpegurl');
  const clear = () => {
    ++generation;
    clearTimeout(initialization);
    cancel?.();
    cancel = null;
    const previous = hls;
    hls = null;
    previous?.destroy();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  return {
    audio,
    failure: () => lastFailure,
    supports: format =>
      format === 'mp3'
        ? !!audio.canPlayType('audio/mpeg')
        : format === 'aac'
          ? !!audio.canPlayType('audio/aac')
          : format === 'hls' && (nativeHls() || factory.isSupported()),
    clear,
    load: async stream => {
      clear();
      lastFailure = null;
      if (stream.format !== 'hls' || (nativeHls() && (!preferHlsJs || !factory.isSupported()))) {
        audio.src = stream.url;
        audio.load();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const currentGeneration = generation;
        cancel = () => {
          clearTimeout(initialization);
          reject(new DOMException('Cancelled', 'AbortError'));
        };
        const instance = factory.create();
        hls = instance;
        let failed = false;
        const active = () => hls === instance && generation === currentGeneration && !failed;
        const fail = (failure: PlaybackFailure = { kind: 'unknown', transient: false }) => {
          if (!active()) return;
          failed = true;
          lastFailure = failure;
          clearTimeout(initialization);
          cancel = null;
          reject(new PlaybackError(failure));
          audio.dispatchEvent(new Event('error'));
        };
        initialization = setTimeout(() => fail({ kind: 'timeout', transient: true }), HLS_INITIALIZATION_MS);
        instance.onAttached(() => {
          if (active()) {
            try {
              instance.loadSource(stream.url);
            } catch (cause) {
              fail(playbackFailure(cause));
            }
          }
        });
        instance.onManifest(() => {
          if (!active()) return;
          clearTimeout(initialization);
          cancel = null;
          resolve();
        });
        instance.onFatal(fail);
        try {
          instance.attachMedia(audio);
        } catch (cause) {
          fail(playbackFailure(cause));
        }
      });
    },
  };
}
export const MEDIA_ENGINE = new InjectionToken<MediaEngine | null>('MEDIA_ENGINE', {
  providedIn: 'root',
  factory: () => createMediaEngine(),
});
