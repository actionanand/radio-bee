# Stage 6: in-app playback and Ionic controls

Work branch: `feature/6-in-app-radio-playback`. Client-only changes; no data checkout edits, dependency installation, deployment, commits or pushes.

## Player and interface

Every station uses the same catalogue-driven card and shared eligibility check. Production playback still requires verified, permitted, valid HTTPS, compatible streams. Cards show stable Play / Connecting / Pause / Retry actions for eligible streams and a localized listening-unavailable label otherwise. There are no station-specific player URLs or approval overrides in the UI. Details are always available.

The card and persistent mini-player use the existing real HTMLAudioElement / native HLS / hls.js engine. Pause/resume reuses the loaded audio element; stop and station changes clean up the previous stream. Volume and mute survive pause/resume and station changes. Catalogue refresh rechecks the selected URL, stream identity and permission; removed/revoked streams stop. Delayed playing events cannot undo pause/stop.

All control icons are genuine Ionicons SVGs imported from `ionicons/icons` and rendered by Ionic `IonIcon`: playback, stop, volume/mute, favorites, search, grouping, details, close and external-link indication. They are decorative for assistive technology; localized text/labels supply their accessible names. No Unicode characters serve as control icons. Station initials are artwork fallbacks, not icon substitutes.

One root Ionic popover presents listener metadata without moving the grid. It has dialog semantics, focus trapping, a labelled close control, outside/Escape dismissal and focus restoration. Mobile content is a bounded bottom sheet; desktop anchors to the information button. Stream/API URLs, source IDs, editorial notes, verification and rights flags are excluded. Optional HTTPS broadcaster websites appear only inside details, never as automatic navigation or a replacement Play action. Website metadata is validated; no station-ID-to-website map remains.

The compact radio tuner uses static decorative green/amber/red segments, not a fabricated audio analyser. Its playing state follows the actual player. Listen now combines eligibility with existing search, favorites and geographic filters. India retains detailed geography; other countries retain Country/Language. English, Tamil and Sanskrit and catalogue 1.2.0 compatibility are preserved. Current catalogue 1.3.0 loads all 88 stations and 26 candidates. Optional `directListening` metadata is typed, validated and retained through loading/caching; explicit restrictions cannot be bypassed, and `allowed` alone cannot grant `rightsStatus`. Recording and redistribution remain separate concerns, not conditions for direct listening in an app that does neither.

## Publication versus technical availability

Direct audio from a broadcaster to a listener's browser is distinct from RadioBee relaying, recording or redistributing media. A publicly reachable endpoint, a successful browser probe or a Radio Browser listing does not itself establish permission for an external app. An official embed may authorize only the broadcaster's supplied player. Unresolved terms are recorded as unresolved, not declared illegal.

The public catalogue advanced to **1.3.0** during this task and has **88 stations, 26 candidate streams across 25 stations, 63 stations without candidates, and zero production-eligible stations**. All 26 candidates have unconfirmed rights and `directListening.status: needs-review`. The complete [station audit](stage6/catalogue-audit.md) and [dated technical evidence](stage6/technical-playback-results.json) distinguish these categories. Earlier 1.2.0 remains covered by compatibility tests.

Real technical checks sustained native MP3/AAC playback for the official Sooriyan endpoint, Vasantham, Luminous Tamil and Shakthi, and hls.js playback for 19 AIR candidates, **23 of 26 streams total**. Each successful probe advanced roughly 20 seconds and passed pause/resume. Coimbatore and Kodaikanal initially reset the connection and passed on retry. Three streams still fail: old Sooriyan port 8006 redirects to HTML and is blocked by ORB; Thoothukudi redirects to a manifest returning HTTP 404; Raagam's HTTP 200 manifest lacks the browser-origin CORS allowance. Full failed attempts are retained. HLS evidence includes manifest and segment status/MIME/CORS in the JSON report. Request aborts after stopping a continuous live stream are expected cleanup, not playback failures.

These successful technical tests do not grant publication permission or independently confirm every on-air programme identity. The prior human listening check confirmed audible Sooriyan, and the user has now confirmed audible J1 HITS in the corrected local review preview. No new on-air announcement identification is claimed. Other identities require human confirmation. Vasantham remains production-disabled with unconfirmed rights.

## Explicitly permitted reference source

