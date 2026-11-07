# Stage 7 validation — 7 November 2026

This records the initial Stage 7 run. The [final HLS/policy review](STAGE7-HLS-REVIEW.md) contains the later engine-selection corrections and production retest; historical failures below are preserved as evidence, not presented as the latest station outcome.

Branch: `feature/7-configurable-radio-playback`, created from fetched public master `089fb4426137d9d1e230a34c1a99306ce50ad2e4`. No commit, push, merge or deployment was performed. Only the client repository was changed.

## Implementation

All three environments contain the requested `RadioApi` defaults: `AllowUnverified: true`, `CheckVerificationStatus: false`, `CheckRightsStatus: false`. The typed, frozen injectable policy drives cards, Listen Now, PlayerService, resume, refresh and candidate selection. Strict checks remain available. Explicit restrictions, invalid/non-HTTPS/credential-bearing URLs, non-audio formats and unsupported players remain blocked. Catalogue metadata is never rewritten.

Candidate selection prefers observed successful playback and official provenance, including Sooriyan's official alternative. Each request tries at most three distinct eligible URLs; explicit Retry starts a new bounded request. Pause, stop, metadata revocation and station switching cancel stale work, including HLS callbacks. See [configuration and behavior](CONFIGURABLE-PLAYBACK.md) and the [exact changed-file list](stage7/changed-files.txt).

## Local checks

Run once after application changes, through WSL2 Linux Node 24.16.0, with `process.platform` checked as `linux`:

| Check                                            | Result                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| `npm run lint`                                   | Passed                                               |
| `npm run typecheck`                              | Passed                                               |
| `npm run test:ci`                                | **192 passed, 15 files**, no skips                   |
| `npm run build:gh -- --configuration=production` | Passed; `www/index.html` has `/radio-bee/` base href |
| PR workflow / preview / evidence script tests    | **6 passed**, no skips                               |
| `git diff --check`                               | Passed                                               |

The two existing stylesheet warnings remain: station-card 2.70 kB and station-browser 3.74 kB against 2 kB warning budgets. No stylesheets or budgets were changed. Dependencies, lockfile, Android configuration and deployment workflows were unchanged. Logs are included in this directory's `stage7/` evidence folder.

## Production browser checks

The actual production bundle was served on loopback, with an unchanged fresh capture of published catalogue **1.3.0: 88 stations, 26 candidate streams**. No local technical catalogue, proposed J1 records or fabricated permission/verification values were used. Real media requests went directly to broadcasters.

- **25 station Play controls**, **63 unavailable indications**, **25 Listen Now results**.
- **73 axe scans, zero violations**: English/Tamil/Sanskrit, light/dark, 375×667, 820×900 and 1440×900; browse, Listen Now, details, active mini-player and terminal error states.
- Details links remain confined to the popup; Escape restores focus, and opening details does not move the station grid. Native card Play invokes audio without navigating.
- Real pause/resume, station switching, retained volume/mute and stop/source cleanup passed, using one shared audio instance.
- In a separately labelled fault-injection scenario, both Sooriyan candidates were deliberately blocked. The engine tried official then legacy once each, displayed Error/Retry, and played the official source after unblocking and Retry. These injected failures are not broadcaster availability findings.
- Inspected the saved desktop dark, mobile light and mobile Tamil dark active-player screenshots. Existing responsive design is preserved, with station thumbnails visible in the 375×667 browse viewport.

## Real stream outcomes

Each station probe used a fresh isolated browser context and its own media/network collector. These are browser decoding/continuity results; no new human station-identification listening check was performed. Earlier human listening confirmations are not re-labelled as Stage 7 proof.

| Station                 | Actual result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sooriyan FM Sri Lanka   | **Played**, official port-2020 source; HTTP 200, `audio/mpeg`, CORS `*`; native `playing`, 20.004 seconds continuity and 320,157 additional decoded bytes. Official source was the sole source loaded in this probe.                                                                                                                                                                                                                                                                                                         |
| Vasantham FM Sri Lanka  | **Played**; HTTP 200, `audio/mpeg`, CORS `*`; native `playing`, 20.004 seconds continuity and 320,156 additional decoded bytes.                                                                                                                                                                                                                                                                                                                                                                                              |
| AIR Nagercoil Kumari FM | **Failed in Chrome**. Original HLS URL returned 302 to CloudFront; redirected request reported `net::ERR_CONNECTION_RESET`, followed by native media error code 4 (`DEMUXER_ERROR_COULD_NOT_PARSE`). No playing event or continuity success. A subsequent WSL curl check received HTTP 200, `application/vnd.apple.mpegurl`, CORS `*`, and a listed segment returned 200 / 311,704 bytes (discarded). This does not resolve the browser failure or prove playable HLS; repeat browser/platform investigation remains needed. |

MP3 requests marked `ERR_ABORTED` during explicit stop/context cleanup are retained in the raw evidence, not interpreted as playback failures. All event collectors are scoped to their relevant station attempt. The multi-station controls trace is stored separately.

Raw evidence: [browser results](stage7/browser-results.json) and [unchanged public metadata capture](stage7/public-catalogue-1.3.0.json). Reproduce with [the Stage 7 driver](../scripts/verify-stage7-playback.cjs) following the configuration guide; set `RADIOBEE_CATALOG_SNAPSHOT=documentation/stage7/public-catalogue-1.3.0.json` to reuse this exact capture. The browser pass marker means the UI/controls assertions passed; it does **not** mean every live source played. Individual `stationProbes[].played` results remain authoritative.

## Outstanding issues

All 26 candidate rights records remain unconfirmed. The relaxed configuration enables attempts, **not broadcaster authorization**; public-use review remains outstanding, including broadcaster-specific restrictions discussed in the configuration guide. J1 is absent from published 1.3.0 and was not tested or added. No claims are made that all 25 eligible stations are currently audible.

AIR's browser HLS failure, physical Android/WebView testing and fresh human identification of the tested station programmes remain outstanding. The two existing CSS warning budgets remain unchanged. The implementation and evidence are ready for code review; public release authorization is a separate unresolved decision.
