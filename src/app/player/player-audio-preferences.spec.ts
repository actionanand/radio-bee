import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { MEDIA_ENGINE } from './media-engine';
import { PlayerService, PLAYER_AUDIO_STORAGE, PLAYER_AUDIO_STORAGE_KEY } from './player.service';

describe('Persisted player audio preferences', () => {
  const setup = (storage: {
    get: (options: { key: string }) => Promise<{ value: string | null }>;
    set: (options: { key: string; value: string }) => Promise<void>;
  }) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { catalog: signal(null) } },
        { provide: MEDIA_ENGINE, useValue: null },
        { provide: PLAYER_AUDIO_STORAGE, useValue: storage },
      ],
    });
    return TestBed.inject(PlayerService);
  };

  it('restores a saved volume and mute state across a fresh player instance', async () => {
    const values = new Map<string, string>();
    const storage = {
      get: async ({ key }: { key: string }) => ({ value: values.get(key) ?? null }),
      set: async ({ key, value }: { key: string; value: string }) => { values.set(key, value); },
    };
    const first = setup(storage);
    await first.preferencesLoaded;
    first.setVolume(0.45);
    first.toggleMute();
    await vi.waitFor(() => expect(values.get(PLAYER_AUDIO_STORAGE_KEY)).toBe(
      JSON.stringify({ volume: 0.45, muted: true }),
    ));
    first.stop();
    TestBed.resetTestingModule();
    const restored = setup(storage);
    await restored.preferencesLoaded;
    expect(restored.volume()).toBe(0.45);
    expect(restored.muted()).toBe(true);
  });

  it('does not overwrite a user edit if a slow storage read finishes later', async () => {
    let finish!: (value: { value: string | null }) => void;
    const get = () => new Promise<{ value: string | null }>(resolve => { finish = resolve; });
    const saved: string[] = [];
    const player = setup({
      get,
      set: async ({ value }) => { saved.push(value); },
    });
    player.setVolume(0.65);
    player.toggleMute();
    finish({ value: JSON.stringify({ volume: 0.2, muted: false }) });
    await player.preferencesLoaded;
    expect(player.volume()).toBe(0.65);
    expect(player.muted()).toBe(true);
    await vi.waitFor(() => expect(saved.at(-1)).toBe(JSON.stringify({ volume: 0.65, muted: true })));
  });

  it('ignores malformed saved records and remains functional when storage is denied', async () => {
    const player = setup({
      get: async () => ({ value: JSON.stringify({ volume: 4, muted: true }) }),
      set: async () => { throw Error('Storage unavailable'); },
    });
    await player.preferencesLoaded;
    expect(player.volume()).toBe(0.8);
    expect(player.muted()).toBe(false);
    player.setVolume(0.25);
    player.toggleMute();
    expect(player.volume()).toBe(0.25);
    expect(player.muted()).toBe(true);
  });
});
