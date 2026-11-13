import { languageDisplayName, uiLanguageChoices } from './language-label';

describe('language display labels', () => {
  const known = Object.fromEntries(uiLanguageChoices.map(language => [language.code, language]));

  it('uses the requested English labels with native scripts', () => {
    expect(languageDisplayName(known['ta'], 'en')).toBe('Tamil (தமிழ்)');
    expect(languageDisplayName(known['en'], 'en')).toBe('English');
    expect(languageDisplayName(known['sa'], 'en')).toBe('Sanskrit (संस्कृतम्)');
  });

  it('uses the requested Tamil labels with native scripts', () => {
    expect(languageDisplayName(known['ta'], 'ta')).toBe('தமிழ்');
    expect(languageDisplayName(known['en'], 'ta')).toBe('ஆங்கிலம் (English)');
    expect(languageDisplayName(known['sa'], 'ta')).toBe('சமஸ்க்ரிதம் (संस्कृतम्)');
  });

  it('uses Sanskrit-first labels with original scripts', () => {
    expect(languageDisplayName(known['ta'], 'sa')).toBe('तमिळ् (தமிழ்)');
    expect(languageDisplayName(known['en'], 'sa')).toBe('आङ्ग्लभाषा (English)');
    expect(languageDisplayName(known['sa'], 'sa')).toBe('संस्कृतम्');
  });

  it('retains native writing for other catalogue languages', () => {
    const other = { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' };
    expect(languageDisplayName(other, 'en')).toBe('Malayalam (മലയാളം)');
    expect(languageDisplayName(other, 'ta')).toContain('(മലയാളം)');
    expect(languageDisplayName(other, 'sa')).toContain('(മലയാളം)');
    expect(languageDisplayName({ code: 'xx', name: 'Unknown', nativeName: '' }, 'en')).toBe('Unknown');
  });
});
