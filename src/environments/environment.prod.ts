import type { RadioRecordingConfig } from './radio-recording.config';
import type { RadioApiConfig } from './radio-api.config';
import type { AlexaSkillConfig } from './alexa-skill.config';

export const environment = {
  // Enable/disable the Alexa section in Settings; paste the official public Store or beta-invite URL when available.
  AlexaSkill: { Enabled: true, Url: '' } satisfies AlexaSkillConfig,
  RadioRecording: { Enabled: true, AllowProhibitedRecording: false, MaxDurationMs: 60 * 60_000, MaxBytes: 80 * 1024 * 1024, AutoContinue: true } satisfies RadioRecordingConfig,
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
  production: true,
  catalogSeedUrl: null,
  // Catalogue URL selects both the schema and the UI:
  // https://actionanand.github.io/radio-bee-data/v1/ -> legacy RadioBee station-browser UI.
  // https://actionanand.github.io/radio-bee-data/v2/ -> new Stage 16 directory UI (sidebar, routes, station pages).
  catalogUrl: 'https://actionanand.github.io/radio-bee-data/v2/',
};
