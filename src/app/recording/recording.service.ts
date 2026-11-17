import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PlayerService } from '../player/player.service';
import { RADIO_RECORDING } from './recording.config';
import { captureRadio, captureSupported, CaptureFactory, CaptureHandle, CaptureDiagnostic } from './capture-engine';
import { exportRecording, recordingFilename } from './export-recording';
import { Stream } from '../catalog/catalog.models';
import { UiKey } from '../catalog/catalog.ui';
import { CatalogService } from '../catalog/catalog.service';
import { CaptureAccessError, checkCaptureAccess } from './capture-access';
import { RecordingDestination } from './recording-destination';
import { RecordingExportPreferencesService, recordingBitrate } from './recording-export-preferences';
import { SnackbarService } from '../shared/snackbar.service';
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
  factory: () => {
    const catalog = inject(CatalogService);
    return {
      check: (url: string, signal: AbortSignal) =>
        checkCaptureAccess(url, signal, catalog.catalog()?.manifest.schemaVersion === 2 ? 'GET' : 'HEAD'),
    };
  },
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
export type RecordingStopReason =
  | 'manual'
  | 'source'
  | 'pause'
  | 'stop'
  | 'failure'
  | 'permission'
  | 'unavailable'
  | 'navigation'
  | 'hidden'
  | 'pagehide'
  | 'native-background';
