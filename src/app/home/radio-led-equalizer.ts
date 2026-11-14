import { Component, input } from '@angular/core';

/** Reusable decorative LED meter; its steps are choreographed, not decoded audio. */
@Component({
  selector: 'app-radio-led-equalizer',
  host: {
    class: 'rb-led-equalizer',
    '[attr.data-active]': 'playing()',
  },
  templateUrl: './radio-led-equalizer.html',
  styleUrl: './radio-led-equalizer.scss',
})
export class RadioLedEqualizerComponent {
  readonly playing = input(false);
  readonly columns = Array.from({ length: 20 }, (_, index) => index);
}
