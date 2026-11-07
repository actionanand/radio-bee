import { InjectionToken } from '@angular/core';
import Hls from 'hls.js';
import { Stream } from '../catalog/catalog.models';
export interface MediaEngine {
  audio: HTMLAudioElement;
  supports(format: string): boolean;
  load(stream: Stream): Promise<void>;
  clear(): void;
}
export interface HlsAdapter {
  onAttached(callback: () => void): void;
  onManifest(callback: () => void): void;
  onFatal(callback: () => void): void;
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
    const instance = new Hls({ enableWorker: true });
    return {
      onAttached: callback => instance.on(Hls.Events.MEDIA_ATTACHED, callback),
      onManifest: callback => instance.on(Hls.Events.MANIFEST_PARSED, callback),
      onFatal: callback =>
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) callback();
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
  const nativeHls = () => !!audio.canPlayType('application/vnd.apple.mpegurl');
  const clear = () => {
    ++generation;
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
    supports: format =>
      format === 'mp3'
        ? !!audio.canPlayType('audio/mpeg')
        : format === 'aac'
          ? !!audio.canPlayType('audio/aac')
          : format === 'hls' && (nativeHls() || factory.isSupported()),
    clear,
    load: async stream => {
      clear();
      if (stream.format !== 'hls' || (nativeHls() && (!preferHlsJs || !factory.isSupported()))) {
        audio.src = stream.url;
        audio.load();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const currentGeneration = generation;
        cancel = () => reject(new DOMException('Cancelled', 'AbortError'));
        const instance = factory.create();
        hls = instance;
        let failed = false;
        const active = () => hls === instance && generation === currentGeneration && !failed;
        instance.onAttached(() => {
          if (active()) instance.loadSource(stream.url);
        });
        instance.onManifest(() => {
          if (!active()) return;
          cancel = null;
          resolve();
        });
        instance.onFatal(() => {
          if (!active()) return;
          failed = true;
          cancel = null;
          reject(new Error('HLS failure'));
          audio.dispatchEvent(new Event('error'));
        });
        instance.attachMedia(audio);
      });
    },
  };
}
export const MEDIA_ENGINE = new InjectionToken<MediaEngine | null>('MEDIA_ENGINE', {
  providedIn: 'root',
  factory: () => createMediaEngine(),
});
