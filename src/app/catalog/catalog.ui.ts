// Client-only controls supplement the catalogue-owned dictionaries; broadcaster names are never translated here.
const english = {
  indiaStates: 'State / Union Territory',
  refresh: 'Refresh catalogue',
  clear: 'Clear filters',
  uiLanguage: 'UI language',
  details: 'Station details',
  loading: 'Loading catalogue…',
  unavailable: 'Playback is not available in this preview.',
  unspecified: 'Unspecified',
  discovery: 'Discovery only. Listing review does not verify a stream. Playback is reserved for Stage 3.',
  broaden: 'Clear filters or choose a broader region. Unspecified locations do not match a selected city.',
};
export type UiKey = keyof typeof english;
const labels: Record<string, Partial<Record<UiKey, string>>> = {
  en: english,
  ta: {
    indiaStates: 'மாநிலம் / ஒன்றியப் பகுதி',
    refresh: 'பட்டியலைப் புதுப்பி',
    clear: 'வடிகட்டிகளை நீக்கு',
    uiLanguage: 'இடைமுக மொழி',
    details: 'நிலைய விவரங்கள்',
    loading: 'பட்டியல் ஏற்றப்படுகிறது…',
    unavailable: 'இந்த முன்னோட்டத்தில் ஒலிபரப்பைக் கேட்க முடியாது.',
    unspecified: 'குறிப்பிடப்படவில்லை',
    discovery:
      'நிலையங்களை அறிய மட்டுமே. பட்டியல் சரிபார்ப்பு இணைய ஒலிபரப்பை உறுதிசெய்யாது. ஒலிபரப்பு வசதி மூன்றாம் கட்டத்தில் வரும்.',
    broaden:
      'வடிகட்டிகளை நீக்கவும் அல்லது பெரிய பகுதியைத் தேர்வுசெய்யவும். குறிப்பிடப்படாத இடங்கள் தேர்ந்தெடுத்த நகரத்துடன் பொருந்தாது.',
  },
  sa: {
    indiaStates: 'राज्यम् / केन्द्रशासितप्रदेशः',
    refresh: 'सूचीं नवीकुरुत',
    clear: 'चयनानि निरस्यत',
    uiLanguage: 'अन्तरफलकभाषा',
    details: 'केन्द्रस्य विवरणम्',
    loading: 'सूची आनीयते…',
    unavailable: 'अस्मिन् पूर्वदर्शने श्रवणं न उपलब्धम्।',
    unspecified: 'अनिर्दिष्टम्',
    discovery: 'केवलम् अन्वेषणार्थम्। सूचीपरीक्षा प्रसारस्य सत्यापनं नास्ति। श्रवणसुविधा तृतीये चरणे भविष्यति।',
    broaden: 'चयनानि निरस्यत अथवा विस्तृतं क्षेत्रं चिनुत। अनिर्दिष्टस्थानानि चयनितनगरस्य न सन्ति।',
  },
};
export function uiLabel(locale: string, key: UiKey): string {
  return labels[locale]?.[key] || english[key];
}
