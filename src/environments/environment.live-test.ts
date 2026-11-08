import type { RadioRecordingConfig } from './radio-recording.config';
import type { RadioApiConfig } from './radio-api.config';

export const environment = {
  RadioRecording: { Enabled: true, AllowProhibitedRecording: false } satisfies RadioRecordingConfig,
  RadioApi: {
    AllowUnverified: true,
    CheckVerificationStatus: false,
    CheckRightsStatus: false,
  } satisfies RadioApiConfig,
  production: false,
  liveStreamTests: true,
  catalogSeedUrl: 'assets/catalog-development-seed.json',
  catalogUrl: 'https://actionanand.github.io/radio-bee-data/v1/',
};
