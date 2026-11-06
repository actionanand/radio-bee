import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import { Station } from '../catalog/catalog.models';
export function localTechnicalMode(production: boolean, enabled: boolean, hostname: string): boolean {
  return !production && enabled && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}
export const LIVE_TEST_ENABLED = new InjectionToken<boolean>('LIVE_TEST_ENABLED', {
  providedIn: 'root',
  factory: () =>
    localTechnicalMode(
      environment.production,
      environment.liveStreamTests,
      typeof location === 'undefined' ? '' : location.hostname,
    ),
});
export const liveLeads: Station[] = [
  {
    id: 'lab-sooriyan',
    name: 'Sooriyan FM Sri Lanka',
    countryCode: 'LK',
    networkId: 'sooriyan-lk',
    url: 'https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden',
    format: 'mp3',
    website: 'https://www.sooriyanfm.lk/',
  },
  {
    id: 'lab-vasantham',
    name: 'Vasantham FM Sri Lanka',
    countryCode: 'LK',
    networkId: 'vasantham-lk',
    url: 'https://cp12.serverse.com/proxy/vasanthamfm?mp=/stream',
    format: 'mp3',
    website: 'https://www.vasanthamfm.lk/',
  },
  {
    id: 'lab-air',
    name: 'AIR Nagercoil Kumari FM 101 — official channel lead',
    countryCode: 'IN',
    networkId: 'akashvani',
    url: 'https://radio.wavespb.com/live/10c64309264eb009/10c64309264eb009.m3u8',
    format: 'hls',
    website: 'https://akashvani.gov.in/radio/live.php',
  },
  {
    id: 'lab-third-party',
    name: 'Suryan 93.5 third-party lead — identity unconfirmed',
    countryCode: 'IN',
    networkId: 'unconfirmed',
    url: 'https://tamil.crabdance.com:8002/2',
    format: 'mp3',
    website: null,
  },
].map(lead => ({
  id: lead.id,
  name: lead.name,
  countryCode: lead.countryCode,
  networkId: lead.networkId,
  regionId: null,
  districtId: null,
  localityId: null,
  broadcastLanguages: [],
  genres: [],
  delivery: 'online',
  coverage: 'global',
  listingStatus: 'candidate',
  frequencyMHz: null,
  website: lead.website,
  sourceIds: [],
  notes: 'Controlled technical lead only. Human listening and publication terms remain unconfirmed.',
  streams: [
    {
      id: lead.id + '-stream',
      url: lead.url,
      format: lead.format,
      verificationStatus: 'unverified',
      rightsStatus: 'unconfirmed',
      lastVerifiedAt: null,
      sourceId: 'user-supplied-technical-lead',
    },
  ],
}));
