import { allowedStreamUrl, legacyHttpStreamUrls } from './stream-url-policy';

describe('V2 legacy HTTP stream exceptions', () => {
  it('accepts all three original HTTP feeds without rewriting them to HTTPS', () => {
    expect(legacyHttpStreamUrls).toHaveLength(3);
    expect(legacyHttpStreamUrls.every(url => allowedStreamUrl(url))).toBe(true);
  });
  it('rejects all other HTTP URLs, unsafe credentials, and loopback access', () => {
    for (const url of [
      'http://media2.lankasri.fm/other.mp3',
      'http://s2.voscast.com:9371/;',
      'http://117.241.19.61:89/broadwave.mp3',
      'http://127.0.0.1:88/live',
      'http://localhost/radio',
      'ftp://example.org/audio',
      'https://user:pass@example.org/audio',
      'https://example.org/audio#fragment',
    ]) expect(allowedStreamUrl(url)).toBe(false);
  });
  it('retains working HTTPS candidates and does not mutate their URLs', () => {
    expect(allowedStreamUrl('https://stream.zeno.fm/swa83te314zuv')).toBe(true);
    expect(allowedStreamUrl('https://radio.lotustechnologieslk.net:2020/stream/sunfmgarden')).toBe(true);
  });
});
