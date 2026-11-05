import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CatalogService } from './catalog.service';
import { UiKey, uiLabel } from './catalog.ui';
import { Filters, Location, Station, emptyFilters, groups, streamLabel } from './catalog.models';
@Component({
  selector: 'app-station-browser',
  imports: [DatePipe],
  templateUrl: './station-browser.html',
  styleUrl: './station-browser.scss',
})
export class StationBrowserComponent {
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
    return catalog ? groups(catalog, this.filters()) : [];
  });
  readonly count = computed(() => this.grouped().reduce((total, g) => total + g.stations.length, 0));
  readonly controls = [
    { key: 'country', label: 'countries' },
    { key: 'region', label: 'states' },
    { key: 'district', label: 'districts' },
    { key: 'locality', label: 'localities' },
    { key: 'language', label: 'languages' },
    { key: 'genre', label: 'genres' },
  ] as const;
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
    }));
  }
  clear() {
    this.filters.set({ ...emptyFilters });
  }
  options(key: keyof Filters): { id: string; name: string }[] {
    const c = this.data.catalog();
    if (!c) return [];
    const f = this.filters();
    if (key === 'language') return c.languages.map(l => ({ id: l.code, name: l.nativeName }));
    if (key === 'genre') return c.categories.map(g => ({ id: g.id, name: this.data.t('categories', g.id, g.name) }));
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
          (!f.country || l.countryCode === f.country) &&
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
  location(s: Station): string {
    const c = this.data.catalog();
    return [s.countryCode, s.regionId, s.districtId, s.localityId]
      .map(id => {
        const l = c?.locations.find(l => l.id === id || (l.type === 'country' && l.countryCode === id));
        return l ? this.placeName(l) : '';
      })
      .filter(Boolean)
      .join(' / ');
  }
  readonly status = streamLabel;
}
