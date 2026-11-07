import type { RadioApiConfig } from './radio-api.config';

export const environment = {
  RadioApi: {
    AllowUnverified: true,
    CheckVerificationStatus: false,
    CheckRightsStatus: false,
  } satisfies RadioApiConfig,
  liveStreamTests: false,
  production: true,
  catalogSeedUrl: null,
  catalogUrl: 'https://actionanand.github.io/radio-bee-data/v1/',
};
