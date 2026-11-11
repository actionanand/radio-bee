import { DirectoryBreadcrumbsComponent } from './directory-breadcrumbs';
import { uiLabel } from '../catalog/catalog.ui';
import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { IonIcon } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { allStations } from '../catalog/catalog.models';
import { StationArtworkComponent } from '../catalog/station-artwork';
import { StationCardComponent } from '../catalog/station-card';
import { FavoritesService } from '../catalog/favorites.service';
import { PlayerService } from '../player/player.service';
import { radioIcons } from '../shared/radio-icons';
import { stationWebsite } from '../catalog/station-website';
import { DirectoryKey, directoryText } from './directory.labels';
import { Crumb, continentFor, locationUrl, nearbyStations, stationAncestry, geographicCrumbs } from './directory.model';
@Component({
  selector: 'app-station-page',
  imports: [RouterLink, IonIcon, StationArtworkComponent, StationCardComponent, DirectoryBreadcrumbsComponent],
  templateUrl: './station-page.html',
  styleUrl: './station-page.scss',
})
export class StationPage {
  readonly data = inject(CatalogService);
  readonly favorites = inject(FavoritesService);
  readonly player = inject(PlayerService);
  readonly icons = radioIcons;
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly station = computed(
    () => allStations(this.data.catalog()).find(s => s.id === this.params().get('stationId')) ?? null,
  );
  readonly network = computed(() => this.data.catalog()?.networks.find(n => n.id === this.station()?.networkId));
  readonly broadcaster = computed(() =>
    this.data.catalog()?.broadcasters?.find(b => b.id === this.network()?.broadcasterId),
  );
  readonly website = computed(() => (this.station() ? stationWebsite(this.station()!) : null));
  readonly languages = computed(
    () =>
      this.station()?.broadcastLanguages.map(code => ({
        code,
        name: this.data.catalog()?.languages.find(l => l.code === code)?.nativeName ?? code,
      })) ?? [],
  );
  readonly crumbs = computed<Crumb[]>(() => {
    const c = this.data.catalog(),
      s = this.station();
    if (!c || !s) return [];
    const location = stationAncestry(c, s).at(-1)?.id ?? '';
    return [
      ...geographicCrumbs(
        c,
        continentFor(s.countryCode),
        location,
        key => this.text(key),
        (id, name) => {
          const l = c.locations.find(node => node.id === id)!;
          return this.data.t(
            l.type === 'country' ? 'countries' : 'regions',
            l.type === 'country' ? l.countryCode : id,
            name,
          );
        },
      ),
      { name: s.name, url: ['/radios', s.id], kind: 'station', current: true },
    ];
  });
  readonly fields = computed(() => {
    const s = this.station(),
      c = this.data.catalog();
    if (!s || !c) return [];
    return stationAncestry(c, s).map(l => ({
      id: l.id,
      label: this.text(
        ({ country: 'country', state: 'region', district: 'district', locality: 'locality' } as const)[l.type],
      ),
      value: this.data.t(
        l.type === 'country' ? 'countries' : 'regions',
        l.type === 'country' ? l.countryCode : l.id,
        l.name,
      ),
      url: locationUrl(c, l.id),
    }));
  });
  readonly related = computed(() =>
    this.station() && this.data.catalog() ? nearbyStations(this.data.catalog()!, this.station()!) : [],
  );
  readonly eligibility = computed(() => (this.station() ? this.player.eligibility(this.station()!) : null));
  readonly action = computed<DirectoryKey>(() =>
    this.station() && this.player.stateFor(this.station()!) === 'playing'
      ? 'pause'
      : this.station() && this.player.stateFor(this.station()!) === 'error'
        ? 'retry'
        : 'play',
  );
  readonly broadcastType = computed(() =>
    this.station()?.delivery === 'online'
      ? uiLabel(this.data.locale(), 'onlineRadio')
      : (this.station()?.delivery.toUpperCase() ?? ''),
  );
  readonly shortLanguages = computed(() =>
    this.languages()
      .slice(0, 3)
      .map(l => l.name)
      .join(' · '),
  );
  readonly languageName = (language: { name: string }) => language.name;
  text(key: DirectoryKey) {
    return directoryText(this.data.locale(), key);
  }
  genre(id: string) {
    return this.data.t('categories', id, this.data.catalog()?.categories.find(g => g.id === id)?.name ?? id);
  }
  constructor() {
    effect(() => this.title.setTitle((this.station()?.name ?? this.text('notFound')) + ' · RadioBee'));
  }
}
