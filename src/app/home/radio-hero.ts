import { Component, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { PlayerService } from '../player/player.service';
import { radioIcons } from '../shared/radio-icons';
import { RadioLedEqualizerComponent } from './radio-led-equalizer';

/** Reusable hero shell; the equalizer itself is separately embeddable. */
@Component({
  selector: 'app-radio-hero',
  imports: [IonIcon, RadioLedEqualizerComponent],
  templateUrl: './radio-hero.html',
  styleUrl: './radio-hero.scss',
})
export class RadioHeroComponent {
  readonly compact = input(false);
  readonly icons = radioIcons;
  readonly player = inject(PlayerService);
  readonly data = inject(CatalogService);
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
}
