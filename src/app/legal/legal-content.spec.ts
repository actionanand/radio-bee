import { legalDocuments, legalLinks, recordingLegalSections, visibleLegalDocument } from './legal-content';
import { legalPageCopy } from './legal-page-copy';

describe('Public legal notices', () => {
  it('provides a distinct, substantial policy document for every footer destination', () => {
    expect(legalLinks.map(link => link.path)).toEqual([
      '/privacy',
      '/terms',
      '/copyright-policy',
      '/contact',
    ]);
    for (const link of legalLinks) {
      const document = legalDocuments[link.path.slice(1) as keyof typeof legalDocuments];
      expect(document?.title).toBeTruthy();
      expect(document?.summary).toBeTruthy();
      expect(document?.sections.length).toBeGreaterThanOrEqual(link.path === '/contact' ? 1 : 3);
      expect(document?.sections.every(section => !!section.heading)).toBe(true);
    }
  });

  it('does not advertise a hidden recording facility in public-facing terms or policy content', () => {
    const publicText = JSON.stringify(legalDocuments);
    expect(publicText).not.toMatch(/\brecord(?:ing|ings|ed|s)?\b|\bcapture\b|\bexport\b/i);
    expect(publicText).toContain('does not claim ownership');
    expect(publicText).toContain('rights');
    expect(publicText).toContain('Contact Us');
  });

  it('includes the testing-only recording disclaimer only when enabled', () => {
    for (const page of ['privacy', 'terms', 'copyright-policy'] as const) {
      const disabled = visibleLegalDocument(page, false);
      const enabled = visibleLegalDocument(page, true);
      expect(disabled).toBe(legalDocuments[page]);
      expect(disabled.sections).toHaveLength(legalDocuments[page].sections.length);
      expect(enabled.sections).toHaveLength(disabled.sections.length + 1);
      const disclaimer = enabled.sections.at(-1)!;
      const notice = [disclaimer.heading, ...(disclaimer.paragraphs ?? [])].join(' ');
      expect(notice).toMatch(/recording/i);
      expect(notice).toMatch(/responsib|permissions|law/i);
      expect(notice).not.toMatch(/https?:\/\/|<a\b|radio-bee\.app/i);
    }
    expect(visibleLegalDocument('contact', true)).toBe(legalDocuments.contact);
    expect(Object.keys(recordingLegalSections)).toEqual(['privacy', 'terms', 'copyright-policy']);
    expect(JSON.stringify(legalDocuments)).not.toMatch(/\brecording\b/i);
  });

  it('translates every policy, contact section and point in Tamil and Sanskrit with exact structural parity', () => {
    for (const locale of ['ta', 'sa'] as const) {
      for (const page of ['privacy', 'terms', 'copyright-policy', 'contact'] as const) {
        const reference = visibleLegalDocument(page, false, 'en');
        const localized = visibleLegalDocument(page, false, locale);
        expect(localized.title).not.toBe(reference.title);
        expect(localized.summary.trim().length).toBeGreaterThan(40);
        expect(localized.sections).toHaveLength(reference.sections.length);
        localized.sections.forEach((section, index) => {
          const english = reference.sections[index];
          expect(section.heading).toBeTruthy();
          expect(section.heading).not.toBe(english.heading);
          expect(section.paragraphs?.length ?? 0).toBe(english.paragraphs?.length ?? 0);
          expect(section.points?.length ?? 0).toBe(english.points?.length ?? 0);
          for (const text of [...section.paragraphs ?? [], ...section.points ?? []]) {
            expect(text.trim().length).toBeGreaterThan(30);
          }
        });
        const recorded = visibleLegalDocument(page, true, locale);
        expect(recorded.sections.length).toBe(localized.sections.length + (page === 'contact' ? 0 : 1));
        if (page !== 'contact') {
          const last = recorded.sections.at(-1)!;
          const english = visibleLegalDocument(page, true, 'en').sections.at(-1)!;
          expect(last.heading).not.toBe(english.heading);
          expect(last.paragraphs?.length).toBe(english.paragraphs?.length);
          expect(JSON.stringify(last)).not.toContain('http://');
          expect(JSON.stringify(last)).not.toContain('https://');
          expect(JSON.stringify(last)).not.toContain('<a');
        }
      }
    }
    expect(visibleLegalDocument('privacy', false, 'unknown')).toBe(legalDocuments.privacy);
  });

  it('includes localized copy for every Contact Us card, action and legal navigation link', () => {
    const keys = Object.keys(legalPageCopy.en).sort();
    for (const locale of ['ta', 'sa'] as const) {
      expect(Object.keys(legalPageCopy[locale]).sort()).toEqual(keys);
      for (const key of keys as (keyof typeof legalPageCopy.en)[]) {
        expect(legalPageCopy[locale][key].trim().length).toBeGreaterThan(0);
        expect(legalPageCopy[locale][key]).not.toBe(legalPageCopy.en[key]);
      }
    }
  });

  it('accurately discloses Google Forms handling of contact entries', () => {
    expect(JSON.stringify(legalDocuments.privacy)).toContain('Google Forms');
    expect(JSON.stringify(legalDocuments['copyright-policy'])).toContain('Contact Us');
    expect(legalDocuments.contact.summary).toContain('contact form');
    expect(JSON.stringify(legalDocuments.contact)).not.toContain('coming soon');
  });
});
