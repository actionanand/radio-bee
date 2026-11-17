import { radioBeeCopyright } from './copyright';

describe('RadioBee copyright', () => {
  it('shows only the founding year when the current year is 2026', () => {
    expect(radioBeeCopyright(2026)).toBe('© 2026 RadioBee. All rights reserved.');
  });

  it('automatically expands the range from 2027 onwards', () => {
    expect(radioBeeCopyright(2027)).toBe('© 2026–2027 RadioBee. All rights reserved.');
    expect(radioBeeCopyright(2030)).toBe('© 2026–2030 RadioBee. All rights reserved.');
  });

  it('never shows a year earlier than the start year', () => {
    expect(radioBeeCopyright(2025)).toBe('© 2026 RadioBee. All rights reserved.');
    expect(radioBeeCopyright(Number.NaN)).toBe('© 2026 RadioBee. All rights reserved.');
  });
});
