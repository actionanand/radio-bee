import { Component, input } from '@angular/core';

/** Visual-only radio-and-bee progress indicator, adapted from the supplied HTML/CSS. */
@Component({
  selector: 'app-radio-bee-loader',
  templateUrl: './radio-bee-loader.html',
  styleUrl: './radio-bee-loader.scss',
  host: { '[class.compact]': 'compact()' },
})
export class RadioBeeLoaderComponent {
  readonly compact = input(false);
}
