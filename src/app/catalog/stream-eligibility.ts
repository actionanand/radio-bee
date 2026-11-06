import { Station, Stream } from './catalog.models';

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

/** One policy for cards and the player boundary. Listing review never grants playback permission. */
export function streamEligibility(station: Pick<Station, 'streams'>, player: PlayerCapabilities): StreamEligibility {
  return selectStream(station, player, true);
}
export function technicalStreamEligibility(
  station: Pick<Station, 'streams'>,
  player: PlayerCapabilities,
): StreamEligibility {
  return selectStream(station, player, false);
}
function selectStream(
  station: Pick<Station, 'streams'>,
  player: PlayerCapabilities,
  editorial: boolean,
): StreamEligibility {
  if (!station.streams.length) return { status: 'noStream', stream: null };
  const evaluate = (stream: Stream): StreamStatus => {
    if (editorial && stream.verificationStatus === 'unavailable') return 'streamUnavailable';
    if (editorial && stream.verificationStatus !== 'verified') return 'verificationPending';
    if (editorial && stream.rightsStatus !== 'permission-granted') return 'permissionPending';
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
  };
  const results = station.streams.map(stream => ({ status: evaluate(stream), stream }));
  const ready = results.find(result => result.status === 'ready');
  if (ready) return ready;
  // Prefer the most actionable blocker; an unavailable alternative never hides an approved candidate.
  const priority: StreamStatus[] = [
    'playerUnavailable',
    'incompatibleStream',
    'invalidStream',
    'permissionPending',
    'verificationPending',
    'streamUnavailable',
  ];
  const blocked = priority.map(status => results.find(result => result.status === status)).find(Boolean)!;
  return { status: blocked.status, stream: null };
}
