import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { PlayerComponent } from './player/player';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, PlayerComponent],
  styleUrl: './app.component.scss',
})
export class AppComponent {
  constructor() {}
}
