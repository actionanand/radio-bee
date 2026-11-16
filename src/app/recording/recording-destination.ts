import { Injectable, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { exportRecording } from './export-recording';

interface AndroidRecordingStorage {
  chooseFolder(): Promise<{ selected: boolean }>;
  beginFile(options: { filename: string; mimeType: string }): Promise<{ id: string }>;
  appendData(options: { id: string; base64: string }): Promise<void>;
  finishFile(options: { id: string }): Promise<void>;
  cancelFile(options: { id: string }): Promise<void>;
}
const androidStorage = registerPlugin<AndroidRecordingStorage>('RadioBeeRecordingStorage');
type DirectoryWindow = Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };

/** Explicit user-selected destinations; never upload radio recordings to an external server. */
@Injectable({ providedIn: 'root' })
export class RecordingDestination {
  readonly selected = signal(false);
  private directory: FileSystemDirectoryHandle | undefined;

  get requiresSelection(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /** The browser only supports unattended segment saves when a user grants directory access. */
  async chooseFolder(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'android') {
      try {
        const result = await androidStorage.chooseFolder();
        this.selected.set(result.selected);
        return result.selected;
      } catch {
        this.selected.set(false);
        return false;
      }
    }
    const picker = (window as DirectoryWindow).showDirectoryPicker;
    if (!picker) return false;
    try {
      const directory = await picker.call(window);
      if (!directory) return false;
      this.directory = directory;
      this.selected.set(true);
      return true;
    } catch {
      return false;
    }
  }

  async save(blob: Blob, filename: string): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      if (!this.selected()) throw Error('Choose an Android recording folder first');
      const { id } = await androidStorage.beginFile({ filename, mimeType: blob.type || 'application/octet-stream' });
      try {
        // Small transfers avoid materializing an 80 MB recording as a >100 MB base64 string.
        const chunkSize = 48 * 1024;
        for (let offset = 0; offset < blob.size; offset += chunkSize) {
          const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await androidStorage.appendData({ id, base64: btoa(binary) });
        }
        await androidStorage.finishFile({ id });
      } catch (error) {
        await androidStorage.cancelFile({ id }).catch(() => undefined);
        throw error;
      }
      return;
    }
    if (this.directory) {
      const entry = await this.directory.getFileHandle(filename, { create: true });
      const writer = await entry.createWritable();
      try {
        await writer.write(blob);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
      }
      return;
    }
    // A manual export is a user gesture, so ordinary Downloads is available.
    await exportRecording(blob, filename);
  }
}
