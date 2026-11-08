import { InjectionToken } from '@angular/core';
export const RECOVERY_POLICY = Object.freeze({
  maxDistinctUrls: 3,
  maxAttemptsPerUrl: 2,
  maxTotalAttempts: 6,
  startupMs: 20_000,
  bufferingMs: 12_000,
  backoffMinMs: 500,
  backoffJitterMs: 250,
  maxDiagnostics: 80,
});
export const RECOVERY_RANDOM = new InjectionToken<() => number>('RECOVERY_RANDOM', {
  providedIn: 'root',
  factory: () => Math.random,
});
export function recoveryDelay(random: number): number {
  return (
    RECOVERY_POLICY.backoffMinMs +
    Math.floor(Math.max(0, Math.min(1, Number.isFinite(random) ? random : 0)) * RECOVERY_POLICY.backoffJitterMs)
  );
}
