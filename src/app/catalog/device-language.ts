/** Language preference controls only the UI; it never filters or modifies catalogue data. */
export type UiLocale = 'en' | 'ta' | 'sa';
export type UiLanguagePreference = 'device' | UiLocale;

/** The device's primary language wins when supported; otherwise English is the fallback. */
export function resolveDeviceLanguage(language: string | null | undefined): UiLocale {
  const primary = (language ?? '').trim().split(/[-_]/, 1)[0].toLowerCase();
  return primary === 'ta' || primary === 'sa' || primary === 'en' ? primary : 'en';
}

export function effectiveLocale(preference: UiLanguagePreference, deviceLocale: UiLocale): UiLocale {
  return preference === 'device' ? deviceLocale : preference;
}

const labels: Record<UiLocale, readonly { id: UiLanguagePreference; name: string }[]> = {
  en: [
    { id: 'device', name: 'Device language' },
    { id: 'ta', name: 'Tamil' },
    { id: 'en', name: 'English' },
    { id: 'sa', name: 'Sanskrit' },
  ],
  ta: [
    { id: 'device', name: 'சாதன மொழி' },
    { id: 'ta', name: 'தமிழ்' },
    { id: 'en', name: 'ஆங்கிலம்' },
    { id: 'sa', name: 'சமஸ்க்ரிதம்' },
  ],
  sa: [
    { id: 'device', name: 'उपकरणभाषा' },
    { id: 'ta', name: 'तमिळ्' },
    { id: 'en', name: 'आङ्ग्लभाषा' },
    { id: 'sa', name: 'संस्कृतम्' },
  ],
};

/** The language picker intentionally differs from multilingual language-directory labels. */
export function uiLanguageOptions(locale: UiLocale): { id: UiLanguagePreference; name: string }[] {
  return labels[locale].map(option => ({ ...option }));
}
