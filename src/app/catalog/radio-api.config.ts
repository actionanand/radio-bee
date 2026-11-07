import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
import { RadioApiConfig } from '../../environments/radio-api.config';

export const RADIO_API_CONFIG = new InjectionToken<RadioApiConfig>('RADIO_API_CONFIG', {
  providedIn: 'root',
  factory: () => Object.freeze({ ...environment.RadioApi }),
});
