import { Component, DestroyRef, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { RecordingService } from './recording.service';
import { RecordingDestination } from './recording-destination';
import { PlayerService } from '../player/player.service';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { radioIcons } from '../shared/radio-icons';
import { RecordingDurationPipe } from './recording-duration.pipe';
import { RecordingConfirmationComponent } from './recording-confirmation';
@Component({
  selector: 'app-recording-controls',
  imports: [IonIcon, IonSpinner, RecordingDurationPipe, RecordingConfirmationComponent],
  host: { '(document:pointerdown)': 'outsidePointer($event)' },
  providers: [RecordingService],
  template: `
    @if (player.station() || recorder.state() !== 'idle') {
      <div class="recording-dock rb-ui" [attr.lang]="catalog.locale()">
        <div class="recording-launcher">
          <button
            class="recording-toggle"
            type="button"
            [disabled]="player.state() === 'loading' && !recorder.file() && (recorder.state() === 'idle' || recorder.state() === 'error')"
            aria-controls="radio-recording-panel"
            [attr.aria-expanded]="expanded()"
            (click)="togglePanel()">
            <ion-icon [icon]="icons.radioButtonOn" aria-hidden="true" />
            <span>{{ ui('record') }}</span>
            @if (recorder.state() === 'recording') {
              <span class="recording-time" role="status">{{ recorder.seconds() | recordingDuration: catalog.locale() }}</span>
            } @else if (recorder.file()) {
              <span class="recording-time">{{ ui('recordingReady') }}</span>
            }
            <ion-icon class="recording-chevron" [class.open]="expanded()" [icon]="icons.chevronDownOutline" aria-hidden="true" />
          </button>
          @if (
            recorder.state() === 'preparing' ||
            recorder.state() === 'starting' ||
            recorder.state() === 'recording'
          ) {
            <button class="quick-action" type="button" (click)="recorder.stop()">
              <ion-icon [icon]="icons.stop" aria-hidden="true" />
              {{ ui('stopRecording') }}
            </button>
          }
          @if (recorder.state() === 'exporting' || destination.converting() > 0) {
            <span class="recording-export-progress" role="status" aria-live="polite">
              <ion-spinner name="crescent" aria-hidden="true" />
              {{ savingText() }}
            </span>
          }
          @if (recorder.unsavedAutoSegments().length > 0) {
            <button class="quick-action" type="button"
              [disabled]="recorder.automaticSavesInProgress() > 0"
              (click)="recorder.retryUnsavedSegment()">
              <ion-icon [icon]="icons.downloadOutline" aria-hidden="true" />
              {{ retryText() }} ({{ recorder.unsavedAutoSegments().length }})
            </button>
          }
          @if (recorder.file()) {
            <button
              class="quick-action"
              type="button"
              (click)="recorder.save()"
              [disabled]="recorder.state() !== 'ready' && recorder.state() !== 'error'">
              <ion-icon [icon]="icons.downloadOutline" aria-hidden="true" />
              {{ recorder.conversionFailed() ? retryM4aText() : ui('exportRecording') }}
            </button>
            @if (recorder.conversionFailed()) {
              <button
                class="quick-action"
                type="button"
                (click)="recorder.saveOriginal()"
                [disabled]="recorder.state() !== 'ready' && recorder.state() !== 'error'">
                <ion-icon [icon]="icons.downloadOutline" aria-hidden="true" />
                {{ exportOriginalText() }}
              </button>
            }
          }
        </div>
        @if (expanded()) {
          <section
            id="radio-recording-panel"
            class="recording-panel"
            [attr.aria-label]="ui('record')">
            <header>
              <strong>{{ ui('record') }}</strong>
              <button class="close-panel" type="button" [attr.aria-label]="ui('close')" (click)="expanded.set(false)">
                <ion-icon [icon]="icons.close" aria-hidden="true" />
              </button>
            </header>
            @if (recorder.state() === 'idle' || recorder.state() === 'error' || recorder.state() === 'ready') {
              @if (recorder.permission() === 'blocked') {
                <p>{{ ui('recordingProhibited') }}</p>
              } @else {
                @if (recorder.permission() === 'unavailable') {
                  <p>{{ ui('recordingPlaybackRequired') }}</p>
                }
                @if (recorder.permission() === 'acknowledgment') {
                  <label class="consent">
                    <input type="checkbox" [checked]="acknowledged()" (change)="acknowledge($event)" />
                    <span>{{ ui('recordingConsent') }}</span>
                  </label>
                }
                @if (confirmReplace() && recorder.file()) {
                  <p role="alert">{{ ui('recordingReplaceConfirm') }}</p>
                  <button class="primary-action" type="button"
                    [disabled]="!canStart()"
                    (click)="begin(true)">{{ ui('recordingReplaceStart') }}</button>
                  <button class="secondary-action" type="button"
                    (click)="confirmReplace.set(false)">{{ ui('recordingReplaceCancel') }}</button>
                } @else {
                  <button class="primary-action" type="button"
                    [disabled]="!canStart()" (click)="begin()">
                    <ion-icon [icon]="icons.radioButtonOn" aria-hidden="true" />{{ ui('recordingStart') }}
                  </button>
                }
              }
            }
            @if (
              recorder.state() === 'preparing' ||
              recorder.state() === 'starting' ||
              recorder.state() === 'recording' ||
              recorder.state() === 'stopping'
            ) {
              <p role="status">
                {{ ui(recorder.state() === 'recording' ? 'recording' : 'recordingStarting') }}
                - {{ recorder.seconds() | recordingDuration: catalog.locale() }}
              </p>
              <button
                class="primary-action"
                type="button"
                (click)="recorder.stop()"
                [disabled]="recorder.state() === 'stopping'">
                <ion-icon [icon]="icons.stop" aria-hidden="true" />{{ ui('stopRecording') }}
              </button>
            }
            @if (recorder.file() || recorder.state() === 'preparing' ||
                  recorder.state() === 'starting' || recorder.state() === 'recording' ||
                  recorder.state() === 'stopping') {
              <button
                class="secondary-action"
                type="button"
                (click)="discard()"
                [disabled]="recorder.state() === 'exporting'">
                <ion-icon [icon]="icons.trashOutline" aria-hidden="true" />{{ ui('discard') }}
              </button>
            }
            @if (recorder.message(); as message) {
              <p [attr.role]="recorder.state() === 'error' ? 'alert' : 'status'">{{ ui(message) }}</p>
            }
          </section>
        }
      </div>
      <app-recording-confirmation />
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      z-index: 2;
    }
    .recording-dock {
      color: var(--ink);
      background: var(--surface);
    }
    .recording-launcher {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 48px;
      padding: 4px clamp(12px, 4vw, 64px);
      border-top: 1px solid var(--line);
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 9px 14px;
      color: var(--ink);
      background: var(--paper);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }
    button:disabled { opacity: .55; cursor: default; }
    button:focus-visible, input:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 2px; }
    ion-icon { font-size: 19px; flex: none; }
    .recording-toggle { border-color: var(--accent-ink); }
    .recording-toggle ion-icon { color: var(--accent-ink); }
    .recording-time { font-size: 11px; font-variant-numeric: tabular-nums; }
    .recording-export-progress {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--accent-ink); font-size: 12px; font-weight: 700;
      max-width: 100%; min-height: 44px;
    }
    .recording-export-progress ion-spinner { width: 21px; height: 21px; flex: none; }
    @media (prefers-reduced-motion: reduce) {
      .recording-export-progress ion-spinner { --animation-duration: 0s; }
    }
    .recording-chevron { font-size: 15px; transition: transform .15s ease; }
    .recording-chevron.open { transform: rotate(180deg); }
    .recording-panel {
      position: absolute;
      right: clamp(12px, 4vw, 64px);
      bottom: calc(100% + 8px);
      z-index: 3;
      width: min(440px, calc(100vw - 24px));
      max-height: min(65dvh, 560px);
      overflow-y: auto;
      overscroll-behavior: contain;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 8px 36px #10251f35;
      background: var(--surface);
    }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    header strong { font-size: 16px; }
    .close-panel { min-width: 44px; padding: 8px; }
    .consent { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; line-height: 1.5; }
    .consent input { width: 20px; height: 20px; flex: none; accent-color: var(--accent-ink); }
    .primary-action { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    .secondary-action { align-self: flex-start; }
    p { margin: 0; font-size: 13px; line-height: 1.5; }
    small { font-size: 12px; line-height: 1.5; color: var(--muted); }
    @media (max-width: 599px) {
      .recording-launcher {
        padding: 4px 12px;
        gap: 6px;
      }
      .recording-panel {
        right: 8px;
        width: calc(100vw - 16px);
        max-height: min(65dvh, 480px);
        padding: 16px;
      }
      .recording-time { font-size: 11px; }
    }
  `,
})
export class RecordingControlsComponent {
  readonly recorder = inject(RecordingService);
  readonly player = inject(PlayerService);
  readonly catalog = inject(CatalogService);
  readonly destination = inject(RecordingDestination);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  readonly confirmation = viewChild.required(RecordingConfirmationComponent);
  readonly icons = radioIcons;
  readonly expanded = signal(false);
  readonly acknowledged = signal(false);
  readonly confirmReplace = signal(false);
  constructor() {
    const unguard = this.player.onStationSwitchRequest(() => {
      // The recording controls are the single authority for in-progress
      // capture. Deny a change unless the user explicitly approves it.
      if (!['preparing', 'starting', 'recording', 'stopping'].includes(this.recorder.state())) return true;
      return this.confirmation().ask('switch');
    });
    inject(DestroyRef).onDestroy(unguard);
    effect(() => {
      this.player.station()?.id;
      this.acknowledged.set(false);
      this.confirmReplace.set(false);
    });
  }
  retryM4aText() {
    const locale = this.catalog.locale();
    return locale === 'ta' ? 'M4A-ஆக மீண்டும் முயலவும்'
      : locale === 'sa' ? 'M4A पुनः प्रयतताम्'
      : 'Retry M4A';
  }
  exportOriginalText() {
    const locale = this.catalog.locale();
    return locale === 'ta' ? 'அசல் ஒலியை ஏற்றுமதி செய்'
      : locale === 'sa' ? 'मूलध्वनिं निर्यातयतु'
      : 'Export original audio';
  }
  retryText() {
    const locale = this.catalog.locale();
    return locale === 'ta' ? 'சேமிப்பை மீண்டும் முயலவும்'
      : locale === 'sa' ? 'सञ्चयं पुनः प्रयतताम्'
      : 'Retry unsaved segment';
  }
  savingText() {
    const locale = this.catalog.locale();
    return locale === 'ta' ? 'பதிவு மாற்றப்பட்டுச் சேமிக்கப்படுகிறது…'
      : locale === 'sa' ? 'मुद्रणं रूपान्तर्य सञ्चीयते…'
      : 'Converting / saving recording…';
  }
  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
  acknowledge(event: Event) {
    if (event.target instanceof HTMLInputElement) this.acknowledged.set(event.target.checked);
  }
  togglePanel() {
    this.expanded.update(value => !value);
    if (!this.expanded()) this.confirmReplace.set(false);
  }
  outsidePointer(event: PointerEvent) {
    if (this.expanded() && !event.composedPath().includes(this.hostElement.nativeElement)) {
      this.expanded.set(false);
      this.confirmReplace.set(false);
    }
  }
  canStart() {
    return this.player.state() === 'playing' &&
      this.destination.ready() &&
      this.recorder.permission() !== 'blocked' &&
      this.recorder.permission() !== 'unavailable' &&
      (this.recorder.permission() !== 'acknowledgment' || this.acknowledged());
  }
  async begin(replaceDraft = false) {
    if (!this.canStart()) return;
    if (this.recorder.file() && !replaceDraft) {
      this.confirmReplace.set(true);
      return;
    }
    this.confirmReplace.set(false);
    // Begin synchronously inside the user gesture so the first-use
    // system folder picker retains browser activation.
    const starting = this.recorder.start(this.acknowledged(), {
      promptFirstFolder: true,
      replaceDraft,
    });
    this.expanded.set(false);
    await starting;
    if (['idle', 'error', 'ready'].includes(this.recorder.state()) &&
        this.recorder.message() &&
        this.recorder.message() !== 'recordingReady') {
      this.expanded.set(true);
    }
  }
  async discard() {
    if (!(await this.confirmation().ask('discard'))) return;
    this.recorder.discard();
    this.confirmReplace.set(false);
    this.expanded.set(false);
    this.acknowledged.set(false);
  }
}
