import { uiLabel } from '../catalog/catalog.ui';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CaptureAccessError } from './capture-access';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';
import { currentPublishedFixture } from '../catalog/testing/published-1.3.fixture';
import { validateCatalog } from '../catalog/catalog.validation';
import { MEDIA_ENGINE } from '../player/media-engine';
import { PlayerService } from '../player/player.service';
import { RADIO_RECORDING } from './recording.config';
import {
  CAPTURE_ACCESS,
  CAPTURE_SUPPORT,
  CAPTURE_FACTORY,
  RECORDING_EXPORT,
  RecordingService,
  recordingPermission,
} from './recording.service';
import { CaptureCallbacks, CaptureFactory, CaptureDiagnostic } from './capture-engine';
import { recordingFilename } from './export-recording';
import { RecordingDestination } from './recording-destination';
import { PlayerComponent } from '../player/player';
import { RecordingControlsComponent } from './recording-controls';
import { RecordingConfirmationComponent } from './recording-confirmation';
import { SnackbarService } from '../shared/snackbar.service';
import { environment } from '../../environments/environment';
import { environment as production } from '../../environments/environment.prod';
import { PlaybackError } from '../player/playback-failure';

function setup(
  enabled = true,
  allowProhibitedRecording = false,
  autoContinue = false,
  maxDurationMs = 3_600_000,
  maxBytes = 80 * 1024 * 1024,
) {
  vi.spyOn(window, 'confirm').mockImplementation(() => { throw Error('Native confirmation must never be used'); });
  const c = validateCatalog(structuredClone(currentPublishedFixture));
  const station = c.stations.find(s => s.streams.length)!;
  const other = c.stations.find(s => s.id !== station.id && s.streams.length)!;
  const audio = document.createElement('audio');
  vi.spyOn(audio, 'play').mockResolvedValue();
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  let callbacks!: CaptureCallbacks;
  const stop = vi.fn();
  const create = vi.fn<CaptureFactory>(async (_audio, _signal, hooks) => {
    callbacks = hooks;
    return { stop };
  });
  const save = vi.fn(async () => undefined);
  const folderSave = vi.fn(async (_blob: Blob, _filename: string) => undefined);
  const access = vi.fn<(url: string, signal: AbortSignal) => Promise<void>>(async () => undefined);
  const data = { stationName: CatalogService.prototype.stationName, catalog: signal(c), locale: signal('en') };
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { events: new Subject<NavigationStart>(), navigate: vi.fn() } },
      {
        provide: RADIO_RECORDING,
        useValue: {
          Enabled: enabled,
          AllowProhibitedRecording: allowProhibitedRecording,
          MaxDurationMs: maxDurationMs,
          MaxBytes: maxBytes,
          AutoContinue: autoContinue,
        },
      },
      {
        provide: RecordingDestination,
        useValue: {
          requiresSelection: false,
          selected: signal(autoContinue),
          name: signal(autoContinue ? 'radio-bee' : ''),
          ready: signal(true),
          converting: signal(0),
          chooseFolder: vi.fn(async () => true),
          hasAccess: async () => true,
          save: folderSave,
        },
      },
      { provide: CatalogService, useValue: data },
      { provide: MEDIA_ENGINE, useValue: { audio, supports: () => true, load: async () => undefined, clear: vi.fn() } },
      { provide: CAPTURE_FACTORY, useValue: create },
      { provide: RECORDING_EXPORT, useValue: { save } },
      { provide: CAPTURE_ACCESS, useValue: { check: access } },
      { provide: CAPTURE_SUPPORT, useValue: { available: () => true } },
    ],
  });
  const player = TestBed.inject(PlayerService);
  return { player, station, other, audio, create, save, folderSave, stop, access, data, c, hooks: () => callbacks };
}
async function playing(s: ReturnType<typeof setup>) {
  await s.player.play(s.station);
  s.audio.dispatchEvent(new Event('playing'));
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Configured recording and explicit source policy', () => {
  it('ends capture before transient recovery, preserves the completed draft and never restarts capture', async () => {
    vi.useFakeTimers();
    const s = setup();
    // AIR-like single candidate, keeping its real recording consent requirement.
    s.station.streams = [s.station.streams[0]];
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    s.hooks().progress(2, true);
    Object.defineProperty(s.audio, 'error', { value: { code: 2 } });
    s.audio.dispatchEvent(new Event('error'));
    expect(s.stop).toHaveBeenCalledOnce();
    expect(s.player.statusLabel()).toBe('reconnecting');
    const blob = new Blob(['unit draft'], { type: 'audio/webm' });
    s.hooks().finished(blob);
    await vi.advanceTimersByTimeAsync(750);
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.player.state()).toBe('playing');
    expect(s.create).toHaveBeenCalledOnce();
    expect(service.state()).toBe('ready');
    await service.save();
    expect(s.save).toHaveBeenCalledWith(blob, expect.any(String));
  });
  it('restarts capture without waiting for a previous segment to finish saving', async () => {
    const s = setup(true, false, true);
    await playing(s);
    const service = TestBed.inject(RecordingService);
    let finishSave!: () => void;
    s.folderSave.mockImplementationOnce(() => new Promise<undefined>(resolve => { finishSave = () => resolve(undefined); }));
    await service.start(true);
    const segment = new Blob(['radio segment'], { type: 'audio/webm' });
    s.hooks().progress(12, true);
    s.hooks().finished(segment, 'limit');
    await vi.waitFor(() => expect(s.create).toHaveBeenCalledTimes(2));
    expect(s.folderSave).toHaveBeenCalledTimes(1);
    expect(s.folderSave.mock.calls[0][0]).toBe(segment);
    expect(s.folderSave.mock.calls[0][1]).toContain('.webm');
    expect(s.folderSave.mock.calls[0]).toHaveLength(2);
    expect(service.automaticSavesInProgress()).toBe(1);
    s.hooks().progress(3, true);
    service.stop();
    s.hooks().finished(segment, 'manual');
    finishSave();
    await vi.waitFor(() => expect(service.automaticSavesInProgress()).toBe(0));
    expect(s.folderSave).toHaveBeenCalledTimes(1);
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(service.state()).toBe('ready');
    expect(service.file()).toBe(segment);
  });
  it('keeps draft available after M4A failure and permits explicit original export', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    const draft = new Blob(['recoverable recording'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    s.folderSave.mockResolvedValueOnce('fallback' as never);
    // Native manual M4A path is represented by the destination result. The
    // browser branch does not call destination without a selected directory.
    const destination = TestBed.inject(RecordingDestination);
    destination.selected.set(true);
    await service.save();
    expect(service.file()).toBe(draft);
    expect(service.conversionFailed()).toBe(true);
    expect(service.state()).toBe('ready');
    s.folderSave.mockResolvedValueOnce('original' as never);
    await service.saveOriginal();
    expect(service.file()).toBeNull();
    expect(service.conversionFailed()).toBe(false);
  });
  it('retains a failed automatic segment for retry instead of silently dropping it', async () => {
    const s = setup(true, false, true);
    await playing(s);
    const service = TestBed.inject(RecordingService);
    s.folderSave.mockRejectedValueOnce(Error('Disk full'));
    await service.start(true);
    const segment = new Blob(['important audio'], { type: 'audio/webm' });
    s.hooks().finished(segment, 'limit');
    await vi.waitFor(() => expect(service.unsavedAutoSegments()).toHaveLength(1));
    expect(service.unsavedAutoSegments()[0].blob).toBe(segment);
    s.folderSave.mockResolvedValueOnce(undefined);
    await service.retryUnsavedSegment();
    expect(service.unsavedAutoSegments()).toHaveLength(0);
  });
  it('hides recording limits entirely when the current stream prohibits recording', async () => {
    const s = setup();
    s.station.streams[0].directListening!.recording = 'prohibited';
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const toggle = (view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle');
    expect(toggle).not.toBeNull();
    toggle!.click();
    view.detectChanges();
    expect(view.nativeElement.textContent).toContain('Recording is prohibited for this stream.');
    expect(view.nativeElement.querySelector('[data-recording-limit]')).toBeNull();
    expect(view.nativeElement.textContent).not.toContain('80 MB');
    expect(view.nativeElement.textContent).not.toContain('2 minutes');
    view.destroy();
  });
  it('keeps recording limits and automatic-save notices out of the recording panel', async () => {
    const s = setup(true, false, true);
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    (view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    expect(view.nativeElement.querySelector('[data-recording-limit]')).toBeNull();
    expect(view.nativeElement.textContent).not.toContain('80 MB');
    expect(view.nativeElement.textContent).not.toContain('2 minutes');
    expect(view.nativeElement.textContent).not.toContain('saved automatically');
    view.destroy();
  });
  it('does not show changed recording limits in the recording panel', async () => {
    const s = setup(true, false, false, 5 * 60_000, 12 * 1024 * 1024);
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    (view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    expect(view.nativeElement.querySelector('[data-recording-limit]')).toBeNull();
    expect(view.nativeElement.textContent).not.toContain('5 minutes');
    expect(view.nativeElement.textContent).not.toContain('12 MB');
    expect(view.nativeElement.textContent).not.toContain('saved automatically');
    view.destroy();
  });
  it('distinguishes paused or absent playback from prohibited recording metadata', async () => {
    const s = setup();
    const service = TestBed.inject(RecordingService);
    expect(service.permission()).toBe('unavailable');
    await playing(s);
    expect(service.permission()).toBe('acknowledgment');
    s.player.pause();
    expect(service.permission()).toBe('unavailable');
  });
  it('accepts independently configured recording booleans in both environments without altering RadioApi', () => {
    for (const e of [environment, production]) {
      expect(Object.keys(e.RadioRecording)).toEqual([
        'Enabled',
        'AllowProhibitedRecording',
        'MaxDurationMs',
        'MaxBytes',
        'AutoContinue',
      ]);
      expect(typeof e.RadioRecording.Enabled).toBe('boolean'); // Neither true nor false is a CI release gate.
      expect(typeof e.RadioRecording.AllowProhibitedRecording).toBe('boolean');
      expect(e.RadioRecording.MaxDurationMs).toBe(3_600_000);
      expect(e.RadioRecording.MaxBytes).toBe(80 * 1024 * 1024);
      expect(e.RadioRecording.AutoContinue).toBe(true);
      expect(e.RadioApi).toEqual({ AllowUnverified: true, CheckVerificationStatus: false, CheckRightsStatus: false });
    }
  });
  it('does not render or initialize recorder controls when disabled, while playback works', async () => {
    const s = setup(false);
    await playing(s);
    const view = TestBed.createComponent(PlayerComponent);
    view.detectChanges();
    await view.whenStable();
    expect(view.nativeElement.querySelector('app-recording-controls')).toBeNull();
    expect(view.nativeElement.textContent).not.toMatch(/Record|Export|Discard/);
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.create).not.toHaveBeenCalled();
  });
  it('requires acknowledgment for unconfirmed rights and never overrides an explicit prohibition', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(false);
    expect(s.create).not.toHaveBeenCalled();
    const stream = s.station.streams[0];
    expect(recordingPermission(stream)).toBe('acknowledgment');
    stream.directListening!.recording = 'prohibited';
    await service.start(true);
    expect(s.create).not.toHaveBeenCalled();
    stream.directListening!.recording = 'permission-granted';
    stream.directListening!.status = 'restricted';
    expect(recordingPermission(stream)).toBe('blocked');
  });
  it('requires a deliberate opt-in and user acknowledgment before recording a prohibited stream', async () => {
    const s = setup(true, true);
    await playing(s);
    const stream = s.station.streams[0];
    stream.directListening!.recording = 'prohibited';
    const service = TestBed.inject(RecordingService);
    expect(recordingPermission(stream)).toBe('blocked');
    expect(recordingPermission(stream, true)).toBe('acknowledgment');
    expect(service.permission()).toBe('acknowledgment');
    await service.start(false);
    expect(s.create).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.create).toHaveBeenCalledOnce();
  });
  it('does not override a stream restricted for listening', () => {
    const s = setup(true, true);
    const stream = s.station.streams[0];
    stream.directListening!.recording = 'prohibited';
    stream.directListening!.status = 'restricted';
    expect(recordingPermission(stream, true)).toBe('blocked');
  });
  it('keeps an active capture running through temporary stream buffering', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    s.hooks().progress(7, true);
    expect(service.state()).toBe('recording');

    s.audio.dispatchEvent(new Event('waiting'));
    expect(s.player.state()).toBe('loading');
    expect(s.player.pendingPhase()).toBe('buffering');
    TestBed.tick();
    expect(s.stop).not.toHaveBeenCalled();
    expect(service.state()).toBe('recording');

    // A second Record click must not initiate a new recording while buffering.
    await service.start(true);
    expect(s.create).toHaveBeenCalledOnce();
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.player.state()).toBe('playing');
    TestBed.tick();
    expect(s.stop).not.toHaveBeenCalled();

    s.player.pause();
    expect(s.stop).toHaveBeenCalledOnce();
    const captured = new Blob(['captured audio'], { type: 'audio/webm' });
    s.hooks().finished(captured, 'manual');
    expect(service.file()).toBe(captured);
    expect(service.state()).toBe('ready');
    await service.save();
    expect(s.save).toHaveBeenCalledWith(captured, expect.any(String));
  });
  it('disables starting a recording while playback temporarily buffers', async () => {
    const s = setup();
    await playing(s);
    s.audio.dispatchEvent(new Event('waiting'));
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')?.disabled).toBe(
      true,
    );
    s.audio.dispatchEvent(new Event('playing'));
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')?.disabled).toBe(
      false,
    );
    view.destroy();
  });
  it('collapses V2 controls after Start and exposes Export only in the bottom dock', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    const consent = root.querySelector<HTMLInputElement>('.consent input')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    await view.whenStable();
    view.detectChanges();
    expect(root.querySelector('.recording-panel')).toBeNull();
    expect(s.create).toHaveBeenCalledOnce();
    s.hooks().progress(4, true);
    s.hooks().progress(62, true);
    view.detectChanges();
    expect(root.querySelector('.recording-time')?.textContent).toBe('1 minute 2 s');
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    expect(root.querySelector('.recording-panel [role="status"]')?.textContent).toContain('1 minute 2 s');
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    s.player.pause();
    const draft = new Blob(['previous audio'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    view.detectChanges();
    expect(root.querySelectorAll('.recording-launcher .quick-action')).toHaveLength(1);
    expect(root.querySelector('.recording-launcher')?.textContent).toContain('Export recording');
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    expect(root.querySelector('.recording-panel')?.textContent).toContain('Start recording');
    expect(root.querySelector('.recording-panel')?.textContent).not.toContain('Export recording');
    expect(root.querySelector('.recording-panel')?.querySelector('button')?.textContent).not.toContain('Export');
    expect(root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')?.disabled).toBe(true);
    expect(view.componentInstance.recorder.file()).toBe(draft);
    view.destroy();
  });

  it('closes only the recording popup when clicking outside, without interrupting capture', async () => {
    const s = setup();
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const control = view.componentInstance;
    await control.recorder.start(true);
    s.hooks().progress(3, true);
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    expect(control.expanded()).toBe(true);
    root.querySelector<HTMLButtonElement>('.recording-panel .close-panel')!.dispatchEvent(
      new Event('pointerdown', { bubbles: true, composed: true }),
    );
    expect(control.expanded()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    view.detectChanges();
    expect(control.expanded()).toBe(false);
    expect(root.querySelector('.recording-panel')).toBeNull();
    expect(control.recorder.state()).toBe('recording');
    expect(s.stop).not.toHaveBeenCalled();
    view.destroy();
  });

  it('rejects overlapping sheet requests and treats dismissal as Cancel', async () => {
    setup();
    const view = TestBed.createComponent(RecordingConfirmationComponent);
    view.detectChanges();
    const sheet = view.componentInstance;
    const first = sheet.ask('discard');
    expect(sheet.request()).toBe('discard');
    expect(await sheet.ask('switch')).toBe(false);
    expect(sheet.request()).toBe('discard');
    sheet.cancel();
    expect(await first).toBe(false);
    expect(sheet.request()).toBeNull();
    const second = sheet.ask('switch');
    sheet.confirm();
    expect(await second).toBe(true);
    view.destroy();
  });

  it('requires confirmation before discarding an active recording or a completed draft', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const recorder = view.componentInstance.recorder;
    await recorder.start(true);
    s.hooks().progress(3, true);
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    const discardButton = () => root.querySelector<HTMLButtonElement>('.recording-panel .secondary-action')!;
    expect(discardButton().querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    const sheet = view.componentInstance.confirmation();
    discardButton().click();
    view.detectChanges();
    expect(sheet.request()).toBe('discard');
    expect(recorder.state()).toBe('recording');
    expect(s.stop).not.toHaveBeenCalled();
    sheet.cancel();
    await view.whenStable();
    expect(recorder.state()).toBe('recording');
    expect(root.querySelector('.recording-panel')).not.toBeNull();
    discardButton().click();
    sheet.confirm();
    await view.whenStable();
    view.detectChanges();
    expect(recorder.state()).toBe('idle');
    expect(s.stop).toHaveBeenCalledWith(true);
    expect(root.querySelector('.recording-panel')).toBeNull();

    // The same confirmation also protects unsaved audio after Stop.
    await recorder.start(true);
    const draft = new Blob(['audio draft']);
    s.hooks().finished(draft, 'manual');
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    discardButton().click();
    expect(sheet.request()).toBe('discard');
    sheet.cancel();
    await view.whenStable();
    expect(recorder.file()).toBe(draft);
    discardButton().click();
    sheet.confirm();
    await view.whenStable();
    expect(recorder.file()).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
    view.destroy();
  });

  it('blocks station switching during recording until approved, then preserves captured audio', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const recorder = view.componentInstance.recorder;
    await recorder.start(true);
    s.hooks().progress(8, true);
    const sheet = view.componentInstance.confirmation();
    const cancelledSwitch = s.player.play(s.other);
    expect(sheet.request()).toBe('switch');
    expect(s.player.station()?.id).toBe(s.station.id);
    sheet.cancel();
    await cancelledSwitch;
    expect(s.player.station()?.id).toBe(s.station.id);
    expect(recorder.state()).toBe('recording');
    expect(s.stop).not.toHaveBeenCalled();

    const approvedSwitch = s.player.toggle(s.other);
    expect(sheet.request()).toBe('switch');
    expect(s.player.station()?.id).toBe(s.station.id);
    sheet.confirm();
    await approvedSwitch;
    expect(s.player.station()?.id).toBe(s.other.id);
    expect(s.stop).toHaveBeenCalledOnce();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(recorder.state()).toBe('stopping');
    const saved = new Blob(['captured audio'], { type: 'audio/webm' });
    s.hooks().finished(saved, 'manual');
    expect(recorder.file()).toBe(saved);
    view.destroy();
  });

  it('does not request station-switch confirmation when no capture is active', async () => {
    const s = setup();
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    await s.player.play(s.other);
    expect(view.componentInstance.confirmation().request()).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(s.player.station()?.id).toBe(s.other.id);
    view.destroy();
  });

  it('requires explicit confirmation before replacing a previous draft', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const recorder = view.componentInstance.recorder;
    await recorder.start(true);
    const draft = new Blob(['genuine station audio'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    const consent = root.querySelector<HTMLInputElement>('.consent input')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    view.detectChanges();
    expect(root.querySelector('.recording-panel')?.textContent).toContain('Starting a new recording');
    expect(recorder.file()).toBe(draft);
    expect(s.create).toHaveBeenCalledOnce();
    root.querySelector<HTMLButtonElement>('.recording-panel .secondary-action')!.click();
    view.detectChanges();
    expect(recorder.file()).toBe(draft);
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    await view.whenStable();
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(recorder.file()).toBeNull();
    expect(root.querySelector('.recording-panel')).toBeNull();
    view.destroy();
  });

  it('opens the first V2 recording folder picker from Start, without navigating to Settings', async () => {
    const s = setup(true, false, true);
    s.c.manifest.schemaVersion = 2;
    const folder = TestBed.inject(RecordingDestination);
    folder.selected.set(false);
    folder.name.set('');
    const choose = vi.spyOn(folder, 'chooseFolder').mockImplementation(async () => {
      folder.selected.set(true);
      folder.name.set('first-recordings');
      return true;
    });
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    const consent = root.querySelector<HTMLInputElement>('.consent input')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    await view.whenStable();
    expect(choose).toHaveBeenCalledOnce();
    expect(s.create).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(root.querySelector('.recording-panel')).toBeNull();
    view.destroy();
  });

  it('keeps first-use cancellation in the recording panel without a Settings redirect', async () => {
    const s = setup(true, false, true);
    s.c.manifest.schemaVersion = 2;
    const folder = TestBed.inject(RecordingDestination);
    folder.selected.set(false);
    folder.name.set('');
    vi.spyOn(folder, 'chooseFolder').mockResolvedValue(false);
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.recording-toggle')!.click();
    view.detectChanges();
    const consent = root.querySelector<HTMLInputElement>('.consent input')!;
    consent.checked = true;
    consent.dispatchEvent(new Event('change'));
    view.detectChanges();
    root.querySelector<HTMLButtonElement>('.recording-panel .primary-action')!.click();
    await view.whenStable();
    view.detectChanges();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(root.querySelector('.recording-panel')?.textContent).toContain('Choose a recording folder');
    expect(s.create).not.toHaveBeenCalled();
    view.destroy();
  });

  it('does not replace a revoked prior folder from Start', async () => {
    const s = setup(true, false, true);
    s.c.manifest.schemaVersion = 2;
    const folder = TestBed.inject(RecordingDestination);
    folder.selected.set(false);
    folder.name.set('previous-folder');
    vi.spyOn(folder, 'hasAccess').mockResolvedValue(false);
    const chooser = vi.spyOn(folder, 'chooseFolder');
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    await recorder.start(true, { promptFirstFolder: true });
    expect(chooser).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/settings']);
    expect(recorder.message()).toBe('recordingFolderRequired');
  });

  it('shows a localized success snackbar, clears the draft and removes dock Export only after successful save', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const recorder = view.componentInstance.recorder;
    await recorder.start(true);
    const draft = new Blob(['saved broadcast audio'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    expect(root.querySelector('.recording-launcher')?.textContent).toContain('Export recording');
    const snackbar = TestBed.inject(SnackbarService);
    expect(snackbar.current()).toBeNull();
    await recorder.save();
    view.detectChanges();
    expect(s.save).toHaveBeenCalledWith(draft, expect.any(String));
    expect(recorder.file()).toBeNull();
    expect(recorder.state()).toBe('idle');
    expect(recorder.seconds()).toBe(0);
    expect(recorder.message()).toBeNull();
    expect(root.querySelector('.recording-launcher')?.textContent).not.toContain('Export recording');
    expect(snackbar.current()).toMatchObject({
      tone: 'success',
      content: { kind: 'localized', key: 'recordingExported' },
    });
    view.destroy();
  });

  it('retains the recording and Export control on failed save, then clears after a retry', async () => {
    const s = setup();
    await playing(s);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    const recorder = view.componentInstance.recorder;
    const snackbar = TestBed.inject(SnackbarService);
    await recorder.start(true);
    const draft = new Blob(['audio'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    s.save.mockRejectedValueOnce(new Error('Folder write failed'));
    await recorder.save();
    view.detectChanges();
    expect(recorder.file()).toBe(draft);
    expect(recorder.message()).toBe('recordingSaveError');
    expect(snackbar.current()).toBeNull();
    expect((view.nativeElement as HTMLElement).querySelector('.recording-launcher')?.textContent).toContain(
      'Export recording',
    );
    await recorder.save();
    view.detectChanges();
    expect(s.save).toHaveBeenCalledTimes(2);
    expect(recorder.file()).toBeNull();
    expect(snackbar.current()?.tone).toBe('success');
    view.destroy();
  });

  it('does not clear a newer draft when a stale export finishes after it was discarded', async () => {
    const s = setup();
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    const snackbar = TestBed.inject(SnackbarService);
    await recorder.start(true);
    const draft = new Blob(['old audio'], { type: 'audio/webm' });
    s.hooks().finished(draft, 'manual');
    let resolveSave!: () => void;
    s.save.mockImplementationOnce(() => new Promise<undefined>(resolve => { resolveSave = () => resolve(undefined); }));
    const pending = recorder.save();
    expect(recorder.state()).toBe('exporting');
    recorder.discard();
    expect(recorder.file()).toBeNull();
    resolveSave();
    await pending;
    expect(recorder.file()).toBeNull();
    expect(recorder.message()).toBeNull();
    expect(snackbar.current()).toBeNull();
  });

  it('does not consume an unsaved segment while automatic continuation saves and restarts', async () => {
    const s = setup(true, false, true);
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    const snackbar = TestBed.inject(SnackbarService);
    await recorder.start(true);
    const segment = new Blob(['first segment'], { type: 'audio/webm' });
    s.hooks().finished(segment, 'limit');
    await vi.waitFor(() => expect(s.create).toHaveBeenCalledTimes(2));
    expect(snackbar.current()).toBeNull();
    expect(recorder.file()).toBeNull();
  });

  it('keeps manual stops exportable instead of auto-saving them in continuation mode', async () => {
    const s = setup(true, false, true);
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    const blob = new Blob(['manual segment'], { type: 'audio/webm' });
    s.player.pause();
    s.hooks().finished(blob, 'manual');
    expect(service.state()).toBe('ready');
    expect(service.file()).toBe(blob);
    expect(s.folderSave).not.toHaveBeenCalled();
    await service.save();
    expect(s.folderSave).toHaveBeenCalledWith(blob, expect.any(String));
  });
  it('keeps a station-switch recording available until exported or discarded', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    const next = s.player.play(s.other);
    expect(s.stop).toHaveBeenCalledOnce();
    const blob = new Blob(['previous station'], { type: 'audio/webm' });
    s.hooks().finished(blob, 'manual');
    await next;
    expect(service.state()).toBe('ready');
    expect(service.file()).toBe(blob);
    await service.start(true);
    expect(s.create).toHaveBeenCalledOnce();
    await service.save();
    expect(s.save).toHaveBeenCalledWith(blob, expect.any(String));
  });
  it('disables the Record launcher while playback is still connecting', async () => {
    const s = setup();
    const pending = s.player.play(s.station);
    const view = TestBed.createComponent(RecordingControlsComponent);
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')?.disabled).toBe(
      true,
    );
    await pending;
    s.audio.dispatchEvent(new Event('playing'));
    view.detectChanges();
    expect((view.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.recording-toggle')?.disabled).toBe(
      false,
    );
    view.destroy();
  });
  it('starts only on request and claims recording only after genuine-data confirmation', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    expect(s.create).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.create).toHaveBeenCalledWith(
      s.audio,
      expect.any(AbortSignal),
      expect.any(Object),
      expect.objectContaining({ MaxDurationMs: 3_600_000, MaxBytes: 80 * 1024 * 1024 }),
    );
    s.hooks().progress(1, false);
    expect(service.state()).toBe('starting');
    s.hooks().progress(2, true);
    expect(service.state()).toBe('recording');
    expect(service.seconds()).toBe(2);
    service.stop();
    expect(s.stop).toHaveBeenCalledWith();
    // Unit fixture only. Real capture is checked separately in Chrome.
    const blob = new Blob(['controlled unit data'], { type: 'audio/webm' });
    s.hooks().finished(blob);
    expect(service.state()).toBe('ready');
    await service.save();
    expect(s.save).toHaveBeenCalledWith(blob, expect.stringMatching(/^RadioBee-.*\.webm$/));
  });
  it('discards pending asynchronous capture and ignores stale final data', async () => {
    const s = setup();
    await playing(s);
    let resolve!: (value: { stop: typeof s.stop }) => void;
    s.create.mockImplementationOnce(() => new Promise(r => (resolve = r)));
    const service = TestBed.inject(RecordingService);
    const pending = service.start(true);
    const signal = s.create.mock.calls[0][1];
    service.discard();
    expect(signal.aborted).toBe(true);
    resolve({ stop: s.stop });
    await pending;
    expect(s.stop).toHaveBeenCalledWith(true);
    expect(service.file()).toBeNull();
  });
  it('does not let a discarded attempt rejection change a newly prepared capture', async () => {
    const s = setup();
    await playing(s);
    let reject!: (error: Error) => void;
    s.create.mockImplementationOnce(() => new Promise((_resolve, fail) => (reject = fail)));
    const service = TestBed.inject(RecordingService);
    const old = service.start(true);
    service.discard();
    nativeSource(s);
    vi.mocked(s.audio.play).mockImplementation(async () => {
      s.audio.dispatchEvent(new Event('playing'));
    });
    await service.start(true);
    expect(s.audio.crossOrigin).toBe('anonymous');
    reject(Error('Late discarded failure'));
    await old;
    expect(s.audio.crossOrigin).toBe('anonymous');
    expect(service.state()).toBe('starting');
    expect(s.create).toHaveBeenCalledTimes(2);
  });
  it('reports unsupported/security errors without stopping audio', async () => {
    const s = setup();
    await playing(s);
    s.create.mockRejectedValueOnce(new DOMException('CORS', 'SecurityError'));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(service.state()).toBe('error');
    expect(service.message()).toBe('recordingUnsupported');
    expect(s.player.state()).toBe('playing');
  });
  it('rejects empty capture, handles recorder error and retains a file after export errors', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    s.hooks().finished(null);
    expect(service.file()).toBeNull();
    expect(service.message()).toBe('recordingEmpty');
    await service.start(true);
    s.hooks().failed();
    expect(service.state()).toBe('error');
    await service.start(true);
    const blob = new Blob(['unit data'], { type: 'audio/ogg' });
    s.hooks().finished(blob);
    s.save.mockRejectedValueOnce(Error('Device'));
    await service.save();
    expect(service.file()).toBe(blob);
    expect(service.message()).toBe('recordingSaveError');
    service.discard();
    expect(service.file()).toBeNull();
  });
  for (const action of ['pause', 'stop', 'switch', 'failure'] as const)
    it(`terminates capture synchronously before player ${action}`, async () => {
      const s = setup();
      await playing(s);
      const service = TestBed.inject(RecordingService);
      await service.start(true);
      if (action === 'switch') {
        const next = s.player.play(s.other);
        expect(s.stop).toHaveBeenCalled();
        await next;
      } else if (action === 'failure') s.audio.dispatchEvent(new Event('error'));
      else s.player[action]();
      expect(s.stop).toHaveBeenCalledOnce();
      expect(service.state()).toBe('stopping');
    });
  it('stops on a recording-policy revocation independently of relaxed listening checks', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    const next = structuredClone(s.c);
    next.stations.find(st => st.id === s.station.id)!.streams[0].directListening!.recording = 'prohibited';
    s.data.catalog.set(next);
    TestBed.tick();
    expect(s.stop).toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
  });
  it('discards and unregisters observers on destruction and stops on hidden/pagehide', async () => {
    const s = setup();
    await playing(s);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(s.stop).toHaveBeenCalled();
    service.discard();
    await service.start(true);
    service.ngOnDestroy();
    expect(service.file()).toBeNull();
    expect(s.create.mock.calls.at(-1)![1].aborted).toBe(true);
  });
  it('produces safe station/timestamp filenames and uses actual output containers', () => {
    const date = new Date('2026-11-07T12:00:00Z');
    expect(recordingFilename('../Station: FM', 'audio/webm;codecs=opus', date)).toBe(
      'RadioBee-Station-FM-2026-11-07T12-00-00-000Z.webm',
    );
    expect(recordingFilename('தமிழ்', 'audio/mp4', date)).toMatch(/தமிழ்.*\.m4a$/);
    expect(recordingFilename('Station', 'audio/ogg', date)).toMatch(/\.ogg$/);
  });
  function nativeSource(s: ReturnType<typeof setup>) {
    Object.defineProperty(s.audio, 'currentSrc', { value: s.station.streams[0].url, configurable: true });
  }
  it('prepares native capture only after a user request and restores the playback mode on stop', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play).mockImplementation(async () => {
      s.audio.dispatchEvent(new Event('playing'));
    });
    const service = TestBed.inject(RecordingService);
    expect(s.access).not.toHaveBeenCalled();
    await service.start(true);
    expect(s.access).toHaveBeenCalledWith(s.station.streams[0].url, expect.any(AbortSignal));
    expect(s.audio.crossOrigin).toBe('anonymous');
    expect(s.create).toHaveBeenCalledOnce();
    service.stop();
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
  });
  it('does not disturb playback or construct a recorder when a CORS check fails', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    s.access.mockRejectedValueOnce(Error('CORS'));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.player.state()).toBe('playing');
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
    expect(s.create).not.toHaveBeenCalled();
    expect(service.message()).toBe('recordingUnsupported');
  });
  it('does not restart playback or make access requests on unsupported recording platforms', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.spyOn(TestBed.inject(CAPTURE_SUPPORT), 'available').mockReturnValue(false);
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.access).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    expect(service.message()).toBe('recordingUnsupported');
  });
  for (const action of ['pause', 'stop', 'switch'] as const)
    it(`never restarts after ${action} during capture preparation`, async () => {
      const s = setup();
      await playing(s);
      nativeSource(s);
      let resolve!: () => void;
      s.access.mockImplementationOnce(() => new Promise<void>(r => (resolve = r)));
      const service = TestBed.inject(RecordingService);
      const pending = service.start(true);
      if (action === 'switch') await s.player.play(s.other);
      else s.player[action]();
      resolve();
      await pending;
      expect(s.create).not.toHaveBeenCalled();
      expect(s.audio.getAttribute('crossorigin')).toBeNull();
      expect(s.player.station()?.id).toBe(
        action === 'stop' ? undefined : action === 'switch' ? s.other.id : s.station.id,
      );
      if (action === 'pause') expect(s.player.state()).toBe('paused');
    });
  it('makes one ordinary playback restoration after a failed CORS restart without retry loops', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play)
      .mockRejectedValueOnce(Error('CORS'))
      .mockImplementation(async () => {
        s.audio.dispatchEvent(new Event('playing'));
      });
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.audio.play).toHaveBeenCalledTimes(3); // Initial playback, capture restart, ordinary restoration.
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
    expect(s.create).not.toHaveBeenCalled();
    expect(s.player.state()).toBe('playing');
    expect(service.state()).toBe('error');
  });
  it('does not create a fresh session over the player reconnect scheduled during capture preparation', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.station.streams = [s.station.streams[0]];
    await playing(s);
    nativeSource(s);
    vi.mocked(s.audio.play).mockRejectedValueOnce(new PlaybackError({ kind: 'network', transient: true }));
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(s.audio.play).toHaveBeenCalledTimes(2); // Initial selection and explicit capture preparation.
    expect(s.player.statusLabel()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(750);
    expect(s.audio.play).toHaveBeenCalledTimes(3);
    expect(
      s.player
        .diagnostics()
        .filter(d => d.result === 'attempt')
        .map(d => d.attempt),
    ).toEqual([1, 1, 2]);
    s.audio.dispatchEvent(new Event('playing'));
    expect(s.create).not.toHaveBeenCalled();
    expect(service.state()).toBe('error');
  });
  for (const action of ['pause', 'stop', 'switch'] as const)
    it(`cancels an already-loading CORS restart on ${action}`, async () => {
      const s = setup();
      await playing(s);
      nativeSource(s);
      const service = TestBed.inject(RecordingService);
      const pending = service.start(true);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(s.audio.crossOrigin).toBe('anonymous');
      expect(s.player.state()).toBe('loading');
      if (action === 'switch') await s.player.play(s.other);
      else s.player[action]();
      await pending;
      expect(s.audio.getAttribute('crossorigin')).toBeNull();
      expect(s.create).not.toHaveBeenCalled();
      expect(s.audio.play).toHaveBeenCalledTimes(action === 'switch' ? 3 : 2);
      expect(s.player.station()?.id).toBe(
        action === 'stop' ? undefined : action === 'switch' ? s.other.id : s.station.id,
      );
      if (action === 'pause') expect(s.player.state()).toBe('paused');
    });
  it('reports v2 media access failures distinctly without restarting normal playback', async () => {
    const s = setup();
    await playing(s);
    nativeSource(s);
    const c = structuredClone(s.c);
    c.manifest.schemaVersion = 2;
    s.data.catalog.set(c);
    s.access.mockRejectedValueOnce(new CaptureAccessError());
    const service = TestBed.inject(RecordingService);
    await service.start(true);
    expect(service.message()).toBe('recordingAccessUnavailable');
    expect(s.player.state()).toBe('playing');
    expect(s.audio.getAttribute('crossorigin')).toBeNull();
    expect(s.create).not.toHaveBeenCalled();
  });
});

