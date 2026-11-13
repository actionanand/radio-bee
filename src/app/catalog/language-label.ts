import type { Language } from './catalog.models';

const uiNames: Record<string, Record<string, string>> = {
  en: { ta: 'Tamil (தமிழ்)', en: 'English', sa: 'Sanskrit (संस्कृतम्)' },
  ta: { ta: 'தமிழ்', en: 'ஆங்கிலம் (English)', sa: 'சமஸ்க்ரிதம் (संस्कृतम्)' },
  sa: { ta: 'तमिळ् (தமிழ்)', en: 'आङ्ग्लभाषा (English)', sa: 'संस्कृतम्' },
};

export const uiLanguageChoices: readonly Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
];

/** Localize other catalogue names when the browser supports it; retain native writing. */
const formatters = new Map<string, Intl.DisplayNames | null>();
function localizedName(code: string, locale: string): string | undefined {
  if (locale !== 'ta' && locale !== 'sa') return undefined;
  if (!formatters.has(locale)) {
    try {
      formatters.set(locale, new Intl.DisplayNames([locale, 'en'], { type: 'language', fallback: 'none' }));
    } catch {
      formatters.set(locale, null);
    }
  }
  try {
    return formatters.get(locale)?.of(code) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Show the selected UI language first, plus the language's native script when different. */
export function languageDisplayName(language: Language, locale: string): string {
  const explicit = uiNames[locale]?.[language.code];
  if (explicit) return explicit;
  const label = localizedName(language.code, locale) || language.name || language.nativeName || language.code;
  const nativeName = language.nativeName?.trim();
  return nativeName && label.toLocaleLowerCase() !== nativeName.toLocaleLowerCase()
    ? `${label} (${nativeName})`
    : label;
}
