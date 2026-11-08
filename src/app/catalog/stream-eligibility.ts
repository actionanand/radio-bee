import { Station, Stream, Source } from './catalog.models';
import { environment } from '../../environments/environment';
import { RadioApiConfig } from '../../environments/radio-api.config';

export type StreamStatus =
  | 'noStream'
  | 'verificationPending'
  | 'permissionPending'
  | 'streamUnavailable'
  | 'invalidStream'
  | 'incompatibleStream'
  | 'playerUnavailable'
  | 'ready';
export interface PlayerCapabilities {
  available: boolean;
  supports: (format: string) => boolean;
}
export interface StreamEligibility {
  status: StreamStatus;
  stream: Stream | null;
}
export interface StreamPreference {
  sources?: readonly Source[];
  outcomes?: ReadonlyMap<string, 'playing' | 'failed'>;
}

/** One policy for cards and the player boundary. Listing review never grants playback permission. */
export function streamEligibility(
  station: Pick<Station, 'streams' | 'discovery'>,
  player: PlayerCapabilities,
  policy: RadioApiConfig = environment.RadioApi,
  preference: StreamPreference = {},
): StreamEligibility {
  if (station.discovery || !station.streams.length) return { status: 'noStream', stream: null };
  const ready = eligibleStreams(station, player, policy, preference)[0];
  if (ready) return { status: 'ready', stream: ready };
  const statuses = station.streams.map(stream => streamStatus(stream, player, policy));
  const priority: StreamStatus[] = [
    'playerUnavailable',
    'incompatibleStream',
    'invalidStream',
    'permissionPending',
    'verificationPending',
    'streamUnavailable',
  ];
  return { status: priority.find(status => statuses.includes(status))!, stream: null };
}
export function technicalStreamEligibility(
  station: Pick<Station, 'streams' | 'discovery'>,
  player: PlayerCapabilities,
  policy: RadioApiConfig = environment.RadioApi,
): StreamEligibility {
  // Compatibility alias, not a separate permission bypass. Injected callers pass their policy explicitly.
  return streamEligibility(station, player, policy);
}
function streamStatus(stream: Stream, player: PlayerCapabilities, policy: RadioApiConfig): StreamStatus {
  if (stream.directListening?.status === 'restricted') return 'permissionPending';
  if (policy.CheckVerificationStatus) {
    if (stream.verificationStatus === 'unavailable') return 'streamUnavailable';
    if (
      stream.verificationStatus !== 'verified' &&
      !(policy.AllowUnverified && stream.verificationStatus === 'unverified')
    )
      return 'verificationPending';
  }
  if (
    policy.CheckRightsStatus &&
    (stream.rightsStatus !== 'permission-granted' ||
      (stream.directListening && stream.directListening.status !== 'allowed'))
  )
    return 'permissionPending';
  try {
    const url = new URL(stream.url);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return 'invalidStream';
  } catch {
    return 'invalidStream';
  }
  if (!['mp3', 'aac', 'hls'].includes(stream.format)) return 'incompatibleStream';
  if (!player.available) return 'playerUnavailable';
  if (!player.supports(stream.format)) return 'incompatibleStream';
  return 'ready';
}

/** Ranking is evidence of technical preference, never a rights/verification grant. */
export function eligibleStreams(
  station: Pick<Station, 'streams' | 'discovery'>,
  player: PlayerCapabilities,
  policy: RadioApiConfig = environment.RadioApi,
  preference: StreamPreference = {},
): Stream[] {
  if (station.discovery) return [];
  const score = (stream: Stream) => {
    const outcome = preference.outcomes?.get(stream.url);
    const source = preference.sources?.find(source => source.id === stream.sourceId);
    return (
      (outcome === 'playing' ? 1000 : outcome === 'failed' ? -1000 : 0) +
      (stream.verificationStatus === 'verified' ? 100 : stream.verificationStatus === 'unavailable' ? -100 : 0) +
      (source && ['official', 'broadcaster'].includes(source.kind) ? 20 : 0)
    );
  };
  return station.streams
    .filter(stream => streamStatus(stream, player, policy) === 'ready')
    .map((stream, index) => ({ stream, index, score: score(stream) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.stream);
}
