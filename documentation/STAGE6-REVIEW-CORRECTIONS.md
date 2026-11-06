# Stage 6 final review corrections

Completed 2026-11-07 (Asia/Calcutta), continuing `feature/6-in-app-radio-playback` from reviewed commit `e3699b21a9a2`. Stream evidence uses its original UTC timestamps on 2026-11-06.

**Ready for PR review; not ready for public playback release.** Existing player, tuner, localization, routing, catalogue/cache and India-only geographic filtering are preserved. No data-repository files, dependency versions, Android configuration or workflows were changed. Nothing was committed, pushed, merged or deployed.

## A — Station Details lifecycle

Each presentation now owns an immutable token and captured button anchor. Different selections are queued while the departing Ionic instance finishes; the latest request wins. The successor gets a fresh overlay instance, so its position is recalculated against the correct button. Late lifecycle callbacks check their originating token and cannot clear or close the successor.

Closing before first presentation still completes a real lifecycle rather than leaving a stuck queue. A close/reopen request during dismissal is retained. A nested icon click anchors to the button instead of the SVG child; the captured target remains valid after the event handler returns.

Real-browser stress testing exposed an additional Ionic timing issue: `didDismiss` fires before focus-trap teardown. Finalizing in a guarded microtask lets Ionic remove the departing trap before promoting the next session or restoring focus. This prevents the old trap from taking focus back. Focus returns to the final station's button, or search if that card was removed.

Nine focused lifecycle unit tests cover rapid A→B→C, stale callbacks, immediate same-station reopening, pre-presentation closing, dismissal/teardown interleaving, external dismissal and removed-trigger focus fallback. Browser checks exercise real animation timing, compact mobile and anchored desktop popups, close/outside/Escape/simulated Ionic Back, correct positioning, one overlay, no grid movement and restored focus in English/Tamil/Sanskrit and both themes. Physical Android hardware Back remains a device check.

## B — Local preview binding

`scripts/serve-web-preview.cjs` binds **127.0.0.1 by default**. `--allow-external` explicitly selects all interfaces and prints a warning about exposing the development preview and any injected review metadata. Three real-process tests verify default isolation from a non-loopback interface, explicit external access/warning, and separate metadata injection.

The production HTTPS catalogue base and validation are unchanged. Local snapshot injection remains a visibly labelled review harness; it does not grant stream rights or enable the technical lab in a public build. Preview routing still supports `/radio-bee/home` and Angular fallback.

## C — Corrected technical evidence

The previous media-event array lived for the lifetime of a reused page/audio element. It accumulated earlier stations' events. Its network callbacks also referred to a mutable current-result pointer after asynchronous work. The earlier arrays are superseded, not reused as proof.

The committed `scripts/verify-technical-playback.cjs` now creates a **fresh context, page and audio instance for every attempt**. Each attempt has a unique ID, event phases and independent network/console collectors. Response callbacks capture the specific result before awaiting headers. Bytes are measured as a before/after delta; current-time continuity, real playing events, pause/resume clock advancement and stop cleanup remain separate checks. One failed attempt is retried once in another fresh context; both outcomes are retained. No generated audio, player mocks, rights edits, audio recording or media proxy is used.

The fresh result is **17/26 successful streams, 9 failed**, rather than 23/26. The six newly failed candidates are Tirunelveli, Karaikal, Kochi, Thrissur, Kannur and Devikulam. Both browser attempts failed for each; none were promoted from historical success. Supplemental HEAD requests find their redirected manifests returning HTTP 404 HTML without CORS headers. The same applies to the previously failing Thoothukudi candidate. These are endpoint observations at the recorded time, not permanent declarations that the stations have no online service.

Other failures:

- Legacy Sooriyan port 8006: browser requests redirect to an HTML page and fail ORB. A utility-user-agent HEAD response advertises MP3, but a HEAD using the same audit-browser user agent redirects to the HTML page, explaining the difference. Neither HEAD result changes the failed browser outcome. The separate official port-2020 candidate plays.
- Raagam: the HLS manifest returns HTTP 200 but lacks the required origin allowance. Chrome explicitly reports a CORS policy block. A native-HLS platform may differ; this report describes the tested Chrome/hls.js path.

All **88 station records** remain in the [regenerated audit](stage6/catalogue-audit.md). There are 25 candidate-station records, 26 candidates, 63 records without candidates and **zero production-eligible stations**: all 26 still need use review. Human on-air identity verification remains distinct from technical playback. The [raw report](stage6/technical-playback-results.json) includes 35 isolated attempts, responses/redirects/MIME/CORS, decoded bytes, continuity, media errors, pause/resume/stop, supplemental HEAD diagnostics and the comparison with the old count. A HEAD request never promotes a failed playback probe.

Two Node evidence/policy regression tests verify complete unique attribution, event time/source boundaries, actual-success counts, cleanup, URL-free player errors and J1 review-only metadata.

## D — J1 policy and listener links

