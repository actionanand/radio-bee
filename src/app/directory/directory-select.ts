import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { IonSelect, IonSelectOption } from '@ionic/angular';
import { isPlatform } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { directoryText } from './directory.labels';

let nextOverlayOwner = 0;

export interface DirectoryOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-directory-select',
  host: {
    '(document:ionPopoverDidPresent)': 'focusOverlay($event)',
    '(document:ionPopoverWillPresent)': 'prepareOverlay($event)',
    '(document:ionModalWillPresent)': 'prepareOverlay($event)',
  },
  imports: [IonSelect, IonSelectOption],
  template: `
    <ion-select
      mode="md"
      fill="outline"
      labelPlacement="stacked"
      [label]="label()"
      [value]="value()"
      [disabled]="disabled()"
      [interface]="overlayInterface()"
      [interfaceOptions]="overlayOptions()"
      [cancelText]="cancelText()"
      (ionChange)="change($event)">
      @for (option of options(); track option.id) {
        <ion-select-option [value]="option.id">{{ option.name }}</ion-select-option>
      }
    </ion-select>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    ion-select {
      width: 100%;
      min-height: 64px;
      border: 0;
      padding: 0;
      --background: var(--surface);
      --color: var(--ink);
      --border-color: var(--line);
      --border-radius: 8px;
      --padding-start: 10px;
      --padding-end: 10px;
      --highlight-color-focused: var(--accent-ink);
      --highlight-color-valid: var(--accent-ink);
    }
    ion-select::part(label) {
      color: var(--muted);
      font-size: 12px;
    }
    ion-select::part(text) {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    ion-select::part(icon) {
      color: var(--ink);
      opacity: 1;
    }
    ion-select:focus-within {
      outline: 3px solid var(--accent-ink);
      outline-offset: 2px;
    }
  `,
})
export class DirectorySelectComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly options = input.required<readonly DirectoryOption[]>();
  readonly disabled = input(false);
  readonly changed = output<string>();
  private readonly owner = 'rb-directory-select-' + ++nextOverlayOwner;
  private readonly data = inject(CatalogService);
  private readonly win = inject(DOCUMENT).defaultView;
  readonly narrow = signal((this.win?.innerWidth ?? 1024) < 900);
  readonly overlayInterface = computed(() =>
    (this.narrow() || isPlatform('android')) && this.options().length > 8 ? 'modal' : 'popover',
  );
  readonly overlayOptions = computed(() => {
    const popover = this.overlayInterface() === 'popover';
    const attributes = {
      lang: this.data.locale(),
      'aria-label': this.label(),
      'data-directory-select-owner': this.owner,
      ...(popover ? { role: 'dialog' } : {}),
    };
    return {
      cssClass: 'rb-directory-select-overlay',
      header: this.label(),
      showBackdrop: true,
      ...(popover && this.options().length > 8 ? { size: 'auto' as const } : {}),
      // Ionic modals move/delete ARIA attributes while creating their content wrapper. Never reuse that mutated bag.
      get htmlAttributes() {
        return { ...attributes };
      },
    };
  });
  readonly cancelText = computed(() => directoryText(this.data.locale(), 'closeSelect'));
  constructor() {
    const resize = () => this.narrow.set((this.win?.innerWidth ?? 1024) < 900);
    this.win?.addEventListener('resize', resize);
    inject(DestroyRef).onDestroy(() => this.win?.removeEventListener('resize', resize));
  }
  focusOverlay(event: Event) {
    const overlay = event.target;
    if (
      !(overlay instanceof HTMLElement) ||
      !overlay.isConnected ||
      overlay.getAttribute('data-directory-select-owner') !== this.owner
    )
      return;
    const active = overlay.ownerDocument.activeElement;
    if (active !== overlay && overlay.contains(active)) return;
    const radio = overlay.querySelector('ion-radio[aria-checked="true"]') ?? overlay.querySelector('ion-radio');
    void (radio as (HTMLElement & { setFocus?: () => Promise<void> }) | null)?.setFocus?.();
  }
  async prepareOverlay(event: Event) {
    const overlay = event.target;
    if (!(overlay instanceof HTMLElement) || overlay.getAttribute('data-directory-select-owner') !== this.owner) return;
    // Ionic 9 renders a role=list around its radiogroup. The list/item wrappers are structural; their radiogroup and radios supply the semantics.
    for (const node of overlay.querySelectorAll(
      'ion-select-popover ion-list, ion-select-modal ion-list, ion-select-popover ion-item, ion-select-modal ion-item',
    )) {
      const list = node as HTMLElement & { componentOnReady?: () => Promise<unknown> };
      await list.componentOnReady?.();
      if (overlay.isConnected) list.setAttribute('role', 'presentation');
    }
    overlay.querySelector('ion-radio-group')?.setAttribute('aria-label', this.label());
  }
  change(event: CustomEvent<{ value: unknown }>) {
    const value = event.detail?.value;
    if (!this.disabled() && typeof value === 'string' && this.options().some(option => option.id === value))
      this.changed.emit(value);
  }
}