describe('V2 persistent recording lifecycle', () => {
  it('claims startup before awaiting the folder and ignores duplicate starts', async () => {
    const s = setup(true, false, true);
    let allow!: (value: boolean) => void;
    const folder = TestBed.inject(RecordingDestination);
    vi.spyOn(folder, 'hasAccess').mockImplementation(
      () =>
        new Promise(resolve => {
          allow = resolve;
        }),
    );
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    const pending = recorder.start(true);
    expect(recorder.state()).toBe('preparing');
    await recorder.start(true);
    allow(true);
    await pending;
    expect(s.create).toHaveBeenCalledOnce();
  });
  it('handles a rejected folder permission request without creating or wedging capture', async () => {
    const s = setup(true, false, true);
    vi.spyOn(TestBed.inject(RecordingDestination), 'hasAccess').mockRejectedValue(Error('Folder inaccessible'));
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    await recorder.start(true);
    expect(recorder.state()).toBe('idle');
    expect(recorder.message()).toBe('recordingFolderRequired');
    expect(s.create).not.toHaveBeenCalled();
  });
  it('still finishes capture on pagehide instead of promising recording after document exit', async () => {
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    await recorder.start(true);
    s.hooks().progress(5, true);
    window.dispatchEvent(new Event('pagehide'));
    const draft = new Blob(['genuine prior audio']);
    s.hooks().finished(draft, 'manual');
    expect(recorder.lastStopReason()).toBe('pagehide');
    expect(recorder.file()).toBe(draft);
    expect(recorder.state()).toBe('ready');
  });
  it('does not resume a cancelled folder preparation', async () => {
    const s = setup(true, false, true);
    let allow!: (value: boolean) => void;
    vi.spyOn(TestBed.inject(RecordingDestination), 'hasAccess').mockImplementation(
      () =>
        new Promise(resolve => {
          allow = resolve;
        }),
    );
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    const pending = recorder.start(true);
    s.player.stop();
    allow(true);
    await pending;
    expect(s.create).not.toHaveBeenCalled();
    expect(recorder.state()).toBe('idle');
  });
  for (const version of [1, 2]) {
    it(`retains internal navigation only for V2 (schema ${version})`, async () => {
      const s = setup();
      s.c.manifest.schemaVersion = version;
      const events = TestBed.inject(Router).events as Subject<NavigationStart>;
      await playing(s);
      const recorder = TestBed.inject(RecordingService);
      await recorder.start(true);
      s.hooks().progress(5, true);
      events.next(new NavigationStart(1, '/settings'));
      expect(s.stop).toHaveBeenCalledTimes(version === 2 ? 0 : 1);
      expect(recorder.state()).toBe(version === 2 ? 'recording' : 'stopping');
    });
    it(`retains browser background capture only for V2 (schema ${version})`, async () => {
      const s = setup();
      s.c.manifest.schemaVersion = version;
      await playing(s);
      const recorder = TestBed.inject(RecordingService);
      await recorder.start(true);
      s.hooks().progress(5, true);
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(s.stop).toHaveBeenCalledTimes(version === 2 ? 0 : 1);
    });
  }
  it('retains genuine failure audio and explains why recovered playback has not restarted recording', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.c.manifest.schemaVersion = 2;
    s.station.streams = [s.station.streams[0]];
    await playing(s);
    const recorder = TestBed.inject(RecordingService);
    await recorder.start(true);
    s.hooks().progress(9, true);
    Object.defineProperty(s.audio, 'error', { value: { code: 2 } });
    s.audio.dispatchEvent(new Event('error'));
    const draft = new Blob(['captured radio']);
    s.hooks().finished(draft, 'manual');
    await vi.advanceTimersByTimeAsync(750);
    s.audio.dispatchEvent(new Event('playing'));
    expect(recorder.file()).toBe(draft);
    expect(recorder.message()).toBe('recordingInterrupted');
    expect(s.create).toHaveBeenCalledOnce();
    expect(recorder.diagnostics().some(row => row.event === 'stop' && row.reason === 'failure')).toBe(true);
  });
});

