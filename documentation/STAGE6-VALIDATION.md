# Stage 6 validation — 2026-11-06 (historical run)

> Superseded by [final review corrections](STAGE6-REVIEW-CORRECTIONS.md). The J1 Web-permission conclusion below is withdrawn; see [the joint developer/FAQ review](J1-PUBLICATION-REVIEW.md). Historic 23/26 event arrays had attribution contamination and have been replaced by fresh, per-attempt evidence. Current results and counts belong to the corrections report.

Branch: `feature/6-in-app-radio-playback`. Implementation is ready for client review, but **Stage 6 public-release acceptance remains unmet**: the public 1.3.0 catalogue has zero production-eligible stations. No deployment or data publication was performed.

## Results

| Check                  | Exact result                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Environment            | WSL2 Linux; Node 24.16.0, npm 11.13.0; platform checked before Node/npm commands                                               |
| Lint                   | Passed, all files                                                                                                              |
| TypeScript             | Passed, `npm run typecheck`                                                                                                    |
| Complete unit suite    | **123 passed, 11 files**, no skipped tests                                                                                     |
| PR workflow regression | **1 passed**, read-only PR validation with lint/typecheck/tests/production build and no publishing                             |
| Production Pages build | Passed, `npm run build:gh -- --configuration=production`                                                                       |
| Pages base             | `www/index.html` contains `/radio-bee/`                                                                                        |
| Stylesheet budgets     | Unchanged; two warnings: station-card 2.85 kB and station-browser 3.84 kB against 2 kB warning / 4 kB error thresholds         |
| Browser accessibility  | **74 axe scans, zero violations**                                                                                              |
| Browser matrix         | 375×667, 820×900, 1440×900; light/dark; English/Tamil/Sanskrit                                                                 |
| Screenshots            | **58** generated; mobile/desktop hero, grid, Play/Pause, real player, details and non-English/theme samples visually inspected |
| Current catalogue      | 1.3.0: **88 stations, 26 candidates**; optional directListening metadata retained and validated                                |
| Older catalogue/cache  | 1.2.0 supported; current metadata survives offline cache serialization/restore                                                 |
| Diff hygiene           | `git diff --check` passed                                                                                                      |

The optional browser report is [browser-validation-results.json](stage6/browser-validation-results.json). The earlier 1.2.0 production-build matrix is retained separately for compatibility evidence. Browser checks use the genuine audio engine and real stream requests, not mocked player state or generated audio.

## Actual playback and authorization

| Scope                                  | Result                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published 1.3.0 candidates             | **23/26 streams** sustained decoded real playback for roughly 20 seconds and passed pause/resume                                                                                                                   |
| Candidate station records              | **25**; Sooriyan has two alternatives                                                                                                                                                                              |
| Failed published streams               | **3**: legacy Sooriyan HTML redirect/ORB; Thoothukudi redirected manifest HTTP 404; Raagam HLS manifest CORS denial confirmed by Chrome console                                                                    |
| Transient first failures               | Coimbatore/Kodaikanal connection resets; both passed a real browser retry; initial evidence retained                                                                                                               |
| Streams awaiting use review            | **26**, including the technically playable streams                                                                                                                                                                 |
| Published production-eligible stations | **0** — rights unconfirmed and directListening needs-review                                                                                                                                                        |
| Stations without stream candidates     | **63**; no claim that no online service exists elsewhere                                                                                                                                                           |
| Confirmed station identity mismatches  | **0**; unconfirmed on-air identity is not counted as a match                                                                                                                                                       |
| Historical technical references        | J1 HITS and J1 GOLD: actual direct MP3 playback, explicit third-party-app policy; proposed metadata only                                                                                                           |
| Human listening                        | User explicitly confirmed **audible J1 HITS audio** in the corrected local review preview; prior session also confirmed audible Sooriyan technical playback. No new on-air announcement identification was claimed |

The [complete 88-record audit](stage6/catalogue-audit.md) provides source availability, identity confidence, browser result, policy status and next data work for every record. [Raw technical evidence](stage6/technical-playback-results.json) includes redirects, final audio URL, MIME/CORS, playing/buffering/error events, decoded bytes, HLS manifest/segment access, continuity and retries. Audio was not recorded or relayed.

## Production configuration proof

The browser suite served the normal production `www/` bundle, with the technical lab disabled. One scenario loaded the unmodified published 1.3.0 snapshot; another substituted only the explicitly reviewed, **unpublished** J1 metadata proposal. The actual playback engine, stream URLs, network responses and browser media implementation were real.

Both themes sustained J1 HITS playback for approximately 20 seconds. Card Pause/Play and mini-player Pause/Play stayed synchronized. Switching J1 HITS → J1 GOLD → J1 HITS reused one audio element and preserved volume. Mute/unmute, stop and cleanup passed. Search/filter changes and details opening during actual playback did not interrupt the stream or navigate away.

