import { InjectionToken, inject } from '@angular/core';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
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
export function createMediaEngine(factory: HlsFactory = defaultHlsFactory, preferHlsJs = false): MediaEngine | null {
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
  const nativeHls = () => !!audio.canPlayType('application/vnd.apple.mpegurl');
  const clear = () => {
    cancel?.();
    cancel = null;
    hls?.destroy();
    hls = null;
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
        cancel = () => reject(new DOMException('Cancelled', 'AbortError'));
        const instance = factory.create();
        hls = instance;
        instance.onAttached(() => instance.loadSource(stream.url));
        instance.onManifest(() => {
          cancel = null;
          resolve();
        });
        instance.onFatal(() => {
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
  factory: () => createMediaEngine(defaultHlsFactory, inject(LIVE_TEST_ENABLED)),
});
