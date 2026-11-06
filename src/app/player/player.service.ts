import { Service, inject, signal, effect, OnDestroy } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { Station, Stream } from '../catalog/catalog.models';
import { streamEligibility, technicalStreamEligibility } from '../catalog/stream-eligibility';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
import { MEDIA_ENGINE } from './media-engine';
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
@Service()
export class PlayerService implements OnDestroy {
  private readonly testsEnabled = inject(LIVE_TEST_ENABLED);
  readonly technicalTest = signal(false);
  private readonly engine = inject(MEDIA_ENGINE);
  private readonly catalog = inject(CatalogService);
  private attempt = 0;
  private loaded = false;
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
      const technical = this.technicalTest();
      const selected = this.selectedStream();
      const catalog = this.catalog.catalog();
      if (!active || !selected || !catalog || this.state() === 'error' || this.state() === 'idle') return;
      const current = catalog.stations
        .find(s => s.id === active.id)
        ?.streams.find(s => s.id === selected.id && s.url === selected.url);
      const eligibility = technical ? technicalStreamEligibility : streamEligibility;
      if (!current || eligibility({ streams: [current] }, this.capabilities).status !== 'ready')
        this.fail('playbackPermissionChanged');
    });
    const audio = this.engine?.audio;
    if (!audio) return;
    const listen = (event: string, action: () => void) => {
      audio.addEventListener(event, action);
      this.cleanups.push(() => audio.removeEventListener(event, action));
    };
    listen('playing', () => {
      if (this.station() && this.state() === 'loading') {
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
    listen('pause', () => {
      if (this.station() && this.state() === 'playing') {
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
    this.technicalTest.set(false);
    await this.start(current, eligibility.stream);
  }
  technicalEligibility(id: string, streamId?: string) {
    const station = this.testsEnabled ? this.catalog.catalog()?.stations.find(station => station.id === id) : null;
    return technicalStreamEligibility(
      { streams: station?.streams.filter(stream => !streamId || stream.id === streamId) ?? [] },
      this.capabilities,
    );
  }
  async playTechnical(id: string, streamId?: string): Promise<void> {
    const station = this.testsEnabled ? this.catalog.catalog()?.stations.find(station => station.id === id) : null;
    const result = this.technicalEligibility(id, streamId);
    if (!station || result.status !== 'ready' || !result.stream) return;
    this.technicalTest.set(true);
    await this.start(station, result.stream);
  }
  canResume(): boolean {
    const station = this.station();
    return (
      !!station &&
      (this.technicalTest() ? this.technicalEligibility(station.id) : this.eligibility(station)).status === 'ready'
    );
  }
  private async start(current: Station, stream: Stream): Promise<void> {
    if (!this.engine) return;
    const attempt = ++this.attempt;
    this.clearTimer();
    this.engine.clear();
    this.loaded = false;
    this.station.set(current);
    this.selectedStream.set(stream);
    this.error.set('');
    this.state.set('loading');
    this.watchdog();
    try {
      await this.engine.load(stream);
      if (attempt !== this.attempt) return;
      this.loaded = true;
      this.engine.audio.volume = this.volume();
      this.engine.audio.muted = this.muted();
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
    if (this.loaded) this.engine?.audio.pause();
    else this.engine?.clear();
  }
  async resume(): Promise<void> {
    const station = this.station();
    const selected = this.selectedStream();
    const current = this.catalog
      .catalog()
      ?.stations.find(candidate => candidate.id === station?.id)
      ?.streams.find(stream => stream.id === selected?.id && stream.url === selected.url);
    const check = this.technicalTest() ? technicalStreamEligibility : streamEligibility;
    if (this.loaded && current && check({ streams: [current] }, this.capabilities).status === 'ready' && this.engine) {
      const attempt = ++this.attempt;
      this.error.set('');
      this.state.set('loading');
      this.watchdog();
      try {
        await this.engine.audio.play();
      } catch (error) {
        if (attempt === this.attempt)
          this.fail(
            error instanceof DOMException && error.name === 'NotAllowedError' ? 'playbackBlocked' : 'playbackError',
          );
      }
      return;
    }
    if (station) {
      if (this.technicalTest()) await this.playTechnical(station.id, selected?.id);
      else await this.play(station);
    }
  }
  stateFor(station: Station): PlaybackState {
    return this.station()?.id === station.id ? this.state() : 'idle';
  }
  async toggle(station: Station): Promise<void> {
    const state = this.stateFor(station);
    if (state === 'playing' || state === 'loading') this.pause();
    else if (state === 'paused' || state === 'error') await this.resume();
    else await this.play(station);
  }
  stop(): void {
    ++this.attempt;
    this.clearTimer();
    this.station.set(null);
    this.technicalTest.set(false);
    this.selectedStream.set(null);
    this.loaded = false;
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
    this.loaded = false;
    this.engine?.clear();
  }
  ngOnDestroy(): void {
    this.stop();
    for (const cleanup of this.cleanups) cleanup();
  }
}
