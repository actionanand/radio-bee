import { TestBed } from '@angular/core/testing';
import { CatalogService } from '../catalog/catalog.service';
import { fixture } from '../catalog/catalog.fixture';
import { validateCatalog } from '../catalog/catalog.validation';
import { FAVORITES_STORAGE, FavoritesService } from '../catalog/favorites.service';
import { SnackbarComponent } from './snackbar';
import { SnackbarService } from './snackbar.service';

describe('Reusable favorites snackbar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows one notice at a time, restarts its timer and dismisses it accessibly', () => {
    vi.useFakeTimers();
    const snackbar = TestBed.inject(SnackbarService);
    snackbar.show({ kind: 'text', message: 'First message' }, 'info', 3000);
    const first = snackbar.current()!;
    vi.advanceTimersByTime(1400);
    snackbar.show({ kind: 'text', message: 'Second message' }, 'success', 3000);
    expect(snackbar.current()?.id).not.toBe(first.id);
    vi.advanceTimersByTime(1700);
    expect(snackbar.current()?.content).toEqual({ kind: 'text', message: 'Second message' });
    vi.advanceTimersByTime(1300);
    expect(snackbar.current()).toBeNull();

    snackbar.show({ kind: 'text', message: 'Dismiss me' });
    const view = TestBed.createComponent(SnackbarComponent);
    view.detectChanges();
    const host = view.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy();
    expect(host.querySelector('.message')?.textContent).toBe('Dismiss me');
    const close = host.querySelector<HTMLButtonElement>('button');
    expect(close?.getAttribute('aria-label')).toBe('Dismiss notification');
    close?.click();
    view.detectChanges();
    expect(snackbar.current()).toBeNull();
  });

  it('localizes added/removed messages and refreshes the same toast when toggled quickly', async () => {
    let persisted = '';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FAVORITES_STORAGE,
          useValue: {
            get: async () => ({ value: null }),
            set: async ({ value }: { value: string }) => {
              persisted = value;
            },
          },
        },
      ],
    });
    const catalog = TestBed.inject(CatalogService);
    catalog.catalog.set(validateCatalog(structuredClone(fixture)));
    const station = catalog.catalog()!.stations[0];
    const snackbar = TestBed.inject(SnackbarService);
    const favorites = TestBed.inject(FavoritesService);
    await favorites.loaded;
    const view = TestBed.createComponent(SnackbarComponent);
    const host = view.nativeElement as HTMLElement;

    await favorites.toggle(station.id);
    view.detectChanges();
    expect(favorites.has(station.id)).toBe(true);
    expect(snackbar.current()?.tone).toBe('success');
    expect(host.querySelector('.message')?.textContent).toContain('Added to favorites');
    expect(host.querySelector('.message')?.textContent).toContain(catalog.stationName(station));
    expect(persisted).toContain(station.id);

    catalog.locale.set('ta');
    view.detectChanges();
    expect(host.querySelector('.message')?.textContent).toContain('விருப்பங்களில் சேர்க்கப்பட்டது');
    await favorites.toggle(station.id);
    view.detectChanges();
    expect(favorites.has(station.id)).toBe(false);
    expect(host.querySelector('.message')?.textContent).toContain('விருப்பங்களிலிருந்து நீக்கப்பட்டது');
    expect(JSON.parse(persisted)).toEqual([]);

    catalog.locale.set('sa');
    view.detectChanges();
    expect(host.querySelector('.message')?.textContent).toContain('प्रियेभ्यः निष्कासितम्');
  });

  it('warns when storage fails while keeping the in-session favorite', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FAVORITES_STORAGE,
          useValue: {
            get: async () => ({ value: null }),
            set: async () => {
              throw new Error('Storage unavailable');
            },
          },
        },
      ],
    });
    const catalog = TestBed.inject(CatalogService);
    catalog.catalog.set(validateCatalog(structuredClone(fixture)));
    const favorites = TestBed.inject(FavoritesService);
    const snackbar = TestBed.inject(SnackbarService);
    await favorites.toggle(catalog.catalog()!.stations[0].id);
    const view = TestBed.createComponent(SnackbarComponent);
    view.detectChanges();
    expect(favorites.has(catalog.catalog()!.stations[0].id)).toBe(true);
    expect(favorites.warning()).toBe(true);
    expect(snackbar.current()?.tone).toBe('warning');
    expect((view.nativeElement as HTMLElement).querySelector('.warning .message')?.textContent).toContain(
      'Favorites could not be saved.',
    );
  });
});
