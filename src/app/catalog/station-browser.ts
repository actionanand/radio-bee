import { V2BrowserComponent } from './v2-browser';
import { RadioBeeLoaderComponent } from '../shared/radio-bee-loader';
import { uiLanguageOptions } from './device-language';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CatalogService } from './catalog.service';
import { UiKey, uiLabel } from './catalog.ui';
import { Filters, Location, emptyFilters, groups, catalogCounts } from './catalog.models';
import { StationCardComponent } from './station-card';
import { FavoritesService } from './favorites.service';
import { DiscoveryCategory, discoveryCategories, inCategory } from './discovery';
import { PlayerService } from '../player/player.service';
import { IonIcon, IonSelect, IonSelectOption } from '@ionic/angular';
import { ThemeService } from '../theme/theme.service';
import { radioIcons } from '../shared/radio-icons';
@Component({
  selector: 'app-station-browser',
  imports: [V2BrowserComponent, RadioBeeLoaderComponent, DatePipe, StationCardComponent, IonIcon, IonSelect, IonSelectOption],
  templateUrl: './station-browser.html',
  styleUrl: './station-browser.scss',
  host: { '(document:ionPopoverWillPresent)': 'selectPresented($event)' },
})
export class StationBrowserComponent {
  readonly theme = inject(ThemeService);
  readonly localeOptions = computed(() => uiLanguageOptions(this.data.locale() as 'en' | 'ta' | 'sa'));
  selectOptions(label: string) {
    return {
      cssClass: 'radio-select-popover',
      showBackdrop: true,
      htmlAttributes: { role: 'dialog', 'aria-label': label, lang: this.data.locale() },
    };
  }
  selectPresented(event: Event) {
    const overlay = event.target;
    if (!(overlay instanceof HTMLElement) || !overlay.matches('ion-popover.radio-select-popover')) return;
    // Ionic 9 puts a radiogroup inside ion-list without listitems. The list is visual, not a semantic list.
    overlay.querySelector('ion-select-popover ion-list')?.setAttribute('role', 'presentation');
  }
  readonly icons = radioIcons;
  readonly player = inject(PlayerService);
  readonly toggle = (value: boolean) => !value;
  readonly favorites = inject(FavoritesService);
  readonly categories = discoveryCategories;
  readonly category = signal<DiscoveryCategory>('all');
  readonly byNetwork = signal(false);
  readonly stations = computed(() => this.grouped().flatMap(group => group.stations));
  readonly sections = computed(() =>
    this.byNetwork()
      ? this.grouped().map(group => ({ id: group.network.id, name: group.network.name, stations: group.stations }))
      : [{ id: 'all', name: '', stations: this.stations() }],
  );
  selectCategory(category: DiscoveryCategory) {
    this.category.set(category);
  }
  ui(key: UiKey): string {
    return uiLabel(this.data.locale(), key);
  }
  value(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
  }
  readonly data = inject(CatalogService);
  readonly filters = signal<Filters>({ ...emptyFilters });
  readonly grouped = computed(() => {
    const catalog = this.data.catalog();
    return catalog
      ? groups(catalog, this.filters())
          .map(group => ({
            ...group,
            stations: group.stations.filter(
              station =>
                (station.streams.length > 0 || !!station.discovery) &&
                inCategory(station, this.category(), this.favorites.has(station.id)) &&
                (this.category() !== 'listenNow' || this.player.eligibility(station).status === 'ready'),
            ),
          }))
          .filter(group => group.stations.length)
      : [];
  });
  readonly totals = computed(() => catalogCounts(this.data.catalog()));
  readonly count = computed(() => this.grouped().reduce((total, g) => total + g.stations.length, 0));
  readonly controls = computed(() =>
    this.filters().country === 'IN'
      ? ([
          { key: 'country', label: 'countries' },
          { key: 'region', label: 'indiaStates' },
          { key: 'district', label: 'districts' },
          { key: 'locality', label: 'localities' },
          { key: 'language', label: 'languages' },
        ] as const)
      : ([
          { key: 'country', label: 'countries' },
          { key: 'language', label: 'languages' },
        ] as const),
  );
  controlLabel(label: string): string {
    return label === 'indiaStates' ? this.ui('indiaStates') : this.data.t('catalog', label);
  }
  constructor() {
    void this.data.start();
  }
  change(key: keyof Filters, value: string) {
    this.filters.update(previous => ({
      ...previous,
      [key]: value,
      ...(key === 'country' ? { region: '', district: '', locality: '' } : {}),
      ...(key === 'region' ? { district: '', locality: '' } : {}),
      ...(key === 'district' ? { locality: '' } : {}),
      ...((key === 'country' ? value : previous.country) !== 'IN' ? { region: '', district: '', locality: '' } : {}),
    }));
  }
  clear() {
    this.filters.set({ ...emptyFilters });
  }
  options(key: keyof Filters): { id: string; name: string }[] {
    const c = this.data.catalog();
    if (!c) return [];
    const f = this.filters();
    if (key === 'language') return c.languages.map(l => ({ id: l.code, name: this.data.languageName(l) }));
    if (key !== 'country' && f.country !== 'IN') return [];
    const types: Record<string, string> = {
      country: 'country',
      region: 'state',
      district: 'district',
      locality: 'locality',
    };
    return c.locations
      .filter(
        l =>
          l.type === types[key] &&
          (key === 'country' || !f.country || l.countryCode === f.country) &&
          (key !== 'district' || !f.region || l.parentId === f.region) &&
          (key !== 'locality' ||
            ((!f.district || l.parentId === f.district) &&
              (!f.region || c.locations.find(d => d.id === l.parentId)?.parentId === f.region))),
      )
      .map(l => ({ id: key === 'country' ? l.countryCode : l.id, name: this.placeName(l) }));
  }
  placeName(l: Location) {
    return this.data.t(
      l.type === 'country' ? 'countries' : 'regions',
      l.type === 'country' ? l.countryCode : l.id,
      l.name,
    );
  }
}
