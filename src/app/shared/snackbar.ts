import { Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { CatalogService } from '../catalog/catalog.service';
import { allStations } from '../catalog/catalog.models';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { SnackbarService } from './snackbar.service';
import { radioIcons } from './radio-icons';

/** Route-independent notification above the mini player on mobile and desktop. */
@Component({
  selector: 'app-snackbar',
  imports: [IonIcon],
  templateUrl: './snackbar.html',
  styleUrl: './snackbar.scss',
})
export class SnackbarComponent {
  readonly snackbar = inject(SnackbarService);
  readonly icons = radioIcons;
  private readonly catalog = inject(CatalogService);

  readonly message = computed(() => {
    const notice = this.snackbar.current();
    if (!notice) return '';
    const content = notice.content;
    if (content.kind === 'text') return content.message;
    if (content.kind === 'localized') return this.ui(content.key);
    const station = allStations(this.catalog.catalog()).find(row => row.id === content.stationId);
    const name = station ? this.catalog.stationName(station) : '';
    const action = this.ui(content.added ? 'favoriteAddedToast' : 'favoriteRemovedToast');
    return name ? `${action}: ${name}` : action;
  });

  get locale() {
    return this.catalog.locale();
  }

  ui(key: UiKey) {
    return uiLabel(this.catalog.locale(), key);
  }
}
