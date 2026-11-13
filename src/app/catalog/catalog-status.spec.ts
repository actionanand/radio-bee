import { catalogStatusText } from './catalog-status';

describe('catalogue status translations', () => {
  it('preserves English diagnostics and translates fetch messages into Tamil and Sanskrit', () => {
    const message = 'Catalogue request timed out. Showing the last successfully validated catalogue.';
    expect(catalogStatusText('en', message)).toBe(message);
    expect(catalogStatusText('ta', message)).toBe(
      'வானொலிப் பட்டியல் கோரிக்கை நேரம் முடிந்தது. முன்பு சரிபார்க்கப்பட்ட வானொலிப் பட்டியல் காட்டப்படுகிறது.',
    );
    expect(catalogStatusText('sa', message)).toBe(
      'वाणीसूचीप्रार्थनायाः समयसीमा समाप्ता। पूर्वं सत्यापिता वाणीसूची प्रदर्श्यते।',
    );
  });

  it('translates home and cache notices while preserving HTTP status codes', () => {
    expect(catalogStatusText('ta', 'Home selection unavailable. Browse World for all radios.')).toContain('முகப்பு');
    expect(catalogStatusText('sa', 'Saved catalogue could not be read; requesting a fresh copy.')).toContain('नूतना');
    expect(catalogStatusText('ta', 'Catalogue request failed (503).')).toContain('(503)');
    expect(catalogStatusText('sa', 'Catalogue request failed (429).')).toContain('(429)');
  });

  it('leaves unknown network diagnostics untouched', () => {
    expect(catalogStatusText('ta', 'Unexpected server error')).toBe('Unexpected server error');
    expect(catalogStatusText('sa', '')).toBe('');
  });
});
