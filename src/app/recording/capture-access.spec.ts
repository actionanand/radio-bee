import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { CAPTURE_ACCESS } from './recording.service';
import { checkCaptureAccess } from './capture-access';
describe('Explicit recording access check', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function response(url: string, ok = true) {
    return { url, ok, body: { cancel: vi.fn(async () => undefined) } } as unknown as Response;
  }
  it('uses a bounded credential-free CORS GET request, cancelling the body instead of downloading the stream', async () => {
    const fetch = vi.fn(async () => response('https://broadcaster.test/final'));
    vi.stubGlobal('fetch', fetch);
    await checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith(
      'https://broadcaster.test/live',
      expect.objectContaining({ method: 'GET', mode: 'cors', credentials: 'omit' }),
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
        'Recording media access unavailable',
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
    ).rejects.toThrow('Recording media access unavailable');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
  });
  it('cancels successful infinite bodies and retains explicit legacy HEAD behavior', async () => {
    const result = response('https://broadcaster.test/live');
    const fetch = vi.fn(async () => result);
    vi.stubGlobal('fetch', fetch);
    await checkCaptureAccess(result.url, new AbortController().signal);
    expect(result.body!.cancel).toHaveBeenCalledOnce();
    await checkCaptureAccess(result.url, new AbortController().signal, 'HEAD');
    expect(fetch).toHaveBeenLastCalledWith(result.url, expect.objectContaining({ method: 'HEAD' }));
  });
  it('does not treat a successful HEAD as proof that the media GET is allowed', async () => {
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'HEAD') return response('https://broadcaster.test/live');
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetch);
    await checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal, 'HEAD');
    await expect(checkCaptureAccess('https://broadcaster.test/live', new AbortController().signal)).rejects.toThrow(
      'Recording media access unavailable',
    );
  });
  for (const schemaVersion of [1, 2])
    it(`selects ${schemaVersion === 1 ? 'HEAD' : 'GET'} through the real V${schemaVersion} access token`, async () => {
      const catalog = signal({ manifest: { schemaVersion } });
      TestBed.configureTestingModule({ providers: [{ provide: CatalogService, useValue: { catalog } }] });
      const fetch = vi.fn(async () => response('https://broadcaster.test/live'));
      vi.stubGlobal('fetch', fetch);
      await TestBed.inject(CAPTURE_ACCESS).check('https://broadcaster.test/live', new AbortController().signal);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        'https://broadcaster.test/live',
        expect.objectContaining({ method: schemaVersion === 1 ? 'HEAD' : 'GET' }),
      );
    });
  for (const failure of ['reject', 'throw', 'pending'] as const)
    it(`accepts valid GET headers when body cancellation ${failure}s, aborting only that request`, async () => {
      const result = response('https://broadcaster.test/live');
      vi.mocked(result.body!.cancel).mockImplementation(() => {
        if (failure === 'throw') throw Error('Already closed');
        return failure === 'pending'
          ? new Promise<void>(() => undefined)
          : Promise.reject(Error('Cancellation failed'));
      });
      const caller = new AbortController(),
        fetch = vi.fn(async () => result);
      vi.stubGlobal('fetch', fetch);
      await expect(checkCaptureAccess(result.url, caller.signal)).resolves.toBeUndefined();
      expect(caller.signal.aborted).toBe(false);
      const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(request[1].signal?.aborted).toBe(true);
    });
});
