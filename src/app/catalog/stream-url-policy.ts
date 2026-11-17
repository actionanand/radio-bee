/**
 * Only these three user-supplied V2 legacy endpoints are allowed to use HTTP.
 * Browser HTTPS pages may still block/upgrade their audio requests. The native
 * Android WebView has separate cleartext/mixed-content configuration.
 */
export const legacyHttpStreamUrls = Object.freeze([
  'http://media2.lankasri.fm/;stream.mp3',
  'http://s2.voscast.com:9370/;',
  'http://117.241.19.61:88/broadwave.mp3',
]);

export function allowedStreamUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw !== raw.trim()) return false;
  try {
    const url = new URL(raw);
    if (!url.hostname || url.username || url.password || url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && legacyHttpStreamUrls.includes(raw);
  } catch {
    return false;
  }
}
