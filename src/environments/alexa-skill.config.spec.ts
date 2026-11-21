import { validatedAlexaSkillUrl } from './alexa-skill.config';

describe('Alexa install URL configuration', () => {
  it('accepts real HTTPS Store and invitation URLs', () => {
    expect(validatedAlexaSkillUrl('https://www.amazon.in/dp/B0EXAMPLE'))
      .toBe('https://www.amazon.in/dp/B0EXAMPLE');
    expect(validatedAlexaSkillUrl('https://alexa.amazon.com/spa/skill/example'))
      .toBe('https://alexa.amazon.com/spa/skill/example');
  });

  it('does not expose an active install link for blank, unsafe or malformed values', () => {
    for (const value of ['', 'Radio Bee Lambda ARN', 'javascript:alert(1)',
      'http://www.amazon.in/dp/B0EXAMPLE', 'https://localhost/a',
      'https://username:password@amazon.in/dp/B0EXAMPLE', 'https://127.0.0.1/x']) {
      expect(validatedAlexaSkillUrl(value)).toBeNull();
    }
  });
});
