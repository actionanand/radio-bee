import { Component, computed, inject, signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { ThemeService } from '../theme/theme.service';
import { uiLanguageOptions } from '../catalog/device-language';
import { DirectorySelectComponent } from './directory-select';
import { ContactFormComponent } from '../contact/contact-form';
import { HOME_STATIONS_MAX, HOME_STATIONS_MIN, HomePreferencesService } from './home-preferences.service';
import { SettingsKey, settingsText } from './settings.labels';
import { directoryText } from './directory.labels';
import { RADIO_RECORDING } from '../recording/recording.config';
import { RecordingDestination } from '../recording/recording-destination';
import { recordingLimits } from '../recording/capture-engine';

/** v2 Settings: a draft selection never changes Home until the user saves it. */
@Component({
  selector: 'app-settings-page',
  imports: [DirectorySelectComponent, ContactFormComponent],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  readonly data = inject(CatalogService);
  readonly theme = inject(ThemeService);
  readonly home = inject(HomePreferencesService);
  readonly recording = inject(RADIO_RECORDING);
  readonly recordingFolder = inject(RecordingDestination);
  readonly folderError = signal(false);
  readonly choosingFolder = signal(false);
  readonly recordingLimitText = computed(() => {
    const { maxMs, maxBytes } = recordingLimits(this.recording);
    const locale = this.data.locale();
    const hour = locale === 'ta' ? 'மணி நேரம்' : locale === 'sa' ? 'घण्टाः' : 'hour';
    const minute = locale === 'ta' ? 'நிமிடங்கள்' : locale === 'sa' ? 'निमेषाः' : 'minute';
    const second = locale === 'ta' ? 'விநாடிகள்' : locale === 'sa' ? 'क्षणाः' : 'second';
    const duration = maxMs % 3_600_000 === 0
      ? `${maxMs / 3_600_000} ${hour}${locale === 'en' && maxMs !== 3_600_000 ? 's' : ''}`
      : maxMs % 60_000 === 0
        ? `${maxMs / 60_000} ${minute}${locale === 'en' && maxMs !== 60_000 ? 's' : ''}`
        : `${Math.ceil(maxMs / 1000)} ${second}${locale === 'en' && maxMs > 1000 ? 's' : ''}`;
    const size = Number((maxBytes / (1024 * 1024)).toFixed(2));
    return this.text('recordingLimits').replace('{duration}', duration).replace('{size}', `${size} MB`);
  });
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
  readonly limitReached = computed(() => this.draft().length >= this.max);
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
      const savedIds = this.home.state().ids;
      const draftMatchesSaved = this.draft().join('|') === savedIds.join('|');
      if (draftMatchesSaved && this.home.enableSaved(this.data.catalog())) {
        this.choosing.set(false);
      } else {
        // Preserve an unfinished draft across OFF/ON, but never publish it
        // until it has passed validation and the user explicitly saves.
        this.choosing.set(true);
      }
    } else {
      this.choosing.set(false);
      this.home.disable();
    }
  }
  choose(id: string) {
    this.saved.set(false);
    this.draft.update(ids => {
      if (ids.includes(id)) return ids.filter(value => value !== id);
      if (ids.length >= this.max ||
          !this.home.eligible(this.data.catalog()).some(station => station.id === id)) return ids;
      return [...ids, id];
    });
  }
  save() {
    if (!this.valid()) return;
    if (this.home.save(this.draft(), this.data.catalog())) {
      this.choosing.set(false);
      this.saved.set(true);
    }
  }
  async chooseRecordingFolder() {
    if (!this.recording.Enabled || this.choosingFolder()) return;
    this.choosingFolder.set(true);
    try {
      this.folderError.set(!await this.recordingFolder.chooseFolder());
    } finally {
      this.choosingFolder.set(false);
    }
  }
  search(event: Event) {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }
}
