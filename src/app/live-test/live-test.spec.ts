import { localTechnicalMode, liveLeads } from './live-test.config';
import { streamEligibility, technicalStreamEligibility } from '../catalog/stream-eligibility';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Catalog } from '../catalog/catalog.models';
import { CatalogService } from '../catalog/catalog.service';
import { LIVE_TEST_ENABLED } from './live-test.config';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
describe('Isolated local technical tests', () => {
  it('requires explicit non-production configuration and a loopback host', () => {
    expect(localTechnicalMode(false, true, 'localhost')).toBe(true);
    expect(localTechnicalMode(false, true, '127.0.0.1')).toBe(true);
    expect(localTechnicalMode(true, true, 'localhost')).toBe(false);
    expect(localTechnicalMode(false, false, 'localhost')).toBe(false);
    expect(localTechnicalMode(false, true, 'actionanand.github.io')).toBe(false);
  });
  it('separates technical eligibility from editorial approval without altering metadata', () => {
    for (const lead of liveLeads) {
      const original = JSON.stringify(lead);
      expect(technicalStreamEligibility(lead, { available: true, supports: () => true }).status).toBe('ready');
      expect(streamEligibility(lead, { available: true, supports: () => true }).status).not.toBe('ready');
      expect(JSON.stringify(lead)).toBe(original);
      expect(lead.streams[0].rightsStatus).toBe('unconfirmed');
      expect(lead.streams[0].verificationStatus).toBe('unverified');
    }
    expect(
      technicalStreamEligibility(
        { ...liveLeads[0], streams: [{ ...liveLeads[0].streams[0], url: 'http://unsafe.test/audio' }] },
        { available: true, supports: () => true },
      ).status,
    ).toBe('invalidStream');
  });
  for (const enabled of [false, true])
    it(`gates technical requests (${enabled}) and never changes normal play enforcement`, async () => {
      const audio = document.createElement('audio');
      vi.spyOn(audio, 'play').mockResolvedValue();
      const load = vi.fn(async () => undefined);
      TestBed.configureTestingModule({
        providers: [
          { provide: LIVE_TEST_ENABLED, useValue: enabled },
          { provide: CatalogService, useValue: { catalog: signal<Catalog | null>(null) } },
          { provide: MEDIA_ENGINE, useValue: { audio, load, clear: () => undefined, supports: () => true } },
        ],
      });
      const player = TestBed.inject(PlayerService);
      await player.play(liveLeads[0]);
      expect(load).not.toHaveBeenCalled();
      await player.playTechnical('arbitrary-url');
      expect(load).not.toHaveBeenCalled();
      await player.playTechnical('lab-sooriyan');
      expect(load).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) {
        expect(player.technicalTest()).toBe(true);
        audio.dispatchEvent(new Event('playing'));
        expect(player.state()).toBe('playing');
        player.pause();
        await player.resume();
        expect(load).toHaveBeenCalledTimes(2);
      }
      player.stop();
      expect(player.technicalTest()).toBe(false);
    });
});
