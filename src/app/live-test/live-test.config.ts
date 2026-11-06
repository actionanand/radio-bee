import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';
export function localTechnicalMode(production: boolean, enabled: boolean, hostname: string): boolean {
  return !production && enabled && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}
export const LIVE_TEST_ENABLED = new InjectionToken<boolean>('LIVE_TEST_ENABLED', {
  providedIn: 'root',
  factory: () =>
    localTechnicalMode(
      environment.production,
      environment.liveStreamTests,
      typeof location === 'undefined' ? '' : location.hostname,
    ),
});
