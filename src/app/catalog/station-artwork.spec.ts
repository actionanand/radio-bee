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

  it('keeps approved catalogue-local station images ahead of their network brand', () => {
    const local = 'assets/logos/stations/custom-mark.webp';
    const shared = 'https://i1.sndcdn.com/artworks-000070154341-a8vv1u-t1080x1080.jpg';
    expect(artworkCandidates(base, { logoPath: local }, { logoUrl: shared }))
      .toEqual([logoUrl(base, local), shared, FALLBACK_ARTWORK]);
  });

  it('rejects unapproved hosts, SVGs, insecure, credentialed and malformed URLs', () => {
    for (const value of [
      'http://i1.sndcdn.com/pic.jpg',
      'https://evil.example/pic.jpg',
      'https://i1.sndcdn.com@evil.example/pic.jpg',
      'https://i1.sndcdn.com/pic.svg',
      'https://i1.sndcdn.com/pic.png#fragment',
      'https://user:pass@i1.sndcdn.com/pic.png',
      null, 42,
    ]) {
      expect(reviewedArtworkUrl(value)).toBeNull();
      expect(artworkCandidates(base, { logoUrl: value as string }, {})).toEqual([FALLBACK_ARTWORK]);
    }
  });
});
