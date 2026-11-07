/** User-requested HEAD check. No audio download, credentials, relay or CORS bypass. */
export async function checkCaptureAccess(url: string, signal: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    if (signal.aborted) throw Error('Cancelled');
    const response = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit', signal: controller.signal });
    const final = new URL(response.url);
    if (!response.ok || final.protocol !== 'https:' || final.username || final.password)
      throw Error('Capture access unavailable');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
