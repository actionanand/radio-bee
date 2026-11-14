import { TestBed } from '@angular/core/testing';
import { validateV2 } from '../catalog/catalog-v2';
import { v2Fixture } from '../catalog/testing/v2.fixture';
import {
  HOME_PREFERENCES_STORAGE,
  HOME_STATIONS_MAX,
  HOME_STATIONS_MIN,
  HomePreferencesService,
} from './home-preferences.service';

describe('V2 personal Home station settings', () => {
  const catalog = validateV2(structuredClone(v2Fixture));

  it('accepts three through configured maximum distinct playable stations only', async () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: HOME_PREFERENCES_STORAGE,
        useValue: { get: async () => ({ value: null }), set: vi.fn(async () => undefined) },
      }],
    });
    const preferences = TestBed.inject(HomePreferencesService);
    await preferences.loaded;
    const eligible = preferences.eligible(catalog).map(station => station.id);
    expect(HOME_STATIONS_MIN).toBe(3);
    expect(HOME_STATIONS_MAX).toBe(10);
    expect(eligible.length).toBeGreaterThan(10);
    expect(HomePreferencesService.validIds(eligible.slice(0, 2), new Set(eligible))).toBe(false);
    expect(HomePreferencesService.validIds(eligible.slice(0, 3), new Set(eligible))).toBe(true);
    expect(HomePreferencesService.validIds(eligible.slice(0, 10), new Set(eligible))).toBe(true);
    expect(HomePreferencesService.validIds(eligible.slice(0, 11), new Set(eligible))).toBe(false);
    expect(HomePreferencesService.validIds([eligible[0], eligible[0], eligible[1]], new Set(eligible))).toBe(false);
    expect(HomePreferencesService.validIds(['not-a-station', ...eligible.slice(0, 2)], new Set(eligible))).toBe(false);
    expect(preferences.save(eligible.slice(0, 2), catalog)).toBe(false);
    expect(preferences.enabled()).toBe(false);
    expect(preferences.selection(catalog)).toEqual([]);
  });

  it('persists a valid override, restores API default on off, and keeps selection for re-enable', async () => {
    let saved = '';
    const set = vi.fn(async (value: string) => { saved = value; });
    TestBed.configureTestingModule({
      providers: [{
        provide: HOME_PREFERENCES_STORAGE,
        useValue: { get: async () => ({ value: null }), set },
      }],
    });
    const preferences = TestBed.inject(HomePreferencesService);
    await preferences.loaded;
    const ids = preferences.eligible(catalog).slice(0, 3).map(station => station.id);
    expect(preferences.save(ids, catalog)).toBe(true);
    expect(preferences.enabled()).toBe(true);
    expect(preferences.selection(catalog)).toEqual(ids);
    preferences.disable();
    expect(preferences.enabled()).toBe(false);
    expect(preferences.selection(catalog)).toEqual([]);
    expect(preferences.state().ids).toEqual(ids);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(set).toHaveBeenCalled();
    expect(JSON.parse(saved)).toEqual({ enabled: false, ids });
  });

  it('rejects corrupted saved preferences instead of displaying fewer than three stations', async () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: HOME_PREFERENCES_STORAGE,
        useValue: {
          get: async () => ({ value: JSON.stringify({ enabled: true, ids: ['unknown', 'unknown'] }) }),
          set: vi.fn(async () => undefined),
        },
      }],
    });
    const preferences = TestBed.inject(HomePreferencesService);
    await preferences.loaded;
    expect(preferences.warning()).toBe(true);
    expect(preferences.enabled()).toBe(false);
    expect(preferences.selection(catalog)).toEqual([]);
  });
});
