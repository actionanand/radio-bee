import { artworkCandidates, FALLBACK_ARTWORK, logoUrl } from './station-artwork';
import { reviewedArtworkUrl } from './station-artwork-url';

const base = 'https://actionanand.github.io/radio-bee-data/v2/';

describe('reviewed network brand artwork', () => {
  it('uses the station brand, then shared network brand, then RadioBee fallback', () => {
    const network = { logoUrl: 'https://i1.sndcdn.com/artworks-000070154341-a8vv1u-t1080x1080.jpg' };
    const station = { logoUrl: 'https://onecms-res.cloudinary.com/image/upload/v1678108773/mediacorp/mel/image/2023-03/oli-968_0.png' };
    expect(artworkCandidates(base, station, network)).toEqual([
      station.logoUrl, network.logoUrl, FALLBACK_ARTWORK,
    ]);
    expect(artworkCandidates(base, {}, network)).toEqual([network.logoUrl, FALLBACK_ARTWORK]);
    expect(artworkCandidates(base, {}, {})).toEqual([FALLBACK_ARTWORK]);
  });

  it('does not resurrect old generic radio images when an offline cached catalogue is restored', () => {
    const oldNetwork = { logoPath: 'assets/logos/networks/akashvani-radio.png' };
    expect(artworkCandidates(base, {}, oldNetwork)).toEqual([FALLBACK_ARTWORK]);
    expect(artworkCandidates(base, {}, {
      ...oldNetwork, logoUrl: 'https://i1.sndcdn.com/artworks-000070154341-a8vv1u-t1080x1080.jpg',
    })).toEqual(['https://i1.sndcdn.com/artworks-000070154341-a8vv1u-t1080x1080.jpg', FALLBACK_ARTWORK]);
  });

  it('resolves data-repo-hosted station-specific editorial SVG covers', () => {
    const local = 'assets/artwork/stations/missing-fm.svg';
    expect(artworkCandidates(base, { logoPath: local }, {})).toEqual([logoUrl(base, local), FALLBACK_ARTWORK]);
    expect(logoUrl(base, 'assets/artwork/stations/../other.svg')).toBeNull();
    expect(logoUrl(base, 'assets/artwork/stations/pic.svg?unsafe=true')).toBeNull();
    expect(logoUrl(base, 'assets/artwork/networks/random.svg')).toBeNull();
    expect(logoUrl(base, 'assets/artwork/artists/justin-bieber.svg')).toBe(base + 'assets/artwork/artists/justin-bieber.svg');
    expect(logoUrl(base, 'assets/artwork/genres/hindu-devotional.svg')).toBe(base + 'assets/artwork/genres/hindu-devotional.svg');
    expect(logoUrl(base, 'assets/artwork/artists/../genres/music.svg')).toBeNull();
  });
  it('keeps approved catalogue-local station images ahead of their network brand', () => {
    const local = 'assets/logos/stations/custom-mark.webp';
    const shared = 'https://i1.sndcdn.com/artworks-000070154341-a8vv1u-t1080x1080.jpg';
    expect(artworkCandidates(base, { logoPath: local }, { logoUrl: shared }))
      .toEqual([logoUrl(base, local), shared, FALLBACK_ARTWORK]);
  });

  it('accepts every new reviewed image host in the V2 data release', () => {
    // These URLs are published in radio-bee-data/data/v2/networks.json.
    // Keep this list in sync with radio-bee-data/scripts/validate.mjs.
    const links = [
      'https://www.kexp.org/media/filer_public_thumbnails/filer_public/4f/52/4f52b5aa-bd93-4fe7-ab94-2d3258a3804c/kexp_primarylogo_black.png__300x356_q85_crop_subsampling-2_upscale.png',
      'https://upload.wikimedia.org/wikipedia/commons/e/ec/WNYC_logo.png',
      'https://raw.githubusercontent.com/FreemediaMY/FreemediaMY/main/assets/freelisten/logos/local/AstroRadio/raaga.png',
      'https://cdn.brandfetch.io/id7dYvpMT-/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1767766219614',
      'https://higherlogicdownload.s3.amazonaws.com/CBAA/f91521e2-cb7a-4f99-8ca0-552342c290f7/UploadedImages/Photos/DAB_Logos/4EB_Logo_G.png',
      'https://rtm-images.glueapi.io/720x0/radio-asset/MINNAL_FM.png',
      'https://admango.cdn.mangomolo.com/analytics/uploads/194/688348f504.png',
    ];
    for (const link of links) {
      expect(reviewedArtworkUrl(link)).toBe(link);
      expect(artworkCandidates(base, {}, { logoUrl: link })).toEqual([link, FALLBACK_ARTWORK]);
    }
  });

  it('accepts arbitrary public HTTPS image providers including data-repo hosted and extensionless URLs', () => {
    const urls = [
      'https://actionanand.github.io/radio-bee-data/v2/assets/logos/networks/real-brand.webp',
      'https://publisher.fm/brand/station-logo.svg',
      'https://cdn.music.example.com/radio/image?id=123&sz=240',
      'https://www.givenow.com.au/organisation/file/logo.jpg?fileId=64053&parentId=516',
      'https://unknown-image-host.org/logos/station.avif',
    ];
    for (const url of urls) {
      expect(reviewedArtworkUrl(url)).toBe(url);
      expect(artworkCandidates(base, { logoUrl: url }, {})).toEqual([url, FALLBACK_ARTWORK]);
    }
  });

  it('rejects private destinations, non-HTTPS, credentials, fragments and malformed URLs', () => {
    for (const value of [
      'http://i1.sndcdn.com/pic.jpg',
      'https://evil.example/pic.jpg',
      'https://i1.sndcdn.com@evil.example/pic.jpg',
      'https://localhost/image.png',
      'https://127.0.0.1/image.png',
      'https://192.168.0.1/image.jpg',
      'https://printer.local/image.png',
      'https://example.internal/logo.png',
      'https://i1.sndcdn.com:8080/image.png',
      'data:image/png;base64,SGVsbG8=',
      'javascript:alert(1)',
      'https://i1.sndcdn.com/pic.png#fragment',
      'https://user:pass@i1.sndcdn.com/pic.png',
      'https://i1.sndcdn.com/pic.png\n',
      null, 42,
    ]) {
      expect(reviewedArtworkUrl(value)).toBeNull();
      expect(artworkCandidates(base, { logoUrl: value as string }, {})).toEqual([FALLBACK_ARTWORK]);
      expect(artworkCandidates(base, {}, { logoUrl: value as string })).toEqual([FALLBACK_ARTWORK]);
    }
  });
});
