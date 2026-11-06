import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { StationBrowserComponent } from '../catalog/station-browser';
import { LiveStreamLabComponent } from '../live-test/live-stream-lab';
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, NgOptimizedImage, StationBrowserComponent, LiveStreamLabComponent],
})
export class HomePage {}
