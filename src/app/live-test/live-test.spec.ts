import { RADIO_API_CONFIG } from '../catalog/radio-api.config';
import { STRICT_RADIO_API_CONFIG, TECHNICAL_RADIO_API_CONFIG } from '../../environments/radio-api.config';
import { localTechnicalMode, LIVE_TEST_ENABLED } from './live-test.config';
import { streamEligibility as configuredEligibility, technicalStreamEligibility } from '../catalog/stream-eligibility';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { validateCatalog } from '../catalog/catalog.validation';
import { publishedFixture } from '../catalog/testing/published-1.2.fixture';
import { CatalogService } from '../catalog/catalog.service';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
const streamEligibility: typeof configuredEligibility = (station, player) =>
  configuredEligibility(station, player, STRICT_RADIO_API_CONFIG);
// Retain the Stage 3–6 strict-policy contract; Stage 7 separately tests the new environment defaults.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: RADIO_API_CONFIG, useValue: STRICT_RADIO_API_CONFIG }] });
});
describe('Isolated generic technical verification', () => {
  it('requires explicit non-production configuration and a loopback host', () => {
    expect(localTechnicalMode(false, true, 'localhost')).toBe(true);
    expect(localTechnicalMode(false, true, '127.0.0.1')).toBe(true);
    expect(localTechnicalMode(true, true, 'localhost')).toBe(false);
    expect(localTechnicalMode(false, false, 'localhost')).toBe(false);
    expect(localTechnicalMode(false, true, 'actionanand.github.io')).toBe(false);
  });
  it('checks every loaded candidate technically without granting production rights or altering metadata', () => {
    const catalog = validateCatalog(structuredClone(publishedFixture));
    for (const station of catalog.stations.filter(station => station.streams.length)) {
      const before = JSON.stringify(station);
      expect(technicalStreamEligibility(station, { available: true, supports: () => true }).status).toBe('ready');
      expect(streamEligibility(station, { available: true, supports: () => true }).status).not.toBe('ready');
      expect(JSON.stringify(station)).toBe(before);
    }
    const station = catalog.stations.find(station => station.streams.length)!;
    expect(
      technicalStreamEligibility(
        { ...station, streams: [{ ...station.streams[0], url: 'http://unsafe.test/audio' }] },
        { available: true, supports: () => true },
      ).status,
    ).toBe('invalidStream');
  });
  for (const enabled of [false, true])
    it(`gates catalogue-based technical selection (${enabled}) under the configured relaxed policy`, async () => {
      const catalog = validateCatalog(structuredClone(publishedFixture));
      const station = catalog.stations.find(station => station.id === 'sooriyan-srilanka')!;
      const audio = document.createElement('audio');
      vi.spyOn(audio, 'play').mockResolvedValue();
      vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
      const load = vi.fn(async () => undefined);
      TestBed.configureTestingModule({
        providers: [
          { provide: RADIO_API_CONFIG, useValue: TECHNICAL_RADIO_API_CONFIG },
          { provide: LIVE_TEST_ENABLED, useValue: enabled },
          { provide: CatalogService, useValue: { catalog: signal(catalog) } },
          { provide: MEDIA_ENGINE, useValue: { audio, load, clear: () => undefined, supports: () => true } },
        ],
      });
      const player = TestBed.inject(PlayerService);
      await player.playTechnical('arbitrary-url');
      await player.playTechnical(station.id, 'missing-stream');
      expect(load).not.toHaveBeenCalled();
      await player.playTechnical(station.id, 'sooriyan-official-candidate');
      expect(load).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) {
        expect(load).toHaveBeenCalledWith(station.streams.find(stream => stream.id === 'sooriyan-official-candidate'));
        audio.dispatchEvent(new Event('playing'));
        expect(player.state()).toBe('playing');
        player.pause();
        await player.resume();
        expect(load).toHaveBeenCalledTimes(1);
        expect(audio.play).toHaveBeenCalledTimes(2);
      }
      player.stop();
      expect(player.technicalTest()).toBe(false);
    });
});
