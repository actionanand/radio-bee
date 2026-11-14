import { OnDestroy, Service, signal } from '@angular/core';
import { UiKey } from '../catalog/catalog.ui';

export type SnackbarTone = 'success' | 'warning' | 'info';
export type SnackbarContent =
  | { kind: 'favorite'; stationId: string; added: boolean }
  | { kind: 'localized'; key: UiKey }
  | { kind: 'text'; message: string };
export type SnackbarNotice = {
  id: number;
  content: SnackbarContent;
  tone: SnackbarTone;
};

/** One global, replaceable notification with a fresh timeout on each action. */
@Service()
export class SnackbarService implements OnDestroy {
  readonly current = signal<SnackbarNotice | null>(null);
  private nextId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(content: SnackbarContent, tone: SnackbarTone = 'info', durationMs = 3400) {
    clearTimeout(this.timer);
    const id = ++this.nextId;
    this.current.set({ id, content, tone });
    this.timer = setTimeout(() => {
      if (this.current()?.id === id) this.dismiss();
    }, durationMs);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.current.set(null);
  }

  ngOnDestroy() {
    this.dismiss();
  }
}
