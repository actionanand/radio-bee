import { Component, inject } from '@angular/core';
import { PlayerService } from '../player/player.service';
import { LIVE_TEST_ENABLED, liveLeads } from './live-test.config';
@Component({
  selector: 'app-live-stream-lab',
  template: ` @if (enabled) {
    <section aria-labelledby="lab-title">
      <h2 id="lab-title">Local live-radio technical tests</h2>
      <p>
        <strong>Development tests only — rights remain unconfirmed.</strong> These controls test real direct audio
        without changing catalogue verification or production permissions. No recording or proxy is used.
      </p>
      @for (lead of leads; track lead.id) {
        <article>
          <h3>{{ lead.name }}</h3>
          <p>{{ lead.streams[0].format }} · {{ player.technicalEligibility(lead.id).status }}</p>
          <button
            type="button"
            [disabled]="player.technicalEligibility(lead.id).status !== 'ready'"
            (click)="player.playTechnical(lead.id)">
            Test live audio · {{ lead.name }}
          </button>
          @if (lead.website) {
            <p>
              <a [href]="lead.website" target="_blank" rel="noopener noreferrer"
                >Broadcaster listening page (outside RadioBee)</a
              >
            </p>
          }
        </article>
      }
    </section>
  }`,
  styles: `
    section {
      border: 2px solid var(--ink);
      padding: 20px;
      margin-bottom: 24px;
    }
    article {
      margin: 20px 0;
    }
    button {
      min-height: 44px;
      padding: 10px;
      background: var(--paper);
      color: var(--ink);
      border: 1px solid currentColor;
      font: inherit;
      cursor: pointer;
    }
    a {
      color: var(--ink);
    }
    :focus-visible {
      outline: 3px solid currentColor;
      outline-offset: 3px;
    }
  `,
})
export class LiveStreamLabComponent {
  readonly enabled = inject(LIVE_TEST_ENABLED);
  readonly player = inject(PlayerService);
  readonly leads = liveLeads;
}
