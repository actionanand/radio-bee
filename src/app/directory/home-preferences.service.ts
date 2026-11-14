import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';
import { Catalog, Station, allStations } from '../catalog/catalog.models';

export const HOME_STATIONS_MIN = 3;
/** One limit for the API Home list and the personal station picker (up to 10). */
export const HOME_STATIONS_MAX = Math.max(HOME_STATIONS_MIN, Math.min(10, environment.maxHomeStations));
const KEY = 'radiobee.v2.personal-home.v1';

export const HOME_PREFERENCES_STORAGE = new InjectionToken('HOME_PREFERENCES_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    get: () => Preferences.get({ key: KEY }),
    set: (value: string) => Preferences.set({ key: KEY, value }),
  }),
});

export interface PersonalHomePreferences {
  enabled: boolean;
  ids: string[];
}

/** Saved Home station override; never affects the API-provided v1 Home. */
@Service()
export class HomePreferencesService {
  private readonly storage = inject(HOME_PREFERENCES_STORAGE);
  readonly state = signal<PersonalHomePreferences>({ enabled: false, ids: [] });
  readonly warning = signal(false);
  readonly loaded = this.restore();
  private touched = false;
  private writes = Promise.resolve();
  readonly enabled = computed(() => this.state().enabled);

  static validIds(ids: readonly string[], allowed: ReadonlySet<string>): boolean {
    return ids.length >= HOME_STATIONS_MIN &&
      ids.length <= HOME_STATIONS_MAX &&
      new Set(ids).size === ids.length &&
      ids.every(id => allowed.has(id));
  }

  private async restore() {
    try {
      const { value } = await this.storage.get();
      if (!value || this.touched) return;
      const raw: unknown = JSON.parse(value);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid Home preferences');
      const prefs = raw as Record<string, unknown>;
      if (typeof prefs['enabled'] !== 'boolean' ||
          !Array.isArray(prefs['ids']) ||
          !prefs['ids'].every(id => typeof id === 'string') ||
          new Set(prefs['ids']).size !== prefs['ids'].length ||
          prefs['ids'].length > HOME_STATIONS_MAX ||
          (prefs['enabled'] && prefs['ids'].length < HOME_STATIONS_MIN))
        throw Error('Invalid Home preferences');
      if (!this.touched) this.state.set({ enabled: prefs['enabled'], ids: [...prefs['ids']] as string[] });
    } catch {
      this.warning.set(true);
    }
  }

  /** Only stations with stream candidates may be chosen; never inject invented station IDs. */
  eligible(catalog: Catalog | null): Station[] {
    return allStations(catalog).filter(station => station.streams.length > 0);
  }

  selection(catalog: Catalog | null): readonly string[] {
    const state = this.state();
    if (!state.enabled) return [];
    const eligible = new Set(this.eligible(catalog).map(station => station.id));
    return HomePreferencesService.validIds(state.ids, eligible) ? state.ids : [];
  }

  save(ids: readonly string[], catalog: Catalog | null): boolean {
    const allowed = new Set(this.eligible(catalog).map(station => station.id));
    if (!HomePreferencesService.validIds(ids, allowed)) return false;
    this.update({ enabled: true, ids: [...ids] });
    return true;
  }

  disable() {
    this.update({ ...this.state(), enabled: false });
  }

  private update(next: PersonalHomePreferences) {
    this.touched = true;
    this.state.set(next);
    this.writes = this.writes.then(async () => {
      await this.loaded;
      try {
        await this.storage.set(JSON.stringify(this.state()));
        this.warning.set(false);
      } catch {
        this.warning.set(true);
      }
    });
  }
}
