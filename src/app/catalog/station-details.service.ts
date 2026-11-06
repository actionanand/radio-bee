import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
@Service()
export class StationDetailsService {
  private readonly data = inject(CatalogService);
  private readonly document = inject(DOCUMENT);
  private readonly selected = signal<string | null>(null);
  private trigger: HTMLElement | null = null;
  readonly anchor = signal<Event | undefined>(undefined);
  readonly isOpen = signal(false);
  readonly station = computed(
    () => this.data.catalog()?.stations.find(station => station.id === this.selected()) ?? null,
  );
  open(id: string, event: Event) {
    if (this.selected() === id && this.isOpen()) {
      this.dismiss();
      return;
    }
    if (!this.data.catalog()?.stations.some(station => station.id === id)) return;
    this.trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.anchor.set(event);
    this.selected.set(id);
    this.isOpen.set(true);
  }
  dismiss() {
    this.isOpen.set(false);
  }
  dismissed() {
    this.isOpen.set(false);
    this.selected.set(null);
    const target = this.trigger?.isConnected
      ? this.trigger
      : this.document.querySelector<HTMLElement>('input[type="search"]');
    target?.focus();
    this.trigger = null;
  }
}
