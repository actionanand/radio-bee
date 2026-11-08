import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PlayerService } from '../player/player.service';
import { RADIO_RECORDING } from './recording.config';
import { captureRadio, captureSupported, CaptureFactory, CaptureHandle } from './capture-engine';
import { exportRecording, recordingFilename } from './export-recording';
import { Stream } from '../catalog/catalog.models';
import { UiKey } from '../catalog/catalog.ui';
import { checkCaptureAccess } from './capture-access';
export const CAPTURE_FACTORY = new InjectionToken<CaptureFactory>('CAPTURE_FACTORY', {
  providedIn: 'root',
  factory: () => captureRadio,
});
export const CAPTURE_SUPPORT = new InjectionToken('CAPTURE_SUPPORT', {
  providedIn: 'root',
  factory: () => ({ available: captureSupported }),
});
export const RECORDING_EXPORT = new InjectionToken('RECORDING_EXPORT', {
  providedIn: 'root',
  factory: () => ({ save: exportRecording }),
});
export const CAPTURE_ACCESS = new InjectionToken('CAPTURE_ACCESS', {
  providedIn: 'root',
  factory: () => ({ check: checkCaptureAccess }),
});
export function recordingPermission(
  stream: Stream,
  allowProhibitedRecording = false,
): 'blocked' | 'acknowledgment' | 'allowed' {
  if (stream.directListening?.status === 'restricted') return 'blocked';
  if (stream.directListening?.recording === 'prohibited')
    return allowProhibitedRecording ? 'acknowledgment' : 'blocked';
  return stream.directListening?.recording === 'permission-granted' ? 'allowed' : 'acknowledgment';
}
@Service()
export class RecordingService implements OnDestroy {
  private readonly config = inject(RADIO_RECORDING);
  private readonly player = inject(PlayerService);
  private readonly document = inject(DOCUMENT);
  private readonly create = inject(CAPTURE_FACTORY);
  private readonly support = inject(CAPTURE_SUPPORT);
  private readonly exporter = inject(RECORDING_EXPORT);
  private readonly access = inject(CAPTURE_ACCESS);
  private readonly router = inject(Router, { optional: true });
  readonly state = signal<
    'idle' | 'preparing' | 'starting' | 'recording' | 'stopping' | 'ready' | 'error' | 'exporting'
  >('idle');
  readonly seconds = signal(0);
  readonly message = signal<UiKey | null>(null);
  readonly file = signal<Blob | null>(null);
  readonly permission = computed(() => {
    const source = this.player.captureSource();
    return source ? recordingPermission(source.stream, this.config.AllowProhibitedRecording === true) : 'unavailable';
  });
  private handle: CaptureHandle | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private name = '';
  private destroyed = false;
  private ownRestart = false;
  private preparation: { failed: boolean; cancelled: boolean } | undefined;
  private restoreAccess: (() => void) | undefined;
  private readonly removeBoundary = this.player.onPlaybackBoundary(reason => {
    if (this.ownRestart && reason === 'source') return;
    if (this.preparation) {
      if (reason === 'failure') this.preparation.failed = true;
      else this.preparation.cancelled = true;
    }
    this.stop();
  });
  private readonly navigation = this.router?.events.subscribe(event => {
    if (event instanceof NavigationStart) this.stop();
  });
  private removeAppListener: (() => Promise<void>) | undefined;
  private readonly hidden = () => {
    if (this.document.hidden) this.stop();
  };
  private readonly leaving = () => this.stop();
  constructor() {
    this.document.addEventListener('visibilitychange', this.hidden);
    this.document.defaultView?.addEventListener('pagehide', this.leaving);
    effect(() => {
      const source = this.player.captureSource();
      if (
        ['starting', 'recording'].includes(this.state()) &&
        (!source || recordingPermission(source.stream, this.config.AllowProhibitedRecording === true) === 'blocked')
      )
        this.stop();
    });
    if (this.config.Enabled && Capacitor.isNativePlatform()) void this.observeApp();
  }
  private async observeApp() {
    try {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('appStateChange', state => {
        if (!state.isActive) this.stop();
      });
      if (this.destroyed) await listener.remove();
      else this.removeAppListener = () => listener.remove();
    } catch {
      /* No background capture is promised on unsupported native platforms. */
    }
  }
  async start(acknowledged: boolean) {
    const source = this.player.captureSource();
    if (
      !this.config.Enabled ||
      !source ||
      this.destroyed ||
      ['preparing', 'starting', 'recording', 'stopping', 'exporting'].includes(this.state())
    )
      return;
    const permission = recordingPermission(source.stream, this.config.AllowProhibitedRecording === true);
    if (permission === 'blocked' || (permission === 'acknowledgment' && !acknowledged)) {
      this.message.set(permission === 'blocked' ? 'recordingProhibited' : 'recordingConsent');
      return;
    }
    this.discard();
    const generation = ++this.generation;
    this.controller = new AbortController();
    this.name = source.station.name;
    this.seconds.set(0);
    this.message.set(null);
    if (!this.support.available(source.audio)) {
      this.state.set('error');
      this.message.set('recordingUnsupported');
      return;
    }
    const preparation = { failed: false, cancelled: false };
    try {
      const audio = source.audio,
        signal = this.controller.signal;
      if (audio.currentSrc.startsWith('https:') && audio.crossOrigin !== 'anonymous') {
        this.preparation = preparation;
        this.state.set('preparing');
        await this.access.check(source.stream.url, signal);
        if (signal.aborted || generation !== this.generation) throw Error('Cancelled');
        const previous = audio.getAttribute('crossorigin');
        this.restoreAccess = () => {
          if (previous === null) audio.removeAttribute('crossorigin');
          else audio.setAttribute('crossorigin', previous);
        };
        signal.addEventListener('abort', this.restoreAccess, { once: true });
        audio.crossOrigin = 'anonymous';
        const ready = this.waitForAudio(audio, signal);
        this.ownRestart = true;
        const restarting = this.player.play(source.station);
        this.ownRestart = false;
        await Promise.all([restarting, ready]);
      }
      const latest = this.player.captureSource();
      if (
        signal.aborted ||
        generation !== this.generation ||
        !latest ||
        latest.station.id !== source.station.id ||
        latest.stream.url !== source.stream.url ||
        recordingPermission(latest.stream, this.config.AllowProhibitedRecording === true) === 'blocked' ||
        (recordingPermission(latest.stream, this.config.AllowProhibitedRecording === true) === 'acknowledgment' &&
          !acknowledged)
      )
        throw Error('Cancelled');
      this.preparation = undefined;
      this.state.set('starting');
      const handle = await this.create(source.audio, this.controller.signal, {
        progress: (seconds, genuine) => {
          if (generation === this.generation) {
            this.seconds.set(seconds);
            if (genuine) this.state.set('recording');
          }
        },
        finished: blob => {
          if (generation === this.generation) {
            this.handle = undefined;
            this.restoreAccess?.();
            this.file.set(blob);
            this.state.set(blob ? 'ready' : 'error');
            this.message.set(blob ? 'recordingReady' : 'recordingEmpty');
          }
        },
        failed: () => {
          if (generation === this.generation) {
            this.handle = undefined;
            this.restoreAccess?.();
            this.file.set(null);
            this.state.set('error');
            this.message.set('recordingError');
          }
        },
      });
      if (generation !== this.generation || this.controller.signal.aborted) handle.stop(true);
      else this.handle = handle;
    } catch {
      if (generation !== this.generation && !(preparation.failed && !preparation.cancelled)) return;
      this.ownRestart = false;
      const restorePlayback =
        !!this.restoreAccess &&
        !preparation.cancelled &&
        (preparation.failed || generation === this.generation) &&
        !this.destroyed &&
        this.player.station()?.id === source.station.id &&
        (this.player.state() === 'error' ||
          (this.player.state() === 'loading' && this.player.pendingPhase() !== 'reconnecting'));
      this.restoreAccess?.();
      if (this.preparation === preparation) this.preparation = undefined;
      if (restorePlayback) {
        // One ordinary-mode restoration only; never resumes after a user's Pause/Stop/station switch.
        await this.player.play(source.station);
      }
      if (generation === this.generation || (preparation.failed && !preparation.cancelled)) {
        this.state.set('error');
        this.message.set('recordingUnsupported');
      }
    }
  }
  private waitForAudio(audio: HTMLAudioElement, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        audio.removeEventListener('playing', ready);
        signal.removeEventListener('abort', abort);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(Error('Cancelled'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Capture preparation timed out'));
      }, 8000);
      audio.addEventListener('playing', ready, { once: true });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  stop() {
    if (!['preparing', 'starting', 'recording'].includes(this.state())) return;
    this.state.set('stopping');
    if (this.handle) this.handle.stop();
    else {
      ++this.generation;
      this.controller?.abort();
      this.state.set('idle');
    }
    this.restoreAccess?.();
  }
  discard() {
    if (this.preparation) this.preparation.cancelled = true;
    ++this.generation;
    this.controller?.abort();
    this.restoreAccess?.();
    this.restoreAccess = undefined;
    this.handle?.stop(true);
    this.handle = undefined;
    this.file.set(null);
    this.message.set(null);
    this.state.set('idle');
    this.seconds.set(0);
  }
  async save() {
    const file = this.file();
    if (!file || this.state() === 'exporting') return;
    this.state.set('exporting');
    const generation = this.generation;
    try {
      await this.exporter.save(file, recordingFilename(this.name, file.type));
      if (generation === this.generation) {
        this.state.set('ready');
        this.message.set('recordingExported');
      }
    } catch {
      if (generation === this.generation) {
        this.state.set('ready');
        this.message.set('recordingSaveError');
      }
    }
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.discard();
    this.removeBoundary();
    this.navigation?.unsubscribe();
    this.document.removeEventListener('visibilitychange', this.hidden);
    this.document.defaultView?.removeEventListener('pagehide', this.leaving);
    void this.removeAppListener?.();
  }
}
