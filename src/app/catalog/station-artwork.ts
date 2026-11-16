import { NgOptimizedImage } from '@angular/common';
import { Component, Service, computed, inject, input, linkedSignal } from '@angular/core';
import { CatalogService, CATALOG_URL } from './catalog.service';
import { Network, Station } from './catalog.models';
import { reviewedArtworkUrl } from './station-artwork-url';

export const FALLBACK_ARTWORK = 'assets/icon/radio-fallback.svg';
// Only catalogue-owned raster files. No origins, encodings, traversal, query strings or SVG payloads.
export function logoUrl(base: string, path: unknown): string | null {
  if (
    typeof path !== 'string' ||
    !/^(?:assets\/logos\/(?:stations|networks)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|png)|assets\/artwork\/(?:stations|artists|genres)\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg)$/.test(path)
  )
    return null;
  try {
    const root = new URL(base);
    const url = new URL(path, root);
    return root.protocol === 'https:' && url.origin === root.origin && url.pathname.startsWith(root.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** The original v1/v2 logo paths below are generic radio graphics, not brand marks.
 * Do not surface them even when an older catalogue is restored from offline cache.
 */
const LEGACY_GENERIC_NETWORK_LOGOS = new Set([
  'akashvani-radio.png', 'big-fm-radio.png', 'boom-tamil-radio.png',
  'hello-fm-radio.png', 'mirchi-radio.png', 'radio-city-radio.png',
  'red-fm-radio.png', 'shaivam-radio.png', 'sooriyan-lk-radio.png',
  'star-fm-lk-radio.png', 'suryan-in-radio.png',
].map(name => 'assets/logos/networks/' + name));

export function artworkCandidates(
  base: string,
  station: Pick<Station, 'logoPath' | 'logoUrl'>,
  network?: Pick<Network, 'logoPath' | 'logoUrl'>,
): string[] {
  // A network's brand must be identical on every station card (including
  // fallback behavior). Ignore station-specific editorial artwork whenever
  // the network supplies a usable brand logo.
  const networkLogo =
    reviewedArtworkUrl(network?.logoUrl) ??
    (LEGACY_GENERIC_NETWORK_LOGOS.has(network?.logoPath ?? '') ? null : logoUrl(base, network?.logoPath));
  if (networkLogo) return [networkLogo, FALLBACK_ARTWORK];
  return [...new Set([
    reviewedArtworkUrl(station.logoUrl),
    logoUrl(base, station.logoPath),
    FALLBACK_ARTWORK,
  ].filter((url): url is string => !!url))];
}
@Service()
export class ArtworkFailures {
  private readonly catalog = inject(CatalogService);
  // Keep failures across filtered-out/recreated cards and the mini-player, until a new validated snapshot arrives.
  private readonly urls = linkedSignal({ source: () => this.catalog.catalog(), computation: () => new Set<string>() });
  has(url: string) {
    return this.urls().has(url);
  }
  remember(url: string) {
    this.urls.update(previous => (previous.has(url) ? previous : new Set([...previous, url])));
  }
}
@Component({
  selector: 'app-station-artwork',
  imports: [NgOptimizedImage],
  template: ` <span class="artwork" [class]="'artwork tone-' + tone()" [class.fallback]="source() === fallback">
    <img
      #image
      [ngSrc]="source()"
      width="240"
      height="240"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      (error)="failed(image.currentSrc || image.src)" />
    @if (source() === fallback) {
      <span class="initials" aria-hidden="true">{{ initials() }}</span
      ><span class="wordmark" aria-hidden="true">RADIOBEE</span>
    }
  </span>`,
  styles: `
    :host {
      display: block;
      width: 100%;
      aspect-ratio: 1;
      container-type: inline-size;
    }
    .artwork {
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      background: #f4f1e8;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 8%;
    }
    .fallback img {
      opacity: 0.16;
      padding: 18%;
      transform: rotate(-12deg);
    }
    .initials {
      position: absolute;
      font-size: 24cqw;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #173a32;
    }
    .wordmark {
      position: absolute;
      bottom: 12%;
      font-size: 4cqw;
      letter-spacing: 0.2em;
      font-weight: 700;
      color: #173a32;
    }
    .tone-0 {
      background: #dce8d4;
    }
    .tone-1 {
      background: #f4dfbe;
    }
    .tone-2 {
      background: #dbe7ec;
    }
    .tone-3 {
      background: #e7dded;
    }
    .tone-4 {
      background: #f1dcd5;
    }
    .tone-5 {
      background: #d3e8e2;
    }
  `,
})
export class StationArtworkComponent {
  readonly station = input.required<Station>();
  private readonly catalog = inject(CatalogService);
  private readonly base = inject(CATALOG_URL);
  private readonly failures = inject(ArtworkFailures);
  readonly fallback = FALLBACK_ARTWORK;
  readonly source = computed(
    () =>
      artworkCandidates(
        this.base,
        this.station(),
        this.catalog.catalog()?.networks.find(n => n.id === this.station().networkId),
      ).find(url => !this.failures.has(url)) ?? FALLBACK_ARTWORK,
  );
  readonly initials = computed(() =>
    this.station()
      .name.replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => Array.from(word)[0])
      .join('')
      .toLocaleUpperCase(),
  );
  readonly tone = computed(() => Array.from(this.station().id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6);
  failed(url: string) {
    if (url !== this.source() || url === FALLBACK_ARTWORK) return;
    this.failures.remember(url);
  }
}
