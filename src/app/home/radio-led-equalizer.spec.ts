import { TestBed } from '@angular/core/testing';
import { RadioLedEqualizerComponent, spectrumLevels } from './radio-led-equalizer';

describe('Reusable LED equalizer', () => {
  it('renders twenty columns, a bee and scale; activity follows its input', () => {
    const fixture = TestBed.createComponent(RadioLedEqualizerComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-active')).toBe('false');
    expect(host.querySelectorAll('.rb-leds > .rb-led')).toHaveLength(20);
    expect(host.querySelector('.rb-led-bee svg')).toBeTruthy();
    expect(host.querySelectorAll('.rb-led-scale span')).toHaveLength(5);
    expect(host.querySelector('.rb-led-panel')?.getAttribute('aria-hidden')).toBe('true');
    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();
    expect(host.getAttribute('data-active')).toBe('true');
    fixture.componentRef.setInput('playing', false);
    fixture.detectChanges();
    expect(host.getAttribute('data-active')).toBe('false');
  });
  it('maps measured frequencies to independent LED heights', () => {
    const silent = spectrumLevels(new Uint8Array(1024), 48_000, 2048);
    expect(silent).toEqual(Array(20).fill(1));
    const bins = new Uint8Array(1024);
    bins.fill(185, 3, 12);
    const levels = spectrumLevels(bins, 48_000, 2048);
    expect(levels).toHaveLength(20);
    expect(levels[0]).toBeGreaterThan(levels[19]);
    expect(levels.every(level => level >= 1 && level <= 16)).toBe(true);
  });

  it('holds the exact last LED heights and mode on pause', () => {
    const fixture = TestBed.createComponent(RadioLedEqualizerComponent);
    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const led = host.querySelector<HTMLElement>('.rb-led');
    expect(led).toBeTruthy();
    led!.style.setProperty('--rb-led-inset', '31.25%');
    fixture.componentInstance.mode.set('audio');
    fixture.detectChanges();
    fixture.componentRef.setInput('playing', false);
    fixture.detectChanges();
    expect(host.getAttribute('data-active')).toBe('false');
    expect(host.getAttribute('data-mode')).toBe('audio');
    expect(led!.style.getPropertyValue('--rb-led-inset')).toBe('31.25%');
    fixture.destroy();
  });

  it('samples existing captured audio without rerouting its output', async () => {
    let onFrame: FrameRequestCallback | undefined;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      onFrame = callback;
      return 17;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const track = { muted: false, readyState: 'live', stop: vi.fn() };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const connect = vi.fn();
    const analyser = {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0,
      getByteFrequencyData: (samples: Uint8Array) => samples.fill(145),
      disconnect: vi.fn(),
    };
    const close = vi.fn(async () => undefined);
    class FakeAudioContext {
      readonly sampleRate = 48_000;
      createAnalyser() { return analyser; }
      createMediaStreamSource() { return { connect, disconnect: vi.fn() }; }
      async resume() { return undefined; }
      close() { return close(); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = document.createElement('audio');
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    Object.defineProperty(audio, 'captureStream', { configurable: true, value: () => stream });
    const fixture = TestBed.createComponent(RadioLedEqualizerComponent);
    try {
      fixture.componentRef.setInput('audio', audio);
      fixture.componentRef.setInput('playing', true);
      fixture.detectChanges();
      await Promise.resolve();
      expect(onFrame).toBeDefined();
      onFrame?.(120);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.getAttribute('data-mode')).toBe('audio');
      const bar = host.querySelector<HTMLElement>('.rb-led');
      const heldLevel = bar!.style.getPropertyValue('--rb-led-inset');
      expect(heldLevel).toMatch(/%$/);
      expect(connect).toHaveBeenCalledOnce();
      expect(pause).not.toHaveBeenCalled();
      fixture.componentRef.setInput('playing', false);
      fixture.componentRef.setInput('audio', null);
      fixture.detectChanges();
      expect(bar!.style.getPropertyValue('--rb-led-inset')).toBe(heldLevel);
      expect(host.getAttribute('data-mode')).toBe('audio');
      expect(cancel).toHaveBeenCalled();
      expect(track.stop).toHaveBeenCalled();
    } finally {
      fixture.destroy();
      raf.mockRestore();
      cancel.mockRestore();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
    expect(close).toHaveBeenCalled();
  });

});
