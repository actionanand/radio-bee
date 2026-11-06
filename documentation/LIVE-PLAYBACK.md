# Controlled live-radio playback

Tested 6 November 2026 on branch `codex/live-radio-technical-test`, based on client
master `5535342`. No commits, pushes, merges, dependency changes or catalogue
rights changes were made.

## Run locally through WSL2

Use the existing Linux Node installation and dependencies:

```bash
nvm use 24.16.0
test "$(node -p process.platform)" = linux
cd /mnt/c/AR_Files/code/radio-bee
npm start -- --configuration=live-test --host=127.0.0.1 --port=3043
```

Open <http://localhost:3043/> and use **Test live audio** in the local technical
test section. The normal persistent player provides pause, resume, stop, volume,
mute, retry and errors. Headphones/speakers must be enabled for a human listening
check. No broadcaster audio is recorded or redistributed.

This configuration requires an explicit non-production environment **and** a
loopback hostname. Ordinary development and production configurations disable it.
Only the four supplied leads can be selected; there is no arbitrary-URL input.
Technical eligibility checks HTTPS URLs, supported formats and player capability,
without turning editorial verification or unconfirmed rights into permission.
The normal PlayerService entry point still resolves the latest catalogue metadata
and requires production eligibility. Catalogue discovery and geographic filtering
are unchanged.

The local test configuration prefers hls.js when supported so its real MSE path
can be exercised even in Chrome versions with native HLS. Production still
prefers native HLS, with hls.js as the supported fallback.

## Real browser results

The tests clicked actual RadioBee controls in Windows Chrome, driven by Linux
Node through a browser-control bridge. Audio went directly from the broadcaster
endpoint to the browser. No media mocks, generated audio, recordings or CORS
proxies were used. Each successful playback was observed for approximately
20 seconds after its `playing` event.

| Lead                              | Result                                   | HTTP, media and continuity evidence                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sooriyan FM Sri Lanka             | Played; user confirmed sound             | Exact supplied URL; HTTP 200, `audio/mpeg; charset=UTF-8`, CORS `*`, no redirect. `playing`, readyState 4, no media error; playback advanced 19.800 seconds.                                                                                                                                                                                       |
| Vasantham FM Sri Lanka            | Browser playback confirmed               | Exact supplied URL; HTTP 200, `audio/mpeg`, CORS `*`, no redirect. `playing`, readyState 4, no media error; playback advanced 20.014 seconds. No independent human identity check.                                                                                                                                                                 |
| AIR Nagercoil Kumari FM 101 lead  | Native HLS and hls.js playback confirmed | HTTP 302 to `https://d1tmej9eu7kw5c.cloudfront.net/10c64309264eb009/10c64309264eb009.m3u8`. Playlist HTTP 200/206, `application/vnd.apple.mpegurl`; segments HTTP 200/206, `video/mp2t`, CORS `*`. Native playback advanced 20.207 seconds; hls.js playback used a `blob:` media source and advanced 20.006 seconds, readyState 4, no media error. |
| Suryan 93.5 third-party candidate | Failed; identity unconfirmed             | Connection to `tamil.crabdance.com:8002` timed out without an HTTP response in the bounded curl probe. Browser remained at time 0/readyState 0 and RadioBee reported its 20-second startup timeout. No MIME, codec, redirect or CORS conclusion can be drawn without a response. Do not label this Suryan Chennai.                                 |

Native AIR emitted `stalled` events while its clock continued advancing; hls.js
completed the observed interval without a fatal error. Deliberate Stop/cleanup
can abort an outstanding live request; that cancellation is not a source failure.
Continuous MP3 responses can outlast a bounded HTTP probe even when healthy.

The human response to the instructed Sooriyan listening test was: **"Working. UI
is not looking good. UI is simple"**. This establishes user-reported audible
playback. The user did not report language, programme or a station-identification
announcement; station naming currently relies on the broadcaster-published URL,
not independent recognition of an announcement. Visual refinement remains a
follow-up.

Real Sooriyan pause/resume and Stop cleanup also passed at 375px and 1280px in
both light and dark themes. All four combinations had zero automated axe
violations and no horizontal overflow. These checks do not establish complete
manual accessibility conformance. Twenty-second samples do not establish long
term uptime; Android, Safari and other devices still need separate testing.

## Catalogue and publication policy

