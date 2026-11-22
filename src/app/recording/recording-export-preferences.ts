import { Injectable, computed, inject, signal } from '@angular/core';
import { RADIO_RECORDING } from './recording.config';

export type RecordingFormat = 'm4a' | 'original';
export type RecordingQuality = 'space' | 'balanced' | 'high';
export type RecordingExportPreferences = {
  format: RecordingFormat;
  quality: RecordingQuality;
  coverArt: boolean;
};

const STORAGE_KEY = 'radiobee-recording-export-v1';
const DEFAULTS: RecordingExportPreferences = { format: 'original', quality: 'balanced', coverArt: true };
export const recordingBitrate = (quality: RecordingQuality): number =>
  ({ space: 64_000, balanced: 96_000, high: 128_000 })[quality];

/** Device-local export choices; never loaded or used when recording is disabled. */
@Injectable({ providedIn: 'root' })
export class RecordingExportPreferencesService {
  private readonly recording = inject(RADIO_RECORDING);
  private readonly values = signal<RecordingExportPreferences>(this.load());
  readonly format = computed((): RecordingFormat => 'original');
  readonly quality = computed(() => this.values().quality);
  readonly coverArt = computed(() => this.values().coverArt);
  readonly embedCover = computed(() =>
    this.format() === 'm4a' && this.values().coverArt && Capacitor.getPlatform() === 'android',
  );

  private load(): RecordingExportPreferences {
    if (!this.recording.Enabled) return DEFAULTS;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<RecordingExportPreferences> | null;
      if (!stored || typeof stored !== 'object') return DEFAULTS;
      return {
        format: 'original',
        quality: stored.quality === 'space' || stored.quality === 'high' ? stored.quality : 'balanced',
        coverArt: stored.coverArt !== false,
      };
    } catch { return DEFAULTS; }
  }

  private update(next: RecordingExportPreferences) {
    if (!this.recording.Enabled) return;
    this.values.set(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* In-memory choice still works. */ }
  }

  setFormat(value: string) {
    if (value !== 'original') return;
    this.update({ ...this.values(), format: value });
  }
  setQuality(value: string) {
    if (value !== 'space' && value !== 'balanced' && value !== 'high') return;
    this.update({ ...this.values(), quality: value });
  }
  setCoverArt(value: boolean) {
    this.update({ ...this.values(), coverArt: value });
  }
}
