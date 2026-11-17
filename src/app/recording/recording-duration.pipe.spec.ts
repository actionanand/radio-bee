import { RecordingDurationPipe } from './recording-duration.pipe';

describe('RecordingDurationPipe', () => {
  const pipe = new RecordingDurationPipe();

  const cases: [number, string][] = [
    [0, '0 s'],
    [2, '2 s'],
    [59, '59 s'],
    [60, '1 minute'],
    [62, '1 minute 2 s'],
    [120, '2 minutes'],
    [3600, '1 hour'],
    [3602, '1 hour 2 s'],
    [3662, '1 hour 1 minute 2 s'],
    [7320, '2 hours 2 minutes'],
  ];

  it.each(cases)('formats %i elapsed seconds as %s', (seconds, expected) => {
    expect(pipe.transform(seconds)).toBe(expected);
  });

  it('handles fractional, invalid and missing seconds safely', () => {
    expect(pipe.transform(62.9)).toBe('1 minute 2 s');
    expect(pipe.transform(-42)).toBe('0 s');
    expect(pipe.transform(NaN)).toBe('0 s');
    expect(pipe.transform(Infinity)).toBe('0 s');
    expect(pipe.transform(undefined)).toBe('0 s');
    expect(pipe.transform(null)).toBe('0 s');
  });

  it('uses the current UI language and falls back to English', () => {
    expect(pipe.transform(62, 'ta')).toBe('1 நிமிடம் 2 விநாடிகள்');
    expect(pipe.transform(3600, 'ta')).toBe('1 மணி நேரம்');
    expect(pipe.transform(62, 'sa')).toBe('1 निमेषः 2 क्षणाः');
    expect(pipe.transform(3600, 'sa')).toBe('1 घण्टा');
    expect(pipe.transform(62, 'unknown')).toBe('1 minute 2 s');
  });
});
