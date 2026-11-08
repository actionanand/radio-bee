import { checkCaptureAccess } from './capture-access';
describe('Explicit recording access check', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function response(url: string, ok = true) {
    return { url, ok } as Response;
  }
  it('uses a bounded credential-free CORS HEAD request, not a hidden stream download', async () => {
    const fetch = vi.fn(async () => response('https://broadcaster.test/final'));
    vi.stubGlobal('fetch', fetch);
    await checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith(
      'https://broadcaster.test/live',
      expect.objectContaining({ method: 'HEAD', mode: 'cors', credentials: 'omit' }),
    );
  });
  it('rejects failed or insecure final responses', async () => {
    for (const r of [
      response('https://broadcaster.test/live', false),
      response('http://unsafe.test/live'),
      response('https://user:secret@broadcaster.test/live'),
    ]) {
      vi.stubGlobal('fetch', async () => r);
      await expect(checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal)).rejects.toThrow(
        'Capture access unavailable',
      );
    }
  });
  it('cancels before requesting and bounds a stalled access check', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(checkCaptureAccess('https://broadcaster.test/live', cancelled.signal)).rejects.toThrow('Cancelled');
    expect(fetch).not.toHaveBeenCalled();
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(Error('Aborted')));
        }),
    );
    const pending = expect(
      checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal),
    ).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
  });
});
