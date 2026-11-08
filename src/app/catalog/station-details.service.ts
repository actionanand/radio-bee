import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { allStations } from './catalog.models';
interface DetailsSession {
  token: number;
  id: string;
  anchor: Event;
  trigger: HTMLElement | null;
  presented: boolean;
  closing: boolean;
}
@Service()
export class StationDetailsService {
  private readonly data = inject(CatalogService);
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<DetailsSession | null>(null);
  private pending: DetailsSession | null = null;
  private sequence = 0;
  readonly sessions = computed(() => {
    const session = this.active();
    return session ? [session] : [];
  });
  readonly isOpen = computed(() => !!this.active() && !this.active()!.closing);
  // Closing before presentation must still complete a real Ionic lifecycle.
  readonly overlayOpen = computed(() => !!this.active() && (!this.active()!.closing || !this.active()!.presented));
  readonly station = computed(
    () => allStations(this.data.catalog()).find(station => station.id === this.active()?.id) ?? null,
  );
  constructor() {
    effect(() => {
      const active = this.active();
      if (active && !active.closing && this.data.catalog() && !this.station()) this.willDismiss(active.token);
    });
  }
  open(id: string, event: Event) {
    if (!allStations(this.data.catalog()).some(station => station.id === id)) return;
    const active = this.active();
    if (active?.id === id && !active.closing) {
      this.dismiss();
      return;
    }
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    // currentTarget expires after dispatch; an SVG child must not become the anchor.
    const anchor = new Event('click');
    Object.defineProperty(anchor, 'target', { value: trigger ?? event.target });
    const next: DetailsSession = { token: ++this.sequence, id, anchor, trigger, presented: false, closing: false };
    if (active) {
      this.pending = next;
      this.willDismiss(active.token);
    } else this.active.set(next);
  }
  dismiss() {
    this.pending = null;
    const active = this.active();
    if (active) this.willDismiss(active.token);
  }
  presented(token: number) {
    this.active.update(session => (session?.token === token ? { ...session, presented: true } : session));
  }
  willDismiss(token: number) {
    this.active.update(session => (session?.token === token ? { ...session, closing: true } : session));
  }
  dismissed(token: number) {
    // Ionic emits didDismiss before removing its focus trap. Finish after that teardown,
    // otherwise the old trap can redirect restored focus back into the departing popup.
    queueMicrotask(() => this.finishDismiss(token));
  }
  private finishDismiss(token: number) {
    const active = this.active();
    if (active?.token !== token) return;
    const next = this.pending;
    this.pending = null;
    if (next && allStations(this.data.catalog()).some(station => station.id === next.id)) {
      this.active.set(next);
      return; // A predecessor must not steal focus from its successor.
    }
    this.active.set(null);
    const target = active.trigger?.isConnected
      ? active.trigger
      : this.document.querySelector<HTMLElement>('input[type="search"]');
    target?.focus();
  }
}
