import {
  contactEntryIds,
  contactPurposes,
  defaultContactPurpose,
  googleFormBody,
  type ContactPayload,
} from './contact-google-form';
import { contactCopy, contactPurposeOptions } from './contact-copy';

const example: ContactPayload = {
  name: 'Example Contributor',
  email: 'someone@example.test',
  phone: '',
  purpose: defaultContactPurpose,
  stationName: 'Sample Tamil FM',
  streamUrl: 'https://example.org/live',
  stationWebsite: 'https://example.org',
  frequency: '93.5 FM',
  country: 'India',
  city: 'Chennai',
  language: 'Tamil',
  description: 'Please review this station.',
};

describe('Contact Google Forms integration', () => {
  it('maps the user-provided Google Form entry IDs and purpose values exactly', () => {
    expect(contactEntryIds).toEqual({
      name: 'entry.2005620554',
      email: 'entry.1045781291',
      phone: 'entry.1166974658',
      purpose: 'entry.1730206658',
      stationName: 'entry.1797538244',
      streamUrl: 'entry.1974010954',
      stationWebsite: 'entry.796016218',
      frequency: 'entry.728735755',
      country: 'entry.971212541',
      city: 'entry.476700365',
      language: 'entry.344147520',
      description: 'entry.2093831229',
    });
    expect(contactPurposes).toHaveLength(6);
    expect(defaultContactPurpose).toBe('Interested in contributing content');
    expect(contactPurposes).toContain(defaultContactPurpose);
  });

  it('preserves the canonical English option in submissions in all locales', () => {
    for (const locale of ['en', 'ta', 'sa']) {
      const options = contactPurposeOptions(locale, contactPurposes);
      expect(options.map(option => option.value)).toEqual(contactPurposes);
      expect(options).toHaveLength(6);
      expect(options[2].value).toBe(defaultContactPurpose);
      if (locale !== 'en') expect(options[2].label).not.toBe(defaultContactPurpose);
      expect(contactCopy(locale).title).toBeTruthy();
    }
  });

  it('encodes all populated values and skips empty optional fields', () => {
    const body = googleFormBody(example);
    expect(body.get(contactEntryIds.name)).toBe(example.name);
    expect(body.get(contactEntryIds.email)).toBe(example.email);
    expect(body.get(contactEntryIds.purpose)).toBe(defaultContactPurpose);
    expect(body.get(contactEntryIds.streamUrl)).toBe(example.streamUrl);
    expect(body.get(contactEntryIds.description)).toBe(example.description);
    expect(body.has(contactEntryIds.phone)).toBe(false);
    expect([...body.keys()]).toHaveLength(11);
    expect(body.toString()).toContain('entry.1730206658=Interested%20in%20contributing%20content'.replaceAll('%20','+'));
  });
});