describe('Capture evidence isolation', () => {
  for (const version of [1, 2])
    it(`keeps bounded evidence for V2 only, ignoring obsolete capture callbacks (schema ${version})`, async () => {
      const s = setup();
      s.c.manifest.schemaVersion = version;
      await playing(s);
      const recorder = TestBed.inject(RecordingService);
      await recorder.start(true);
      const event = vi.fn();
      window.addEventListener('radiobee-recording-diagnostic', event);
      try {
        const snapshot: CaptureDiagnostic = {
          at: 1,
          phase: 'capturing',
          contextState: 'running',
          tracks: [{ readyState: 'live', muted: false, enabled: true }],
          recorderState: 'recording',
          mimeType: 'audio/webm',
          bytes: 1024,
          seconds: 1,
          rms: 0.1,
          maxRms: 0.2,
          signalWindows: 3,
          heard: true,
          captureAttempt: 1,
        };
        for (let index = 0; index < 20; index++) s.hooks().diagnostic?.({ ...snapshot, at: index });
        expect(recorder.captureDiagnostics()).toHaveLength(version === 2 ? 12 : 0);
        expect(event).toHaveBeenCalledTimes(version === 2 ? 20 : 0);
        if (version === 2) expect((event.mock.calls[0][0] as CustomEvent).detail.stationId).toBe(s.station.id);
        recorder.discard();
        const before = event.mock.calls.length;
        s.hooks().diagnostic?.(snapshot);
        expect(event).toHaveBeenCalledTimes(before);
      } finally {
        window.removeEventListener('radiobee-recording-diagnostic', event);
      }
    });
});

