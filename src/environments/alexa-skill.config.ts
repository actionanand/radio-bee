/** Public Alexa listing/invitation URL and compile-time Settings visibility. */
export interface AlexaSkillConfig {
  readonly Enabled: boolean;
  /** Real Amazon Skill Store or invitation link; never substitute the developer console URL or Skill ID. */
  readonly Url: string;
}

/** Refuse malformed, local or insecure destinations; no install button without a real URL. */
export function validatedAlexaSkillUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') ||
      url.hostname === 'localhost' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
