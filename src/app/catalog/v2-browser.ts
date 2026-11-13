import { Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { CatalogService } from './catalog.service';
import { ancestry, browseV2, initialBrowse, locationMembership, BrowseSelection } from './catalog-v2';
import { StationCardComponent } from './station-card';
import { ThemeService } from '../theme/theme.service';
import { FavoritesService } from './favorites.service';
import { PlayerService } from '../player/player.service';
import { Catalog, emptyFilters, filterStations } from './catalog.models';
import { uiLabel } from './catalog.ui';
@Component({
  selector: 'app-v2-browser',
  imports: [StationCardComponent],
  template: ` <section [attr.lang]="data.locale()" [attr.aria-label]="label('Browse', 'உலாவு', 'अन्वेषणम्')">
    <h2>{{ label('Explore stations', 'நிலையங்களை ஆராயுங்கள்', 'केन्द्राणि अन्विष्यन्ताम्') }}</h2>
    <button (click)="data.refresh()" [disabled]="data.loading()" [attr.aria-busy]="data.loading()">
      {{ label('Refresh catalogue', 'பட்டியலைப் புதுப்பி', 'सूचीं नवीकुरु') }}
    </button>
    @if (data.error()) {
      <p role="alert">{{ data.error() }}</p>
    }
    @if (data.cached()) {
      <p role="status">
        {{ label('Using saved catalogue', 'சேமித்த பட்டியல் பயன்பாட்டில்', 'सञ्चिता सूची प्रयुज्यते') }}
      </p>
    }
    @if (data.storageWarning()) {
      <p role="status" data-warning="storage">{{ storageNotice() }}</p>
    }
    @if (favorites.warning()) {
      <p role="status" data-warning="favorites">{{ favoritesNotice() }}</p>
    }
    <nav [attr.aria-label]="label('Location breadcrumbs', 'இட வழிகாட்டி', 'स्थानपथः')">
      <button (click)="set('location', '')">{{ label('World', 'உலகம்', 'विश्वम्') }}</button>
      @for (node of trail(); track node.id) {
        <span aria-hidden="true"> / </span
        ><button
          (click)="set('location', node.id)"
          [attr.aria-current]="node.id === selection().location ? 'location' : null">
          {{ place(node.id, node.name) }}
        </button>
      }
    </nav>
    <div class="quick-filters">
      <button data-category="favorites" [attr.aria-pressed]="favoritesOnly()" (click)="favoritesOnly.update(toggle)">
        {{ label('Favorites', 'விருப்பங்கள்', 'प्रियाणि') }}
      </button>
      <button [attr.aria-pressed]="listenNowOnly()" (click)="listenNowOnly.update(toggle)">
        {{ label('Listen now', 'இப்போது கேளுங்கள்', 'इदानीं शृणु') }}
      </button>
      @if (hasFilters()) {
        <button type="button" (click)="reset()">
          {{ label('Clear filters', 'வடிகட்டிகளை நீக்கு', 'शोधकान् पुनः स्थापय') }}
        </button>
      }
    </div>
    <div class="primary-controls">
      <label
        >{{ label('Search stations', 'நிலையங்களைத் தேடு', 'केन्द्रान्वेषणम्')
        }}<input #search type="search" [value]="query()" (input)="query.set(value($event))"
      /></label>
      <label
        >{{ label('UI language', 'இடைமுக மொழி', 'अन्तरफलकभाषा')
        }}<select
          data-control="locale"
          [attr.aria-label]="label('UI language', 'இடைமுக மொழி', 'अन्तरफलकभाषा')"
          [value]="data.locale()"
          (change)="data.setLocale(value($event))">
          <option value="en">English</option>
          <option value="ta">தமிழ்</option>
          <option value="sa">संस्कृतम्</option>
        </select></label
      >
      <label
        >{{ label('Theme', 'தோற்றம்', 'वर्णयोजना')
        }}<select
          data-control="theme"
          [attr.aria-label]="label('Theme', 'தோற்றம்', 'वर्णयोजना')"
          [value]="theme.mode()"
          (change)="theme.set(value($event))">
          <option value="automatic">{{ label('Automatic', 'தானியங்கி', 'स्वयम्') }}</option>
          <option value="light">{{ label('Light', 'பகல்', 'प्रकाशः') }}</option>
          <option value="dark">{{ label('Dark', 'இரவு', 'अन्धकारः') }}</option>
        </select></label
      >
    </div>
    <details>
      <summary>{{ label('Refine stations', 'நிலையங்களை வடிகட்டு', 'केन्द्राणि परिशोधय') }}</summary>
      <div class="facets">
        <label
          >{{ label('Location', 'இடம்', 'स्थानम्')
          }}<select
            data-control="location"
            [attr.aria-label]="label('Location', 'இடம்', 'स्थानम्')"
            [value]="selection().location"
            (change)="set('location', value($event))">
            <option value="">{{ label('All countries', 'அனைத்து நாடுகள்', 'सर्वदेशाः') }}</option>
            @if (trail().length) {
              <option [value]="selection().location">
                {{ place(selection().location, trail()[trail().length - 1].name) }}
              </option>
            }
            @for (node of children(); track node.id) {
              <option [value]="node.id">{{ place(node.id, node.name) }} · {{ population().get(node.id) }}</option>
            }
          </select></label
        >
        @for (control of controls(); track control.key) {
          <label
            >{{ control.label
            }}<select
              [attr.aria-label]="control.label"
              [value]="selection()[control.key]"
              (change)="set(control.key, value($event))">
              <option value="">{{ label('All', 'அனைத்தும்', 'सर्वे') }}</option>
              @for (option of control.options; track option.id) {
                <option [value]="option.id">{{ option.name }}</option>
              }
            </select></label
          >
        }
        <label
          >{{ label('Sort', 'வரிசை', 'क्रमः')
          }}<select [value]="selection().sort" (change)="set('sort', value($event))">
            @for (option of sorts; track option) {
              <option [value]="option">{{ sortLabel(option) }}</option>
            }
          </select></label
        >
        <label
          >{{ label('Group', 'தொகுப்பு', 'समूहः')
          }}<select [value]="grouping()" (change)="grouping.set(value($event))">
            <option value="none">{{ label('None', 'இல்லை', 'नास्ति') }}</option>
            <option value="network">{{ label('Network', 'வலையமைப்பு', 'प्रसारणजालम्') }}</option>
            <option value="broadcaster">{{ label('Broadcaster', 'ஒலிபரப்பாளர்', 'प्रसारकः') }}</option>
          </select></label
        >
      </div>
    </details>
    <p role="status">
      @if (rows().length) {
        {{ rows().length }} {{ label('stations', 'நிலையங்கள்', 'केन्द्राणि') }}
      } @else {
        {{
          label(
            'No stations match these filters. Clear filters to explore the catalogue.',
            'இந்த வடிகட்டிகளுக்குப் பொருந்தும் நிலையங்கள் இல்லை. பட்டியலைக் காண வடிகட்டிகளை நீக்கவும்.',
            'एतैः शोधकैः केन्द्राणि न लब्धानि। सूचीदर्शनाय शोधकान् पुनः स्थापय।'
          )
        }}
      }
    </p>
    @for (group of sections(); track group.id) {
      @if (group.name) {
        <h3>{{ group.name }}</h3>
      }
      <div class="cards">
        @for (station of group.stations; track station.id) {
          <div>
            <app-station-card [station]="station" />
            <div
              class="chips"
              role="group"
              [attr.aria-label]="label('Documented languages', 'ஆவணப்படுத்தப்பட்ட மொழிகள்', 'प्रलेखितभाषाः')">
              @if (station.languageProfile?.classification === 'multilingual') {
                <span>{{ label('Multilingual', 'பல்மொழி', 'बहुभाषिकम्') }}</span>
              }
              @for (code of station.broadcastLanguages; track code) {
                <button
                  [attr.aria-pressed]="selection().language === code"
                  (click)="set('language', selection().language === code ? '' : code)">
                  {{ language(code) }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    }
  </section>`,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }
    summary {
      min-height: 44px;
      line-height: 44px;
      cursor: pointer;
    }
    button,
    input,
    select {
      min-height: 44px;
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0.5rem;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-width: 0;
    }
    .quick-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-block: 0.5rem;
    }
    .primary-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      margin-block: 0.5rem;
    }
    .primary-controls label:first-child {
      grid-column: 1 / -1;
    }
    .facets {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-block: 1rem;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
      gap: 1rem;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-block: 0.5rem;
    }
    .cards > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .cards app-station-card {
      display: block;
      flex: 1;
    }
    .chips button[aria-pressed='true'] {
      outline: 2px solid var(--ink);
    }
    button:focus-visible,
    input:focus-visible,
    summary:focus-visible,
    select:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
  `,
})
export class V2BrowserComponent {
  readonly player = inject(PlayerService);
  readonly listenNowOnly = signal(false);
  readonly favorites = inject(FavoritesService);
  readonly favoritesOnly = signal(false);
  readonly query = signal('');
  readonly toggle = (value: boolean) => !value;
  readonly theme = inject(ThemeService);
  readonly data = inject(CatalogService);
  readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  readonly selection = linkedSignal<Catalog | null, BrowseSelection>({
    source: () => this.data.catalog(),
    computation: (catalog, previous) => {
      const current = previous?.value ?? { ...initialBrowse };
      return {
        ...current,
        location: catalog && locationMembership(catalog).has(current.location) ? current.location : '',
      };
    },
  });
  readonly hasFilters = computed(
    () =>
      !!this.query().trim() ||
      this.favoritesOnly() ||
      this.listenNowOnly() ||
      this.grouping() !== 'none' ||
      Object.entries(this.selection()).some(([key, value]) => value !== initialBrowse[key as keyof BrowseSelection]),
  );
  reset() {
    this.selection.set({ ...initialBrowse });
    this.query.set('');
    this.favoritesOnly.set(false);
    this.listenNowOnly.set(false);
    this.grouping.set('none');
    this.search()?.nativeElement.focus();
  }
  storageNotice() {
    return this.label(
      this.data.storageWarning(),
      'சேமித்த பட்டியல் அல்லது விருப்ப அமைப்புகளை அணுக முடியவில்லை. இவ்வமர்வில் பயன்பாட்டைத் தொடரலாம்.',
      'सञ्चितसूची अथवा अभिरुचयः न उपलब्धाः। अस्मिन् सत्रे उपयोगः सम्भवति।',
    );
  }
  favoritesNotice() {
    return uiLabel(this.data.locale(), 'favoritesWarning');
  }
  readonly grouping = signal('none');
  readonly sorts = [
    'name',
    'country',
    'region',
    'district',
    'network',
    'broadcaster',
    'language',
    'genre',
    'availability',
  ];
  label(en: string, ta: string, sa: string) {
    return this.data.locale() === 'ta' ? ta : this.data.locale() === 'sa' ? sa : en;
  }
  value(event: Event) {
    const target = event.target;
    return target instanceof HTMLSelectElement || target instanceof HTMLInputElement ? target.value : '';
  }
  set(key: keyof BrowseSelection, value: string) {
    if (key === 'location' && value && !this.population().has(value)) return;
    this.selection.update(s => ({ ...s, [key]: value }));
  }
  place(id: string, fallback: string) {
    const c = this.data.catalog();
    const node = c?.locations.find(l => l.id === id);
    return this.data.t(
      node?.type === 'country' ? 'countries' : 'regions',
      node?.type === 'country' ? node.countryCode : id,
      fallback,
    );
  }
  language(code: string) {
    const language = this.data.catalog()?.languages.find(l => l.code === code);
    return language ? this.data.languageName(language) : code;
  }
  sortLabel(key: string) {
    const i = this.sorts.indexOf(key);
    return this.label(
      ['Name', 'Country', 'State / Region', 'District', 'Network', 'Broadcaster', 'Language', 'Genre', 'Availability'][
        i
      ],
      ['பெயர்', 'நாடு', 'மாநிலம்', 'மாவட்டம்', 'வலையமைப்பு', 'ஒலிபரப்பாளர்', 'மொழி', 'வகை', 'கிடைக்கும் நிலை'][i],
      ['नाम', 'देशः', 'प्रदेशः', 'जनपदः', 'प्रसारणजालम्', 'प्रसारकः', 'भाषा', 'वर्गः', 'उपलब्धता'][i],
    );
  }
  readonly trail = computed(() =>
    this.data.catalog() ? ancestry(this.data.catalog()!, this.selection().location) : [],
  );
  readonly population = computed(() =>
    this.data.catalog() ? locationMembership(this.data.catalog()!) : new Map<string, number>(),
  );
  readonly children = computed(
    () =>
      this.data
        .catalog()
        ?.locations.filter(l => l.parentId === (this.selection().location || null) && this.population().has(l.id)) ??
      [],
  );
  readonly controls = computed(() => {
    const c = this.data.catalog()!;
    return [
      {
        key: 'availability' as const,
        label: this.label('Stream metadata', 'ஓடைத் தகவல்', 'प्रवाहविवरणम्'),
        options: [
          {
            id: 'stream-bearing',
            name: this.label('With stream candidates', 'ஓடை இணைப்புகள் உள்ளவை', 'प्रवाहसङ्केतयुक्तानि'),
          },
          { id: 'discovery-only', name: this.label('Discovery only', 'கண்டறிதல் மட்டும்', 'अन्वेषणमात्रम्') },
        ],
      },
      {
        key: 'language' as const,
        label: this.label('Language', 'மொழி', 'भाषा'),
        options: c.languages.map(l => ({ id: l.code, name: this.data.languageName(l) })),
      },
      {
        key: 'classification' as const,
        label: this.label('Language profile', 'மொழி வகை', 'भाषाप्रकारः'),
        options: [
          { id: 'multilingual', name: this.label('Multilingual', 'பல்மொழி', 'बहुभाषिकम्') },
          { id: 'single-language', name: this.label('Single language', 'ஒரு மொழி', 'एकभाषिकम्') },
          { id: 'unknown', name: this.label('Unknown', 'தெரியவில்லை', 'अज्ञातम्') },
        ],
      },
      {
        key: 'genre' as const,
        label: this.label('Genre', 'வகை', 'वर्गः'),
        options: c.categories.map(g => ({ id: g.id, name: this.data.t('categories', g.id, g.name) })),
      },
      {
        key: 'theme' as const,
        label: this.label('Content theme', 'உள்ளடக்கப் பொருள்', 'विषयः'),
        options: c.programmeThemes ?? [],
      },
      { key: 'network' as const, label: this.label('Network', 'வலையமைப்பு', 'प्रसारणजालम्'), options: c.networks },
      {
        key: 'broadcaster' as const,
        label: this.label('Broadcaster', 'ஒலிபரப்பாளர்', 'प्रसारकः'),
        options: c.broadcasters ?? [],
      },
    ];
  });
  readonly rows = computed(() => {
    const catalog = this.data.catalog();
    if (!catalog) return [];
    // Reuse existing station/alias/network/location search semantics.
    const matches = new Set(filterStations(catalog, { ...emptyFilters, search: this.query() }).map(s => s.id));
    return browseV2(catalog, this.selection()).filter(
      s =>
        matches.has(s.id) &&
        (!this.listenNowOnly() || this.player.eligibility(s).status === 'ready') &&
        (!this.favoritesOnly() || this.favorites.has(s.id)),
    );
  });
  readonly sections = computed(() => {
    const c = this.data.catalog()!;
    const map = new Map<string, { id: string; name: string; stations: ReturnType<typeof browseV2> }>();
    for (const s of this.rows()) {
      const n = c.networks.find(n => n.id === s.networkId)!;
      const id =
        this.grouping() === 'none'
          ? 'all'
          : this.grouping() === 'broadcaster' && n.broadcasterId
            ? 'broadcaster:' + n.broadcasterId
            : 'network:' + n.id;
      const name =
        id === 'all'
          ? ''
          : id.startsWith('broadcaster:')
            ? (c.broadcasters?.find(b => b.id === n.broadcasterId)?.name ?? n.name)
            : n.name;
      const group = map.get(id) ?? { id, name, stations: [] };
      group.stations.push(s);
      map.set(id, group);
    }
    return [...map.values()];
  });
}
