import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CatalogService, CATALOG_URL } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';

/** Animated RadioBee signal-lost page for unmatched v1 and v2 routes. */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss',
  host: {
    '[attr.lang]': 'data.locale()',
    '[class.ion-page]': '!isDirectory',
  },
})
export class NotFoundPage {
  readonly data = inject(CatalogService);
  readonly isDirectory = new URL(inject(CATALOG_URL)).pathname.endsWith('/v2/');
  private readonly title = inject(Title);

  constructor() {
    effect(() => this.title.setTitle('404 · ' + this.ui('signalLost') + ' · RadioBee'));
  }

  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
}
