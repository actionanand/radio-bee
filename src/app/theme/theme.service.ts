import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
export type ThemeMode = 'automatic' | 'light' | 'dark';
export const THEME_KEY = 'radiobee.theme.v1';
export function themeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'automatic';
}
export const THEME_STORAGE = new InjectionToken('THEME_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    get: () => Preferences.get({ key: THEME_KEY }),
    set: (value: string) => Preferences.set({ key: THEME_KEY, value }),
  }),
});
@Service()
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(THEME_STORAGE);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);
  readonly mode = signal<ThemeMode>(this.cached());
  readonly dark = computed(() => this.mode() === 'dark' || (this.mode() === 'automatic' && this.systemDark()));
  readonly warning = signal(false);
  private touched = false;
  private writes = Promise.resolve();
  private barVersion = 0;
  private readonly changed = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
  readonly loaded = this.restore();
  constructor() {
    this.media?.addEventListener('change', this.changed);
    effect(() => {
      const dark = this.dark();
      this.document.documentElement.classList.toggle('ion-palette-dark', dark);
      this.document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      this.document.documentElement.dataset['theme'] = this.mode();
      this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#10251f' : '#faf9f5');
      void this.systemBar(dark);
    });
  }
  private cached() {
    try {
      return themeMode(this.document.defaultView?.localStorage.getItem(THEME_KEY));
    } catch {
      return 'automatic' as const;
    }
  }
  private async restore() {
    try {
      const { value } = await this.storage.get();
      if (!this.touched && value !== null) {
        const mode = themeMode(value);
        this.mode.set(mode);
        this.document.defaultView?.localStorage.setItem(THEME_KEY, mode);
      }
    } catch {
      this.warning.set(true);
    }
  }
  set(value: unknown) {
    this.touched = true;
    const mode = themeMode(value);
    this.mode.set(mode);
    try {
      this.document.defaultView?.localStorage.setItem(THEME_KEY, mode);
    } catch {
      this.warning.set(true);
    }
    this.writes = this.writes.then(async () => {
      try {
        await this.storage.set(mode);
      } catch {
        this.warning.set(true);
      }
    });
  }
  private async systemBar(dark: boolean) {
    const version = ++this.barVersion;
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      if (version !== this.barVersion) return;
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      if (version === this.barVersion) await StatusBar.setBackgroundColor({ color: dark ? '#10251f' : '#faf9f5' });
    } catch {
      /* Unsupported system-bar customization must not block the interface. */
    }
  }
  ngOnDestroy() {
    this.barVersion++;
    this.media?.removeEventListener('change', this.changed);
  }
}
