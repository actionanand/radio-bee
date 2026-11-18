import { legalDocuments, legalLinks, recordingLegalSections, visibleLegalDocument } from './legal-content';

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

  it('accurately discloses Google Forms handling of contact entries', () => {
    expect(JSON.stringify(legalDocuments.privacy)).toContain('Google Forms');
    expect(JSON.stringify(legalDocuments['copyright-policy'])).toContain('Contact Us');
    expect(legalDocuments.contact.summary).toContain('contact form');
    expect(JSON.stringify(legalDocuments.contact)).not.toContain('coming soon');
  });
});
