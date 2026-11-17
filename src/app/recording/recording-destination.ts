import { Injectable, signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { SnackbarService } from '../shared/snackbar.service';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { exportRecording } from './export-recording';
import { inject } from '@angular/core';
import { RADIO_RECORDING } from './recording.config';
import { RecordingExportPreferencesService, recordingBitrate } from './recording-export-preferences';

interface AndroidRecordingStorage {
  getFolder(): Promise<{ selected: boolean; name?: string }>;
  chooseFolder(): Promise<{ selected: boolean; name?: string }>;
  beginFile(options: { filename: string; mimeType: string }): Promise<{ id: string; name: string }>;
  appendData(options: { id: string; base64: string }): Promise<void>;
  finishFile(options: { id: string }): Promise<void>;
  cancelFile(options: { id: string }): Promise<void>;
  convertSaved(options: { filename: string; bitrate: number; cover: boolean; station: string }): Promise<{ name: string; converted: boolean }>;
}
const androidStorage = registerPlugin<AndroidRecordingStorage>('RadioBeeRecordingStorage');
type FolderAccess = 'granted' | 'prompt' | 'denied';
type FolderHandle = FileSystemDirectoryHandle & {
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<FolderAccess>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<FolderAccess>;
};
type DirectoryWindow = Window & { showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<FolderHandle> };
const FOLDER_DATABASE = 'radiobee-recording-folder';
const FOLDER_STORE = 'selections';
const FOLDER_KEY = 'selected';

/** A recording destination is device-local. It is never sent to a server. */
@Injectable({ providedIn: 'root' })
export class RecordingDestination {
  private readonly recording = inject(RADIO_RECORDING);
  private readonly preferences = inject(RecordingExportPreferencesService);
  private readonly snackbar = inject(SnackbarService);
  private readonly catalog = inject(CatalogService);
  readonly converting = signal(0);
  readonly selected = signal(false);
  readonly name = signal('');
  readonly ready = signal(false);
  readonly loaded = (this.recording.Enabled ? this.restore() : Promise.resolve())
    .finally(() => this.ready.set(true));
  private directory: FolderHandle | undefined;

  get requiresSelection(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private async database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(Error('Directory persistence unavailable')); return; }
      const request = indexedDB.open(FOLDER_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FOLDER_STORE)) request.result.createObjectStore(FOLDER_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async savedHandle(): Promise<FolderHandle | undefined> {
    const db = await this.database();
    try {
      return await new Promise<FolderHandle | undefined>((resolve, reject) => {
        const request = db.transaction(FOLDER_STORE, 'readonly').objectStore(FOLDER_STORE).get(FOLDER_KEY);
        request.onsuccess = () => resolve(request.result as FolderHandle | undefined);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  private async remember(handle: FolderHandle): Promise<void> {
    const db = await this.database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(FOLDER_STORE, 'readwrite');
        transaction.objectStore(FOLDER_STORE).put(handle, FOLDER_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }

  private async restore(): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      try {
        const result = await androidStorage.getFolder();
        this.selected.set(result.selected);
        this.name.set(result.selected ? result.name ?? '' : '');
      } catch { this.selected.set(false); }
      return;
    }
    try {
      const handle = await this.savedHandle();
      if (!handle) return;
      this.directory = handle;
      const permission = await handle.queryPermission?.({ mode: 'readwrite' });
      this.selected.set(permission === 'granted');
      this.name.set(handle.name);
    } catch { /* Manual browser Downloads remain usable if folder persistence is unavailable. */ }
  }

  /** Call only from a user gesture; it opens the system folder picker once per setup. */
  async chooseFolder(): Promise<boolean> {
    if (!this.recording.Enabled) return false;
    if (Capacitor.getPlatform() === 'android') {
      await this.loaded;
      try {
        const result = await androidStorage.chooseFolder();
        if (!result.selected) return false;
        this.selected.set(true);
        this.name.set(result.name ?? '');
        return true;
      } catch { return false; }
    }
    // Invoke the web picker directly in the click gesture. Awaiting IndexedDB
    // restoration first can lose the transient activation required by Chrome.
    const picker = (window as DirectoryWindow).showDirectoryPicker;
    if (!picker) return false;
    try {
      const handle = await picker.call(window, { mode: 'readwrite' });
      if (!handle) return false;
      // Picker access is a user gesture; don't demand a second picker on later visits.
      this.directory = handle;
      this.name.set(handle.name);
      this.selected.set(true);
      await this.remember(handle).catch(() => undefined);
      return true;
    } catch { return false; }
  }

  /** A previously selected folder may have its permission revoked in Settings. */
  async hasAccess(): Promise<boolean> {
    if (!this.recording.Enabled) return false;
    await this.loaded;
    if (Capacitor.getPlatform() === 'android') {
      try {
        const result = await androidStorage.getFolder();
        this.selected.set(result.selected);
        this.name.set(result.selected ? result.name ?? '' : '');
        return result.selected;
      } catch { this.selected.set(false); return false; }
    }
    if (!this.directory) return false;
    try {
      const permission = await this.directory.queryPermission?.({ mode: 'readwrite' });
      this.selected.set(permission === 'granted');
      return permission === 'granted';
    } catch { this.selected.set(false); return false; }
  }

  async save(blob: Blob, filename: string, requireFolder = false, station = 'RadioBee', deferConversion = false): Promise<'original' | 'converted' | 'fallback'> {
    if (!this.recording.Enabled) throw Error('Recording is disabled');
    if (Capacitor.getPlatform() === 'android') {
      if (!await this.hasAccess()) throw Error('Recording folder access was removed');
      const { id, name } = await androidStorage.beginFile({ filename, mimeType: blob.type || 'application/octet-stream' });
      try {
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
      if (this.preferences.format() !== 'm4a') return 'original';
      const options = {
        filename: name || filename,
        bitrate: recordingBitrate(this.preferences.quality()),
        cover: this.preferences.coverArt(),
        station,
      };
      const convert = async (): Promise<'converted' | 'fallback'> => {
        this.converting.update(count => count + 1);
        try {
          const result = await androidStorage.convertSaved(options);
          return result.converted ? 'converted' : 'fallback';
        } catch {
          // Original document remains safely stored if transcoding/metadata fails.
          return 'fallback';
        } finally {
          this.converting.update(count => Math.max(0, count - 1));
        }
      };
      if (deferConversion) {
        // Continuous recording must restart as soon as the raw segment is saved;
        // do not wait for conversion to finish and create a recording gap.
        void convert().then(outcome => {
          if (outcome !== 'fallback') return;
          const locale = this.catalog.locale();
          const message = locale === 'ta'
            ? 'M4A மாற்றம் தோல்வியடைந்தது. அசல் பதிவு சேமிக்கப்பட்டது.'
            : locale === 'sa'
              ? 'M4A रूपान्तरणं विफलम्। मूलमुद्रणं रक्षितम्।'
              : 'M4A conversion failed; the original recording was saved.';
          this.snackbar.show({ kind: 'text', message }, 'warning', 7500);
        });
        return 'original';
      }
      return convert();
    }
    if (await this.hasAccess() && this.directory) {
      const file = await this.directory.getFileHandle(filename, { create: true });
      const writer = await file.createWritable();
      try {
        await writer.write(blob);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
      }
      return 'original';
    }
    if (requireFolder) throw Error('A persistent recording folder is required for auto-save');
    await exportRecording(blob, filename);
    return 'original';
  }
}
