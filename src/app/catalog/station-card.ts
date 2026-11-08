import { Component, computed, inject, input } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { Station } from './catalog.models';
import { CatalogService } from './catalog.service';
import { StationArtworkComponent } from './station-artwork';
import { FavoritesService } from './favorites.service';
import { PlayerService } from '../player/player.service';
import { uiLabel, UiKey } from './catalog.ui';
import { StationDetailsService } from './station-details.service';
import { radioIcons } from '../shared/radio-icons';
@Component({
  selector: 'app-station-card',
  imports: [StationArtworkComponent, IonIcon],
  templateUrl: './station-card.html',
  styleUrl: './station-card.scss',
})
export class StationCardComponent {
  readonly station = input.required<Station>();
  readonly data = inject(CatalogService);
  readonly player = inject(PlayerService);
  readonly favorites = inject(FavoritesService);
  readonly details = inject(StationDetailsService);
  readonly icons = radioIcons;
  private readonly document = inject(DOCUMENT);
  readonly state = computed(() => this.player.stateFor(this.station()));
  readonly action = computed<UiKey>(() =>
    this.state() === 'playing'
      ? 'pause'
      : this.state() === 'loading'
        ? 'connecting'
        : this.state() === 'error'
          ? 'retry'
          : 'play',
  );
  readonly actionIcon = computed(() =>
    this.state() === 'playing'
      ? this.icons.pause
      : this.state() === 'loading'
        ? this.icons.syncOutline
        : this.icons.play,
  );
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
  toggleFavorite() {
    void this.favorites.toggle(this.station().id);
    this.document.querySelector<HTMLButtonElement>('[data-category="favorites"][aria-pressed="true"]')?.focus();
  }
  shortLocation(station: Station) {
    const catalog = this.data.catalog();
    const country = catalog?.locations.find(
      location => location.type === 'country' && location.countryCode === station.countryCode,
    );
    const id = station.localityId ?? station.districtId ?? station.regionId;
    const location = catalog?.locations.find(location => location.id === id);
    return [
      location ? this.data.t('regions', location.id, location.name) : '',
      country ? this.data.t('countries', station.countryCode, country.name) : station.countryCode,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
