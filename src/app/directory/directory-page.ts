import { DirectoryBreadcrumbsComponent } from './directory-breadcrumbs';
import { DirectorySelectComponent } from './directory-select';
import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { CatalogService } from '../catalog/catalog.service';
import { allStations, emptyFilters, filterStations } from '../catalog/catalog.models';
import { BrowseSelection, browseV2, initialBrowse, locationMembership } from '../catalog/catalog-v2';
import { FavoritesService } from '../catalog/favorites.service';
import { PlayerService } from '../player/player.service';
import { StationCardComponent } from '../catalog/station-card';
import { RadioIllustrationComponent } from '../home/radio-illustration';
import { RadioBeeLoaderComponent } from '../shared/radio-bee-loader';
import { NotFoundPage } from '../not-found/not-found-page';
import {
  ContinentId,
  Crumb,
  continentFor,
  featuredStations,
  geographicScope,
  locationUrl,
  geographicCrumbs,
} from './directory.model';
import { DirectoryKey, directoryText } from './directory.labels';

@Component({
  selector: 'app-directory-page',
  imports: [
    RouterLink,
    StationCardComponent,
    RadioIllustrationComponent,
    RadioBeeLoaderComponent,
    NotFoundPage,
    DirectoryBreadcrumbsComponent,
    DirectorySelectComponent,
  ],
  templateUrl: './directory-page.html',
  styleUrl: './directory-page.scss',
})
export class DirectoryPage {
  readonly data = inject(CatalogService);
  readonly favorites = inject(FavoritesService);
  readonly player = inject(PlayerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  readonly routeData = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly url = toSignal(this.route.url, { initialValue: this.route.snapshot.url });
  readonly mode = computed(() => String(this.routeData()['mode']));
  readonly facet = computed(() => this.params().get('facetId'));
  readonly scope = computed(() =>
    this.data.catalog() && this.mode() === 'world'
      ? geographicScope(
          this.data.catalog()!,
          this.url()
            .map(s => s.path)
            .slice(1),
        )
      : { valid: true, continent: null, location: '' },
  );
  text(key: DirectoryKey) {
    return directoryText(this.data.locale(), key);
  }
  place(id: string, name: string) {
    const node = this.data.catalog()?.locations.find(l => l.id === id);
    return this.data.t(
      node?.type === 'country' ? 'countries' : 'regions',
      node?.type === 'country' ? node.countryCode : id,
      name,
    );
  }
  readonly index = computed(
    () => ['languages', 'genres', 'artists', 'networks', 'broadcasters'].includes(this.mode()) && !this.facet(),
  );
  readonly registry = computed(() => {
    const c = this.data.catalog();
    if (!c) return [];
    switch (this.mode()) {
      case 'languages':
        return c.languages.map(l => ({ id: l.code, name: this.data.languageName(l) }));
      case 'genres':
        return c.categories.map(g => ({ id: g.id, name: this.data.t('categories', g.id, g.name) }));
      case 'artists':
        return (c.artists ?? []).map(a => ({ ...a, name: this.data.artistName(a) }));
      case 'networks':
        return c.networks;
      case 'broadcasters':
        return c.broadcasters ?? [];
      default:
        return [];
    }
  });
  readonly valid = computed(
    () =>
      this.mode() !== 'notFound' &&
      this.scope().valid &&
      (!this.facet() || this.registry().some(row => row.id === this.facet())),
  );
  readonly heading = computed(() => {
    if (!this.valid()) return this.text('notFound');
    if (this.facet()) return this.registry().find(r => r.id === this.facet())?.name ?? this.text('notFound');
    const scope = this.scope(),
      c = this.data.catalog();
    if (scope.location && c) {
      const l = c.locations.find(l => l.id === scope.location)!;
      return this.place(l.id, l.name);
    }
    return this.text((scope.continent ?? this.mode()) as DirectoryKey);
  });
  readonly crumbs = computed<Crumb[]>(() => {
    const c = this.data.catalog(),
      scope = this.scope();
    if (!c || this.mode() !== 'world' || !scope.valid) return [];
    const result = geographicCrumbs(
      c,
      scope.continent,
      scope.location,
      key => this.text(key),
      (id, name) => this.place(id, name),
    );
    const url = scope.location
      ? locationUrl(c, scope.location)
      : scope.continent
        ? ['/world', scope.continent]
        : ['/world'];
    // A collapsed terminal locality still has its own scope; keep the district link and label the current context.
    if (result.at(-1)?.url.join('/') !== url.join('/'))
      return [...result, { name: this.text('locality'), url, kind: 'locality', current: true }];
    return result.map((crumb, index) => ({ ...crumb, current: index === result.length - 1 }));
  });
  readonly filters = computed<BrowseSelection>(() => {
    const result = { ...initialBrowse };
    for (const key of Object.keys(result) as (keyof BrowseSelection)[])
      result[key] = this.query().get(key) ?? result[key];
    result.location = this.scope().location;
    const field =
      this.mode() === 'languages'
        ? 'language'
        : this.mode() === 'genres'
          ? 'genre'
          : this.mode() === 'artists'
            ? 'artist'
            : this.mode() === 'networks'
              ? 'network'
              : this.mode() === 'broadcasters'
                ? 'broadcaster'
                : null;
    if (field && this.facet()) result[field] = this.facet()!;
    if (!this.sorts.includes(result.sort)) result.sort = 'name';
    return result;
  });
  readonly rows = computed(() => {
    const c = this.data.catalog();
    if (!c || !this.valid() || this.index()) return [];
    if (this.mode() === 'home') return featuredStations(c, this.data.homeStationIds());
    const searched = new Set(
      filterStations(c, { ...emptyFilters, search: this.query().get('q') ?? '' }).map(s => s.id),
    );
    return browseV2(c, this.filters()).filter(
      s =>
        searched.has(s.id) &&
        (!this.scope().continent || continentFor(s.countryCode) === this.scope().continent) &&
        (this.mode() !== 'favorites' || this.favorites.has(s.id)) &&
        (this.mode() !== 'listenNow' || this.player.eligibility(s).status === 'ready'),
    );
  });
  readonly destinations = computed(() => {
    const c = this.data.catalog();
    if (!c || !this.valid()) return [];
    const all = allStations(c),
      scope = this.scope(),
      counts = locationMembership(c);
    if (this.index())
      return this.registry()
        .map(item => ({
          id: item.id,
          name: item.name,
          url: ['/' + this.mode(), item.id],
          count: all.filter(s =>
            this.mode() === 'languages'
              ? s.broadcastLanguages.includes(item.id)
              : this.mode() === 'genres'
                ? s.genres.includes(item.id)
                : this.mode() === 'artists'
                  ? (s.artistIds?.includes(item.id) ?? false)
                  : this.mode() === 'networks'
                    ? s.networkId === item.id
                    : c.networks.find(n => n.id === s.networkId)?.broadcasterId === item.id,
          ).length,
        }))
        .filter(d => d.count > 0);
    if (this.mode() !== 'world') return [];
    if (!scope.continent)
      return ([...new Set(all.map(s => continentFor(s.countryCode)))] as ContinentId[]).map(id => ({
        id,
        name: this.text(id),
        url: ['/world', id],
        count: all.filter(s => continentFor(s.countryCode) === id).length,
      }));
    return c.locations
      .filter(
        l =>
          l.parentId === (scope.location || null) &&
          counts.has(l.id) &&
          continentFor(l.countryCode) === scope.continent,
      )
      .map(l => ({ id: l.id, name: this.place(l.id, l.name), url: locationUrl(c, l.id), count: counts.get(l.id)! }));
  });
  readonly sorts = [
    'name',
    'country',
    'region',
    'district',
    'network',
    'broadcaster',
    'language',
    'genre',
    'artist',
    'availability',
  ];
  readonly controls = computed<
    { key: keyof BrowseSelection; label: string; options: { id: string; name: string }[] }[]
  >(() => {
    const c = this.data.catalog();
    return c
      ? (
          [
            {
              key: 'language',
              label: this.text('language'),
              options: c.languages.map(l => ({ id: l.code, name: this.data.languageName(l) })),
            },
            {
              key: 'genre',
              label: this.text('genre'),
              options: c.categories.map(g => ({ id: g.id, name: this.data.t('categories', g.id, g.name) })),
            },
            { key: 'theme', label: this.text('themeFilter'), options: c.programmeThemes ?? [] },
            {
              key: 'artist',
              label: this.text('artist'),
              options: (c.artists ?? []).map(a => ({ ...a, name: this.data.artistName(a) })),
            },
            { key: 'network', label: this.text('network'), options: c.networks },
            { key: 'broadcaster', label: this.text('broadcaster'), options: c.broadcasters ?? [] },
            {
              key: 'classification',
              label: this.text('classification'),
              options: [
                { id: 'multilingual', name: this.text('multilingual') },
                { id: 'single-language', name: this.text('single') },
                { id: 'unknown', name: this.text('unknown') },
              ],
            },
            {
              key: 'availability',
              label: this.text('availability'),
              options: [
                { id: 'stream-bearing', name: this.text('streamBearing') },
                { id: 'discovery-only', name: this.text('discoveryOnly') },
              ],
            },
          ] satisfies { key: keyof BrowseSelection; label: string; options: { id: string; name: string }[] }[]
        ).map(control => ({ ...control, options: [{ id: '', name: this.text('all') }, ...control.options] }))
      : [];
  });
  readonly sortOptions = computed(() => this.sorts.map(id => ({ id, name: this.sortName(id) })));
  readonly groupOptions = computed(() => [
    { id: 'none', name: this.text('none') },
    { id: 'network', name: this.text('network') },
    { id: 'artist', name: this.text('artist') },
    { id: 'broadcaster', name: this.text('broadcaster') },
  ]);
  readonly groups = computed(() => {
    const c = this.data.catalog(),
      group = this.query().get('group');
    const result = new Map<string, { id: string; name: string; stations: ReturnType<typeof browseV2> }>();
    for (const s of this.rows()) {
      if (group === 'artist') {
        for (const artistId of s.artistIds?.length ? s.artistIds : ['']) {
          const artist = c?.artists?.find(a => a.id === artistId);
          const id = artist ? 'artist:' + artist.id : 'artist:other';
          const name = artist ? this.data.artistName(artist) : this.text('otherArtistStations');
          const entry = result.get(id) ?? { id, name, stations: [] };
          entry.stations.push(s);
          result.set(id, entry);
        }
        continue;
      }
      const n = c!.networks.find(n => n.id === s.networkId)!;
      const id =
        group === 'broadcaster' && n.broadcasterId
          ? 'broadcaster:' + n.broadcasterId
          : group === 'network' || group === 'broadcaster'
            ? 'network:' + n.id
            : 'all';
      const name =
        id === 'all'
          ? ''
          : id.startsWith('broadcaster:')
            ? (c?.broadcasters?.find(b => b.id === n.broadcasterId)?.name ?? n.name)
            : n.name;
      const row = result.get(id) ?? { id, name, stations: [] };
      row.stations.push(s);
      result.set(id, row);
    }
    return [...result.values()];
  });
  sortName(key: string) {
    return this.text(key as DirectoryKey);
  }
  constructor() {
    effect(() => this.title.setTitle(this.heading() + ' · RadioBee'));
  }
  fixed(key: string) {
    return (
      !!this.facet() &&
      (
        {
          languages: 'language',
          genres: 'genre',
          artists: 'artist',
          networks: 'network',
          broadcasters: 'broadcaster',
        } as Record<string, string>
      )[this.mode()] === key
    );
  }
  filter(key: string, value: string) {
    void this.router.navigate([this.router.url.split('?')[0]], {
      queryParams: { ...this.route.snapshot.queryParams, [key]: value || null },
      replaceUrl: true,
    });
  }
  reset() {
    void this.router
      .navigate([this.router.url.split('?')[0]], { queryParams: {}, replaceUrl: true })
      .then(() => this.document.querySelector<HTMLInputElement>('input[type=search]')?.focus());
  }
}
