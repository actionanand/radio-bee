import { computed } from '@angular/core';
import { DirectorySelectComponent } from './directory-select';
import { afterNextRender, Injector } from '@angular/core';
import { Component, DestroyRef, ElementRef, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { DOCUMENT, Location, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import {
  homeOutline,
  earthOutline,
  languageOutline,
  musicalNotesOutline,
  personOutline,
  heartOutline,
  playCircleOutline,
  gitNetworkOutline,
  businessOutline,
  menuOutline,
  closeOutline,
  searchOutline,
} from 'ionicons/icons';
import { CatalogService } from '../catalog/catalog.service';
import { FavoritesService } from '../catalog/favorites.service';
import { uiLabel } from '../catalog/catalog.ui';
import { ThemeService } from '../theme/theme.service';
import { DirectoryKey, directoryText } from './directory.labels';

@Component({
  selector: 'app-directory-shell',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IonIcon,
    DirectorySelectComponent,
  ],
  templateUrl: './directory-shell.html',
  styleUrl: './directory-shell.scss',
  host: { class: 'ion-page', '(document:ionBackButton)': 'back($event)' },
})
export class DirectoryShellComponent {
  readonly data = inject(CatalogService);
  readonly favorites = inject(FavoritesService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  readonly drawer = viewChild<ElementRef<HTMLDialogElement>>('drawer');
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  readonly content = viewChild<ElementRef<HTMLElement>>('content');
  readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly query = linkedSignal(() => this.params().get('q') ?? '');
  readonly canBack = signal(false);
  readonly drawerOpen = signal(false);
  readonly icons = { menuOutline, closeOutline, searchOutline };
  readonly localeOptions = [
    { id: 'en', name: 'English' },
    { id: 'ta', name: 'தமிழ்' },
    { id: 'sa', name: 'संस्कृतम्' },
  ];
  readonly themeOptions = computed(() => [
    { id: 'automatic', name: this.text('automatic') },
    { id: 'light', name: this.text('light') },
    { id: 'dark', name: this.text('dark') },
  ]);
  readonly links: { key: DirectoryKey; path: string; icon: string }[] = [
    { key: 'home', path: '/home', icon: homeOutline },
    { key: 'world', path: '/world', icon: earthOutline },
    { key: 'languages', path: '/languages', icon: languageOutline },
    { key: 'genres', path: '/genres', icon: musicalNotesOutline },
    { key: 'artists', path: '/artists', icon: personOutline },
    { key: 'favorites', path: '/favorites', icon: heartOutline },
    { key: 'listenNow', path: '/listen-now', icon: playCircleOutline },
    { key: 'networks', path: '/networks', icon: gitNetworkOutline },
    { key: 'broadcasters', path: '/broadcasters', icon: businessOutline },
  ];
  private restoreOnClose = true;
  private lastPath = '';
  private searches = 0;
  private cursor = -1;
  private entries: number[] = [];
  private positions = new Map<number, number>();
  private restored: number | undefined;
  constructor() {
    void this.data.start();
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.restored = event.restoredState?.navigationId;
      if (!(event instanceof NavigationEnd)) return;
      const path = event.urlAfterRedirects.split('?')[0],
        position = this.restored === undefined ? undefined : this.positions.get(this.restored);
      if (position !== undefined) this.cursor = position;
      else if (this.cursor < 0 || path !== this.lastPath) {
        this.entries = this.entries.slice(0, this.cursor + 1);
        this.entries.push(event.id);
        this.cursor++;
      }
      this.entries[this.cursor] = event.id;
      this.positions.set(event.id, this.cursor);
      this.canBack.set(this.cursor > 0);
      if (path !== this.lastPath) {
        this.closeMenu(false);
        if (!this.searches)
          afterNextRender(
            () => {
              this.content()?.nativeElement.scrollTo?.({ top: 0 });
              this.focusHeading();
            },
            { injector: this.injector },
          );
      }
      this.lastPath = path;
    });
    const win = this.document.defaultView;
    const resized = () => {
      if (win && win.innerWidth >= 900 && this.drawer()?.nativeElement.open) {
        this.closeMenu(false);
        this.focusHeading();
      }
    };
    win?.addEventListener('resize', resized);
    inject(DestroyRef).onDestroy(() => win?.removeEventListener('resize', resized));
  }
  text(key: DirectoryKey) {
    return directoryText(this.data.locale(), key);
  }
  value(event: Event) {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }
  searchInput(event: Event) {
    this.query.set(this.value(event));
    this.search();
  }
  search(event?: Event) {
    event?.preventDefault();
    const path = this.router.url.split('?')[0];
    this.searches++;
    void this.router
      .navigate(['/world'], {
        queryParams: { q: this.query() || null },
        replaceUrl: path === '/world',
      })
      .finally(() => this.searches--);
  }
  openMenu() {
    this.restoreOnClose = true;
    this.drawer()?.nativeElement.showModal();
    this.drawerOpen.set(true);
    this.closeButton()?.nativeElement.focus();
  }
  closeMenu(restore = true) {
    const dialog = this.drawer()?.nativeElement;
    if (!dialog?.open) return;
    this.restoreOnClose = restore;
    dialog.close();
    this.drawerOpen.set(false);
  }
  closed() {
    this.drawerOpen.set(false);
    if (this.restoreOnClose) this.menuButton()?.nativeElement.focus();
  }
  backdrop(event: MouseEvent) {
    const dialog = this.drawer()?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
      this.closeMenu();
  }
  trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const dialog = this.drawer()?.nativeElement;
    if (!dialog?.open) return;
    const controls = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
    const first = controls[0],
      last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (this.document.activeElement === first || !dialog.contains(this.document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  navigationSelected() {
    this.closeMenu(false);
    afterNextRender(() => this.focusHeading(), { injector: this.injector });
  }
  focusHeading() {
    this.content()?.nativeElement.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
  skip(event: Event) {
    event.preventDefault();
    this.focusHeading();
  }
  back(event: Event) {
    const register = (event as CustomEvent<{ register?: (priority: number, handler: () => void) => void }>).detail
      ?.register;
    if (this.drawer()?.nativeElement.open) register?.(1000, () => this.closeMenu());
    else if (this.canBack()) register?.(10, () => this.location.back());
  }
  storageNotice() {
    return this.data.locale() === 'en' ? this.data.storageWarning() : this.text('storage');
  }
  favoritesNotice() {
    return uiLabel(this.data.locale(), 'favoritesWarning');
  }
}
