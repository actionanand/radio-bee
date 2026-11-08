import { Service, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { Station, Stream } from '../catalog/catalog.models';
import { eligibleStreams, streamEligibility } from '../catalog/stream-eligibility';
import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
import { MEDIA_ENGINE } from './media-engine';
import { PlaybackFailure, playbackFailure, safeFailure } from './playback-failure';
import { RECOVERY_POLICY, RECOVERY_RANDOM, recoveryDelay } from './recovery-policy';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export const MAX_STREAM_ATTEMPTS = RECOVERY_POLICY.maxDistinctUrls;
export interface PlaybackDiagnostic {
  timestamp: number;
  elapsedMs: number;
  stationId: string;
  streamId: string;
  attempt: number;
  urlAttempt: number;
  phase: 'connecting' | 'reconnecting' | 'buffering' | 'playing' | 'paused' | 'idle' | 'error';
  result: 'attempt' | 'playing' | 'buffering' | 'failure' | 'scheduled' | 'exhausted' | 'cancelled';
  retryAllowed?: boolean;
  delayMs?: number;
  failure?: PlaybackFailure;
}
export type PlaybackBoundary = 'source' | 'pause' | 'stop' | 'failure';

@Service()
export class PlayerService implements OnDestroy {
  private readonly testsEnabled = inject(LIVE_TEST_ENABLED);
  private readonly policy = inject(RADIO_API_CONFIG);
  private readonly engine = inject(MEDIA_ENGINE);
  private readonly catalog = inject(CatalogService);
  private readonly random = inject(RECOVERY_RANDOM);
  private attempt = 0;
  private loaded = false;
  private attempted = new Map<string, number>();
  private readonly retryable = new Set<string>();
  private totalAttempts = 0;
  private startedAt = 0;
  private pending: ReturnType<typeof setTimeout> | undefined;
  private lastStream: Stream | null = null;
  readonly pendingPhase = signal<'connecting' | 'reconnecting' | 'buffering'>('connecting');
  readonly statusLabel = computed(() => {
    const state = this.state();
    return state === 'loading' ? this.pendingPhase() : state;
  });
  private readonly history = signal<readonly PlaybackDiagnostic[]>([]);
  readonly diagnostics = this.history.asReadonly();
  private pinnedStreamId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cleanups: (() => void)[] = [];
  private readonly outcomes = signal<ReadonlyMap<string, 'playing' | 'failed'>>(new Map());
  private readonly selectedStream = signal<Stream | null>(null);
  private readonly playbackBoundaries = new Set<(reason: PlaybackBoundary) => void>();
  readonly captureSource = computed(() => {
    const station = this.station(),
      selected = this.selectedStream();
    const current = station && this.current(station.id);
    const stream = current?.streams.find(stream => stream.id === selected?.id && stream.url === selected.url);
    return current && stream && this.state() === 'playing' && this.engine
      ? { station: current, stream, audio: this.engine.audio }
      : null;
  });
  onPlaybackBoundary(callback: (reason: PlaybackBoundary) => void) {
    this.playbackBoundaries.add(callback);
    return () => this.playbackBoundaries.delete(callback);
  }
  private playbackBoundary(reason: PlaybackBoundary) {
    for (const callback of this.playbackBoundaries) {
      try {
        callback(reason);
      } catch {
        /* An optional observer must never break ordinary playback. */
      }
    }
  }
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
      if (!active || !catalog || this.state() === 'error' || this.state() === 'idle') return;
      if (!selected) {
        if (this.state() === 'loading' && this.pendingPhase() === 'reconnecting' && !this.nextCandidate())
          this.terminate('playbackPermissionChanged', { kind: 'revoked', transient: false });
        return;
      }
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
        } else void this.recover('playbackPermissionChanged', { kind: 'revoked', transient: false }, false);
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
      if (
        selected &&
        this.loaded &&
        this.state() === 'loading' &&
        (!this.engine?.failure || (!audio.paused && audio.readyState >= 2))
      ) {
        this.clearTimer();
        this.recordOutcome(selected.url, 'playing');
        this.state.set('playing');
        this.trace('playing');
      }
    });
    const buffering = () => {
      if (this.state() === 'playing') {
        this.state.set('loading');
        this.pendingPhase.set('buffering');
        this.trace('buffering');
        this.watchdog(true);
      }
    };
    listen('waiting', buffering);
    listen('stalled', buffering);
    listen('error', () => {
      const failure = this.engine?.failure?.();
      if (this.engine?.failure && !failure && !audio.error) return;
      if (this.selectedStream() && ['loading', 'playing'].includes(this.state()))
        void this.recover('playbackError', failure ?? playbackFailure(undefined, audio.error));
    });
    listen('ended', () => {
      if (
        this.selectedStream() &&
        ['loading', 'playing'].includes(this.state()) &&
        (!this.engine?.failure || audio.ended)
      )
        void this.recover('playbackError', { kind: 'ended', transient: true });
    });
    listen('pause', () => {
      if (audio.paused && this.selectedStream() && this.loaded && ['loading', 'playing'].includes(this.state())) {
        this.playbackBoundary('pause');
        ++this.attempt;
        this.clearTimer();
        this.state.set('paused');
        this.trace('cancelled');
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
    this.attempted = new Map();
    this.retryable.clear();
    this.totalAttempts = 0;
    this.startedAt = Date.now();
    this.lastStream = null;
    this.pendingPhase.set('connecting');
    this.pinnedStreamId = pinned;
    this.technicalTest.set(technical);
    this.station.set(station);
    this.error.set('');
    await this.loadNext();
  }
  private async loadNext(failure = 'playbackError'): Promise<void> {
    this.playbackBoundary('source');
    const station = this.station();
    const current = station && this.current(station.id);
    const stream = this.nextCandidate();
    if (!current || !stream || !this.engine) {
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
    this.lastStream = stream;
    this.attempted.set(stream.url, (this.attempted.get(stream.url) ?? 0) + 1);
    ++this.totalAttempts;
    this.trace('attempt');
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
      await this.recover('playbackError', playbackFailure(cause));
    }
  }
  private async recover(message: string, failure: PlaybackFailure, mediaFailure = true): Promise<void> {
    this.playbackBoundary('failure');
    const selected = this.selectedStream();
    if (selected) {
      if (failure.transient) this.retryable.add(selected.url);
      else this.retryable.delete(selected.url);
    }
    if (selected && mediaFailure) this.recordOutcome(selected.url, 'failed');
    const next = ['cancelled', 'autoplay', 'restricted'].includes(failure.kind) ? undefined : this.nextCandidate();
    this.trace('failure', { failure, retryAllowed: !!next });
    const cancellation = ++this.attempt;
    this.clearTimer();
    this.loaded = false;
    this.selectedStream.set(null);
    this.state.set('loading');
    this.pendingPhase.set('reconnecting');
    if (failure.kind === 'cancelled') {
      this.pause();
      return;
    }
    if (failure.kind === 'autoplay' || failure.kind === 'restricted') {
      this.terminate(failure.kind === 'autoplay' ? 'playbackBlocked' : message, failure);
      return;
    }
    if (!next) {
      this.terminate(message, failure);
      return;
    }
    this.engine?.clear();
    const delay = this.attempted.has(next.url) ? recoveryDelay(this.random()) : 0;
    this.trace('scheduled', { failure, retryAllowed: true, delayMs: delay }, next);
    if (delay) {
      this.pending = setTimeout(() => {
        this.pending = undefined;
        if (cancellation === this.attempt && this.state() === 'loading') void this.loadNext(message);
      }, delay);
      return;
    }
    // Leave the failing adapter's callback before replacing/destroying its media.
    await Promise.resolve();
    if (cancellation === this.attempt && this.state() === 'loading') await this.loadNext(message);
  }
  private nextCandidate(): Stream | undefined {
    const station = this.station(),
      current = station && this.current(station.id);
    if (!current || this.totalAttempts >= RECOVERY_POLICY.maxTotalAttempts) return;
    const eligible = this.candidates(current);
    if (this.attempted.size < RECOVERY_POLICY.maxDistinctUrls) {
      const fresh = eligible.find(stream => !this.attempted.has(stream.url));
      if (fresh) return fresh;
    }
    return eligible.find(
      stream =>
        this.retryable.has(stream.url) && (this.attempted.get(stream.url) ?? 0) < RECOVERY_POLICY.maxAttemptsPerUrl,
    );
  }
  canResume(): boolean {
    const station = this.station();
    const current = station && this.current(station.id);
    return !!current && this.candidates(current).length > 0;
  }
  pause(): void {
    this.playbackBoundary('pause');
    if (!this.station()) return;
    ++this.attempt;
    this.clearTimer();
    this.state.set('paused');
    this.trace('cancelled');
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
      this.pendingPhase.set('connecting');
      this.watchdog();
      try {
        await this.engine.audio.play();
      } catch (cause) {
        if (attempt === this.attempt) {
          await this.recover('playbackError', playbackFailure(cause));
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
    this.playbackBoundary('stop');
    this.trace('cancelled');
    ++this.attempt;
    this.clearTimer();
    this.station.set(null);
    this.selectedStream.set(null);
    this.technicalTest.set(false);
    this.pinnedStreamId = undefined;
    this.attempted.clear();
    this.retryable.clear();
    this.totalAttempts = 0;
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
  private recordOutcome(url: string, outcome: 'playing' | 'failed') {
    this.outcomes.update(previous => new Map(previous).set(url, outcome));
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending) clearTimeout(this.pending);
    this.pending = undefined;
  }
  private watchdog(buffering = false) {
    this.clearTimer();
    const attempt = this.attempt;
    this.timer = setTimeout(
      () => {
        if (attempt === this.attempt) void this.recover('playbackTimeout', { kind: 'timeout', transient: true });
      },
      buffering ? RECOVERY_POLICY.bufferingMs : RECOVERY_POLICY.startupMs,
    );
  }
  private terminate(message: string, failure?: PlaybackFailure) {
    this.playbackBoundary('failure');
    ++this.attempt;
    this.clearTimer();
    this.loaded = false;
    this.selectedStream.set(null);
    this.state.set('error');
    this.error.set(message);
    this.trace('exhausted', { failure, retryAllowed: false });
    this.engine?.clear();
  }
  private trace(
    result: PlaybackDiagnostic['result'],
    extra: Partial<Pick<PlaybackDiagnostic, 'failure' | 'retryAllowed' | 'delayMs'>> = {},
    stream = this.selectedStream() ?? this.lastStream,
  ) {
    const station = this.station();
    if (!station) return;
    const id = (value: string | undefined) =>
      value && /^[a-z0-9][a-z0-9._-]{0,95}$/i.test(value) ? value : 'catalogue-id';
    const timestamp = Date.now();
    const row: PlaybackDiagnostic = {
      timestamp,
      elapsedMs: timestamp - this.startedAt,
      stationId: id(station.id),
      streamId: id(stream?.id),
      attempt: this.totalAttempts,
      urlAttempt: stream ? (this.attempted.get(stream.url) ?? 0) : 0,
      phase: this.statusLabel(),
      result,
      ...extra,
      ...(extra.failure ? { failure: safeFailure(extra.failure) } : {}),
    };
    this.history.update(history => [...history.slice(-(RECOVERY_POLICY.maxDiagnostics - 1)), row]);
    this.engine?.audio.dispatchEvent(new CustomEvent('radiobee-diagnostic', { detail: row }));
  }
  ngOnDestroy(): void {
    this.stop();
    for (const cleanup of this.cleanups) cleanup();
  }
}