This historical exercise tested the engine path, but J1 website permission is unresolved and must not be inferred from it. It **does not** make the current public app playable: the separate data session must review/publish an authorized stream, followed by the normal client review/release. The [review-only RFC 6902 proposal](stage6/catalogue-proposal.patch.json) proposes two review-only sources with unconfirmed rights and changes none of the original 88 station records. It is rebased on 1.3.0; its proposed 1.3.1 label is not reserved or published.

## Interface checks

- Real Ionic `IonIcon` SVGs render for all icon controls; no Unicode icon substitutes remain. Decorative SVGs are hidden from assistive technology and controls have localized accessible names.
- First thumbnails start at approximately **497px English, 513px Tamil, 502px Sanskrit** within the 375×667 initial viewport, in both themes.
- Card controls keep their geometry while switching state; details popovers do not shift the grid. One root overlay is rendered, with listener-only fields and an optional validated broadcaster website.
- Overlay close button, outside click, Escape and simulated Ionic Back dismiss correctly and restore trigger focus. Axe checks include open details, Favorites and active player states in all themes/languages.
- Existing India-only hierarchy, other-country Country/Language filters, search, network grouping, favorites and artwork fallback remain covered. Listen now combines the existing filters with stream eligibility.
- Explicit directListening restrictions block playback, including technical probes. `allowed` cannot override unconfirmed rights. Recording/redistribution flags remain separate from direct listening.

Physical Android/WebView playback, native audio focus and hardware Back still require device testing. The browser Back simulation verifies Ionic's overlay handling, not a physical Android device. Automatic programme/language identity classification is not implemented; human identification remains necessary for catalogue review.

## Local previews

The reusable `scripts/serve-web-preview.cjs` correctly serves `/radio-bee/home` with Angular route fallback. It leaves the production HTTPS catalogue base and validation unchanged. The HTTP-base experiment that caused the initial preview error was removed.

```bash
# Real public 1.3.0 catalogue (currently no authorized Play controls).
node scripts/serve-web-preview.cjs --port 3065

# Clearly labelled proposed metadata, real direct audio; opens approved review stations.
node scripts/capture-catalogue.cjs
node scripts/prepare-stage6-review.cjs tmp/stage6-catalogue.json tmp/stage6-reviewed.json
node scripts/serve-web-preview.cjs --snapshot tmp/stage6-reviewed.json --review-playback --port 3063
```

The review server uses a metadata-only local harness and visible LOCAL REVIEW notice. It clears temporary filters on startup so a Sri Lanka/Tamil selection cannot hide the Canadian/Japanese reference stations. It does not auto-play, grant permissions, alter the production bundle or proxy audio. The corrected preview was browser-verified to show two real Play controls, and the user confirmed audible playback.

## Changed files and screenshots

The exact file list, including all screenshot filenames, is [stage6/changed-files.txt](stage6/changed-files.txt). Main implementation groups:

- Shared Ionicons: `src/app/shared/radio-icons.ts`.
- Player/card/discovery: `src/app/player/player.service.ts`, player template/component/styles/tests; station-card/browser templates/components/styles; discovery and localized UI strings.
- Root details overlay: app root wiring, new station-details service/component/content and metadata-only website validator; removed the obsolete hardcoded broadcaster-page map.
- Catalogue compatibility: models/validation, stream eligibility and regression tests; published 1.3.0 test-only fixture. Runtime catalogue URLs are unchanged.
- Compact tuner: home templates/styles and radio-illustration component.
- Generic controlled technical lab: removed station-specific stream leads and uses loaded metadata only.
- Reproducible local review/browser tools and documentation under `scripts/` and `documentation/`.

Selected screenshots:

| View                         | Artifact                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| Desktop tuner/grid           | [Light English](screenshots/stage6-browse-1440-light-en.png) |
| Mobile tuner/grid            | [Light Tamil](screenshots/stage6-browse-375-light-ta.png)    |
| Real card Play               | [Light](screenshots/stage6-card-play-light.png)              |
| Real card Pause              | [Dark](screenshots/stage6-card-pause-dark.png)               |
| Active mini-player           | [Dark Tamil](screenshots/stage6-player-375-dark-ta.png)      |
| Mobile details while playing | [Light English](screenshots/stage6-details-375-light-en.png) |
| Desktop details              | [Dark Sanskrit](screenshots/stage6-details-1440-dark-sa.png) |

No dependency versions/lockfiles, Android signing/version/application ID, deployment workflows or adjacent data-repository files were changed. Nothing was staged, committed, pushed, merged or deployed.
