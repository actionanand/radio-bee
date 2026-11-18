import { translated, type Catalog } from './catalog.models';
import { legalCopy } from '../legal/legal-page-copy';
import { radioBeeCopyright } from '../shared/copyright';

describe('V2 multilingual entity and footer labels', () => {
  const canonical = {
    network: { id: 'akashvani', name: 'Akashvani (All India Radio)' },
    broadcaster: { id: 'prasar-bharati', name: 'Prasar Bharati' },
    theme: { id: 'hindu-devotional', name: 'Hindu devotional programming' },
  };
  const dictionaries = {
    en: {
      networkNames: { akashvani: canonical.network.name },
      broadcasterNames: { 'prasar-bharati': canonical.broadcaster.name },
      programmeThemeNames: { 'hindu-devotional': canonical.theme.name },
    },
    ta: {
      networkNames: { akashvani: 'ஆகாஷவாணி (அகில இந்திய வானொலி)' },
      broadcasterNames: { 'prasar-bharati': 'பிரசார் பாரதி' },
      programmeThemeNames: { 'hindu-devotional': 'இந்து பக்தி நிகழ்ச்சிகள்' },
    },
    sa: {
      networkNames: { akashvani: 'आकाशवाणी (अखिलभारतीयरेडियो)' },
      broadcasterNames: { 'prasar-bharati': 'प्रसारभारती' },
      programmeThemeNames: { 'hindu-devotional': 'हिन्दूभक्तिकार्यक्रमाः' },
    },
  };
  const catalogue = { localization: dictionaries } as unknown as Catalog;

  it('uses requested locale for each catalog entity and preserves stable IDs', () => {
    for (const locale of ['en', 'ta', 'sa'] as const) {
      expect(translated(catalogue, locale, 'networkNames', canonical.network.id)).toBe(
        dictionaries[locale].networkNames.akashvani,
      );
      expect(translated(catalogue, locale, 'broadcasterNames', canonical.broadcaster.id)).toBe(
        dictionaries[locale].broadcasterNames['prasar-bharati'],
      );
      expect(translated(catalogue, locale, 'programmeThemeNames', canonical.theme.id)).toBe(
        dictionaries[locale].programmeThemeNames['hindu-devotional'],
      );
    }
  });

  it('keeps canonical names for missing translations instead of exposing IDs', () => {
    expect(translated(catalogue, 'ta', 'networkNames', 'new-brand', 'New Brand')).toBe('New Brand');
    expect(translated(catalogue, 'sa', 'broadcasterNames', 'new-operator', 'New Operator')).toBe('New Operator');
  });

  it('provides translated legal navigation and copyright for every locale', () => {
    for (const locale of ['en', 'ta', 'sa'] as const) {
      const copy = legalCopy(locale);
      for (const key of ['privacy', 'terms', 'copyright', 'contact', 'policies'] as const) {
        expect(copy[key].trim()).not.toBe('');
      }
      const notice = radioBeeCopyright(2026, locale);
      expect(notice).toContain('RadioBee');
      if (locale !== 'en') {
        expect(copy.privacy).not.toBe(legalCopy('en').privacy);
        expect(notice).not.toContain('All rights reserved');
      }
    }
  });
});