[J1 Radio's developer policy](https://www.j1fm.tokyo/j1/developers/) explicitly encourages its listed streams in third-party websites/apps. Its HTTPS J1 HITS and J1 GOLD MP3 sources each sustained real decoded playback in the technical checks. The policy forbids interrupting/inserting stream ads and excludes J1 HD from third-party use; RadioBee inserts no ads and uses no J1 HD or J1-branded app icon. [J1's own history/legal description](https://www.j1fm.tokyo/about-j1-radio/) identifies the Canadian origin of its streams; country metadata is not guessed from the server hostname. These are separate reference additions, not part of the original 88 stations.

The [exact review-only JSON patch](stage6/catalogue-proposal.patch.json) proposes J1 HITS and J1 GOLD plus their network, language, country and provenance records, rebased on published 1.3.0. The original 88 records are unchanged. J1 XTRA's listed endpoint returned HTTP 502 `text/html` on a follow-up HEAD probe and was blocked by Chrome ORB; it is excluded. `verified` is proposed only for sources that actually decoded, advanced and passed pause/resume, with recorded test timestamps. `permission-granted` / `directListening.allowed` for these new references cite the explicit developer policy; recording/redistribution stay unconfirmed. Published data is not changed by this client patch.

The separate data session must review/apply those additions across `stations.json`, `networks.json`, `languages.json`, `locations.json`, `sources.json`, `index.json` counts/countries/version, and `i18n/{en,ta,sa}.json`. The patch paths address the client's aggregate snapshot; map them to those files. `1.3.1` is a local proposed version, not a reserved or published release. Rebase explicitly if the data repository has advanced.

For the original sources, review [Prasar Bharati's terms](https://prasarbharati.gov.in/en/terms-conditions/) and official channel pages; keep direct-app use unresolved until reviewed. Sooriyan's official player establishes endpoint provenance, not a blanket integration grant. Preserve its metadata website `https://www.sooriyanfm.lk/`. Shakthi's legacy `/stream` path needs exact official-player provenance and on-air identification. No third-party Suryan feed is labelled Chennai without proof.

## Radio Browser research

[The provider API documentation](https://docs.radio-browser.info/) requires server discovery/failover, an identifying user agent and click notification when a station is actually selected through that provider. Research queried `all.api.radio-browser.info/json/servers`, then the returned `de1.api.radio-browser.info` mirror using `RadioBee-Stage6-Research/0.0.1`; a bounded Tamil search returned 30 directory leads. Those are discovery leads, not identity certification, rights grants or client runtime dependencies. No provider-selected stream was played, so no fake click was submitted. A future integration must preserve UUID/provenance, resolve official identity/use terms and notify actual selections. No directory URL has been silently added to the published catalogue.

## Local verification and release boundary

Use WSL2 Linux Node 24.16.0 and existing dependencies only. Verify `node -p process.platform` prints `linux` before Node/npm commands.

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build:gh -- --configuration=production
node --test scripts/pr-validation.test.mjs
node scripts/capture-catalogue.cjs
node scripts/prepare-stage6-review.cjs tmp/stage6-catalogue.json tmp/stage6-reviewed.json
RADIOBEE_BROWSER_BRIDGE=tmp/browser-bridge-stage6.cjs node scripts/verify-stage6-ui.cjs
node scripts/serve-web-preview.cjs --port 3065
node scripts/serve-web-preview.cjs --snapshot tmp/stage6-reviewed.json --review-playback --port 3063
```

The optional browser driver uses existing Playwright/axe tools (`RADIOBEE_BROWSER_TOOLS`) and either installed Chromium or an explicitly supplied local CDP bridge. The bridge carries browser-control messages only; it does not relay media or bypass CORS. It serves the unmodified production `www/` artifact and intercepts metadata requests only to select either the published snapshot or the proposed reviewed snapshot. Real broadcaster audio requests are neither mocked nor intercepted. No audio is recorded. The technical lab is absent from production and guarded by non-production plus explicit opt-in plus loopback in development.

The reusable preview server supports `/radio-bee/home` and Angular route fallback. Without `--snapshot` it loads the real public HTTPS catalogue. With an explicit local snapshot it adds a visible LOCAL REVIEW notice and a metadata-only fetch harness; the application's configured HTTPS base and production validation are unchanged. `--review-playback` clears temporary filters and opens Listen now so Canada/Japanese reference stations are not hidden by a prior Sri Lanka/Tamil selection. It never auto-plays or overrides eligibility. The original preview failure was caused by changing the base to HTTP; this is fixed in the harness, not by relaxing the loader.

Production-config playback with the proposed metadata proves the real production player path, **not** that the published 88-station catalogue now has an approved stream. Public availability still requires the separate data publication and normal client review/release. Physical Android/WebView playback and hardware Back require device testing; desktop Chrome and simulated Ionic Back are not substitutes.

Screenshots and final validation counts are recorded in the accompanying validation report. Existing PR-only validation already runs lint, typecheck, all unit tests and the production Pages build without publishing; deployment and Android release workflows are unchanged.
