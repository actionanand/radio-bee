/**
 * Optional catalogue artwork can be hosted either by radio-bee-data or by any
 * public HTTPS publisher, image service, or Wikimedia media URL. Rendering an
 * unsupported image is handled by the browser and falls back to RadioBee art.
 *
 * Only accept public web destinations; never turn arbitrary catalogue strings
 * into local-network image requests. Images render as <img> with no referrer.
 * This checks URL safety, not the artwork's identity or redistribution rights.
 */
const BLOCKED_TLDS = new Set(['localhost', 'local', 'internal', 'lan', 'onion', 'invalid', 'test', 'example']);
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);
export function reviewedArtworkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 4096 ||
      value !== value.trim() || /[\s\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const labels = hostname.split('.');
    // IP literals and internal/reserved hostnames are not public publisher URLs.
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
        (url.port && url.port !== '443') || hostname.includes(':') ||
        !labels.every(label => label.length > 0) || labels.length < 2 ||
        BLOCKED_HOSTS.has(hostname) || BLOCKED_TLDS.has(labels.at(-1) ?? '') ||
        hostname.endsWith('.home.arpa') || hostname.endsWith('.localdomain') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
