import { Capacitor } from '@capacitor/core';
export function recordingFilename(station: string, mime: string, date = new Date()) {
  const name =
    station
      .normalize('NFC')
      .replace(/[^\p{L}\p{M}\p{N}-]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'RadioBee';
  const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  return `RadioBee-${name}-${date.toISOString().replace(/[:.]/g, '-')}.${extension}`;
}
export async function exportRecording(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  if (!(await Share.canShare()).value) throw Error('Sharing unsupported');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject(Error('Invalid file'));
    reader.readAsDataURL(blob);
  });
  let written = false;
  try {
    const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    written = true;
    await Share.share({ title: filename, files: [result.uri], dialogTitle: 'RadioBee' });
  } finally {
    if (written) await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => undefined);
  }
}
