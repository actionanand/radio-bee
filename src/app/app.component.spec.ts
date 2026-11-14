import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { RADIO_RECORDING } from './recording/recording.config';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideIonicAngular({ animated: false }),
        { provide: RADIO_RECORDING, useValue: { Enabled: true, AllowProhibitedRecording: false } },
      ],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    try {
      fixture.detectChanges();
      // Await native preference initialization as well as Angular's tracked deferred imports.
      await fixture.componentInstance.theme.loaded;
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance).toBeTruthy();
      expect(host.querySelector('ion-app')).not.toBeNull();
      expect(host.querySelector('ion-router-outlet')).not.toBeNull();
      expect(host.querySelectorAll('app-player')).toHaveLength(1);
      expect(host.querySelectorAll('app-snackbar')).toHaveLength(1);
      expect(host.querySelector('.player-dock app-snackbar')).not.toBeNull();
      // Exercise the real lazy recording chunk, rather than disabling it to avoid teardown races.
      expect(host.querySelector('app-recording-controls')).not.toBeNull();
      expect(fixture.isStable()).toBe(true);
    } finally {
      fixture.destroy();
    }
  });
});
