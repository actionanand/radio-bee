import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, NgOptimizedImage],
})
export class HomePage {}