The earlier developer-page-only Web permission conclusion is withdrawn. The [developer page](https://www.j1fm.tokyo/j1/developers/) encourages integration; the [FAQ](https://www.j1fm.tokyo/faq/) separately prohibits directly linking website audio and gives conditional mobile-app permission. An external HTMLAudio player on GitHub Pages cannot safely be assumed exempt. Android needs a separate final-app review against the mobile conditions; this shared catalogue cannot encode an Android-only grant by setting a global flag.

Both client-local proposed J1 records now use `rightsStatus: unconfirmed` and `directListening.status: needs-review`. Their listener-facing `website` is the official J1 homepage. Developer-policy and FAQ evidence remain in source metadata. Historic audible playback is retained as a fact, not publication approval. No further J1 audio was used in this correction's browser playback checks.

See [the joint policy interpretation and prepared clarification question](J1-PUBLICATION-REVIEW.md). No external inquiry was sent, and no data was modified or published. Written Web clarification and a subsequent data-side review/publication remain release blockers.

## Universal website placement

Official broadcaster links exist **only inside Station Details**, including J1, Sooriyan, Vasantham, Akashvani and future metadata entries. Cards, hero, filters, mini-player and player error messages contain no broadcaster links. Non-ready cards show only the compact localized unavailable indication; eligible Play invokes the existing in-app player and never navigates. Details expose only the optional validated HTTPS website and listener metadata. Legacy unused external-listening CTA translations were removed.

Three localized unit scenarios exercise all the named station shapes plus a future record, and the existing 24 eligibility/card scenarios still pass. Browser scans assert the link boundary throughout; 24 dedicated J1 Details checks verify the official homepage link while Play stays absent. Actual playback switching additionally asserts the page URL remains unchanged.

## Final verification

| Check                               | Result                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment                         | WSL2 Linux, Node 24.16.0; platform verified before Node/npm commands; existing dependencies only                                                                                            |
| Lint / TypeScript                   | Both passed                                                                                                                                                                                 |
| Angular tests                       | **135 passed in 12 files**, no skips                                                                                                                                                        |
| Script/workflow tests               | **6 passed**: PR workflow guard, 3 preview checks, 2 evidence/policy checks                                                                                                                 |
| Production Pages build              | Passed; base href remains `/radio-bee/`                                                                                                                                                     |
| Browser accessibility               | **110 axe scans, zero violations**: 90 production/review-only UI, 20 explicitly local technical-player states                                                                               |
| Browser dimensions/themes/languages | 375×667, 820×900, 1440×900; light/dark; English/Tamil/Sanskrit                                                                                                                              |
| Real player controls                | Sooriyan official → Vasantham → Sooriyan, pause/resume, mute/unmute, volume preservation, stop/cleanup, search/filter and Details during playback passed; one audio instance; no navigation |
| Production policy                   | Published 88-station catalogue has no Play controls; J1 review-only proposal also has none; public technical lab is disabled                                                                |
| Stylesheet warning investigation    | Card **2.85→2.70 kB**; browser **3.84→3.74 kB** through duplicate/dead-rule removal; two warnings remain, below existing 4 kB errors; budgets unchanged                                     |
| Diff hygiene                        | `git diff --check` passed                                                                                                                                                                   |

[Unit output](stage6/review-unit-test-results.txt), [script output](stage6/review-script-test-results.txt), [browser results](stage6/browser-validation-results.json), and [exact correction file list](stage6/review-changed-files.txt).

The real-player browser checks deliberately use the guarded **local technical build** with the original unconfirmed broadcaster candidates. They do not claim that production rights were granted. Approved production-card actions remain covered by controlled unit scenarios; a public, authorized real-stream release still requires source approval. Physical Android/WebView playback and native audio focus remain untested here.

Screenshots were inspected for mobile/desktop Details, J1 review-only links, Tamil dark-mode playback and the compact tuner/grid. New examples: [mobile J1 Details](screenshots/stage6-review-j1-hits-details-375-light-en.png), [desktop Tamil J1 Details](screenshots/stage6-review-j1-gold-details-1440-dark-ta.png), [local technical player](screenshots/stage6-player-375-dark-ta.png). Older J1 Play/Pause screenshots are historical technical exercises, not current publication permission or current UI availability.

## Reproduction

Use Linux Node 24 and already available browser tools. No installs are needed for the standard checks:

```bash
test "$(node -p process.platform)" = linux
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs
npm run build:gh -- --configuration=production
node scripts/capture-catalogue.cjs
node scripts/prepare-stage6-review.cjs
```

Browser tools default to the existing `tmp/ci-tools/node_modules`; set `RADIOBEE_BROWSER_TOOLS` to another existing Playwright/axe installation. The drivers can launch an existing Chromium or accept `RADIOBEE_BROWSER_BRIDGE` with the same local `attach(chromium)` adapter used in this workspace. The adapter carries browser-control messages, never audio. Run these serially or use distinct browsers and `RADIOBEE_UI_PORT` values:

```bash
RADIOBEE_UI_REPORT=tmp/production-ui.json node scripts/verify-stage6-ui.cjs
npm run build:gh -- --configuration=live-test --output-path=tmp/stage6-live-corrected
node scripts/verify-technical-playback.cjs
node scripts/diagnose-playback-failures.cjs
node scripts/render-playback-audit.cjs
node --test scripts/playback-evidence.test.cjs
RADIOBEE_TECHNICAL_PLAYER=1 RADIOBEE_WEB_ROOT=tmp/stage6-live-corrected/browser \
  RADIOBEE_UI_REPORT=tmp/technical-ui.json node scripts/verify-stage6-ui.cjs
```

The technical report can change as live endpoints change; tests validate the new evidence and derived count rather than asserting a fixed number of successes. The public catalogue was 1.3.0 throughout this run; future versions need explicit proposal rebasing. Public release remains blocked on authorization/source work, not on these completed client corrections.
