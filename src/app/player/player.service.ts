import { Service, inject, signal, effect, OnDestroy } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { Station, Stream } from '../catalog/catalog.models';
import { streamEligibility } from '../catalog/stream-eligibility';
import { MEDIA_ENGINE } from './media-engine';
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
@Service()
export class PlayerService implements OnDestroy {
  private readonly engine = inject(MEDIA_ENGINE);
  private readonly catalog = inject(CatalogService);
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cleanups: (() => void)[] = [];
  readonly station = signal<Station | null>(null);
  readonly state = signal<PlaybackState>('idle');
  readonly error = signal('');
  readonly volume = signal(1);
  readonly muted = signal(false);
  private readonly selectedStream = signal<Stream | null>(null);
  readonly capabilities = {
    available: !!this.engine,
    supports: (format: string) => this.engine?.supports(format) ?? false,
  };
  constructor() {
    effect(() => {
      const active = this.station();
      const selected = this.selectedStream();
      const catalog = this.catalog.catalog();
      if (!active || !selected || !catalog || this.state() === 'error' || this.state() === 'idle') return;
      const current = catalog.stations
        .find(s => s.id === active.id)
        ?.streams.find(s => s.id === selected.id && s.url === selected.url);
      if (!current || streamEligibility({ streams: [current] }, this.capabilities).status !== 'ready')
        this.fail('playbackPermissionChanged');
    });
    const audio = this.engine?.audio;
    if (!audio) return;
    const listen = (event: string, action: () => void) => {
      audio.addEventListener(event, action);
      this.cleanups.push(() => audio.removeEventListener(event, action));
    };
    listen('playing', () => {
      if (this.station() && this.state() !== 'error') {
        this.clearTimer();
        this.state.set('playing');
      }
    });
    listen('waiting', () => {
      if (this.state() === 'playing') {
        this.state.set('loading');
        this.watchdog();
      }
    });
    listen('stalled', () => {
      if (this.state() === 'playing') {
        this.state.set('loading');
        this.watchdog();
      }
    });
    listen('error', () => {
      if (this.station()) this.fail('playbackError');
    });
    listen('ended', () => {
      if (this.station()) {
        this.clearTimer();
        this.state.set('paused');
      }
    });
  }
  eligibility(station: Station) {
    const current = this.catalog.catalog()?.stations.find(s => s.id === station.id);
    return streamEligibility(current ?? { streams: [] }, this.capabilities);
  }
  async play(station: Station): Promise<void> {
    // Resolve the newest loaded metadata again, so callers cannot grant rights with an altered card object.
    const current = this.catalog.catalog()?.stations.find(s => s.id === station.id);
    const eligibility = current ? this.eligibility(current) : null;
    if (!current || !eligibility?.stream || eligibility.status !== 'ready' || !this.engine) return;
    const attempt = ++this.attempt;
    this.clearTimer();
    this.engine.clear();
    this.station.set(current);
    this.selectedStream.set(eligibility.stream);
    this.error.set('');
    this.state.set('loading');
    this.watchdog();
    try {
      await this.engine.load(eligibility.stream);
      if (attempt !== this.attempt) return;
      await this.engine.audio.play();
      // The playing event, rather than a fulfilled request alone, confirms actual playback.
    } catch (cause) {
      if (attempt === this.attempt)
        this.fail(
          cause && typeof cause === 'object' && 'name' in cause && cause.name === 'NotAllowedError'
            ? 'playbackBlocked'
            : 'playbackError',
        );
    }
  }
  pause(): void {
    ++this.attempt;
    this.clearTimer();
    this.state.set('paused');
    this.engine?.clear();
  }
  async resume(): Promise<void> {
    const station = this.station();
    if (station) await this.play(station);
  }
  stop(): void {
    ++this.attempt;
    this.clearTimer();
    this.station.set(null);
    this.selectedStream.set(null);
    this.state.set('idle');
    this.error.set('');
    this.engine?.clear();
  }
  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    const level = Math.max(0, Math.min(1, value));
    this.volume.set(level);
    if (this.engine) this.engine.audio.volume = level;
  }
  toggleMute(): void {
    this.muted.update(value => !value);
    if (this.engine) this.engine.audio.muted = this.muted();
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private watchdog() {
    this.clearTimer();
    this.timer = setTimeout(() => this.fail('playbackTimeout'), 20000);
  }
  private fail(message: string) {
    ++this.attempt;
    this.clearTimer();
    this.state.set('error');
    this.error.set(message);
    this.engine?.clear();
  }
  ngOnDestroy(): void {
    this.stop();
    for (const cleanup of this.cleanups) cleanup();
  }
}
