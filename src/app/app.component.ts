import { Component, inject } from '@angular/core';
import { ThemeService } from './theme/theme.service';
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
  readonly theme = inject(ThemeService);
}
