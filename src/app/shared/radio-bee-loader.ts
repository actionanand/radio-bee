import { Component, inject, input } from '@angular/core';
import { CatalogService } from '../catalog/catalog.service';

/** Visual-only radio-and-bee progress indicator, adapted from the supplied HTML/CSS. */
@Component({
  selector: 'app-radio-bee-loader',
  templateUrl: './radio-bee-loader.html',
  styleUrl: './radio-bee-loader.scss',
  host: { '[class.compact]': 'compact()' },
})
export class RadioBeeLoaderComponent {
  readonly compact = input(false);
  // Same state-driven pattern as the playback tuner: the fetch signal controls animation playback.
  readonly loading = inject(CatalogService).loading;
}
