import type { RadioRecordingConfig } from './radio-recording.config';
import type { RadioApiConfig } from './radio-api.config';

export const environment = {
  RadioRecording: { Enabled: true, AllowProhibitedRecording: false } satisfies RadioRecordingConfig,
  RadioApi: {
    AllowUnverified: true,
    CheckVerificationStatus: false,
    CheckRightsStatus: false,
  } satisfies RadioApiConfig,
  liveStreamTests: false,
  production: true,
  catalogSeedUrl: null,
  // Catalogue URL selects both the schema and the UI:
  // https://actionanand.github.io/radio-bee-data/v1/ -> legacy RadioBee station-browser UI.
  // https://actionanand.github.io/radio-bee-data/v2/ -> new Stage 16 directory UI (sidebar, routes, station pages).
  catalogUrl: 'https://actionanand.github.io/radio-bee-data/v2/',
};
