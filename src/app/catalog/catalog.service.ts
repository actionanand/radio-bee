import { InjectionToken, Service, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';
import { Catalog, translated } from './catalog.models';
import { relativePath, validateCatalog, validateManifest } from './catalog.validation';
export const CATALOG_URL = new InjectionToken<string>('CATALOG_URL', {
  providedIn: 'root',
  factory: () => environment.catalogUrl,
});
export const CATALOG_FETCH = new InjectionToken<(url: string) => Promise<unknown>>('CATALOG_FETCH', {
  providedIn: 'root',
  factory: () => async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? 'Catalogue host is not deployed (404).'
          : `Catalogue request failed (${response.status}).`,
      );
    return response.json() as Promise<unknown>;
  },
});
export const CATALOG_STORAGE = new InjectionToken('CATALOG_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    get: (options: { key: string }) => Preferences.get(options),
    set: (options: { key: string; value: string }) => Preferences.set(options),
  }),
});
export const CATALOG_SEED_URL = new InjectionToken<string | null>('CATALOG_SEED_URL', {
  providedIn: 'root',
  factory: () => environment.catalogSeedUrl,
});
@Service()
export class CatalogService {
  private readonly base = inject(CATALOG_URL);
  private readonly fetchJson = inject(CATALOG_FETCH);
  private readonly storage = inject(CATALOG_STORAGE);
  private readonly seedUrl = inject(CATALOG_SEED_URL);
  readonly developmentSeed = signal(false);
  private readonly key = `radiobee.catalog.v1:${this.base}`;
  private started = false;
  readonly catalog = signal<Catalog | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly storageWarning = signal('');
  readonly cached = signal(false);
  readonly updatedAt = signal('');
  readonly locale = signal('en');
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.loading.set(true);
    try {
      const language = await this.storage.get({ key: 'radiobee.ui-language' });
      if (language.value && ['en', 'ta', 'sa'].includes(language.value)) this.locale.set(language.value);
    } catch {
      this.storageWarning.set('Language preference could not be read.');
    }
    try {
      const cache = await this.storage.get({ key: this.key });
      if (cache.value) {
        const stored: unknown = JSON.parse(cache.value);
        if (
          !stored ||
          typeof stored !== 'object' ||
          !('catalog' in stored) ||
          !('updatedAt' in stored) ||
          typeof stored.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(stored.updatedAt))
        )
          throw new Error('Invalid cached snapshot');
        this.catalog.set(validateCatalog(stored.catalog));
        this.updatedAt.set(stored.updatedAt);
        this.cached.set(true);
      }
    } catch {
      this.storageWarning.set('Saved catalogue could not be read; requesting a fresh copy.');
    }
    this.loading.set(false);
    await this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const manifest = validateManifest(await this.fetchJson(relativePath(this.base, 'index.json')));
      const names = ['networks', 'stations', 'locations', 'languages', 'categories', 'sources'];
      const values = await Promise.all(
        names.map(name => this.fetchJson(relativePath(this.base, manifest.files[name]))),
      );
      const dictionaries = await Promise.all(
        ['en', 'ta', 'sa'].map(locale =>
          this.fetchJson(relativePath(this.base, `${manifest.localizationRoot}${locale}.json`)),
        ),
      );
      const next = validateCatalog({
        manifest,
        ...Object.fromEntries(names.map((name, i) => [name, values[i]])),
        localization: Object.fromEntries(['en', 'ta', 'sa'].map((locale, i) => [locale, dictionaries[i]])),
      });
      const updatedAt = new Date().toISOString();
      try {
        await this.storage.set({ key: this.key, value: JSON.stringify({ catalog: next, updatedAt }) });
        this.storageWarning.set('');
      } catch {
        this.storageWarning.set('Catalogue loaded, but could not be saved for offline use.');
      }
      this.catalog.set(next);
      this.updatedAt.set(updatedAt);
      this.cached.set(false);
      this.developmentSeed.set(false);
    } catch (cause) {
      const detail =
        cause && typeof cause === 'object' && 'name' in cause && cause.name === 'TimeoutError'
          ? 'Catalogue request timed out.'
          : cause instanceof Error
            ? cause.message
            : 'Network request failed.';
      if (!this.catalog() && this.seedUrl) {
        try {
          this.catalog.set(validateCatalog(await this.fetchJson(this.seedUrl)));
          this.developmentSeed.set(true);
        } catch {
          /* A broken development snapshot must not masquerade as live data. */
        }
      }
      this.error.set(
        `${detail} ${this.developmentSeed() ? 'Showing a DEVELOPMENT SEED from the data repository, not live data.' : this.catalog() ? 'Showing the last successfully validated catalogue.' : 'No saved catalogue is available. Check the connection and data repository deployment, then refresh.'}`,
      );
    } finally {
      this.loading.set(false);
    }
  }
  async setLocale(locale: string): Promise<void> {
    if (!['en', 'ta', 'sa'].includes(locale)) return;
    this.locale.set(locale);
    try {
      await this.storage.set({ key: 'radiobee.ui-language', value: locale });
    } catch {
      this.storageWarning.set('UI language changed but could not be saved.');
    }
  }
  t(section: string, key: string, fallback = key): string {
    return translated(this.catalog(), this.locale(), section, key, fallback);
  }
}
