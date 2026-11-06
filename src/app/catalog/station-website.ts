import { Station } from './catalog.models';
export function stationWebsite(station: Pick<Station, 'website'> & Partial<Pick<Station, 'streams'>>): string | null {
  try {
    const url = new URL(station.website ?? '');
    const media =
      station.streams?.some(stream => stream.url === url.href) || /\.(?:m3u8|mp3|aac)(?:$|\/)/i.test(url.pathname);
    const api = /^(?:api\.|api-)/i.test(url.hostname) || /(?:^|\/)api(?:\/|$)/i.test(url.pathname);
    return url.protocol === 'https:' && !url.username && !url.password && !media && !api ? url.href : null;
  } catch {
    return null;
  }
}