describe('Zero-frame browser capture status', () => {
  for (const version of [1, 2])
    it(`opts only V2 into one recovery and reports the correct failure (schema ${version})`, async () => {
      const s = setup();
      s.c.manifest.schemaVersion = version;
      await playing(s);
      const recorder = TestBed.inject(RecordingService);
      await recorder.start(true);
      expect(s.create.mock.calls[0][3]?.retryEmptyCapture).toBe(version === 2 ? true : undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      s.hooks().diagnostic?.({
        at: 1,
        phase: 'finished',
        reason: 'no-audio',
        contextState: 'running',
        tracks: [{ readyState: 'live', muted: false, enabled: true }],
        recorderState: 'recording',
        mimeType: 'audio/webm',
        bytes: 0,
        seconds: 8,
        rms: 0,
        maxRms: 0,
        signalWindows: 0,
        heard: false,
        captureAttempt: 2,
      });
      s.hooks().finished(null, 'no-audio');
      expect(recorder.message()).toBe(version === 2 ? 'recordingCaptureUnavailable' : 'recordingEmpty');
      expect(recorder.file()).toBeNull();
      expect(s.player.state()).toBe('playing');
    });
  it('localizes the browser capture-unavailable status for all supported locales', () => {
    for (const locale of ['en', 'ta', 'sa'])
      expect(uiLabel(locale, 'recordingCaptureUnavailable')).not.toBe('recordingCaptureUnavailable');
    expect(uiLabel('ta', 'recordingCaptureUnavailable')).toMatch(/[\u0b80-\u0bff]/);
    expect(uiLabel('sa', 'recordingCaptureUnavailable')).toMatch(/[\u0900-\u097f]/);
  });
});
