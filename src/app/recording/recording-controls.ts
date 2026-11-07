import { Component, effect, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { RecordingService } from './recording.service';
import { PlayerService } from '../player/player.service';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { radioIcons } from '../shared/radio-icons';
@Component({
  selector: 'app-recording-controls',
  imports: [IonIcon],
  providers: [RecordingService],
  template: `
    @if (player.station() || recorder.state() !== 'idle') {
      <section class="recording-controls rb-ui" [attr.lang]="catalog.locale()" [attr.aria-label]="ui('record')">
        @if (!expanded() && recorder.state() === 'idle') {
          <button type="button" (click)="expanded.set(true)">
            <ion-icon [icon]="icons.radioButtonOn" aria-hidden="true" />{{ ui('record') }}
          </button>
        } @else {
          @if (recorder.state() === 'idle' || recorder.state() === 'error') {
            @if (recorder.permission() === 'blocked') {
              <p>{{ ui('recordingProhibited') }}</p>
            } @else if (recorder.permission() === 'unavailable') {
              <p>{{ ui('recordingPlaybackRequired') }}</p>
            } @else {
              @if (recorder.permission() === 'acknowledgment') {
                <label class="consent"
                  ><input type="checkbox" [checked]="acknowledged()" (change)="acknowledge($event)" />{{
                    ui('recordingConsent')
                  }}</label
                >
              }
              <button
                type="button"
                [disabled]="
                  player.state() !== 'playing' || (recorder.permission() === 'acknowledgment' && !acknowledged())
                "
                (click)="recorder.start(acknowledged())">
                <ion-icon [icon]="icons.radioButtonOn" aria-hidden="true" />{{ ui('recordingStart') }}
              </button>
            }
          }
          @if (
            recorder.state() === 'preparing' ||
            recorder.state() === 'starting' ||
            recorder.state() === 'recording' ||
            recorder.state() === 'stopping'
          ) {
            <p role="status">
              {{ ui(recorder.state() === 'recording' ? 'recording' : 'recordingStarting') }} ·
              {{ recorder.seconds() }} s
            </p>
            <button type="button" (click)="recorder.stop()" [disabled]="recorder.state() === 'stopping'">
              <ion-icon [icon]="icons.stop" aria-hidden="true" />{{ ui('stopRecording') }}
            </button>
          }
          @if (recorder.file()) {
            <button type="button" (click)="recorder.save()" [disabled]="recorder.state() === 'exporting'">
              <ion-icon [icon]="icons.downloadOutline" aria-hidden="true" />{{ ui('exportRecording') }}
            </button>
          }
          <button type="button" (click)="discard()" [disabled]="recorder.state() === 'exporting'">
            <ion-icon [icon]="icons.close" aria-hidden="true" />{{ ui('discard') }}
          </button>
          <small>{{ ui('recordingLimit') }}</small>
          @if (recorder.message(); as message) {
            <p [attr.role]="recorder.state() === 'error' ? 'alert' : 'status'">{{ ui(message) }}</p>
          }
        }
      </section>
    }
  `,
  styles: `
    section {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 6px 16px;
      color: var(--ink);
      background: var(--surface);
      border-top: 1px solid var(--line);
      max-height: 32dvh;
      overflow: auto;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    ion-icon {
      font-size: 18px;
    }
    label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      max-width: 600px;
      line-height: 1.5;
    }
    input {
      flex: none;
      width: 20px;
      height: 20px;
      accent-color: var(--accent-ink);
    }
    p,
    small {
      font-size: 12px;
      margin: 4px 0;
    }
    small {
      color: var(--muted);
    }
  `,
})
export class RecordingControlsComponent {
  readonly recorder = inject(RecordingService);
  readonly player = inject(PlayerService);
  readonly catalog = inject(CatalogService);
  readonly icons = radioIcons;
  readonly expanded = signal(false);
  readonly acknowledged = signal(false);
  constructor() {
    effect(() => {
      this.player.station()?.id;
      this.acknowledged.set(false);
    });
  }
  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
  acknowledge(event: Event) {
    if (event.target instanceof HTMLInputElement) this.acknowledged.set(event.target.checked);
  }
  discard() {
    this.recorder.discard();
    this.expanded.set(false);
    this.acknowledged.set(false);
  }
}
