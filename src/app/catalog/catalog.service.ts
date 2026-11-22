import { Catalog, Language, stationDisplayName, Station, translated } from './catalog.models';
import { defer, firstValueFrom, retry, throwError, timer } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { effectiveLocale, resolveDeviceLanguage, UiLanguagePreference } from './device-language';
import { validateV2, v2Manifest } from './catalog-v2';
import { catalogStatusText } from './catalog-status';
import { languageDisplayName } from './language-label';
import { InjectionToken, Service, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';
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
/** Three bounded retries after the first request; test overrides use zero delay. */
export const CATALOG_RETRY_DELAYS = new InjectionToken<readonly number[]>('CATALOG_RETRY_DELAYS', {
  providedIn: 'root',
  factory: () => [300, 800, 1600],
});

/** Retry only transport and service-availability failures, not invalid JSON or permanent HTTP errors. */
function retryableCatalogFailure(error: unknown): boolean {
  if (error instanceof SyntaxError) return false;
  if (error instanceof Error) {
    if (error.message === 'Catalogue host is not deployed (404).') return false;
    const status = /^Catalogue request failed \((\d{3})\)\.$/.exec(error.message);
    if (status) {
      const code = Number(status[1]);
      return code === 408 || code === 429 || code >= 500;
    }
  }
  return true;
}

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
  readonly deviceLocale = resolveDeviceLanguage(inject(DOCUMENT).defaultView?.navigator.language);
  readonly localePreference = signal<UiLanguagePreference>('device');
  private readonly fetchJson = inject(CATALOG_FETCH);
  private readonly retryDelays = inject(CATALOG_RETRY_DELAYS);
  private readonly storage = inject(CATALOG_STORAGE);
  private readonly seedUrl = inject(CATALOG_SEED_URL);
  readonly developmentSeed = signal(false);
  private readonly version = new URL(this.base).pathname.endsWith('/v2/') ? 2 : 1;
  private readonly key = `radiobee.catalog.v${this.version}:${this.base}`;
  private validate(value: unknown) {
    return this.version === 2 ? validateV2(value) : validateCatalog(value);
  }
  private manifest(value: unknown) {
    return this.version === 2 ? v2Manifest(value) : validateManifest(value);
  }
  private requestJson(url: string): Promise<unknown> {
    return firstValueFrom(defer(() => this.fetchJson(url)).pipe(
      retry({
        count: this.retryDelays.length,
        delay: (error: unknown, attempt: number) =>
          retryableCatalogFailure(error)
            ? timer(this.retryDelays[attempt - 1] ?? 0)
            : throwError(() => error),
      }),
    ));
  }

  /** A cached/previous Home selection is usable only for known catalogue station IDs. */
  private validHomeIds(value: unknown, catalog: Catalog): string[] | null {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string') ||
        new Set(value).size !== value.length) return null;
    const known = new Set([
      ...catalog.stations.map(station => station.id),
      ...(catalog.discoveryStations ?? []).map(station => station.id),
    ]);
    return value.every(id => known.has(id)) ? [...value] as string[] : null;
  }

  private started = false;
  readonly catalog = signal<Catalog | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly storageWarning = signal('');
  readonly homeStationIds = signal<readonly string[]>([]);
  readonly homeSelectionWarning = signal('');
  readonly cached = signal(false);
  readonly updatedAt = signal('');
  readonly locale = signal<string>(this.deviceLocale);
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.loading.set(true);
    try {
      const language = await this.storage.get({ key: 'radiobee.ui-language' });
      if (language.value === 'device' || language.value === 'en' || language.value === 'ta' || language.value === 'sa') {
        this.localePreference.set(language.value);
        this.locale.set(effectiveLocale(language.value, this.deviceLocale));
      }
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
        const validated = this.validate(stored.catalog);
        this.catalog.set(validated);
        if (this.version === 2) {
          const ids = this.validHomeIds('homeStationIds' in stored ? stored.homeStationIds : undefined, validated);
          if (ids) this.homeStationIds.set(ids);
        }
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
      const manifest = this.manifest(await this.requestJson(relativePath(this.base, 'index.json')));
      const names = ['networks', 'stations', 'locations', 'languages', 'categories', 'sources'];
      if (manifest.files['discoveryStations']) names.push('discoveryStations');
      if (this.version === 2)
        for (const key of ['stationMigrations', 'broadcasters', 'programmeThemes', 'browseIndex', 'artists'])
          if (manifest.files[key]) names.push(key);
      const values = await Promise.all(
        names.map(async name => {
          try {
            return await this.requestJson(relativePath(this.base, manifest.files[name]));
          } catch (error) {
            // A retrieved but malformed optional index must not invalidate canonical data.
            // Missing advertised files and other transport failures still fail atomically.
            if (name === 'browseIndex' && error instanceof SyntaxError) return undefined;
            throw error;
          }
        }),
      );
      const dictionaries = await Promise.all(
        ['en', 'ta', 'sa'].map(locale =>
          this.requestJson(relativePath(this.base, `${manifest.localizationRoot}${locale}.json`)),
        ),
      );
      const next = this.validate({
        manifest,
        ...Object.fromEntries(names.map((name, i) => [name, values[i]])),
        localization: Object.fromEntries(['en', 'ta', 'sa'].map((locale, i) => [locale, dictionaries[i]])),
      });
      // The v2 Home display is governed by its published sidecar, not a local top-ten list.
      // A missing or malformed sidecar never inserts substitute stations.
      // Do not turn a successful previous Home response into zero on a transient
      // sidecar failure. Keep only IDs that exist in this newly validated catalogue.
      let homeStationIds = this.version === 2 ? (this.validHomeIds(this.homeStationIds(), next) ?? []) : [];
      let homeSelectionWarning = '';
      if (this.version === 2) {
        try {
          const home: unknown = await this.requestJson(relativePath(this.base, 'home-stations.json'));
          if (!home || typeof home !== 'object' || Array.isArray(home)) throw Error('Invalid Home selection');
          const selection = home as Record<string, unknown>;
          const ids = this.validHomeIds(selection['stationIds'], next);
          if (
            selection['schemaVersion'] !== 2 ||
            !ids ||
            !Number.isSafeInteger(selection['count']) ||
            selection['count'] !== ids.length ||
            Object.keys(selection).sort().join(',') !== 'count,schemaVersion,stationIds'
          )
            throw Error('Invalid Home station IDs');
          homeStationIds = ids;
        } catch {
          homeSelectionWarning = homeStationIds.length
            ? 'Home selection temporarily unavailable. Showing last successfully validated Home stations.'
            : 'Home selection unavailable. Browse World for all radios.';
        }
      }
      const confirmed = this.manifest(await this.requestJson(relativePath(this.base, 'index.json')));
      if (JSON.stringify(confirmed) !== JSON.stringify(manifest))
        throw new Error('Catalogue changed during loading; refresh to request a consistent snapshot.');
      const updatedAt = new Date().toISOString();
      try {
        await this.storage.set({ key: this.key, value: JSON.stringify({ catalog: next, updatedAt, ...(this.version === 2 ? { homeStationIds } : {}) }) });
        this.storageWarning.set('');
      } catch {
        this.storageWarning.set('Catalogue loaded, but could not be saved for offline use.');
      }
      this.catalog.set(next);
      this.homeStationIds.set(homeStationIds);
      this.homeSelectionWarning.set(homeSelectionWarning);
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
          this.catalog.set(validateCatalog(await this.requestJson(this.seedUrl)));
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
  async setLocale(preference: string): Promise<void> {
    if (preference !== 'device' && preference !== 'en' && preference !== 'ta' && preference !== 'sa') return;
    const selected = preference as UiLanguagePreference;
    this.localePreference.set(selected);
    this.locale.set(effectiveLocale(selected, this.deviceLocale));
    try {
      await this.storage.set({ key: 'radiobee.ui-language', value: selected });
    } catch {
      this.storageWarning.set('UI language changed but could not be saved.');
    }
  }
  statusText(message: string): string {
    return catalogStatusText(this.locale(), message);
  }
  languageName(language: Language): string {
    return languageDisplayName(language, this.locale());
  }
  stationName(station: Pick<Station, 'id' | 'name'>): string {
    return stationDisplayName(this.catalog(), this.locale(), station);
  }
  /** Localized public display names; canonical catalogue IDs and legal identity remain unchanged. */
  networkName(network: { id: string; name: string }): string {
    return this.t('networkNames', network.id, network.name);
  }
  broadcasterName(broadcaster: { id: string; name: string }): string {
    return this.t('broadcasterNames', broadcaster.id, broadcaster.name);
  }
  programmeThemeName(theme: { id: string; name: string }): string {
    return this.t('programmeThemeNames', theme.id, theme.name);
  }
  artistName(artist: { id: string; name: string }): string {
    const value =
      this.locale() === 'en' ? undefined : this.catalog()?.localization[this.locale()]?.['artistNames']?.[artist.id];
    return typeof value === 'string' && value.trim() ? value.trim() : artist.name;
  }
  t(section: string, key: string, fallback = key): string {
    return translated(this.catalog(), this.locale(), section, key, fallback);
  }
}
