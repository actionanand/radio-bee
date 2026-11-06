import { createMediaEngine, HlsAdapter, HlsFactory, MediaEngine } from './media-engine';
import { Stream } from '../catalog/catalog.models';
const stream: Stream = {
  id: 'test',
  url: 'https://owned.test/live',
  format: 'mp3',
  verificationStatus: 'verified',
  rightsStatus: 'permission-granted',
  sourceId: 'test',
  lastVerifiedAt: '2026-11-03T00:00:00Z',
};
function fakeHls(supported = true) {
  let attached = () => {};
  let manifest = () => {};
  let fatal = () => {};
  const adapter = {
    onAttached: (callback: () => void) => {
      attached = callback;
    },
    onManifest: (callback: () => void) => {
      manifest = callback;
    },
    onFatal: (callback: () => void) => {
      fatal = callback;
    },
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
  } satisfies HlsAdapter;
  const factory = { isSupported: () => supported, create: vi.fn(() => adapter) } satisfies HlsFactory;
  return { factory, adapter, attached: () => attached(), manifest: () => manifest(), fatal: () => fatal() };
}
function existing(engine: MediaEngine | null): MediaEngine {
  expect(engine).not.toBeNull();
  if (!engine) throw new Error('Expected supported engine');
  return engine;
}
describe('Browser media adapter', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
  });
  afterEach(() => vi.restoreAllMocks());
  it('initializes MP3 and AAC without HLS support', async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockImplementation(mime =>
      ['audio/mpeg', 'audio/aac'].includes(mime) ? 'probably' : '',
    );
    const fake = fakeHls(false);
    const engine = existing(createMediaEngine(fake.factory));
    expect(engine.supports('mp3')).toBe(true);
    expect(engine.supports('aac')).toBe(true);
    expect(engine.supports('hls')).toBe(false);
    for (const format of ['mp3', 'aac']) {
      await engine.load({ ...stream, format });
      expect(engine.audio.src).toBe(stream.url);
    }
    engine.clear();
    expect(engine.audio.getAttribute('src')).toBeNull();
    expect(fake.factory.create).not.toHaveBeenCalled();
  });
  it('prefers native HLS over a supported HLS adapter', async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('probably');
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    await engine.load({ ...stream, format: 'hls' });
    expect(engine.audio.src).toBe(stream.url);
    expect(fake.factory.create).not.toHaveBeenCalled();
    engine.clear();
  });
  it('creates HLS, attaches media, loads the source on attachment and waits for the manifest', async () => {
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    expect(engine.supports('hls')).toBe(true);
    let resolved = false;
    const loading = engine.load({ ...stream, format: 'hls' }).then(() => {
      resolved = true;
    });
    expect(fake.factory.create).toHaveBeenCalledOnce();
    expect(fake.adapter.attachMedia).toHaveBeenCalledWith(engine.audio);
    expect(fake.adapter.loadSource).not.toHaveBeenCalled();
    fake.attached();
    expect(fake.adapter.loadSource).toHaveBeenCalledWith(stream.url);
    await Promise.resolve();
    expect(resolved).toBe(false);
    fake.manifest();
    await loading;
    expect(resolved).toBe(true);
    engine.clear();
    expect(fake.adapter.destroy).toHaveBeenCalledOnce();
  });
  it('rejects fatal initialization failures and dispatches media errors', async () => {
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    const failure = vi.fn();
    engine.audio.addEventListener('error', failure);
    const loading = engine.load({ ...stream, format: 'hls' });
    const rejection = expect(loading).rejects.toThrow('HLS failure');
    fake.fatal();
    await rejection;
    expect(failure).toHaveBeenCalledOnce();
    engine.clear();
    expect(fake.adapter.destroy).toHaveBeenCalledOnce();
  });
  it('reports fatal errors after the manifest has loaded', async () => {
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    const loading = engine.load({ ...stream, format: 'hls' });
    fake.manifest();
    await loading;
    const failure = vi.fn();
    engine.audio.addEventListener('error', failure);
    fake.fatal();
    expect(failure).toHaveBeenCalledOnce();
    engine.clear();
  });
  it('cancels pending HLS and cleans up idempotently', async () => {
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    const loading = engine.load({ ...stream, format: 'hls' });
    const rejection = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    engine.clear();
    await rejection;
    engine.clear();
    expect(fake.adapter.destroy).toHaveBeenCalledOnce();
    expect(engine.audio.getAttribute('src')).toBeNull();
  });
  it('cancels HLS when replacing it with a native stream', async () => {
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory));
    const loading = engine.load({ ...stream, format: 'hls' });
    const rejection = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    await engine.load(stream);
    await rejection;
    expect(fake.adapter.destroy).toHaveBeenCalledOnce();
    expect(engine.audio.src).toBe(stream.url);
    engine.clear();
  });
  it('returns null on unsupported platforms regardless of host MediaSource', () => {
    expect(createMediaEngine(fakeHls(false).factory)).toBeNull();
  });
  it('can explicitly exercise hls.js in a local test even when native HLS exists', async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('probably');
    const fake = fakeHls();
    const engine = existing(createMediaEngine(fake.factory, true));
    const loading = engine.load({ ...stream, format: 'hls' });
    expect(fake.factory.create).toHaveBeenCalledOnce();
    fake.attached();
    fake.manifest();
    await loading;
    engine.clear();
  });
});
