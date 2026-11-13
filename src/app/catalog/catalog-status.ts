/**
 * Localize known catalogue fetch/cache notices at the UI boundary.
 * Keep the original service diagnostics intact for logging and tests.
 */
const translations: Record<string, { ta: string; sa: string }> = {
  'Language preference could not be read.': {
    ta: 'மொழி விருப்பத்தைப் படிக்க முடியவில்லை.',
    sa: 'भाषायाः अभिरुचिः पठितुं न शक्यते।',
  },
  'Saved catalogue could not be read; requesting a fresh copy.': {
    ta: 'சேமித்த வானொலிப் பட்டியலைப் படிக்க முடியவில்லை; புதிய நகல் கோரப்படுகிறது.',
    sa: 'सञ्चिता वाणीसूची पठितुं न शक्यते; नूतना प्रतिलिपिः आनीयते।',
  },
  'Catalogue loaded, but could not be saved for offline use.': {
    ta: 'வானொலிப் பட்டியல் ஏற்றப்பட்டது; இணையமின்றிப் பயன்படுத்தச் சேமிக்க முடியவில்லை.',
    sa: 'वाणीसूची प्राप्ता, किन्तु अन्तर्जालरहितोपयोगाय सञ्चेतुं न शक्यते।',
  },
  'UI language changed but could not be saved.': {
    ta: 'இடைமுக மொழி மாற்றப்பட்டது; அதைச் சேமிக்க முடியவில்லை.',
    sa: 'अन्तरफलकभाषा परिवर्तिता, किन्तु सञ्चेतुं न शक्यते।',
  },
  'Home selection unavailable. Browse World for all radios.': {
    ta: 'முகப்பு வானொலிகள் கிடைக்கவில்லை. முழுப் பட்டியலை உலகம் பகுதியில் காணலாம்.',
    sa: 'मुखपृष्ठस्य वाणीकेन्द्राणि अनुपलब्धानि। विश्वविभागे सर्वाणि केन्द्राणि पश्यतु।',
  },
  'Catalogue host is not deployed (404).': {
    ta: 'வானொலிப் பட்டியல் சேவையகம் கிடைக்கவில்லை (404).',
    sa: 'वाणीसूचीजालस्थलं न उपलब्धम् (404)।',
  },
  'Catalogue request timed out.': {
    ta: 'வானொலிப் பட்டியல் கோரிக்கை நேரம் முடிந்தது.',
    sa: 'वाणीसूचीप्रार्थनायाः समयसीमा समाप्ता।',
  },
  'Catalogue changed during loading; refresh to request a consistent snapshot.': {
    ta: 'ஏற்றும்போது வானொலிப் பட்டியல் மாறியது. மீண்டும் புதுப்பிக்கவும்.',
    sa: 'आहरणकाले वाणीसूची परिवर्तिता। पुनः नवीकुरुत।',
  },
  'Network request failed.': {
    ta: 'இணையக் கோரிக்கை தோல்வியடைந்தது.',
    sa: 'अन्तर्जालप्रार्थना विफला।',
  },
  'Showing a DEVELOPMENT SEED from the data repository, not live data.': {
    ta: 'நேரடித் தரவுக்குப் பதிலாக மேம்பாட்டுச் சோதனைத் தரவு காட்டப்படுகிறது.',
    sa: 'प्रत्यक्षदत्तांशस्य स्थाने विकासपरीक्षादत्तांशः प्रदर्श्यते।',
  },
  'Showing the last successfully validated catalogue.': {
    ta: 'முன்பு சரிபார்க்கப்பட்ட வானொலிப் பட்டியல் காட்டப்படுகிறது.',
    sa: 'पूर्वं सत्यापिता वाणीसूची प्रदर्श्यते।',
  },
  'No saved catalogue is available. Check the connection and data repository deployment, then refresh.': {
    ta: 'சேமித்த வானொலிப் பட்டியல் இல்லை. இணைய இணைப்பையும் தரவு வெளியீட்டையும் சரிபார்த்துப் புதுப்பிக்கவும்.',
    sa: 'सञ्चिता वाणीसूची नास्ति। अन्तर्जालसंयोगं दत्तांशप्रकाशनं च परीक्ष्य पुनः नवीकुरुत।',
  },
};

export function catalogStatusText(locale: string, message: string): string {
  if (!message || (locale !== 'ta' && locale !== 'sa')) return message;
  let translated = message;
  for (const [source, languages] of Object.entries(translations))
    translated = translated.replaceAll(source, languages[locale]);
  return translated.replace(/Catalogue request failed \((\d+)\)\./g, (_, status: string) =>
    locale === 'ta'
      ? `வானொலிப் பட்டியல் கோரிக்கை தோல்வியடைந்தது (${status}).`
      : `वाणीसूचीप्रार्थना विफला (${status})।`,
  );
}
