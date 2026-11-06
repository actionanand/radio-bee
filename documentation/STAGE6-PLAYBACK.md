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

The corrected fresh-context technical run sustained native MP3/AAC playback for the official Sooriyan endpoint, Vasantham, Luminous Tamil and Shakthi, and hls.js playback for 13 AIR candidates: **17 of 26 streams total**, with 9 failures. The earlier 23/26 report's cumulative media-event arrays are superseded. Six previously successful candidates now fail: Tirunelveli, Karaikal, Kochi, Thrissur, Kannur and Devikulam; their redirected manifests return HTTP 404 in supplemental HEAD checks, as does Thoothukudi. Legacy Sooriyan returns a browser-facing HTML page/ORB failure, while Raagam's HTTP 200 HLS manifest lacks the required CORS allowance. Each successful fresh probe advanced roughly 20 seconds, increased decoded bytes and passed pause/resume. Full isolated attempts, network evidence and count comparison are retained. See [final review corrections](STAGE6-REVIEW-CORRECTIONS.md). Stop-induced request aborts are expected cleanup, not playback failures.

These successful technical tests do not grant publication permission or independently confirm every on-air programme identity. The prior human listening check confirmed audible Sooriyan, and the user has now confirmed audible J1 HITS in the corrected local review preview. No new on-air announcement identification is claimed. Other identities require human confirmation. Vasantham remains production-disabled with unconfirmed rights.

## J1 review-only reference proposal

The earlier developer-page-only permission conclusion is withdrawn. J1's developer page broadly encourages integration, but its FAQ separately prohibits direct website audio linking and permits conditional mobile-app integration. The GitHub Pages case is unresolved; Android must be reviewed against the final app conditions. See [the complete policy review and clarification draft](J1-PUBLICATION-REVIEW.md).

The client-local proposal now keeps both J1 HITS/GOLD `rightsStatus: unconfirmed` and `directListening.status: needs-review`. Both listener-facing websites point to the official J1 homepage. The developer policy, FAQ and origin evidence stay in source metadata. Previously observed technical playback and human audibility do not confer publication permission. No further J1 Web audio probes are used in the correction run.

The separate data session may review the exact patch, rebased on 1.3.0, but must not publish it as an approved Web source without clarification. No original 88-station record was changed. Proposed version 1.3.1 is neither reserved nor published. Current Web production eligibility remains zero.
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

The optional browser driver uses existing Playwright/axe tools (`RADIOBEE_BROWSER_TOOLS`) and either installed Chromium or an explicitly supplied local CDP bridge. The bridge carries browser-control messages only; it does not relay media or bypass CORS. It serves the unmodified production `www/` artifact and intercepts metadata requests only to select the published snapshot. Real broadcaster audio requests are neither mocked nor intercepted. No audio is recorded. The technical lab is absent from production and guarded by non-production plus explicit opt-in plus loopback in development.

The reusable preview server supports `/radio-bee/home` and Angular route fallback. Without `--snapshot` it loads the real public HTTPS catalogue. With an explicit local snapshot it adds a visible LOCAL REVIEW notice and a metadata-only fetch harness; the application's configured HTTPS base and production validation are unchanged. `--review-playback` clears temporary filters and opens Listen now without changing eligibility; the J1 review-only proposal now intentionally has no production Play controls. It never auto-plays or overrides eligibility. The original preview failure was caused by changing the base to HTTP; this is fixed in the harness, not by relaxing the loader.

The earlier J1 production-player exercise is historical technical evidence only; its Web-permission conclusion is withdrawn. Current browser checks do not grant J1 production rights. Public availability still requires the separate data publication and normal client review/release. Physical Android/WebView playback and hardware Back require device testing; desktop Chrome and simulated Ionic Back are not substitutes.

Screenshots and final validation counts are recorded in the accompanying validation report. Existing PR-only validation already runs lint, typecheck, all unit tests and the production Pages build without publishing; deployment and Android release workflows are unchanged.
