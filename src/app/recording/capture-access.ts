/** A failed access check is not proof of CORS specifically: network/TLS failures also fail fetch. */
export class CaptureAccessError extends Error {
  constructor() {
    super('Recording media access unavailable');
    this.name = 'CaptureAccessError';
  }
}
/** Headers-only verification of the real media method; never saves/downloads raw stream audio. */
export async function checkCaptureAccess(
  url: string,
  signal: AbortSignal,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    if (signal.aborted) throw Error('Cancelled');
    const response = await fetch(url, { method, mode: 'cors', credentials: 'omit', signal: controller.signal });
    const final = new URL(response.url);
    try {
      if (!response.ok || final.protocol !== 'https:' || final.username || final.password)
        throw new CaptureAccessError();
    } finally {
      // A radio GET may never finish. Stop its body immediately after checking response headers.
      await response.body?.cancel();
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new CaptureAccessError();
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal.removeEventListener('abort', abort);
  }
}
