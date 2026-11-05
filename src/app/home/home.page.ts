import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { StationBrowserComponent } from '../catalog/station-browser';
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, NgOptimizedImage, StationBrowserComponent],
})
export class HomePage {}
