import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { STRICT_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Catalog, Station } from '../catalog/catalog.models';
import { fixture } from '../catalog/catalog.fixture';
import { validateCatalog } from '../catalog/catalog.validation';
import { CatalogService } from '../catalog/catalog.service';
import { MEDIA_ENGINE, MediaEngine } from './media-engine';
import { PlayerService } from './player.service';
import type { Mock } from 'vitest';
// Retain the Stage 3–6 strict-policy contract; Stage 7 separately tests the new environment defaults.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: RADIO_API_CONFIG, useValue: STRICT_RADIO_API_CONFIG }] });
});
describe('Functional player service', () => {
  let c: Catalog;
  let station: Station;
  let audio: HTMLAudioElement;
  let load: Mock<MediaEngine['load']>;
  let clear: Mock<MediaEngine['clear']>;
  let player: PlayerService;
  let catalog: { catalog: ReturnType<typeof signal<Catalog>> };
  beforeEach(() => {
    c = validateCatalog(structuredClone(fixture));
    station = c.stations.find(s => s.streams.length)!;
    station.streams[0] = {
      ...station.streams[0],
      verificationStatus: 'verified',
      rightsStatus: 'permission-granted',
      format: 'mp3',
    };
    audio = document.createElement('audio');
    vi.spyOn(audio, 'play').mockResolvedValue();
    vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    load = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
    catalog = { catalog: signal(c) };
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: catalog },
        { provide: MEDIA_ENGINE, useValue: { audio, load, clear, supports: () => true } satisfies MediaEngine },
      ],
    });
    player = TestBed.inject(PlayerService);
  });
  afterEach(() => {
    player.stop();
    vi.useRealTimers();
  });
  it('loads and actually invokes audio play only on an approved selection', async () => {
    await player.play(station);
    expect(load).toHaveBeenCalledWith(station.streams[0]);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(player.state()).toBe('loading');
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('playing');
    player.pause();
    expect(player.state()).toBe('paused');
    await player.resume();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    player.stop();
    expect(player.station()).toBeNull();
  });
  it('rechecks catalogue rights rather than trusting a caller supplied station', async () => {
    c.stations.find(s => s.id === station.id)!.streams[0].rightsStatus = 'unconfirmed';
    await player.play({ ...station, streams: [{ ...station.streams[0], rightsStatus: 'permission-granted' }] });
    expect(load).not.toHaveBeenCalled();
  });
  it('handles browser permission rejection and allows retry', async () => {
    vi.mocked(audio.play).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await player.play(station);
    expect(player.error()).toBe('playbackBlocked');
    await player.resume();
    audio.dispatchEvent(new Event('playing'));
    expect(player.error()).toBe('');
    expect(player.state()).toBe('playing');
  });
  it('handles stream errors, buffering timeout, stop and volume', async () => {
    vi.useFakeTimers();
    await player.play(station);
    audio.dispatchEvent(new Event('error'));
    expect(player.state()).toBe('error');
    await player.resume();
    audio.dispatchEvent(new Event('playing'));
    audio.dispatchEvent(new Event('waiting'));
    await vi.advanceTimersByTimeAsync(20000);
    expect(player.error()).toBe('playbackTimeout');
    player.setVolume(0.35);
    expect(audio.volume).toBe(0.35);
    player.toggleMute();
    expect(audio.muted).toBe(true);
    player.stop();
    expect(player.state()).toBe('idle');
  });
  it('does not start a superseded selection after asynchronous loading', async () => {
    let release!: () => void;
    load.mockImplementationOnce(() => new Promise<void>(r => (release = r)));
    const pending = player.play(station);
    player.stop();
    release();
    await pending;
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('stops when the loaded catalogue revokes stream permission', async () => {
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const next = structuredClone(c);
    next.stations.find(s => s.id === station.id)!.streams[0].rightsStatus = 'unconfirmed';
    catalog.catalog.set(next);
    TestBed.tick();
    expect(player.error()).toBe('playbackPermissionChanged');
  });
  it('preserves mute and volume when switching stations, using one audio element', async () => {
    player.setVolume(0.35);
    player.toggleMute();
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    await player.toggle(station);
    expect(player.stateFor(station)).toBe('paused');
    await player.toggle(station);
    expect(load).toHaveBeenCalledOnce();
    const next = { ...structuredClone(station), id: 'second-approved' };
    catalog.catalog.set({ ...c, stations: [...c.stations, next] });
    await player.play(next);
    expect(load).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBe(0.35);
    expect(audio.muted).toBe(true);
    expect(player.station()?.id).toBe(next.id);
    player.toggleMute();
    expect(audio.volume).toBe(0.35);
    expect(audio.muted).toBe(false);
  });
  it('stops when a refreshed catalogue removes the selected stream', async () => {
    await player.play(station);
    audio.dispatchEvent(new Event('playing'));
    const next = structuredClone(c);
    next.stations.find(candidate => candidate.id === station.id)!.streams = [];
    catalog.catalog.set(next);
    TestBed.tick();
    expect(player.error()).toBe('playbackPermissionChanged');
    expect(clear).toHaveBeenCalledTimes(2);
  });
  it('ignores a late playing event after pause or stop', async () => {
    await player.play(station);
    player.pause();
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('paused');
    player.stop();
    audio.dispatchEvent(new Event('playing'));
    expect(player.state()).toBe('idle');
  });
});
