import { legalDocuments, legalLinks } from './legal-content';

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
      expect(document?.sections.length).toBeGreaterThanOrEqual(3);
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

  it('does not misrepresent the planned private contact form as available', () => {
    expect(legalDocuments.contact.summary).toContain('not yet available');
    expect(JSON.stringify(legalDocuments.contact)).toContain('public GitHub issue tracker');
  });
});
