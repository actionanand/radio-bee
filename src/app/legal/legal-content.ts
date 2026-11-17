export interface LegalSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly points?: readonly string[];
}

export type LegalPageId = 'privacy' | 'terms' | 'copyright-policy' | 'contact';

export interface LegalDocument {
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly LegalSection[];
}

/**
 * Public-facing notices. These explain current application behavior but cannot
 * replace legal advice or verified operator contact details. Review when a
 * backend, analytics, advertising, or contact submission handling changes.
 */
export const legalDocuments: Record<LegalPageId, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    summary:
      'This policy explains what RadioBee stores on your device, what may be shared with third-party streaming services, and the limits of our control over those services. Effective 17 November 2026.',
    sections: [
      {
        heading: '1. Scope and the service',
        paragraphs: [
          'RadioBee is an internet radio discovery and playback application. This policy applies to the RadioBee website and features provided by the application. It does not replace the separate privacy notices or practices of broadcasters, streaming hosts, operating systems, app stores, or websites that you visit through RadioBee.',
          'RadioBee operates as a directory and player for third-party audio streams. The broadcasters and their hosting services independently determine how their servers process network requests and associated information.',
        ],
      },
      {
        heading: '2. Information stored in the application',
        paragraphs: [
          'The current application saves preferences and functional data on your device using browser or platform storage. Depending on the features you use, this may include favorites, interface language, theme, home-station selections, and cached catalogue data.',
          'Clearing site data, changing browsers, or uninstalling the app may remove these locally stored preferences. Browser and operating-system controls determine the availability and persistence of local storage.',
        ],
      },
      {
        heading: '3. Radio listening and third-party network requests',
        paragraphs: [
          'Playing a station connects your device to the relevant broadcaster or streaming provider. Those third parties may receive technical information inherent in a network request, such as your IP address, device and browser details, request time, and stream URL. Their collection, cookies, logging, geographic restrictions, and retention practices are outside RadioBee’s control.',
          'Catalogue and application resources may be requested from GitHub Pages or other configured infrastructure. These hosting providers may process technical request logs under their own policies.',
        ],
      },
      {
        heading: '4. Device storage and preferences',
        paragraphs: [
          'RadioBee uses local device storage to remember supported user preferences and, where available, cache station-directory information. This allows features such as saved favorites and interface settings to function across visits.',
          'Your browser or operating system may clear stored information because of your own settings, storage limits, privacy modes, or maintenance. RadioBee cannot guarantee that device-stored preferences will remain available indefinitely.',
        ],
      },
      {
        heading: '5. Information you choose to submit',
        paragraphs: [
          'RadioBee provides a Contact Us form that submits through a third-party service, Google Forms. If you submit it, the details you enter (such as name, email, optional phone number, inquiry purpose, message, and optional station information) are transmitted to Google for processing and made available to the RadioBee form operator. The form does not store its entries as RadioBee browser preferences.',
          'Google processes form submissions under its own terms and privacy practices. Providing an inquiry and agreeing to submission are voluntary; do not send passwords, identity documents, sensitive contractual information, or other confidential material unless an appropriate secure channel has been agreed separately.',
        ],
      },
      {
        heading: '6. Cookies, analytics and advertising',
        paragraphs: [
          'RadioBee uses device and browser storage for application functionality, as described above. This policy does not promise that every third-party streaming host, browser, operating system, or hosting provider operates without cookies, analytics, advertising technologies, or logs.',
          'If RadioBee later adds its own analytics, advertising integrations, authentication, or another server-hosted contact system, this policy must be reviewed and updated to describe those features and any choices or notices legally required.',
        ],
      },
      {
        heading: '7. Purposes and legal requirements',
        paragraphs: [
          'Functional data is used to provide playback, saved preferences, station discovery, and normal operation of the application. Any information processed by infrastructure providers may also be necessary to deliver and secure network services.',
          'Where applicable law requires consent, a legal basis, or a specific notice for personal data processing, those legal requirements apply in addition to this policy. Nothing in this document is intended to waive statutory privacy rights.',
        ],
      },
      {
        heading: '8. Retention and control',
        paragraphs: [
          'You can usually remove stored RadioBee preferences and cached catalogue data by clearing the app or browser’s site data, subject to the platform. RadioBee does not control deletion or retention of information held by broadcasters, streaming providers, or other independent services.',
          'Contact form entries may be stored and retained by Google Forms and by the form operator according to their respective settings and applicable legal obligations. RadioBee does not currently provide a user-facing deletion workflow for submitted Google Forms responses. Use the Contact Us form for inquiries or requests about submitted information, and do not send sensitive documents through it.',
        ],
      },
      {
        heading: '9. Sharing and international access',
        paragraphs: [
          'RadioBee does not need to sell locally stored favorites or preferences to provide its core directory and playback features. Your device necessarily makes connections to selected streaming and hosting providers, which may operate from other regions or countries. Each provider’s handling of request data is governed by its own practices and applicable law.',
        ],
      },
      {
        heading: '10. Security and limitations',
        paragraphs: [
          'RadioBee aims to use reasonable technical safeguards within its control, but no software, device, internet connection, or storage system can be guaranteed completely secure or continuously available. You should keep your operating system and browser updated and review the permissions and privacy controls on your device.',
        ],
      },
      {
        heading: '11. Children and privacy rights',
        paragraphs: [
          'RadioBee is a general-purpose directory and is not designed to solicit personal information from children. Parents and guardians should supervise children’s use of third-party radio services where appropriate.',
          'Depending on your location and applicable law, you may have rights to information, access, correction, erasure, grievance redressal, or other remedies concerning personal data. The operator must provide any legally required contact or grievance mechanism before collecting information for which such a mechanism is mandatory.',
        ],
      },
      {
        heading: '12. Changes and contact',
        paragraphs: [
          'This policy may be updated when the application changes or legal requirements develop. Material updates will be reflected on this page with a revised effective date. Use the available RadioBee Contact Us form for questions or requests about this policy. The form sends entries through Google Forms; a browser submission does not verify delivery or receipt.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    summary:
      'These terms govern access to and use of RadioBee, a directory and playback interface for third-party internet radio services. Effective 17 November 2026.',
    sections: [
      {
        heading: '1. Acceptance and lawful use',
        paragraphs: [
          'By accessing or using RadioBee, you agree to comply with these terms and applicable law. If you do not agree, do not use the service. If any term conflicts with rights that cannot lawfully be restricted in your jurisdiction, those mandatory rights prevail.',
          'You must use the app, broadcaster websites, streams, and related content only when you have the necessary permissions and legal rights.',
        ],
      },
      {
        heading: '2. What RadioBee provides',
        paragraphs: [
          'RadioBee helps users discover and listen to internet radio stations. Station listings, logos, descriptive information, and playback links may originate from publicly accessible sources or third-party providers. Station inclusion is not a statement of ownership, partnership, affiliation, licensing, or endorsement.',
          'RadioBee is not itself the broadcaster, producer, publisher, or rights holder of the third-party radio programming offered through station links. Streaming availability and access conditions are set by independent providers.',
        ],
      },
      {
        heading: '3. Ownership of streams and third-party content',
        paragraphs: [
          'RadioBee does not claim ownership of any third-party radio stream, broadcast, music, program, transmission, station trademark, or broadcaster-owned logo. Those rights remain with their respective owners and licensors.',
          'The RadioBee name, original interface, original documentation, and other original application materials may be protected separately. Nothing here transfers rights to the app or to third-party content.',
        ],
      },
      {
        heading: '4. Stream links and broadcaster control',
        paragraphs: [
          'Stations and streaming hosts can modify, geo-restrict, interrupt, discontinue, monetize, or block access to their services without notice. A listing or stream link may become incorrect, inaccessible, prohibited, or outdated at any time.',
          'RadioBee does not guarantee a station’s title, metadata, language, licensing status, stream quality, signal continuity, editorial content, or continued availability.',
        ],
      },
      {
        heading: '5. Use of third-party streams',
        paragraphs: [
          'Access to a publicly available stream does not necessarily grant a right to reproduce, retransmit, redistribute, publicly perform, or commercially exploit its content. You are responsible for obtaining any permissions required for uses beyond ordinary authorized listening.',
          'Do not use RadioBee to bypass security controls, defeat access restrictions, infringe third-party rights, or redistribute broadcasts without authorization. RadioBee may remove or restrict a station listing when a valid rights concern or legal restriction is identified.',
        ],
      },
      {
        heading: '6. Your responsibilities',
        points: [
          'Comply with laws, broadcaster terms, licenses, rights of third parties, and the conditions of any platform you use.',
          'Do not use the service to infringe copyrights or trademarks, bypass security controls, distribute malicious code, or interfere with other users or providers.',
          'Do not misrepresent ownership of broadcasts or station identities, or publish another person’s private information through an issue report.',
          'Protect your own device and accounts, and review permissions before opening external links or services.',
        ],
      },
      {
        heading: '7. Third-party sites and services',
        paragraphs: [
          'External links and streams are provided for convenience. RadioBee does not supervise, operate, warrant, or control independent websites, broadcasters, advertisers, hosting providers, or other third parties. Your interactions with those entities are subject to their own terms and policies.',
        ],
      },
      {
        heading: '8. No editorial endorsement',
        paragraphs: [
          'Station listings are informational and do not constitute RadioBee’s endorsement of any broadcaster, viewpoint, advertisement, political position, medical advice, financial advice, or other streamed content. Broadcasters are responsible for their own transmissions and editorial decisions to the extent provided by applicable law.',
        ],
      },
      {
        heading: '9. Accuracy and availability',
        paragraphs: [
          'The service is offered on an as-available basis. To the fullest extent permitted by applicable law, RadioBee disclaims warranties concerning uninterrupted access, error-free operation, fitness for a particular purpose, non-infringement of third-party broadcasts, and the accuracy or completeness of station information.',
          'RadioBee may modify, suspend, remove, or discontinue any station listing, link, feature, or service where reasonably necessary for safety, technical operation, rights compliance, or other legitimate reasons.',
        ],
      },
      {
        heading: '10. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by applicable law, RadioBee and its operators are not liable for indirect, incidental, special, consequential, or exemplary losses arising from third-party broadcasts, interruptions, device incompatibility, unavailable streams, lost local data, or your use of the service.',
          'This provision does not exclude or limit liability that cannot lawfully be excluded, including liability arising from obligations that applicable law makes non-waivable. Nothing in these terms removes statutory consumer, privacy, intellectual-property, or other mandatory rights.',
        ],
      },
      {
        heading: '11. Responsibility for your misuse',
        paragraphs: [
          'You are responsible for your own unlawful use, unauthorized redistribution, and violations of others’ rights. Where permitted by applicable law, you agree to address third-party claims arising from your willful misuse or material breach of these terms, except to the extent caused by RadioBee’s own unlawful conduct.',
        ],
      },
      {
        heading: '12. Intellectual-property complaints and removal',
        paragraphs: [
          'RadioBee respects intellectual-property and broadcaster rights. Verified rights holders, authorized representatives, and users with substantiated concerns may report a specific station listing, stream URL, logo, or other item through the process described in Copyright & Removal.',
          'RadioBee may investigate and remove or disable a contested listing when there is a credible rights claim, valid legal order, substantiated infringement concern, or other legitimate reason. Removal from the directory cannot delete copies or broadcasts controlled by third-party servers.',
        ],
      },
      {
        heading: '13. No reliance on continuous access',
        paragraphs: [
          'RadioBee is not an emergency, public-safety, or guaranteed information service. Do not rely on an internet radio stream as your only source of urgent warnings or time-critical instructions.',
        ],
      },
      {
        heading: '14. Applicable law and disputes',
        paragraphs: [
          'Use of the service is subject to the laws applicable to the particular conduct, location, and parties. Any dispute resolution or forum requirements are subject to mandatory laws and applicable consumer protections. These terms do not designate an exclusive court or waive non-waivable remedies.',
        ],
      },
      {
        heading: '15. Changes, severability and contact',
        paragraphs: [
          'RadioBee may revise these terms as features, external services, and legal requirements change. The date on this page identifies the version in effect. If one provision is held invalid, other provisions remain effective to the extent lawful.',
          'Use the Contact Us form for inquiries and corrections. Because the browser sends the request to Google Forms without access to a private receipt confirmation from Google, an on-screen submission message indicates that the browser request completed, not that the message was delivered to or read by the RadioBee operator.',
        ],
      },
    ],
  },
  'copyright-policy': {
    title: 'Copyright & Removal Policy',
    summary:
      'RadioBee respects broadcast, music, program, trademark, and other third-party rights. We will review substantiated complaints and remove or disable directory entries when warranted. Effective 17 November 2026.',
    sections: [
      {
        heading: '1. No ownership of third-party streams',
        paragraphs: [
          'RadioBee is an independent station-discovery and playback application. It does not own, produce, license on behalf of broadcasters, or claim rights over third-party radio streams, music, programs, transmissions, station brands, or logos. Rights remain with the broadcasters, copyright owners, and their respective licensors.',
          'A station’s appearance in the RadioBee directory does not mean that the broadcaster has sponsored, endorsed, licensed, or authorized the app.',
        ],
      },
      {
        heading: '2. Removal and correction commitment',
        paragraphs: [
          'We aim to review clearly identified, good-faith reports of unauthorized listings, rights conflicts, inaccurate attribution, prohibited access, or other legitimate concerns. Where credible evidence or a valid legal basis warrants action, RadioBee may promptly remove, disable, or correct a station listing, logo, description, stream link, or feature.',
          'RadioBee may also temporarily restrict access while a claim is reviewed. Decisions are assessed according to the information available and applicable law; filing a report does not guarantee a particular outcome.',
        ],
      },
      {
        heading: '3. Information to include in a report',
        points: [
          'The station name, the exact RadioBee listing URL, and the relevant stream or artwork URL if known.',
          'The work, trademark, broadcast, or right at issue and a clear description of the concern.',
          'The legal or factual basis for your rights or authority to act, with non-confidential supporting details.',
          'The specific action requested: correction, removal, disabling of playback, or another appropriate remedy.',
          'A contact email address for follow-up, and a request for an alternative secure channel if sensitive supporting material is required.',
        ],
      },
      {
        heading: '4. Reporting channel',
        paragraphs: [
          'Use the RadioBee Contact Us form to report concerns, identify the specific listing and describe the requested remedy. The form submits details to Google Forms for access by the project operator; it is not a confidential legal-notice portal or a guaranteed receipt system.',
          'Do not submit identity documents, addresses, private contracts, unpublished works, credentials, or sensitive evidence through the contact form. If sensitive evidence is necessary, request a suitable secure channel first.',
        ],
      },
      {
        heading: '5. Review and action',
        paragraphs: [
          'When a report is received through an available channel, the project may check the station URL, source information, available rights details, any broadcaster restrictions, and the requested remedy. We may request clarification before acting where the report is incomplete or disputed.',
          'Reasonably supported concerns may result in removal, restricted playback access, or corrected attribution. RadioBee cannot remove or control the underlying stream on infrastructure operated by a broadcaster or hosting service. Appropriate legal notices or court orders will be addressed according to applicable requirements.',
        ],
      },
      {
        heading: '6. Broadcaster consent and use restrictions',
        paragraphs: [
          'A stream being publicly accessible does not by itself establish permission for redistribution, retransmission, commercial use, or use of station branding. Users must respect applicable rights, broadcaster conditions, and any permissions required for their activities.',
        ],
      },
      {
        heading: '7. Good-faith reports and competing rights',
        paragraphs: [
          'Please submit accurate information and do not knowingly impersonate a rights holder or make false statements. A station operator or other affected party may present relevant corrections or authorization evidence through an appropriate reporting channel.',
          'RadioBee may consider rights ownership, licenses, legal exceptions, permissions, broadcaster instructions, and the circumstances of a disputed listing before determining an action. No formal statutory counter-notice or dispute process is implied unless legally applicable.',
        ],
      },
      {
        heading: '8. Trademarks and station identities',
        paragraphs: [
          'Third-party station names, trademarks, and artwork are used only to identify the referenced services. Their inclusion does not convey sponsorship, endorsement, or transfer of ownership. Rights holders may report inaccurate branding or unauthorized imagery for review.',
        ],
      },
      {
        heading: '9. Repeat issues and updates',
        paragraphs: [
          'Where recurring issues involve the same source, RadioBee may block or remove related listings or features as appropriate. This policy may be updated to reflect changes to contact submission, rights verification, or legal obligations. Any legally required grievance or notice procedure takes precedence over this general description.',
        ],
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    summary:
      'Questions, station corrections, broadcaster rights concerns or suggestions? Choose a topic below to open the RadioBee contact form.',
    sections: [
      {
        heading: 'Contact RadioBee',
        paragraphs: [
          'Provide your name, email and the purpose of your inquiry. Station details are optional. Submitting the form shares your entries with Google Forms for processing and access by the RadioBee form operator.',
          'Submitting does not guarantee a response or establish a verified legal-notice channel. Please avoid including confidential documents, passwords or sensitive personal information.',
        ],
      },
    ],
  },
};

export const legalLinks: ReadonlyArray<{ path: '/privacy' | '/terms' | '/copyright-policy' | '/contact'; label: string }> = [
  { path: '/privacy', label: 'Privacy Policy' },
  { path: '/terms', label: 'Terms & Conditions' },
  { path: '/copyright-policy', label: 'Copyright & Removal' },
  { path: '/contact', label: 'Contact Us' },
];
