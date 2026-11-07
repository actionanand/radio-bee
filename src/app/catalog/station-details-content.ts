import { Component, computed, inject, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { CatalogService } from './catalog.service';
import { Station } from './catalog.models';
import { UiKey, uiLabel } from './catalog.ui';
import { radioIcons } from '../shared/radio-icons';
import { stationWebsite } from './station-website';
@Component({
  selector: 'app-station-details-content',
  imports: [IonIcon],
  template: `<section class="rb-ui" [attr.lang]="data.locale()">
    <header>
      <h2 id="station-details-title">{{ station().name }}</h2>
      <button type="button" class="close" [attr.aria-label]="ui('close')" (click)="closed.emit()">
        <ion-icon [icon]="icons.close" aria-hidden="true" />
      </button>
    </header>
    <dl>
      @for (field of fields(); track field.label) {
        <div>
          <dt>{{ ui(field.label) }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      }
    </dl>
    @if (website(); as url) {
      <a [href]="url" target="_blank" rel="noopener noreferrer"
        >{{ ui('officialWebsite') }}<ion-icon [icon]="icons.openOutline" aria-hidden="true"
      /></a>
    }
  </section>`,
  styles: `
    section {
      padding: 20px;
      color: var(--ink);
      background: var(--surface);
      max-height: 75dvh;
      overflow: auto;
    }
    header {
      display: flex;
      align-items: start;
      gap: 12px;
    }
    h2 {
      font-size: 18px;
      line-height: 1.4;
      margin: 4px 0;
      flex: 1;
      overflow-wrap: anywhere;
    }
    .close {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      padding: 10px;
    }
    ion-icon {
      font-size: 22px;
    }
    dl {
      margin: 16px 0;
    }
    dl > div {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) 2fr;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      line-height: 1.5;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    a {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      color: var(--ink);
      font-size: 13px;
    }
  `,
})
export class StationDetailsContentComponent {
  readonly station = input.required<Station>();
  readonly closed = output<void>();
  readonly data = inject(CatalogService);
  readonly icons = radioIcons;
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
  readonly website = computed(() => stationWebsite(this.station()));
  readonly fields = computed(() => {
    const station = this.station(),
      catalog = this.data.catalog();
    const result: { label: UiKey; value: string }[] = [];
    const add = (label: UiKey, value: string | undefined) => {
      if (value) result.push({ label, value });
    };
    add(
      'language',
      station.broadcastLanguages
        .map(code => catalog?.languages.find(language => language.code === code)?.nativeName ?? '')
        .filter(Boolean)
        .join(', '),
    );
    const country = catalog?.locations.find(
      location => location.type === 'country' && location.countryCode === station.countryCode,
    );
    add('country', country ? this.data.t('countries', station.countryCode, country.name) : undefined);
    for (const [id, label] of [
      [station.regionId, 'region'],
      [station.districtId, 'district'],
      [station.localityId, 'city'],
    ] as const) {
      const location = catalog?.locations.find(location => location.id === id);
      add(label, location ? this.data.t('regions', location.id, location.name) : undefined);
    }
    if (station.delivery === 'fm' && station.frequencyMHz) add('frequency', station.frequencyMHz + ' MHz');
    add(
      'genres',
      station.genres
        .map(id => this.data.t('categories', id, catalog?.categories.find(category => category.id === id)?.name ?? ''))
        .filter(Boolean)
        .join(', '),
    );
    const network = catalog?.networks.find(network => network.id === station.networkId);
    add('network', network?.name);
    return result;
  });
}
