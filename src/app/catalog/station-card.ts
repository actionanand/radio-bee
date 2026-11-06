import { Component, inject, input } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Location, Station } from './catalog.models';
import { CatalogService } from './catalog.service';
import { StationArtworkComponent } from './station-artwork';
import { FavoritesService } from './favorites.service';
import { PlayerService } from '../player/player.service';
import { broadcasterPages } from './broadcaster-pages';
import { uiLabel, UiKey } from './catalog.ui';
@Component({
  selector: 'app-station-card',
  imports: [StationArtworkComponent],
  templateUrl: './station-card.html',
  styleUrl: './station-card.scss',
})
export class StationCardComponent {
  readonly station = input.required<Station>();
  readonly data = inject(CatalogService);
  readonly player = inject(PlayerService);
  readonly favorites = inject(FavoritesService);
  private readonly document = inject(DOCUMENT);
  toggleFavorite() {
    void this.favorites.toggle(this.station().id);
    // Removing the focused card from Favorites must leave keyboard focus in the discovery controls.
    this.document.querySelector<HTMLButtonElement>('[data-category="favorites"][aria-pressed="true"]')?.focus();
  }
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
  networkName(station: Station) {
    return this.data.catalog()?.networks.find(network => network.id === station.networkId)?.name ?? '';
  }
  listeningPage(station: Station): string | null {
    const page = broadcasterPages[station.id] ?? station.website;
    try {
      const url = new URL(page ?? '');
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }
  private places(station: Station) {
    const catalog = this.data.catalog();
    return [station.localityId, station.districtId, station.regionId, station.countryCode]
      .map(id =>
        catalog?.locations.find(
          location => location.id === id || (location.type === 'country' && location.countryCode === id),
        ),
      )
      .filter(location => location !== undefined);
  }
  private placeName(location: Location) {
    return this.data.t(
      location.type === 'country' ? 'countries' : 'regions',
      location.type === 'country' ? location.countryCode : location.id,
      location.name,
    );
  }
  location(station: Station) {
    return this.places(station)
      .map(location => this.placeName(location))
      .reverse()
      .join(' / ');
  }
  shortLocation(station: Station) {
    const places = this.places(station);
    return [places[0], places.length > 1 ? places[places.length - 1] : undefined]
      .filter(location => location !== undefined)
      .map(location => this.placeName(location))
      .join(' · ');
  }
}