Both data references were inspected: `actionanand/radio-bee-data` master had
catalogue 1.0.0 (81 stations, no verified streams); the existing
`feature/3-verified-radio-streams` branch had catalogue 1.1.0 (84 stations,
8 streams, 1 technically verified stream). Its Vasantham stream was verified
but still had unconfirmed rights. The data repository was not modified.

The test leads retain `unverified`, `unconfirmed`, and a null verification date.
A successful technical test does not automatically change these fields. Before
enabling production direct playback, document an applicable usage grant/terms
and evidence of station identity, then make the reviewed catalogue change
separately. Existing production eligibility also checks format and compatibility.

Official source references reviewed:

- [Akashvani player](https://akashvani.gov.in/radio/live.php) and the data branch's source documentation identify the AIR channel lead.
- [Prasar Bharati terms](https://prasarbharati.gov.in/en/terms-conditions/) do not establish a RadioBee direct-playback grant in this investigation.
- [Sooriyan broadcaster](https://www.sooriyanfm.lk/) corroborates its player endpoint.
- [Vasantham broadcaster](https://www.vasanthamfm.lk/) and the existing data branch provide provenance; automated access to the broadcaster page returned 403 during source review.

No new production direct-play grant was established. Blocked AIR, Sooriyan and
Vasantham catalogue cards instead offer a clearly labelled external broadcaster
listening-page link. These fixed HTTPS links are separate from RadioBee playback;
no arbitrary catalogue website is trusted as an audio source.

## Radio Browser investigation

[Radio Browser API documentation](https://docs.radio-browser.info/) was reviewed
and its metadata queried using a descriptive RadioBee User-Agent. Results include
incorrect India records for Sri Lankan Sooriyan and Vasantham; do not import
country, locality, identity or rights blindly. Relevant Sri Lanka station UUIDs:

- Sooriyan: `0e309df5-eebb-4fed-a5eb-61d0ac70012c` (a different port-8006 lead).
- Vasantham: `aa2d0a92-7e8a-4b7f-ace3-fc24d207543f` (same supplied endpoint).

For a future integration, follow the documented mirror discovery and failover
procedure, send an identifying User-Agent where supported, retain station UUID
and Radio Browser attribution, validate the broadcaster identity independently,
and call `/json/url/{stationuuid}` for an actual user playback selection so its
click is counted. No Radio Browser playback selection was made in these tests;
the tested URLs were the user's broadcaster leads. The API does not grant
third-party playback rights.

## Validation

Final validation used WSL2 Linux Node 24.16.0 with the existing dependencies:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:ci`: **84 tests passed across 9 files**. Coverage includes production rights enforcement, local gate/allowlist, native HLS preference, explicit hls.js selection, errors/cancellation, geographic filters and localized broadcaster links.
- `npm run build:gh -- --configuration=production`: passed; `www/index.html` contains `<base href="/radio-bee/">`.
- Local `live-test` build: passed and used for real stream/browser checks above.
- `git diff --check`: passed.

## Changed files

- `angular.json`: explicit build/serve configuration for the local tests.
- `src/environments/environment.ts`, `environment.prod.ts`, `environment.live-test.ts`: opt-in flag, disabled by default/production.
- `src/app/live-test/live-test.config.ts`, `live-stream-lab.ts`, `live-test.spec.ts`: loopback gate, leads, controls and policy separation regressions.
- `src/app/catalog/stream-eligibility.ts`: shared technical checks with a distinct production policy entry point.
- `src/app/player/player.service.ts`, `player.html`: reuse engine/lifecycle, separate technical entry point and visible test label.
- `src/app/player/media-engine.ts`, `media-engine.spec.ts`: explicit local hls.js exercise option; production native preference retained.
- `src/app/home/home.page.ts`, `home.page.html`: local lab integration.
- `src/app/catalog/broadcaster-pages.ts`, `catalog.ui.ts`, `station-browser.ts`, `station-browser.html`, `station-browser.scss`, `station-playback.spec.ts`: external broadcaster fallback and localized regression coverage.
- `documentation/LIVE-PLAYBACK.md`: this report and reproduction instructions.

Ignored `tmp/live-playback-results.json`, `tmp/live-hlsjs-results.json` and
`tmp/live-accessibility-results.json` contain local metadata-only observations.
They contain no captured broadcaster audio.