export interface RecordingDiagnostic {
  at: number;
  event: 'start' | 'boundary' | 'stop' | 'finish' | 'error' | 'navigation' | 'visibility';
  reason?: string;
  state: string;
  seconds: number;
  bytes: number;
  stationId?: string;
  playerStationId?: string;
}
@Service()
export class RecordingService implements OnDestroy {
  private readonly config = inject(RADIO_RECORDING);
  private readonly catalog = inject(CatalogService);
  private readonly player = inject(PlayerService);
  private readonly document = inject(DOCUMENT);
  private readonly create = inject(CAPTURE_FACTORY);
  private readonly support = inject(CAPTURE_SUPPORT);
  private readonly exporter = inject(RECORDING_EXPORT);
  private readonly destination = inject(RecordingDestination);
  private readonly exportPreferences = inject(RecordingExportPreferencesService);
  private readonly snackbar = inject(SnackbarService);
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
  private readonly history = signal<readonly RecordingDiagnostic[]>([]);
  readonly diagnostics = this.history.asReadonly();
  readonly lastStopReason = signal<string | null>(null);
  private readonly captureHistory = signal<readonly CaptureDiagnostic[]>([]);
  readonly captureDiagnostics = this.captureHistory.asReadonly();
  private get v2Web() {
    return this.catalog.catalog()?.manifest.schemaVersion === 2 && !Capacitor.isNativePlatform();
  }
  private trace(event: RecordingDiagnostic['event'], reason?: string, bytes = this.file()?.size ?? 0) {
    this.history.update(rows => [
      ...rows.slice(-79),
      {
        at: Date.now(),
        event,
        reason,
        state: this.state(),
        seconds: this.seconds(),
        bytes,
        stationId: this.recordingStationId,
        playerStationId: this.player.station()?.id,
      },
    ]);
  }
  private handle: CaptureHandle | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private name = '';
  private recordingStationId: string | undefined;
  private destroyed = false;
  private ownRestart = false;
  private acknowledgedSession = false;
  private stopRequested = false;
  private continuationCancelled = false;
  private preparation: { failed: boolean; cancelled: boolean } | undefined;
  private restoreAccess: (() => void) | undefined;
  private readonly removeBoundary = this.player.onPlaybackBoundary(reason => {
    this.trace('boundary', this.ownRestart && reason === 'source' ? 'capture-preparation' : reason);
    if (this.ownRestart && reason === 'source') return;
    this.continuationCancelled = true;
    if (this.preparation) {
      if (reason === 'failure') this.preparation.failed = true;
      else this.preparation.cancelled = true;
    }
    this.stop(reason);
  });
  private readonly navigation = this.router?.events.subscribe(event => {
    if (event instanceof NavigationStart) {
      this.trace(
        'navigation',
        this.catalog.catalog()?.manifest.schemaVersion === 2 ? 'internal-route-retained' : 'legacy-route',
      );
      if (this.catalog.catalog()?.manifest.schemaVersion !== 2) this.stop('navigation');
    }
  });
  private removeAppListener: (() => Promise<void>) | undefined;
  private readonly hidden = () => {
    this.trace('visibility', this.document.visibilityState);
    if (this.document.hidden && !this.v2Web) this.stop('hidden');
  };
  private readonly leaving = () => this.stop('pagehide');
  constructor() {
    this.document.addEventListener('visibilitychange', this.hidden);
    this.document.defaultView?.addEventListener('pagehide', this.leaving);
    effect(() => {
      const source = this.player.captureSource();
      if (!['starting', 'recording'].includes(this.state())) return;
      // A temporary waiting/stalled event puts the player into "loading"
      // with phase "buffering". The same audio stream remains attached, so
      // keep recording until playback resumes or the player reports a real
      // boundary (pause, stop, switch, failure), which stops it synchronously.
      if (!source && this.player.state() === 'loading' && this.player.pendingPhase() === 'buffering') return;
      if (!source || recordingPermission(source.stream, this.config.AllowProhibitedRecording === true) === 'blocked')
        this.stop(source ? 'permission' : 'unavailable');
    });
    if (this.config.Enabled && Capacitor.isNativePlatform()) void this.observeApp();
  }
  private async observeApp() {
    try {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('appStateChange', state => {
        if (!state.isActive) this.stop('native-background');
      });
      if (this.destroyed) await listener.remove();
      else this.removeAppListener = () => listener.remove();
    } catch {
      /* No background capture is promised on unsupported native platforms. */
    }
  }
  async start(acknowledged: boolean, options: { promptFirstFolder?: boolean; replaceDraft?: boolean } = {}) {
    const source = this.player.captureSource();
    if (
      !this.config.Enabled ||
      (this.catalog.catalog()?.manifest.schemaVersion === 2 && !this.destination.ready()) ||
      !source ||
      this.destroyed ||
      ['preparing', 'starting', 'recording', 'stopping', 'exporting'].includes(this.state()) ||
      (!!this.file() && !options.replaceDraft)
    )
      return;
    const permission = recordingPermission(source.stream, this.config.AllowProhibitedRecording === true);
    if (permission === 'blocked' || (permission === 'acknowledgment' && !acknowledged)) {
      this.message.set(permission === 'blocked' ? 'recordingProhibited' : 'recordingConsent');
      return;
    }
    // Claim startup before asynchronous folder permission/persistence work. A
    // second click must not discard/abort the first in-flight preparation.
    const request = ++this.generation;
    this.state.set('preparing');
    this.trace('start');
    const folderRequired = this.destination.requiresSelection || this.config.AutoContinue === true;
    // Only a deliberate V2 Start gesture opens the folder picker. A previously
    // chosen folder is managed in Settings; never replace it silently.
    const firstFolder =
      folderRequired &&
      options.promptFirstFolder === true &&
      this.catalog.catalog()?.manifest.schemaVersion === 2 &&
      !this.destination.selected() &&
      !this.destination.name();
    let folderReady = true;
    try {
      if (folderRequired) {
        // First use must call the picker before the first await in this path.
        // Chrome requires transient user activation for showDirectoryPicker().
        folderReady = firstFolder ? await this.destination.chooseFolder() : await this.destination.hasAccess();
      }
    } catch {
      folderReady = false;
    }
    if (request !== this.generation || this.destroyed || this.state() !== 'preparing') return;
    if (!folderReady) {
      this.state.set(this.file() ? 'ready' : 'idle');
      this.message.set(firstFolder ? 'recordingFolderFirstUse' : 'recordingFolderRequired');
      if (!firstFolder) void this.router?.navigate(['/settings']);
      return;
    }
    this.discard();
    this.acknowledgedSession = acknowledged;
    this.stopRequested = false;
    this.continuationCancelled = false;
    const generation = ++this.generation;
    this.controller = new AbortController();
    this.name = source.station.name;
    this.recordingStationId = source.station.id;
    this.seconds.set(0);
    this.captureHistory.set([]);
    this.lastStopReason.set(null);
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
      const handle = await this.create(
        source.audio,
        this.controller.signal,
        {
          diagnostic: snapshot => {
            if (generation !== this.generation || this.catalog.catalog()?.manifest.schemaVersion !== 2) return;
            this.captureHistory.update(rows => [...rows.slice(-11), snapshot]);
            this.document.defaultView?.dispatchEvent(
              new CustomEvent('radiobee-recording-diagnostic', {
                detail: { stationId: source.station.id, ...snapshot },
              }),
            );
            if (snapshot.reason === 'no-audio')
              console.warn('[RadioBee recording] No captured audio; playback may still work.', snapshot);
          },
          progress: (seconds, genuine) => {
            if (generation === this.generation) {
              this.seconds.set(seconds);
              if (genuine) this.state.set('recording');
            }
          },
          finished: (blob, reason) => {
            if (generation !== this.generation) return;
            this.trace('finish', reason ?? 'manual', blob?.size ?? 0);
            if (!this.lastStopReason() || reason === 'limit' || reason === 'source-ended' || reason === 'no-audio')
              this.lastStopReason.set(reason ?? 'manual');
            this.handle = undefined;
            this.restoreAccess?.();
            this.file.set(blob);
            if (!blob) {
              this.state.set('error');
              const evidence = this.captureDiagnostics().at(-1);
              this.message.set(
                this.catalog.catalog()?.manifest.schemaVersion === 2 &&
                  reason === 'no-audio' &&
                  evidence?.bytes === 0 &&
                  evidence.maxRms === 0
                  ? 'recordingCaptureUnavailable'
                  : 'recordingEmpty',
              );
            } else if (
              this.config.AutoContinue === true &&
              reason === 'limit' &&
              !this.stopRequested &&
              !this.continuationCancelled
            ) {
              // Never discard a segment or start another unless a durable save
              // has succeeded. External browser downloads cannot be trusted to
              // complete without a user gesture, so auto mode requires a folder.
              this.state.set('exporting');
              void this.saveAutomatic(blob, generation, reason === 'limit');
            } else {
              this.state.set('ready');
              this.message.set(
                this.catalog.catalog()?.manifest.schemaVersion === 2 &&
                  ['source', 'failure', 'source-ended', 'unavailable', 'permission'].includes(
                    this.lastStopReason() ?? '',
                  )
                  ? 'recordingInterrupted'
                  : 'recordingReady',
              );
            }
          },
          failed: () => {
            if (generation === this.generation) {
              this.trace('error', 'encoder');
              this.handle = undefined;
              this.restoreAccess?.();
              this.file.set(null);
              this.state.set('error');
              this.message.set('recordingError');
            }
          },
        },
        this.catalog.catalog()?.manifest.schemaVersion === 2
          ? { ...this.config, retryEmptyCapture: true, audioBitrate: recordingBitrate(this.exportPreferences.quality()) }
          : { ...this.config, audioBitrate: recordingBitrate(this.exportPreferences.quality()) },
      );
      if (generation !== this.generation || this.controller.signal.aborted) handle.stop(true);
      else this.handle = handle;
    } catch (error) {
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
        this.message.set(
          this.catalog.catalog()?.manifest.schemaVersion === 2 && error instanceof CaptureAccessError
            ? 'recordingAccessUnavailable'
            : 'recordingUnsupported',
        );
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
  stop(reason: RecordingStopReason = 'manual') {
    if (!['preparing', 'starting', 'recording'].includes(this.state())) return;
    this.trace('stop', reason);
    this.lastStopReason.set(reason);
    this.stopRequested = true;
    this.continuationCancelled = true;
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
    this.continuationCancelled = true;
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
    this.captureHistory.set([]);
  }
  private conversionFallback() {
    const locale = this.catalog.locale();
    const message = locale === 'ta'
      ? 'M4A மாற்றம் தோல்வியடைந்தது. அசல் பதிவு பாதுகாப்பாகச் சேமிக்கப்பட்டது.'
      : locale === 'sa'
        ? 'M4A रूपान्तरणं विफलम्। मूलमुद्रणं सुरक्षितम् अस्ति।'
        : 'M4A conversion failed. The original recording was saved safely.';
    this.snackbar.show({ kind: 'text', message }, 'warning', 7500);
  }
  private async saveAutomatic(blob: Blob, generation: number, dueToLimit: boolean): Promise<void> {
    try {
      const outcome = Capacitor.getPlatform() === 'android'
        ? await this.destination.save(blob, recordingFilename(this.name, blob.type), true, this.name)
        : await this.destination.save(blob, recordingFilename(this.name, blob.type), true);
      if (outcome === 'fallback') this.conversionFallback();
      if (generation !== this.generation || this.destroyed) return;
      this.file.set(null);
      this.state.set('ready');
      this.message.set('recordingExported');
      if (
        dueToLimit &&
        !this.stopRequested &&
        !this.continuationCancelled &&
        this.player.state() === 'playing' &&
        this.player.captureSource()
      ) {
        // A new capture is never started after user stop, station switch,
        // paused playback, a policy revocation or unsuccessful export.
        await this.start(this.acknowledgedSession);
      }
    } catch {
      if (generation !== this.generation || this.destroyed) return;
      this.state.set('ready');
      this.message.set('recordingSaveError');
      // Keep the completed Blob available for a deliberate Export retry.
    }
  }
  async save() {
    const file = this.file();
    if (!file || this.state() === 'exporting') return;
    this.state.set('exporting');
    const generation = this.generation;
    try {
      if (this.destination.requiresSelection || this.destination.selected()) {
        const outcome = Capacitor.getPlatform() === 'android'
          ? await this.destination.save(file, recordingFilename(this.name, file.type), false, this.name)
          : await this.destination.save(file, recordingFilename(this.name, file.type));
        if (outcome === 'fallback') this.conversionFallback();
      } else {
        await this.exporter.save(file, recordingFilename(this.name, file.type));
      }
      if (generation === this.generation && !this.destroyed && this.file() === file) {
        // Only a completed export action consumes the draft. Failed exports
        // remain available in the dock for an explicit retry.
        this.file.set(null);
        this.state.set('idle');
        this.message.set(null);
        this.seconds.set(0);
        this.snackbar.show({ kind: 'localized', key: 'recordingExported' }, 'success');
      }
    } catch {
      if (generation === this.generation && !this.destroyed && this.file() === file) {
        this.state.set('ready');
        this.message.set('recordingSaveError');
      }
    }
  }
  ngOnDestroy() {
    this.continuationCancelled = true;
    this.destroyed = true;
    this.discard();
    this.removeBoundary();
    this.navigation?.unsubscribe();
    this.document.removeEventListener('visibilitychange', this.hidden);
    this.document.defaultView?.removeEventListener('pagehide', this.leaving);
    void this.removeAppListener?.();
  }
}
