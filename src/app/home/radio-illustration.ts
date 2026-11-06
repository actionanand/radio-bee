import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { radioIcons } from '../shared/radio-icons';
import { PlayerService } from '../player/player.service';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
@Component({
  selector: 'app-radio-illustration',
  imports: [IonIcon],
  templateUrl: './radio-illustration.html',
  styleUrl: './radio-illustration.scss',
})
export class RadioIllustrationComponent {
  readonly icons = radioIcons;
  readonly player = inject(PlayerService);
  readonly data = inject(CatalogService);
  readonly segments = Array.from({ length: 24 }, (_, index) => index);
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
}
