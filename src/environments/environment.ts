import type { RadioRecordingConfig } from './radio-recording.config';
// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import type { RadioApiConfig } from './radio-api.config';
import type { AlexaSkillConfig } from './alexa-skill.config';

export const environment = {
  // Enable/disable the Alexa section in Settings; paste the official public Store or beta-invite URL when available.
  AlexaSkill: { Enabled: true, Url: '' } satisfies AlexaSkillConfig,
  RadioRecording: {
    Enabled: false,
    AllowProhibitedRecording: false,
    MaxDurationMs: 60 * 60_000,
    MaxBytes: 80 * 1024 * 1024,
    AutoContinue: true,
  } satisfies RadioRecordingConfig,
  RadioApi: {
    AllowUnverified: true,
    CheckVerificationStatus: false,
    CheckRightsStatus: false,
  } satisfies RadioApiConfig,
  // Presentation-only: suppress unverified-stream and permission-review notices on station cards.
  // Playback eligibility, recording rules, and stream metadata are unaffected.
  hideStreamReviewNotices: true,
  // V2 only: maximum for user-selected Home stations (3–10); API Featured Radios are uncapped.
  maxHomeStations: 10,
  liveStreamTests: false,
  contactGoogleFormId: '1FAIpQLSe_ybw31svEQ62xaAx1dnvSA7JQPwbf7jVWbZbYsfURJDe60Q',
  production: false,
  catalogSeedUrl: null,
  // Catalogue URL selects both the schema and the UI:
  // https://actionanand.github.io/radio-bee-data/v1/ -> legacy RadioBee station-browser UI.
  // https://actionanand.github.io/radio-bee-data/v2/ -> new Stage 16 directory UI (sidebar, routes, station pages).
  catalogUrl: 'https://actionanand.github.io/radio-bee-data/v2/',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
