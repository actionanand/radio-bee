import { Component, inject } from '@angular/core';
import { IonPopover } from '@ionic/angular/ion-popover';
import { StationDetailsService } from './station-details.service';
import { StationDetailsContentComponent } from './station-details-content';
@Component({
  selector: 'app-station-details',
  imports: [IonPopover, StationDetailsContentComponent],
  template: `@for (session of details.sessions(); track session.token) {
    <ion-popover
      cssClass="station-details-popover"
      [isOpen]="details.overlayOpen()"
      [event]="session.anchor"
      reference="trigger"
      side="bottom"
      alignment="end"
      [focusTrap]="true"
      [backdropDismiss]="true"
      role="dialog"
      aria-labelledby="station-details-title"
      (didPresent)="details.presented(session.token)"
      (willDismiss)="details.willDismiss(session.token)"
      (didDismiss)="details.dismissed(session.token)"
      ><ng-template>
        @if (details.station(); as station) {
          <app-station-details-content [station]="station" (closed)="details.dismiss()" />
        }</ng-template
    ></ion-popover>
  }`,
})
export class StationDetailsComponent {
  readonly details = inject(StationDetailsService);
}
