import { effectiveLocale, resolveDeviceLanguage, uiLanguageOptions } from './device-language';

describe('device-language preference', () => {
  it.each([
    ['ta-IN', 'ta'], ['en-US', 'en'], ['sa-IN', 'sa'], ['TA_in', 'ta'],
    ['ml-IN', 'en'], ['fr-FR', 'en'], ['hi-IN', 'en'], ['', 'en'],
  ])('maps primary device language %s to %s', (device, expected) => {
    expect(resolveDeviceLanguage(device)).toBe(expected);
  });

  it('resolves device preference and preserves explicit selections', () => {
    expect(effectiveLocale('device', 'ta')).toBe('ta');
    expect(effectiveLocale('device', 'sa')).toBe('sa');
    expect(effectiveLocale('device', 'en')).toBe('en');
    expect(effectiveLocale('en', 'ta')).toBe('en');
  });

  it('always keeps device, Tamil, English and Sanskrit in that order', () => {
    const ids = ['device', 'ta', 'en', 'sa'];
    const expectations = {
      en: ['Device language', 'Tamil', 'English', 'Sanskrit'],
      ta: ['சாதன மொழி', 'தமிழ்', 'ஆங்கிலம்', 'சமஸ்க்ரிதம்'],
      sa: ['उपकरणभाषा', 'तमिळ्', 'आङ्ग्लभाषा', 'संस्कृतम्'],
    };
    for(const locale of ['en','ta','sa'] as const) {
      const options = uiLanguageOptions(locale);
      expect(options.map(option => option.id)).toEqual(ids);
      expect(options.map(option => option.name)).toEqual(expectations[locale]);
      expect(options.every(option => !option.name.includes('('))).toBe(true);
    }
  });
});
