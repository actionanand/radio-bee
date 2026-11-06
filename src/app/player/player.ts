import { Component, inject } from '@angular/core';
import { PlayerService } from './player.service';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
@Component({ selector: 'app-player', templateUrl: './player.html', styleUrl: './player.scss' })
export class PlayerComponent {
  readonly player = inject(PlayerService);
  readonly catalog = inject(CatalogService);
  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
  volume(event: Event) {
    if (event.target instanceof HTMLInputElement) this.player.setVolume(Number(event.target.value));
  }
}
