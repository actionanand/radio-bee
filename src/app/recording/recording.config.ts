import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import { RadioRecordingConfig } from '../../environments/radio-recording.config';
export const RADIO_RECORDING = new InjectionToken<RadioRecordingConfig>('RADIO_RECORDING', {
  providedIn: 'root',
  factory: () => Object.freeze({ ...environment.RadioRecording }),
});
