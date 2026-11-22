import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { RADIO_RECORDING } from './recording.config';
import { RecordingExportPreferencesService, recordingBitrate } from './recording-export-preferences';

describe('Recording export preferences', () => {
  const key = 'radiobee-recording-export-v1';
  const config = (enabled: boolean) => ({ Enabled: enabled, AutoContinue: true,
    AllowProhibitedRecording: false, MaxDurationMs: 3600000, MaxBytes: 80 * 1024 * 1024 });
  beforeEach(() => {
    localStorage.removeItem(key);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(key);
    vi.restoreAllMocks();
  });
  const setup = (enabled = true) => {
    TestBed.configureTestingModule({ providers: [{ provide: RADIO_RECORDING, useValue: config(enabled) }] });
    return TestBed.inject(RecordingExportPreferencesService);
  };
  it('defaults Android to original format and does not attempt AAC conversion', () => {
    const p = setup();
    expect(p.format()).toBe('original');
    expect(p.quality()).toBe('balanced');
    expect(p.coverArt()).toBe(true);
    expect(p.embedCover()).toBe(false);
    expect(recordingBitrate('space')).toBe(64_000);
    expect(recordingBitrate('balanced')).toBe(96_000);
    expect(recordingBitrate('high')).toBe(128_000);
  });
  it('persists quality, original-format and cover choices', () => {
    const p = setup();
    p.setFormat('original');
    p.setQuality('high');
    p.setCoverArt(false);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({format:'original', quality:'high', coverArt:false});
    expect(p.format()).toBe('original');
    expect(p.embedCover()).toBe(false);
    p.setFormat('m4a');
    expect(p.format()).toBe('original');
    expect(p.coverArt()).toBe(false);
  });
  it('ignores a legacy saved M4A preference on Android', () => {
    localStorage.setItem(key, JSON.stringify({ format: 'm4a', quality: 'high', coverArt: true }));
    const p = setup();
    expect(p.format()).toBe('original');
    expect(p.embedCover()).toBe(false);
    p.setFormat('m4a');
    expect(p.format()).toBe('original');
  });
  it('never reads or writes recording storage when recording is disabled', () => {
    localStorage.setItem(key, 'unrelated saved config');
    const p = setup(false);
    expect(p.quality()).toBe('balanced');
    p.setQuality('space');
    p.setCoverArt(false);
    expect(localStorage.getItem(key)).toBe('unrelated saved config');
  });
  it('web safely uses its original browser container and never claims native M4A conversion', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    const p = setup();
    expect(p.format()).toBe('original');
    expect(p.embedCover()).toBe(false);
    p.setFormat('m4a');
    expect(p.format()).toBe('original');
  });
});
