import { createMediaEngine } from './media-engine';
import { Stream } from '../catalog/catalog.models';
const hooks = vi.hoisted(() => ({
  callbacks: new Map<string, (event: string, data: { fatal: boolean }) => void>(),
  destroyed: 0,
  supported: false,
}));
vi.mock('hls.js', () => ({
  default: class {
    static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static isSupported() {
      return hooks.supported;
    }
    on(event: string, callback: (event: string, data: { fatal: boolean }) => void) {
      hooks.callbacks.set(event, callback);
    }
    attachMedia() {
      hooks.callbacks.get('attached')?.('attached', { fatal: false });
    }
    loadSource() {
      hooks.callbacks.get('manifest')?.('manifest', { fatal: false });
    }
    destroy() {
      hooks.destroyed++;
    }
  },
}));
const stream: Stream = {
  id: 'test',
  url: 'https://owned.test/live',
  format: 'mp3',
  verificationStatus: 'verified',
  rightsStatus: 'permission-granted',
  sourceId: 'test',
  lastVerifiedAt: '2026-11-03T00:00:00Z',
};
describe('Browser media adapter', () => {
  beforeEach(() => {
    hooks.callbacks.clear();
    hooks.destroyed = 0;
    hooks.supported = false;
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  it('checks capabilities and loads MP3/AAC with native audio', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(mime =>
      ['audio/mpeg', 'audio/aac'].includes(mime) ? 'probably' : '',
    );
    const engine = createMediaEngine()!;
    expect(engine.supports('mp3')).toBe(true);
    expect(engine.supports('aac')).toBe(true);
    expect(engine.supports('hls')).toBe(false);
    await engine.load(stream);
    expect(engine.audio.src).toBe(stream.url);
    await engine.load({ ...stream, format: 'aac' });
    engine.clear();
    expect(engine.audio.getAttribute('src')).toBeNull();
  });
  it('uses native HLS where the browser supports it', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    const engine = createMediaEngine()!;
    await engine.load({ ...stream, format: 'hls' });
    expect(engine.audio.src).toBe(stream.url);
    expect(hooks.callbacks.size).toBe(0);
    engine.clear();
  });
  it('attaches HLS through the installed adapter and reports fatal media errors', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    hooks.supported = true;
    const engine = createMediaEngine()!;
    await engine.load({ ...stream, format: 'hls' });
    const failure = vi.fn();
    engine.audio.addEventListener('error', failure);
    hooks.callbacks.get('error')?.('error', { fatal: true });
    expect(failure).toHaveBeenCalledOnce();
    engine.clear();
    expect(hooks.destroyed).toBeGreaterThan(0);
  });
  it('has no engine when the platform cannot play any supported format', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    expect(createMediaEngine()).toBeNull();
  });
});
