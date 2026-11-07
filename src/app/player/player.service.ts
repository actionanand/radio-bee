import { Service, inject, signal, effect, OnDestroy } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { Station, Stream } from '../catalog/catalog.models';
import { eligibleStreams, streamEligibility } from '../catalog/stream-eligibility';
import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
import { MEDIA_ENGINE } from './media-engine';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export const MAX_STREAM_ATTEMPTS = 3;

@Service()
export class PlayerService implements OnDestroy {
  private readonly testsEnabled = inject(LIVE_TEST_ENABLED);
  private readonly policy = inject(RADIO_API_CONFIG);
  private readonly engine = inject(MEDIA_ENGINE);
  private readonly catalog = inject(CatalogService);
  private attempt = 0;
  private loaded = false;
  private attempted = new Set<string>();
  private pinnedStreamId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cleanups: (() => void)[] = [];
  private readonly outcomes = signal<ReadonlyMap<string, 'playing' | 'failed'>>(new Map());
  private readonly selectedStream = signal<Stream | null>(null);
  readonly technicalTest = signal(false);
  readonly station = signal<Station | null>(null);
  readonly state = signal<PlaybackState>('idle');
  readonly error = signal('');
  readonly volume = signal(1);
  readonly muted = signal(false);
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
      const current = catalog.stations.find(station => station.id === active.id);
      const currentStream = current?.streams.find(stream => stream.id === selected.id && stream.url === selected.url);
      if (current && current !== active) this.station.set(current);
      if (
        !currentStream ||
        streamEligibility({ streams: [currentStream] }, this.capabilities, this.policy).status !== 'ready'
      ) {
        if (this.state() === 'paused') {
          // A catalogue refresh must never turn a user's pause into automatic playback.
          ++this.attempt;
          this.clearTimer();
          this.loaded = false;
          this.selectedStream.set(null);
          this.engine?.clear();
          if (!this.canResume()) this.terminate('playbackPermissionChanged');
        } else void this.recover('playbackPermissionChanged', false);
      }
    });
    const audio = this.engine?.audio;
    if (!audio) return;
    const listen = (event: string, action: () => void) => {
      audio.addEventListener(event, action);
      this.cleanups.push(() => audio.removeEventListener(event, action));
    };
    listen('playing', () => {
      const selected = this.selectedStream();
      if (selected && this.state() === 'loading') {
        this.clearTimer();
        this.recordOutcome(selected.url, 'playing');
        this.state.set('playing');
      }
    });
    const buffering = () => {
      if (this.state() === 'playing') {
        this.state.set('loading');
        this.watchdog();
      }
    };
    listen('waiting', buffering);
    listen('stalled', buffering);
    listen('error', () => {
      if (this.selectedStream() && ['loading', 'playing'].includes(this.state())) void this.recover('playbackError');
    });
    listen('ended', () => {
      if (this.selectedStream() && ['loading', 'playing'].includes(this.state())) void this.recover('playbackError');
    });
    listen('pause', () => {
      if (this.station() && this.state() === 'playing') {
        this.clearTimer();
        this.state.set('paused');
      }
    });
  }
  private current(id: string) {
    return this.catalog.catalog()?.stations.find(station => station.id === id);
  }
  private preference() {
    return { sources: this.catalog.catalog()?.sources, outcomes: this.outcomes() };
  }
  private candidates(station: Station, technical = this.technicalTest(), pinned = this.pinnedStreamId) {
    return eligibleStreams(
      { streams: station.streams.filter(stream => !technical || !pinned || stream.id === pinned) },
      this.capabilities,
      this.policy,
      this.preference(),
    );
  }
  eligibility(station: Station) {
    return streamEligibility(
      this.current(station.id) ?? { streams: [] },
      this.capabilities,
      this.policy,
      this.preference(),
    );
  }
  async play(station: Station): Promise<void> {
    await this.begin(station.id, false);
  }
  technicalEligibility(id: string, streamId?: string) {
    const station = this.testsEnabled ? this.current(id) : undefined;
    return streamEligibility(
      { streams: station?.streams.filter(stream => !streamId || stream.id === streamId) ?? [] },
      this.capabilities,
      this.policy,
      this.preference(),
    );
  }
  async playTechnical(id: string, streamId?: string): Promise<void> {
    if (this.testsEnabled) await this.begin(id, true, streamId);
  }
  private async begin(id: string, technical: boolean, pinned?: string): Promise<void> {
    const station = this.current(id);
    if (!station || !this.engine || !this.candidates(station, technical, pinned).length) return;
    ++this.attempt;
    this.clearTimer();
    this.attempted = new Set();
    this.pinnedStreamId = pinned;
    this.technicalTest.set(technical);
    this.station.set(station);
    this.error.set('');
    await this.loadNext();
  }
  private async loadNext(failure = 'playbackError'): Promise<void> {
    const station = this.station();
    const current = station && this.current(station.id);
    const stream = current && this.candidates(current).find(stream => !this.attempted.has(stream.url));
    if (!current || !stream || !this.engine || this.attempted.size >= MAX_STREAM_ATTEMPTS) {
      this.terminate(failure);
      return;
    }
    const attempt = ++this.attempt;
    this.clearTimer();
    this.loaded = false;
    this.state.set('loading');
    this.selectedStream.set(null);
    this.engine.clear();
    this.station.set(current);
    this.selectedStream.set(stream);
    this.attempted.add(stream.url);
    this.watchdog();
    try {
      await this.engine.load(stream);
      if (attempt !== this.attempt) return;
      this.loaded = true;
      this.engine.audio.volume = this.volume();
      this.engine.audio.muted = this.muted();
      await this.engine.audio.play();
      // Only the actual playing event changes Connecting to Playing.
    } catch (cause) {
      if (attempt !== this.attempt) return;
      if (this.blocked(cause)) this.terminate('playbackBlocked');
      else await this.recover('playbackError');
    }
  }
  private async recover(message: string, mediaFailure = true): Promise<void> {
    const selected = this.selectedStream();
    if (selected && mediaFailure) this.recordOutcome(selected.url, 'failed');
    const cancellation = ++this.attempt;
    this.clearTimer();
    this.loaded = false;
    this.selectedStream.set(null);
    this.state.set('loading');
    const station = this.station();
    const current = station && this.current(station.id);
    if (
      !current ||
      this.attempted.size >= MAX_STREAM_ATTEMPTS ||
      !this.candidates(current).some(stream => !this.attempted.has(stream.url))
    ) {
      this.terminate(message);
      return;
    }
    this.engine?.clear();
    // Leave the failing adapter's callback before replacing/destroying its media.
    await Promise.resolve();
    if (cancellation === this.attempt && this.state() === 'loading') await this.loadNext(message);
  }
  canResume(): boolean {
    const station = this.station();
    const current = station && this.current(station.id);
    return !!current && this.candidates(current).length > 0;
  }
  pause(): void {
    if (!this.station()) return;
    ++this.attempt;
    this.clearTimer();
    this.state.set('paused');
    if (this.loaded) this.engine?.audio.pause();
    else {
      this.selectedStream.set(null);
      this.engine?.clear();
    }
  }
  async resume(): Promise<void> {
    const station = this.station();
    if (!station) return;
    const current = this.current(station.id);
    const selected = this.selectedStream();
    const valid =
      current && this.candidates(current).some(stream => stream.id === selected?.id && stream.url === selected.url);
    if (this.loaded && valid && this.engine) {
      const attempt = ++this.attempt;
      this.error.set('');
      this.state.set('loading');
      this.watchdog();
      try {
        await this.engine.audio.play();
      } catch (cause) {
        if (attempt === this.attempt) {
          if (this.blocked(cause)) this.terminate('playbackBlocked');
          else await this.recover('playbackError');
        }
      }
    } else if (this.canResume()) {
      await this.begin(station.id, this.technicalTest(), this.pinnedStreamId);
    } else this.terminate('playbackPermissionChanged');
  }
  stateFor(station: Station): PlaybackState {
    return this.station()?.id === station.id ? this.state() : 'idle';
  }
  async toggle(station: Station): Promise<void> {
    const state = this.stateFor(station);
    if (state === 'playing' || state === 'loading') this.pause();
    else if ((state === 'paused' || state === 'error') && !this.technicalTest()) await this.resume();
    else await this.play(station);
  }
  stop(): void {
    ++this.attempt;
    this.clearTimer();
    this.station.set(null);
    this.selectedStream.set(null);
    this.technicalTest.set(false);
    this.pinnedStreamId = undefined;
    this.attempted.clear();
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
  private blocked(cause: unknown): boolean {
    return !!cause && typeof cause === 'object' && 'name' in cause && cause.name === 'NotAllowedError';
  }
  private recordOutcome(url: string, outcome: 'playing' | 'failed') {
    this.outcomes.update(previous => new Map(previous).set(url, outcome));
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private watchdog() {
    this.clearTimer();
    const attempt = this.attempt;
    this.timer = setTimeout(() => {
      if (attempt === this.attempt) void this.recover('playbackTimeout');
    }, 20000);
  }
  private terminate(message: string) {
    ++this.attempt;
    this.clearTimer();
    this.loaded = false;
    this.selectedStream.set(null);
    this.state.set('error');
    this.error.set(message);
    this.engine?.clear();
  }
  ngOnDestroy(): void {
    this.stop();
    for (const cleanup of this.cleanups) cleanup();
  }
}
