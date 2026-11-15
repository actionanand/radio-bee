/** Publisher and curated radio-directory image hosts only.
 * External images are referenced, not copied into the RadioBee distribution.
 * Keep this allow-list aligned with radio-bee-data/scripts/validate.mjs.
 */
const BRAND_IMAGE_HOSTS = new Set([
  'i1.sndcdn.com', 'static-media.streema.com', 'onecms-res.cloudinary.com',
  'cdn-profiles.tunein.com', 'www.americantamilradio.com',
  'static.tuneyou.com', 'exchange4media.gumlet.io',
  'djhonz7dexnot.cloudfront.net',
]);
export function reviewedArtworkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && BRAND_IMAGE_HOSTS.has(u.hostname) &&
      !u.username && !u.password && !u.hash &&
      /\.(?:png|jpe?g|webp)$/i.test(u.pathname) ? u.href : null;
  } catch { return null; }
}
