import { InjectionToken } from '@angular/core';
import Hls from 'hls.js';
import { Stream } from '../catalog/catalog.models';
export interface MediaEngine {
  audio: HTMLAudioElement;
  supports(format: string): boolean;
  load(stream: Stream): Promise<void>;
  clear(): void;
}
export function createMediaEngine(): MediaEngine | null {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio();
  if (
    !audio.canPlayType('audio/mpeg') &&
    !audio.canPlayType('audio/aac') &&
    !audio.canPlayType('application/vnd.apple.mpegurl') &&
    !Hls.isSupported()
  )
    return null;
  audio.preload = 'none';
  let hls: Hls | null = null;
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
          : format === 'hls' && (nativeHls() || Hls.isSupported()),
    clear,
    load: async stream => {
      clear();
      if (stream.format !== 'hls' || nativeHls()) {
        audio.src = stream.url;
        audio.load();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        cancel = () => reject(new DOMException('Cancelled', 'AbortError'));
        const instance = new Hls({ enableWorker: true });
        hls = instance;
        instance.on(Hls.Events.MEDIA_ATTACHED, () => instance.loadSource(stream.url));
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          cancel = null;
          resolve();
        });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            cancel = null;
            reject(new Error('HLS failure'));
            audio.dispatchEvent(new Event('error'));
          }
        });
        instance.attachMedia(audio);
      });
    },
  };
}
export const MEDIA_ENGINE = new InjectionToken<MediaEngine | null>('MEDIA_ENGINE', {
  providedIn: 'root',
  factory: createMediaEngine,
});
