import { Component, effect, ElementRef, inject, input, signal, viewChild, viewChildren } from '@angular/core';

/** Convert FFT bins into twenty logarithmic bands of 1–16 whole LED cells. */
export function spectrumLevels(bins: Uint8Array, sampleRate: number, fftSize: number): number[] {
  const low = 60;
  const high = Math.min(16_000, sampleRate * 0.47);
  const steps = 20;
  return Array.from({ length: steps }, (_, index) => {
    const fromHz = low * Math.pow(high / low, index / steps);
    const toHz = low * Math.pow(high / low, (index + 1) / steps);
    const from = Math.min(bins.length - 1, Math.max(0, Math.floor((fromHz * fftSize) / sampleRate)));
    const to = Math.min(bins.length, Math.max(from + 1, Math.ceil((toHz * fftSize) / sampleRate)));
    let sum = 0;
    for (let bin = from; bin < to; bin++) sum += bins[bin];
    const strength = sum / (to - from);
    return Math.max(1, Math.min(16, Math.round(1 + 15 * Math.pow(strength / 185, 0.77))));
  });
}

type CaptureAudioElement = HTMLAudioElement & { captureStream?: () => MediaStream };

/**
 * Reusable 20-band LED meter. Captures the existing media element without
 * rerouting its output; CORS-blocked/unsupported captures use decorative motion.
 */
@Component({
  selector: 'app-radio-led-equalizer',
  host: {
    class: 'rb-led-equalizer',
    '[attr.data-active]': 'playing()',
    '[attr.data-mode]': 'mode()',
  },
  templateUrl: './radio-led-equalizer.html',
  styleUrl: './radio-led-equalizer.scss',
})
export class RadioLedEqualizerComponent {
  readonly playing = input(false);
  readonly audio = input<HTMLAudioElement | null>(null);
  readonly columns = Array.from({ length: 20 }, (_, index) => index);
  readonly mode = signal<'decorative' | 'audio'>('decorative');

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly ledElements = viewChildren<ElementRef<HTMLElement>>('led');

  constructor() {
    effect(onCleanup => {
      const playing = this.playing();
      const audio = this.audio();
      const panel = this.panel();
      const leds = this.ledElements();
      // Do nothing when paused: CSS freezes the current animation frame,
      // and inline sampled levels remain untouched.
      if (!playing || !audio || !panel || leds.length !== 20) return;
      onCleanup(this.captureAudio(audio, panel.nativeElement, leds.map(led => led.nativeElement)));
    });
  }

  private captureAudio(audio: CaptureAudioElement, panel: HTMLElement, bars: HTMLElement[]): () => void {
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor || typeof audio.captureStream !== 'function') {
      this.mode.set('decorative');
      return () => undefined;
    }

    let stream: MediaStream;
    try {
      // Unlike createMediaElementSource(), this does not reroute or silence
      // the radio playback. Inaccessible cross-origin tracks yield silence.
      stream = audio.captureStream();
    } catch {
      this.mode.set('decorative');
      return () => undefined;
    }

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame: number | null = null;
    let closed = false;
    let lastDraw = 0;
    let silentSince = 0;
    let lastPace = 0;
    let rollingBass = 0;
    let lastBass = 0;
    let lastBeat = 0;
    let beatInterval = 500;
    const smoothed = Array.from({ length: 20 }, () => 1);

    const sample = (now: number) => {
      if (closed || !context || !analyser) return;
      frame = window.requestAnimationFrame(sample);
      if (now - lastDraw < 45) return; // approximately 20 fps, not every repaint
      lastDraw = now;
      const bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      let peak = 0;
      for (const value of bins) peak = Math.max(peak, value);
      // Cross-origin captures and unavailable tracks read as silence.
      if (peak < 5 || stream.getAudioTracks().every(track => track.muted || track.readyState !== 'live')) {
        if (!silentSince) silentSince = now;
        if (now - silentSince > 1500) this.mode.set('decorative');
        return;
      }
      silentSince = 0;
      const levels = spectrumLevels(bins, context.sampleRate, analyser.fftSize);
      levels.forEach((level, index) => {
        smoothed[index] = level > smoothed[index] ? level : smoothed[index] * 0.64 + level * 0.36;
        const cells = Math.max(1, Math.min(16, Math.round(smoothed[index])));
        bars[index].style.setProperty('--rb-led-inset', `${100 - cells * 6.25}%`);
      });
      this.mode.set('audio');

      // Envelope/onset cues influence the bee flight and display pulse.
      // These are deliberately approximate, not a claimed BPM measurement.
      const bass = levels.slice(0, 6).reduce((sum, level) => sum + level, 0) / 6;
      rollingBass = rollingBass ? 0.9 * rollingBass + 0.1 * bass : bass;
      if (bass > 4 && bass > rollingBass * 1.18 && bass > lastBass && now - lastBeat >= 280) {
        if (lastBeat) beatInterval = beatInterval * 0.7 + Math.max(320, Math.min(1000, now - lastBeat)) * 0.3;
        lastBeat = now;
        panel.style.setProperty('--beat', `${(beatInterval / 1000).toFixed(2)}s`);
      }
      lastBass = bass;
      if (now - lastPace > 400) {
        panel.style.setProperty('--fly', `${(11 - 5 * (bass / 16)).toFixed(1)}s`);
        lastPace = now;
      }
    };

    const begin = () => {
      if (closed || context || !stream.getAudioTracks().length) return;
      try {
        context = new AudioCtor();
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.63;
        source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        // Intentionally no connection to context.destination: existing radio
        // audio plays through the original HTMLAudioElement exactly as before.
        void context.resume().then(() => {
          if (!closed) frame = window.requestAnimationFrame(sample);
        }).catch(() => this.mode.set('decorative'));
      } catch {
        this.mode.set('decorative');
        source?.disconnect();
        if (context) void context.close().catch(() => undefined);
        source = null;
        analyser = null;
        context = null;
      }
    };
    stream.addEventListener('addtrack', begin);
    begin();
    return () => {
      closed = true;
      stream.removeEventListener('addtrack', begin);
      if (frame !== null) window.cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      for (const track of stream.getTracks()) track.stop();
      if (context) void context.close().catch(() => undefined);
    };
  }
}
