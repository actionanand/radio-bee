import { Component, inject } from '@angular/core';
import { PlayerService } from '../player/player.service';
import { CatalogService } from '../catalog/catalog.service';
import { LIVE_TEST_ENABLED } from './live-test.config';
@Component({
  selector: 'app-live-stream-lab',
  template: `@if (enabled) {
    <section aria-labelledby="lab-title">
      <h2 id="lab-title">Local stream verification</h2>
      <p>Technical research only. This does not grant production permission, record audio or proxy a stream.</p>
      @for (station of data.catalog()?.stations ?? []; track station.id) {
        @for (stream of station.streams; track stream.id) {
          <button
            type="button"
            [disabled]="player.technicalEligibility(station.id, stream.id).status !== 'ready'"
            (click)="player.playTechnical(station.id, stream.id)">
            Test live audio · {{ station.name }} · {{ stream.id }}
          </button>
        }
      }
    </section>
  }`,
  styles: `
    section {
      padding: 16px;
      border: 1px solid var(--line);
    }
    button {
      display: block;
      margin: 8px 0;
      min-height: 44px;
      font: inherit;
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      padding: 10px;
      max-width: 100%;
    }
  `,
})
export class LiveStreamLabComponent {
  readonly enabled = inject(LIVE_TEST_ENABLED);
  readonly player = inject(PlayerService);
  readonly data = inject(CatalogService);
}
