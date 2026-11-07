import { TestBed } from '@angular/core/testing';
import { THEME_KEY, THEME_STORAGE, ThemeService } from './theme.service';
describe('RadioBee theme preferences', () => {
  let change: (event: MediaQueryListEvent) => void;
  let systemDark = false;
  const set = vi.fn(async (_value: string) => undefined);
  beforeEach(() => {
    localStorage.clear();
    systemDark = false;
    set.mockClear();
    vi.stubGlobal('matchMedia', () => ({
      matches: systemDark,
      addEventListener: (_type: string, cb: typeof change) => {
        change = cb;
      },
      removeEventListener: vi.fn(),
    }));
    TestBed.configureTestingModule({
      providers: [{ provide: THEME_STORAGE, useValue: { get: async () => ({ value: null }), set } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('ion-palette-dark');
  });
  it('defaults to automatic and responds to OS changes', async () => {
    const theme = TestBed.inject(ThemeService);
    await theme.loaded;
    TestBed.tick();
    expect(theme.mode()).toBe('automatic');
    expect(theme.dark()).toBe(false);
    change({ matches: true } as MediaQueryListEvent);
    TestBed.tick();
    expect(theme.dark()).toBe(true);
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
    change({ matches: false } as MediaQueryListEvent);
    TestBed.tick();
    expect(theme.dark()).toBe(false);
  });
  for (const mode of ['light', 'dark'] as const)
    it(`forces ${mode} independently of OS changes and persists it`, async () => {
      const theme = TestBed.inject(ThemeService);
      await theme.loaded;
      theme.set(mode);
      change({ matches: mode === 'light' } as MediaQueryListEvent);
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();
      expect(theme.dark()).toBe(mode === 'dark');
      expect(localStorage.getItem(THEME_KEY)).toBe(mode);
      expect(set).toHaveBeenCalledWith(mode);
      expect(document.documentElement.style.colorScheme).toBe(mode);
    });
  it('restores a synchronous cache before Preferences resolves without overwriting a new selection', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    let resolve!: (value: { value: string }) => void;
    TestBed.overrideProvider(THEME_STORAGE, { useValue: { get: () => new Promise(r => (resolve = r)), set } });
    const theme = TestBed.inject(ThemeService);
    expect(theme.dark()).toBe(true);
    theme.set('light');
    resolve({ value: 'dark' });
    await theme.loaded;
    expect(theme.mode()).toBe('light');
  });
  it('restores native/shared preferences and updates the startup cache', async () => {
    TestBed.overrideProvider(THEME_STORAGE, { useValue: { get: async () => ({ value: 'dark' }), set } });
    const theme = TestBed.inject(ThemeService);
    await theme.loaded;
    expect(theme.dark()).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
  it('normalizes invalid modes and retains session operation when persistence fails', async () => {
    TestBed.overrideProvider(THEME_STORAGE, {
      useValue: {
        get: async () => {
          throw Error('Storage');
        },
        set: async () => {
          throw Error('Storage');
        },
      },
    });
    const theme = TestBed.inject(ThemeService);
    await theme.loaded;
    theme.set('invalid');
    expect(theme.mode()).toBe('automatic');
    theme.set('dark');
    expect(theme.dark()).toBe(true);
    expect(theme.warning()).toBe(true);
  });
});
