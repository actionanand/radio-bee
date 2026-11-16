export interface RadioRecordingConfig {
  readonly Enabled: boolean;
  readonly AllowProhibitedRecording?: boolean;
  /** Maximum length of each exported segment, in milliseconds. */
  readonly MaxDurationMs: number;
  /** Maximum encoded bytes held in memory per segment. */
  readonly MaxBytes: number;
  /** Automatically export a completed segment and start the next one when a limit is reached. */
  readonly AutoContinue: boolean;
}
