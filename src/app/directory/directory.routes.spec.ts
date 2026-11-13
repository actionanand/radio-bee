import { ThemeService, THEME_STORAGE } from '../theme/theme.service';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { provideIonicAngular } from '@ionic/angular';
import { routes } from '../app.routes';
import { CatalogService, CATALOG_URL, CATALOG_STORAGE } from '../catalog/catalog.service';
import { FavoritesService, FAVORITES_STORAGE } from '../catalog/favorites.service';
import { validateV2 } from '../catalog/catalog-v2';
import { v2Fixture } from '../catalog/testing/v2.fixture';
import { PlayerService } from '../player/player.service';
import { PlayerComponent } from '../player/player';
import { MEDIA_ENGINE } from '../player/media-engine';
import { DirectoryShellComponent } from './directory-shell';

@Component({ imports: [RouterOutlet, PlayerComponent], template: '<router-outlet/><app-player/>' })
class RootPlayerHostComponent {}
function setup(base = 'https://catalog.test/v2/') {
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  const load = vi.fn(async () => undefined),
    clear = vi.fn(),
    storage = { get: async () => ({ value: null }), set: async () => undefined };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideIonicAngular({ animated: false }),
      { provide: THEME_STORAGE, useValue: { get: async () => ({ value: null }), set: vi.fn(async () => undefined) } },
      { provide: CATALOG_URL, useValue: base },
      { provide: CATALOG_STORAGE, useValue: storage },
      { provide: FAVORITES_STORAGE, useValue: storage },
      { provide: MEDIA_ENGINE, useValue: { audio, load, clear, supports: () => true } },
    ],
  });
  const data = TestBed.inject(CatalogService);
  data.catalog.set(validateV2(structuredClone(v2Fixture)));
  data.homeStationIds.set(data.catalog()!.stations.slice(0, 13).map(s => s.id).reverse());
  vi.spyOn(data, 'start').mockResolvedValue();
  return { data, audio, load, clear };
}
const element = (h: RouterTestingHarness) => h.routeNativeElement as HTMLElement;
describe('Routable v2 directory', () => {
  it('renders only the API-provided Home identities in API order and all identities in World', async () => {
    setup();
    const h = await RouterTestingHarness.create('/home');
    const selected = TestBed.inject(CatalogService).homeStationIds();
    expect([...element(h).querySelectorAll<HTMLElement>('.station-card')].map(card => card.dataset['stationId'])).toEqual(selected);
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(13);
    expect(element(h).querySelector('app-directory-page > h2')?.textContent?.trim()).toBe('Featured Radios (13)');
    expect(element(h).querySelector('.selection-note')).toBeNull();
    expect(element(h).textContent).not.toContain('How these radios are selected');
    expect(element(h).querySelector('a.browse-all')?.getAttribute('href')).toBe('/world');
    await h.navigateByUrl('/world');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(117);
    expect(element(h).querySelector('[data-nav=world][aria-current=page]')).not.toBeNull();
  });
  it('localizes tuner and footer taglines when UI language changes', async () => {
    const { data } = setup();
    const h = await RouterTestingHarness.create('/home');
    const tunerTagline = () => element(h).querySelector('.tuner-brand p')?.textContent?.trim();
    const footerTagline = () => element(h).querySelector('.directory-shell footer span')?.textContent?.trim();
    expect(tunerTagline()).toBe('Stay tuned. Stay buzzing.');
    expect(footerTagline()).toBe('RadioBee · Stay tuned. Stay buzzing.');
    data.locale.set('ta');
    h.detectChanges();
    expect(tunerTagline()).toBe('இசையில் இணைவோம். இனிமையாய் ஒலிப்போம்.');
    expect(footerTagline()).toBe('RadioBee · இசையில் இணைவோம். இனிமையாய் ஒலிப்போம்.');
    data.locale.set('sa');
    h.detectChanges();
    expect(tunerTagline()).toBe('सदा शृणुत। मधुरं गुञ्जत।');
    expect(footerTagline()).toBe('RadioBee · सदा शृणुत। मधुरं गुञ्जत।');
  });
  it('shows animated loader on initial fetch and keeps stations visible during refresh', async () => {
    const { data } = setup();
    data.catalog.set(null);
    data.homeStationIds.set([]);
    data.loading.set(true);
    const h = await RouterTestingHarness.create('/home');
    expect(element(h).querySelector('app-radio-bee-loader .radio-loader[data-fetch-state="loading"]')).not.toBeNull();
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(0);
    data.catalog.set(validateV2(structuredClone(v2Fixture)));
    data.homeStationIds.set(data.catalog()!.stations.slice(0, 13).map(s => s.id));
    h.detectChanges();
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(13);
    expect(element(h).querySelector('app-radio-bee-loader.compact .radio-loader.is-loading')).not.toBeNull();
    data.loading.set(false);
    h.detectChanges();
    expect(element(h).querySelector('app-radio-bee-loader')).toBeNull();
  });
  it('keeps World station cards visible and animates the loader during refresh', async () => {
    const { data } = setup();
    const h = await RouterTestingHarness.create('/world');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(117);
    data.loading.set(true);
    h.detectChanges();
    expect(element(h).querySelector('app-radio-bee-loader.compact [data-fetch-state="loading"]')).not.toBeNull();
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(117);
    data.loading.set(false);
    h.detectChanges();
    expect(element(h).querySelector('app-radio-bee-loader')).toBeNull();
  });
  it('opens district deep links with all candidates and discovery identities', async () => {
    setup();
    const h = await RouterTestingHarness.create('/world/asia/in/in-tn/in-tn-kanyakumari');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(10);
    expect(element(h).querySelectorAll('.station-card.is-discovery')).toHaveLength(8);
    expect(element(h).querySelectorAll('.station-card .play')).toHaveLength(2);
    const crumbs = [...element(h).querySelectorAll('.breadcrumbs a')].map(a => a.getAttribute('href'));
    expect(crumbs).not.toContain('/world/asia/in/in-tn/in-tn-kanyakumari');
    expect(element(h).querySelector('.breadcrumbs [aria-current=page]')?.textContent).toBe('Kanyakumari');
  });
  it('shows canonical station metadata, linked breadcrumbs and 9 same-district identities', async () => {
    setup();
    const h = await RouterTestingHarness.create('/radios/air-nagercoil');
    const host = element(h);
    expect(host.querySelector('h1')?.textContent).toContain('Akashvani Nagercoil');
    expect(host.querySelector('.breadcrumbs a[href="/world/asia/in/in-tn/in-tn-kanyakumari"]')).not.toBeNull();
    expect(host.querySelectorAll('.cards .station-card')).toHaveLength(9);
    expect(host.querySelectorAll('app-station-page .station-intro app-station-artwork')).toHaveLength(1);
    expect(host.textContent).not.toContain('Frequency');
    expect(host.querySelector('a.website')?.getAttribute('href')).toMatch(/^https:/);
  });
  for (const locale of ['en', 'ta', 'sa'])
    it(locale + ': renders chevrons and a single Chennai district link before the current station', async () => {
      const { data } = setup();
      await data.setLocale(locale);
      const h = await RouterTestingHarness.create('/radios/big-chennai');
      const nav = element(h).querySelector('.breadcrumbs')!;
      expect(nav.querySelectorAll('ion-icon')).toHaveLength(4);
      expect([...nav.querySelectorAll('ion-icon')].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(
        true,
      );
      expect(nav.textContent).not.toContain('/');
      expect(nav.textContent).not.toContain('>');
      expect(nav.querySelector('a[href="/world/asia/in/in-tn/in-tn-chennai"]')).not.toBeNull();
      expect(nav.querySelector('a[href$="in-tn-chennai-chennai"]')).toBeNull();
      expect(nav.querySelector('[aria-current=page]')?.tagName).toBe('SPAN');
      expect(nav.querySelector('[aria-current=page]')?.textContent).toBe('BIG FM Chennai');
      (nav.querySelector('a[href="/world/asia/in/in-tn/in-tn-chennai"]') as HTMLAnchorElement).click();
      await h.fixture.whenStable();
      h.detectChanges();
      expect(element(h).querySelector('[data-station-id=suryan-chennai]')).not.toBeNull();
      expect(element(h).querySelector('[data-station-id=big-chennai]')).not.toBeNull();
    });
  it('marks directory pages current and keeps duplicate-named locality scope distinct from its district link', async () => {
    setup();
    const h = await RouterTestingHarness.create('/world/asia/in/in-tn/in-tn-chennai/in-tn-chennai-chennai');
    const nav = element(h).querySelector('.breadcrumbs')!;
    expect(nav.querySelector('a[href="/world/asia/in/in-tn/in-tn-chennai"]')?.textContent).toBe('Chennai');
    expect(nav.querySelector('[aria-current=page]')?.textContent).toBe('City / Locality');
    expect(TestBed.inject(Router).url).toContain('in-tn-chennai-chennai');
    await h.navigateByUrl('/world/asia/in/in-tn/in-tn-kanyakumari');
    expect(element(h).querySelector('.breadcrumbs [aria-current=page]')?.textContent).toBe('Kanyakumari');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(10);
  });
  it('uses only Ionic directory dropdowns and applies ionChange values to routes', async () => {
    setup();
    const h = await RouterTestingHarness.create('/world');
    const host = element(h);
    expect(host.querySelectorAll('select,option')).toHaveLength(0);
    expect(host.querySelectorAll('ion-select')).toHaveLength(12);
    const availability = host.querySelector('[data-filter=availability] ion-select')!;
    availability.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'discovery-only' }, bubbles: true }));
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/world?availability=discovery-only');
    expect(host.querySelectorAll('.station-card')).toHaveLength(46);
    for (const [key, value] of [
      ['sort', 'country'],
      ['group', 'network'],
    ]) {
      host
        .querySelector(`[data-filter=${key}] ion-select`)!
        .dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
      await h.fixture.whenStable();
      h.detectChanges();
      expect(new URL(TestBed.inject(Router).url, 'https://client.test').searchParams.get(key)).toBe(value);
    }
    expect(host.querySelectorAll('.station-card')).toHaveLength(46);
  });
  it('retains ThemeService and UI language persistence through Ionic change events', async () => {
    setup();
    const h = await RouterTestingHarness.create('/home');
    const theme = TestBed.inject(ThemeService);
    await theme.loaded;
    const localeWrite = vi.spyOn(TestBed.inject(CATALOG_STORAGE), 'set');
    element(h)
      .querySelector('[data-control=locale] ion-select')!
      .dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'ta' }, bubbles: true }));
    element(h)
      .querySelector('[data-control=theme] ion-select')!
      .dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'dark' }, bubbles: true }));
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(CatalogService).locale()).toBe('ta');
    expect(theme.mode()).toBe('dark');
    expect(localeWrite).toHaveBeenCalledWith({ key: 'radiobee.ui-language', value: 'ta' });
    expect(TestBed.inject(THEME_STORAGE).set).toHaveBeenCalledWith('dark');
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
  });
  it('shows frequencies only when documented in the actual catalogue', async () => {
    const { data } = setup();
    const station = data.catalog()!.stations.find(s => s.frequencyMHz !== null)!;
    const h = await RouterTestingHarness.create('/radios/' + station.id);
    expect(element(h).textContent).toContain('Frequency');
    expect(element(h).textContent).toContain(station.frequencyMHz + ' MHz');
  });
  for (const locale of ['en', 'ta', 'sa'])
    it(locale + ': header Search escapes district and scoped filters without losing input focus', async () => {
      const { data } = setup();
      await data.setLocale(locale);
      const h = await RouterTestingHarness.create('/world/asia/in/in-tn/in-tn-kanyakumari?availability=discovery-only');
      expect(element(h).querySelectorAll('.station-card')).toHaveLength(8);
      const input = element(h).querySelector('input[type=search]') as HTMLInputElement;
      input.focus();
      input.value = 'Sooriyan';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await h.fixture.whenStable();
      h.detectChanges();
      expect(TestBed.inject(Router).url).toBe('/world?q=Sooriyan');
      expect(element(h).querySelector('[data-station-id=sooriyan-srilanka]')).not.toBeNull();
      expect(element(h).querySelectorAll('.station-card')).toHaveLength(1);
      expect(document.activeElement).toBe(input);
      expect(element(h).querySelector('input[type=search]')).toBe(input);
      const shell = h.fixture.debugElement.query(By.directive(DirectoryShellComponent))
        .componentInstance as DirectoryShellComponent;
      expect(shell.canBack()).toBe(true);
      await h.navigateByUrl('/world/asia/in/in-tn/in-tn-kanyakumari?availability=discovery-only');
      expect(element(h).querySelectorAll('.station-card')).toHaveLength(8);
    });
  it('pushes global Search once, replaces subsequent queries and clears stale filters even in World', async () => {
    setup();
    const h = await RouterTestingHarness.create('/favorites');
    const location = TestBed.inject(Location),
      push = vi.spyOn(location, 'go'),
      replace = vi.spyOn(location, 'replaceState');
    const input = element(h).querySelector('input[type=search]') as HTMLInputElement;
    input.focus();
    input.value = 'Soor';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    expect(push).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    input.value = 'Sooriyan';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    expect(push).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/world?q=Sooriyan');
    await h.navigateByUrl('/world?availability=discovery-only&language=ta');
    input.value = 'Sooriyan';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.fixture.whenStable();
    h.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/world?q=Sooriyan');
    expect(element(h).querySelector('[data-station-id=sooriyan-srilanka]')).not.toBeNull();
  });
  it('uses links for names/artwork/details and never redirects Play', async () => {
    const { load } = setup();
    const h = await RouterTestingHarness.create('/world/asia/in/in-tn/in-tn-kanyakumari');
    const host = element(h);
    expect(host.querySelector('[data-station-id=air-nagercoil] h3 a')?.getAttribute('href')).toBe(
      '/radios/air-nagercoil',
    );
    expect(host.querySelector('[data-station-id=air-nagercoil] .artwork-link')?.getAttribute('href')).toBe(
      '/radios/air-nagercoil',
    );
    expect(host.querySelector('.thumbnail > app-station-artwork')).not.toBeNull();
    expect(host.querySelector('.artwork-link')?.childElementCount).toBe(0);
    (host.querySelector('[data-station-id=air-nagercoil] button.play') as HTMLButtonElement).click();
    await h.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/world/asia/in/in-tn/in-tn-kanyakumari');
    expect(load).toHaveBeenCalledOnce();
  });
  it('limits compact cards to three language labels and expands full documented languages on the station page', async () => {
    const { data } = setup();
    const station = data.catalog()!.stations.find(s => s.broadcastLanguages.length > 3)!;
    const h = await RouterTestingHarness.create('/world');
    const summary = element(h).querySelector(`[data-station-id="${station.id}"] .language-summary`)!.textContent!;
    expect(summary.split(' · ')).toHaveLength(3);
    expect(summary).toContain('+' + (station.broadcastLanguages.length - 3));
    await h.navigateByUrl('/radios/' + station.id);
    expect(element(h).querySelectorAll('.languages li')).toHaveLength(station.broadcastLanguages.length);
    expect(element(h).querySelector('app-station-page details summary')).not.toBeNull();
  });
  it('keeps Favorites persistence and focus after removing the final routed favorite', async () => {
    const { data } = setup();
    const favorites = TestBed.inject(FavoritesService);
    await favorites.loaded;
    await favorites.toggle(data.catalog()!.stations[0].id);
    const h = await RouterTestingHarness.create('/favorites');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(1);
    (element(h).querySelector('.favorite') as HTMLButtonElement).click();
    await h.fixture.whenStable();
    h.detectChanges();
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(0);
    expect(document.activeElement).toBe(element(h).querySelector('h1'));
  });
  it('keeps invalid station IDs and contradictory geographic paths safe', async () => {
    setup();
    const h = await RouterTestingHarness.create('/radios/no-such-radio');
    expect(element(h).textContent).toContain('not found');
    expect(element(h).querySelectorAll('.play')).toHaveLength(0);
    await h.navigateByUrl('/world/europe/in/in-tn');
    expect(element(h).textContent).toContain('not found');
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(0);
  });
  it('renders animated wildcard 404 instead of redirecting for unmatched v1 routes', async () => {
    const { data } = setup('https://catalog.test/v1/');
    data.catalog.set(null);
    const h = await RouterTestingHarness.create('/radios/air-nagercoil');
    expect(TestBed.inject(Router).url).toBe('/radios/air-nagercoil');
    expect(element(h).matches('app-not-found-page.ion-page')).toBe(true);
    expect(element(h).querySelector('.scene[data-signal-state="lost"]')).not.toBeNull();
    expect(element(h).querySelector('.scene .bee svg')).not.toBeNull();
    expect(element(h).querySelector('.readout')?.textContent?.trim()).toBe('404 MHz');
    expect(element(h).querySelector('a.btn')?.getAttribute('href')).toBe('/home');
    await h.navigateByUrl('/home');
    expect(element(h).querySelector('app-station-browser')).not.toBeNull();
  });

  it('renders animated wildcard 404 in v2 without changing the URL or the catalogue', async () => {
    const { data } = setup();
    const stationCount = data.catalog()!.stations.length;
    const h = await RouterTestingHarness.create('/this-page-does-not-exist');
    expect(TestBed.inject(Router).url).toBe('/this-page-does-not-exist');
    expect(element(h).querySelector('app-not-found-page')).not.toBeNull();
    expect(element(h).querySelector('.scene[data-signal-state="lost"]')).not.toBeNull();
    expect(element(h).querySelector('.scene .wing.back')).not.toBeNull();
    expect(element(h).querySelector('h1')?.textContent?.trim()).toBe('404');
    expect(element(h).textContent).toContain('Signal lost');
    expect(data.catalog()!.stations.length).toBe(stationCount);
    data.locale.set('ta');
    h.detectChanges();
    expect(element(h).textContent).toContain('சமிக்ஞை தொலைந்துவிட்டது');
    expect(element(h).querySelector('a.btn')?.textContent?.trim()).toBe('முகப்புக்குத் திரும்பு');
    data.locale.set('sa');
    h.detectChanges();
    expect(element(h).textContent).toContain('संकेतः लुप्तः');
    expect(element(h).querySelector('a.btn')?.textContent?.trim()).toBe('मुखपृष्ठं गच्छ');
    await h.navigateByUrl('/home');
    expect(element(h).querySelector('app-not-found-page')).toBeNull();
    expect(element(h).querySelectorAll('.station-card')).toHaveLength(13);
  });
  it('wraps keyboard focus inside the native mobile drawer in both directions', async () => {
    setup();
    const h = await RouterTestingHarness.create('/home');
    const shell = h.fixture.debugElement.query(By.directive(DirectoryShellComponent))
      .componentInstance as DirectoryShellComponent;
    const dialog = element(h).querySelector('dialog')!;
    dialog.open = true;
    const first = dialog.querySelector('button')!;
    const last = dialog.querySelector('a[data-nav=broadcasters]') as HTMLAnchorElement;
    first.focus();
    const reverse = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    shell.trapFocus(reverse);
    expect(reverse.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    shell.trapFocus(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    shell.trapFocus(escape);
    expect(escape.defaultPrevented).toBe(false);
  });
  it('uses Android Back for the modal drawer before route history, and restores focus', async () => {
    setup();
    const h = await RouterTestingHarness.create('/home');
    await h.navigateByUrl('/world');
    const shell = h.fixture.debugElement.query(By.directive(DirectoryShellComponent))
      .componentInstance as DirectoryShellComponent;
    const dialog = element(h).querySelector('dialog')!;
    Object.defineProperty(dialog, 'showModal', {
      value: () => {
        dialog.open = true;
      },
      configurable: true,
    });
    Object.defineProperty(dialog, 'close', {
      value: () => {
        dialog.open = false;
        dialog.dispatchEvent(new Event('close'));
      },
      configurable: true,
    });
    shell.openMenu();
    expect(dialog.open).toBe(true);
    const registrations: { priority: number; handler: () => void }[] = [];
    shell.back(
      new CustomEvent('ionBackButton', {
        detail: { register: (priority: number, handler: () => void) => registrations.push({ priority, handler }) },
      }),
    );
    expect(registrations[0].priority).toBe(1000);
    registrations[0].handler();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(element(h).querySelector('.mobile-brand button'));
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    registrations.length = 0;
    shell.back(
      new CustomEvent('ionBackButton', {
        detail: { register: (priority: number, handler: () => void) => registrations.push({ priority, handler }) },
      }),
    );
    expect(registrations[0].priority).toBe(10);
    registrations[0].handler();
    expect(back).toHaveBeenCalledOnce();
  });
  for (const locale of ['en', 'ta', 'sa'])
    it('supports navigation labels and metadata pages in ' + locale, async () => {
      const { data } = setup();
      await data.setLocale(locale);
      const h = await RouterTestingHarness.create('/radios/air-nagercoil');
      expect(element(h).querySelector('h1')?.textContent).toContain('Akashvani Nagercoil');
      expect(element(h).querySelector('.directory-shell')?.getAttribute('lang')).toBe(locale);
      expect(element(h).querySelectorAll('.desktop-nav nav a').length).toBeGreaterThanOrEqual(7);
    });
});
describe('Root player across directory navigation (controlled media adapter)', () => {
  it('keeps one player/audio/stream with volume, mute and diagnostics across all route types', async () => {
    const { data, audio, load, clear } = setup();
    const app = TestBed.createComponent(RootPlayerHostComponent);
    app.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/home');
    await app.whenStable();
    const player = TestBed.inject(PlayerService);
    const station = data.catalog()!.stations.find(s => s.id === 'air-nagercoil')!;
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    player.setVolume(0.35);
    player.toggleMute();
    const clears = clear.mock.calls.length,
      diagnostics = player.diagnostics().length;
    for (const path of [
      '/world/asia/in',
      '/world/asia/in/in-tn/in-tn-kanyakumari',
      '/radios/air-nagercoil',
      '/favorites',
      '/languages/ta',
      '/home',
    ]) {
      await router.navigateByUrl(path);
      await app.whenStable();
      app.detectChanges();
      expect(TestBed.inject(PlayerService)).toBe(player);
      expect(player.station()?.id).toBe(station.id);
      expect(player.state()).toBe('playing');
      expect(player.volume()).toBe(0.35);
      expect(player.muted()).toBe(true);
      expect(app.nativeElement.querySelectorAll('app-player')).toHaveLength(1);
      expect(app.nativeElement.querySelector('app-player section')).not.toBeNull();
    }
    expect(load).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledTimes(clears);
    expect(player.diagnostics().length).toBe(diagnostics);
    expect(TestBed.inject(MEDIA_ENGINE)?.audio).toBe(audio);
    player.pause();
    expect(player.state()).toBe('paused');
    player.stop();
    expect(player.station()).toBeNull();
  });
});
