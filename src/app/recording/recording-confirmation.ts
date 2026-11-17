import { Component, DestroyRef, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { radioIcons } from '../shared/radio-icons';

export type RecordingConfirmationKind = 'discard' | 'switch';

/**
 * Accessible Ionic bottom sheet for destructive recording actions.
 * Backdrop / swipe / Escape dismissal always means Cancel.
 */
@Component({
  selector: 'app-recording-confirmation',
  imports: [IonButton, IonIcon, IonModal],
  template: `
    <ion-modal
      class="recording-confirmation-modal"
      [isOpen]="request() !== null"
      [breakpoints]="breakpoints"
      [initialBreakpoint]="1"
      [backdropDismiss]="true"
      [handle]="true"
      [attr.aria-label]="request() ? title(request()!) : null"
      style="--height: min(350px, 70dvh); --border-radius: 18px 18px 0 0"
      (didDismiss)="cancel()">
      <ng-template>
        @if (request(); as action) {
          <div class="confirmation-sheet rb-ui" [attr.lang]="catalog.locale()">
            <header>
              <ion-icon
                [icon]="action === 'discard' ? icons.trashOutline : icons.radioOutline"
                aria-hidden="true" />
              <h2>{{ title(action) }}</h2>
            </header>
            <p>{{ ui(action === 'discard' ? 'recordingDiscardConfirm' : 'recordingSwitchConfirm') }}</p>
            <div class="confirmation-actions">
              <ion-button fill="outline" (click)="cancel()">{{ ui('recordingConfirmCancel') }}</ion-button>
              <ion-button
                [color]="action === 'discard' ? 'danger' : 'primary'"
                (click)="confirm()">
                {{ ui(action === 'discard' ? 'recordingConfirmDiscardAction' : 'recordingConfirmSwitchAction') }}
              </ion-button>
            </div>
          </div>
        }
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .confirmation-sheet {
      height: 100%;
      box-sizing: border-box;
      padding: 26px clamp(18px, 4vw, 28px) max(20px, env(safe-area-inset-bottom));
      background: var(--surface);
      color: var(--ink);
      overflow-y: auto;
    }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    header ion-icon { color: var(--accent-ink); font-size: 25px; flex: none; }
    h2 { margin: 0; font-size: 19px; line-height: 1.3; }
    p { margin: 0; font-size: 14px; line-height: 1.6; }
    .confirmation-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
    ion-button { min-height: 44px; text-transform: none; font-weight: 650; }
    @media (max-width: 420px) { .confirmation-actions ion-button { flex: 1; } }
  `,
})
export class RecordingConfirmationComponent {
  readonly catalog = inject(CatalogService);
  readonly request = signal<RecordingConfirmationKind | null>(null);
  readonly breakpoints = [0, 1];
  readonly icons = radioIcons;
  private resolvePending: ((approved: boolean) => void) | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.finish(false));
  }

  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
  title(kind: RecordingConfirmationKind) {
    return this.ui(kind === 'discard' ? 'recordingConfirmDiscardTitle' : 'recordingConfirmSwitchTitle');
  }
  ask(kind: RecordingConfirmationKind): Promise<boolean> {
    // A second click cannot replace a visible request or implicitly approve it.
    if (this.resolvePending) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      this.resolvePending = resolve;
      this.request.set(kind);
    });
  }
  confirm() {
    this.finish(true);
  }
  cancel() {
    this.finish(false);
  }
  private finish(approved: boolean) {
    const resolve = this.resolvePending;
    this.resolvePending = undefined;
    this.request.set(null);
    resolve?.(approved);
  }
}
