export interface RadioApiConfig {
  readonly AllowUnverified: boolean;
  readonly CheckVerificationStatus: boolean;
  readonly CheckRightsStatus: boolean;
}

export const STRICT_RADIO_API_CONFIG: RadioApiConfig = Object.freeze({
  AllowUnverified: false,
  CheckVerificationStatus: true,
  CheckRightsStatus: true,
});

export const TECHNICAL_RADIO_API_CONFIG: RadioApiConfig = Object.freeze({
  AllowUnverified: true,
  CheckVerificationStatus: false,
  CheckRightsStatus: false,
});
