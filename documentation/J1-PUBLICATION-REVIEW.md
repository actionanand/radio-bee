# J1 publication review correction

Reviewed 2026-11-06. This supersedes the earlier interpretation that the developer-page invitation alone established RadioBee Web permission.

## Sources read together

- [Official developer policy](https://www.j1fm.tokyo/j1/developers/) encourages the listed channels in apps/websites, lists HTTPS MP3 endpoints and imposes branding/advertising conditions. J1 HD is excluded.
- [Official FAQ](https://www.j1fm.tokyo/faq/) separately permits conditional mobile-app use, but says directly linking audio streams from a website is not permitted under its SOCAN licensing. It points website visitors to the J1 homepage or its official player.

Neither page states that its wording supersedes the other. Their scope for an external HTMLAudio-based website is therefore unresolved. A reachable stream or an audible local test does not settle this publication question.

## GitHub Pages / Web

GitHub Pages hosts a third-party website. RadioBee's browser player directly requests the MP3 endpoint, even though there is no visible raw-stream hyperlink, recording or relay. It would be unsafe to assume the FAQ restriction applies only to plain anchor links and exempts embedded HTMLAudio. The broad developer invitation is insufficient to dismiss the more specific website restriction.

**Decision: retain review-only/unconfirmed status for J1 HITS and GOLD. Do not publish direct Web playback without clarification from J1/REC.** The proposed `rightsStatus` is `unconfirmed` and `directListening.status` is `needs-review`. The client does not introduce a platform-specific rights override or schema change. No new J1 Web audio probes are run as part of this correction; earlier technical successes remain historical facts, not approval evidence.

## Android

The FAQ's mobile-app permission is clearer than its website permission. RadioBee would still need to satisfy the final app conditions: it must be a broader station app, avoid misleading J1 naming/branding, exclude J1 HD, and avoid monetization that interrupts the stream. Merely listing other unplayable stations should not be assumed to establish the intended broader offering.

A separate Android publication review should verify those conditions and the actual distribution context. A shared, platform-neutral catalogue flag cannot accurately express Android-only permission while Web remains unresolved. Accordingly, this client task does not change either proposed source to globally permission-granted, and does not modify the data repository.

## Listener pages and provenance

Both proposed station `website` values now point to [J1's official homepage](https://www.j1fm.tokyo/), which is explicitly offered by the FAQ as a website destination. The developer page and FAQ remain separately attributed source records, with source IDs on the stations/streams. No developer-policy page is presented as the station's listener website.

## Clarification to obtain before Web release

Prepared question for the project owner to send through J1's official contact route:

> RadioBee is a multi-station radio app with an Android edition and a public GitHub Pages website. May the website play J1 HITS/GOLD directly through HTMLAudio using your published HTTPS endpoints, without recording, relaying, inserted audio ads or J1 app branding? Your developer page encourages website integration, but your FAQ prohibits direct website audio-stream links. Does that restriction include this player integration? Please confirm the allowed Web and Android uses separately, including any geographic conditions or required official-player embed.

No clarification request has been sent from this task. Until the response resolves Web use, production remains blocked; users may follow the official homepage link from station details.
