import { InjectionToken, Service, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
export const FAVORITES_STORAGE = new InjectionToken('FAVORITES_STORAGE', {
  providedIn: 'root',
  // Wrap the Capacitor proxy so Angular lifecycle inspection cannot call plugin methods such as ngOnDestroy.
  factory: () => ({
    get: (options: { key: string }) => Preferences.get(options),
    set: (options: { key: string; value: string }) => Preferences.set(options),
  }),
});
@Service()
export class FavoritesService {
  private readonly storage = inject(FAVORITES_STORAGE);
  private readonly key = 'radiobee.favorites.v1';
  private readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly warning = signal(false);
  readonly loaded = this.restore();
  private writes = Promise.resolve();
  private readonly touched = new Set<string>();
  has(id: string) {
    return this.selected().has(id);
  }
  private async restore() {
    try {
      const { value } = await this.storage.get({ key: this.key });
      const saved: unknown = value ? JSON.parse(value) : [];
      if (!Array.isArray(saved) || !saved.every(id => typeof id === 'string' && id.length > 0))
        throw Error('Invalid favorites');
      this.selected.update(current => new Set([...saved.filter(id => !this.touched.has(id)), ...current]));
    } catch {
      this.warning.set(true);
    }
  }
  async toggle(id: string) {
    this.touched.add(id);
    this.selected.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    this.writes = this.writes.then(async () => {
      await this.loaded;
      try {
        await this.storage.set({ key: this.key, value: JSON.stringify([...this.selected()]) });
        this.warning.set(false);
      } catch {
        this.warning.set(true);
      }
    });
    await this.writes;
  }
}
