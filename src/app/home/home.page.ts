import { NgOptimizedImage } from '@angular/common';
import { RadioHeroComponent } from './radio-hero';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../catalog/catalog.service';
import { UiKey, uiLabel } from '../catalog/catalog.ui';
import { LIVE_TEST_ENABLED } from '../live-test/live-test.config';
import { IonContent } from '@ionic/angular';
import { StationBrowserComponent } from '../catalog/station-browser';
import { LiveStreamLabComponent } from '../live-test/live-stream-lab';
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    IonContent,
    NgOptimizedImage,
    RouterLink,
    StationBrowserComponent,
    LiveStreamLabComponent,
    RadioHeroComponent,
  ],
})
export class HomePage {
  readonly data = inject(CatalogService);
  readonly liveTests = inject(LIVE_TEST_ENABLED);
  ui(key: UiKey) {
    return uiLabel(this.data.locale(), key);
  }
}
