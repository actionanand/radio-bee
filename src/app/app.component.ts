import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { PlayerComponent } from './player/player';
import { StationDetailsComponent } from './catalog/station-details';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, PlayerComponent, StationDetailsComponent],
  styleUrl: './app.component.scss',
})
export class AppComponent {
  constructor() {}
}
