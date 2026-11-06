import { Component, inject } from '@angular/core';
import { IonPopover } from '@ionic/angular/ion-popover';
import { StationDetailsService } from './station-details.service';
import { StationDetailsContentComponent } from './station-details-content';
@Component({
  selector: 'app-station-details',
  imports: [IonPopover, StationDetailsContentComponent],
  template: `<ion-popover
    cssClass="station-details-popover"
    [isOpen]="details.isOpen() && !!details.station()"
    [event]="details.anchor()"
    reference="trigger"
    side="bottom"
    alignment="end"
    [focusTrap]="true"
    [backdropDismiss]="true"
    role="dialog"
    aria-labelledby="station-details-title"
    (didDismiss)="details.dismissed()"
    ><ng-template>
      @if (details.station(); as station) {
        <app-station-details-content [station]="station" (closed)="details.dismiss()" />
      }</ng-template
  ></ion-popover>`,
})
export class StationDetailsComponent {
  readonly details = inject(StationDetailsService);
}
