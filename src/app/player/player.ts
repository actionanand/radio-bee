import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PlayerService } from './player.service';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { StationArtworkComponent } from '../catalog/station-artwork';
@Component({
  selector: 'app-player',
  imports: [StationArtworkComponent],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class PlayerComponent {
  private readonly document = inject(DOCUMENT);
  stop() {
    const id = this.player.station()?.id;
    const card = Array.from(this.document.querySelectorAll<HTMLElement>('[data-station-id]')).find(
      card => card.dataset['stationId'] === id,
    );
    const target =
      card?.querySelector<HTMLButtonElement>('button.play') ??
      card?.querySelector<HTMLButtonElement>('button.favorite') ??
      this.document.querySelector<HTMLInputElement>('input[type="search"]');
    this.player.stop();
    target?.focus();
  }
  readonly player = inject(PlayerService);
  readonly catalog = inject(CatalogService);
  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
  volume(event: Event) {
    if (event.target instanceof HTMLInputElement) this.player.setVolume(Number(event.target.value));
  }
}
