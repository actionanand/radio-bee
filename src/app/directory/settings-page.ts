import { Component, computed, inject, signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { ThemeService } from '../theme/theme.service';
import { uiLanguageOptions } from '../catalog/device-language';
import { DirectorySelectComponent } from './directory-select';
import { HOME_STATIONS_MAX, HOME_STATIONS_MIN, HomePreferencesService } from './home-preferences.service';
import { SettingsKey, settingsText } from './settings.labels';
import { directoryText } from './directory.labels';

/** v2 Settings: a draft selection never changes Home until the user saves it. */
@Component({
  selector: 'app-settings-page',
  imports: [DirectorySelectComponent],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  readonly data = inject(CatalogService);
  readonly theme = inject(ThemeService);
  readonly home = inject(HomePreferencesService);
  readonly min = HOME_STATIONS_MIN;
  readonly max = HOME_STATIONS_MAX;
  readonly choosing = signal(false);
  readonly draft = signal<readonly string[]>([]);
  readonly query = signal('');
  readonly saved = signal(false);
  readonly enabled = computed(() => this.choosing() || this.home.enabled());
  readonly localeOptions = computed(() => uiLanguageOptions(this.data.locale() as 'en' | 'ta' | 'sa'));
  readonly themeOptions = computed(() => [
    { id: 'automatic', name: directoryText(this.data.locale(), 'automatic') },
    { id: 'light', name: directoryText(this.data.locale(), 'light') },
    { id: 'dark', name: directoryText(this.data.locale(), 'dark') },
  ]);
  readonly stations = computed(() => {
    const q = this.query().trim().toLocaleLowerCase();
    return this.home.eligible(this.data.catalog())
      .filter(s => !q || this.data.stationName(s).toLocaleLowerCase().includes(q));
  });
  readonly valid = computed(() => HomePreferencesService.validIds(
    this.draft(),
    new Set(this.home.eligible(this.data.catalog()).map(station => station.id)),
  ));
  text(key: SettingsKey) {
    return settingsText(this.data.locale(), key, { min: this.min, max: this.max });
  }
  constructor() {
    void this.data.start();
    void this.home.loaded.then(() => {
      if (!this.choosing()) this.draft.set([...this.home.state().ids]);
    });
  }
  switchHome(checked: boolean) {
    this.saved.set(false);
    if (checked) {
      this.draft.set([...this.home.state().ids]);
      this.choosing.set(true);
    } else {
      this.choosing.set(false);
      this.draft.set([...this.home.state().ids]);
      this.home.disable();
    }
  }
  choose(id: string) {
    this.saved.set(false);
    this.draft.update(ids => {
      if (ids.includes(id)) return ids.filter(value => value !== id);
      return ids.length >= this.max ? ids : [...ids, id];
    });
  }
  save() {
    if (!this.valid()) return;
    if (this.home.save(this.draft(), this.data.catalog())) {
      this.choosing.set(false);
      this.saved.set(true);
    }
  }
  search(event: Event) {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }
}
