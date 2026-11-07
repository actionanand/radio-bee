# Stage 7 final HLS and policy review

Date: 7 November 2026. Branch: `feature/7-configurable-radio-playback`.

## Same-browser comparison

The unchanged AIR Nagercoil catalogue URL was tested in Chrome 157.0.8103.38, in fresh contexts in this order: native HLS, hls.js, hls.js, native HLS. Each successful start was followed by a 20-second continuity observation. Neither audio recording nor a CORS proxy was used.

| Path           | Continuity seconds | Additional decoded audio bytes | Result |
| -------------- | -----------------: | -----------------------------: | ------ |
| Native, first  |             20.049 |                        172,864 | Played |
| hls.js, first  |             19.943 |                        171,057 | Played |
| hls.js, second |             19.947 |                        168,563 | Played |
| Native, second |             20.046 |                        168,258 | Played |

Both paths followed the original wavespb 302 to the existing CloudFront URL. Responses included HTTP 200 `application/vnd.apple.mpegurl` playlists and HTTP 200 `video/mp2t` segments with CORS `*`. Each attempt captured five segment responses. hls.js reported no fatal or nonfatal errors; neither path reported a media error. The native traces each retain one `ERR_ABORTED` segment request alongside successful continuity; those aborted requests are not counted as failed station playback.

The earlier Stage 7 connection reset / `DEMUXER_ERROR_COULD_NOT_PARSE` was **not reproduced**. These observations demonstrate working native and MediaSource paths, not proof that native HLS caused that earlier failure or that hls.js prevents network failures. No claim of statistical reliability is made from four short observations.

Raw per-attempt redirects, MIME/CORS responses, network failures, media events and byte/continuity measurements: [comparison JSON](stage7-review/hls-comparison.json).

Manual reproduction, using existing WSL2 Linux Node/dependencies and Chromium or the project's local CDP adapter:

```bash
node -e 'if(process.platform!=="linux")process.exit(1)'
node scripts/compare-hls-engines.cjs
```

Set `RADIOBEE_BROWSER_TOOLS` and, when needed, `RADIOBEE_BROWSER_BRIDGE` as in the [Stage 7 configuration guide](CONFIGURABLE-PLAYBACK.md). The diagnostic serves on loopback port 3074, clicks a real browser control and loads the installed hls.js package. It is excluded from CI and does not alter application configuration.

## Production choice and lifecycle

`MEDIA_ENGINE` now calls `createMediaEngine()` without consulting `LIVE_TEST_ENABLED`. The default prefers supported hls.js/MediaSource, a path confirmed by this comparison and existing technical runs. Native HLS remains available when hls.js reports unsupported, preserving native-only platforms. MP3/AAC stay native. Production technical mode remains disabled.

There is **no new automatic alternate-engine retry** for the same URL. Failures use the existing at-most-three-distinct-URL budget and explicit Retry. No hidden fourth attempt or engine loop was added. This keeps retry and cancellation behavior explicit while native remains a platform capability fallback.

Teardown invalidates and detaches the previous adapter reference before destruction. Repeated fatal callbacks are handled once; fatal, attachment and manifest callbacks from failed or discarded adapters cannot affect a replacement. Tests exercise the actual media adapter together with PlayerService across initialization/runtime failure, queued/loading fallback, Pause, Stop, station switching, pause/resume, one shared audio reference and retained volume/mute.

## Policy review

All three RadioApi defaults remain exactly `true / false / false` in the requested property order. Explicit restrictions and URL/credential/format/capability checks are unchanged. Catalogue values and broadcaster URLs were not rewritten.

The existing decision for `verificationStatus=unavailable` is preserved: relaxed verification allows a fresh attempt and deprioritizes the candidate; strict verification blocks it regardless of AllowUnverified. All eight configurations test this behavior. Authorization is independent of technical availability.

The exported `technicalStreamEligibility` alias previously supplied a hard-coded relaxed preset. It now uses the passed policy or environment defaults, matching the main helper. Tests verify equivalence for every metadata combination under all eight configurations. PlayerService continues using its injected policy directly.

PR CI now runs the existing PR contract, preview and playback-evidence Node suites. These validate deterministic local behavior and stored evidence; no live station probes run in CI. Workflow permissions and publishing behavior are unchanged.

## Validation and remaining limits

Checks ran through WSL2 Linux Node 24.16.0 with the platform verified as `linux`:

| Check                                           | Result                              |
| ----------------------------------------------- | ----------------------------------- |
| Lint                                            | Passed                              |
| Typecheck                                       | Passed                              |
| Full Angular tests                              | **205 passed, 16 files**, no skips  |
| PR/preview/playback-evidence Node tests         | **6 passed**, no skips              |
| Production Pages build                          | Passed; base href `/radio-bee/`     |
| Affected HLS tests after teardown-order cleanup | **8 passed**, one file, clean rerun |

The initial full run passed but printed jsdom teardown warnings from restoring media mocks before Angular destroyed the service. The test now destroys the service first; the eight affected tests were rerun without those warnings. Production code was not changed to accommodate jsdom.

The existing station-card 2.70 kB and station-browser 3.74 kB stylesheet warnings remain. No budgets, stylesheets, dependencies, versions or Android configuration were changed.

## Production browser results

The unmodified production Pages bundle loaded catalogue 1.3.0 with 88 stations and 26 candidates: **25 station Play controls, 63 unavailable indications, 25 Listen Now results**. Technical mode stayed hidden. The full UI matrix passed **73 axe scans with zero violations**, covering English/Tamil/Sanskrit, light/dark, 375×667, 820×900 and 1440×900, including Details, active player and error/Retry states. Website links were confined to Details, popup focus/layout checks passed, and mobile Tamil/light and dark player/desktop screenshots were inspected.

The multi-station controls scenario passed pause/resume, volume/mute preservation, station switching, stop/source cleanup and one audio instance. A separately labelled injected-failure scenario tried both Sooriyan URLs once, showed Error/Retry and recovered on explicit Retry after unblocking. Those deliberately failed requests are not broadcaster availability findings.

Two separately retained production source runs were performed:

| Station       | Initial run with unchanged metadata capture                                                                                                                            | Direct public catalogue retest, without request interception                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sooriyan      | Passed, 20.011 s continuity                                                                                                                                            | **Passed**, 20.003 s; 320,157 additional decoded bytes; native MP3, HTTP 200 `audio/mpeg`, CORS `*`                                                                                            |
| Vasantham     | Started and decoded, then buffered at 14.265 s; advanced only 13.232 s during the observation window, so **failed** continuity threshold; no media error, readyState 2 | **Passed**, 19.999 s; 319,739 additional decoded bytes; native MP3, HTTP 200 `audio/mpeg`, CORS `*`                                                                                            |
| AIR Nagercoil | **Failed** after CloudFront playlist `net::ERR_CONNECTION_RESET`; blob source confirms the hls.js path was selected; no successful decoding                            | **Passed**, 19.949 s; 166,252 additional decoded bytes; **hls.js/MediaSource** blob source, 302 → 200 playlist and five HTTP 200 `video/mp2t` segment responses, CORS `*`, no network failures |

AIR additionally passed production-card/mini-player pause/resume while retaining its blob source, volume 0.4, mute and **one audio element**. The successful retest used the actual public catalogue service, not a local proposal or altered stream metadata. Source URLs, RadioApi settings and engine code were identical between these two runs. HTTP cache/routing behavior and timing differed, so these observations **do not isolate why the first request reset or prove request interception was the cause**. hls.js also encountering a reset is further evidence against assigning the earlier failure solely to native HLS.

The raw reports preserve the earlier failures rather than replacing them:

- [Full UI matrix, initial station probes and separate controls trace](stage7-review/production/browser-results.json)
- [Direct public catalogue retest, per-station network requests/responses and media events](stage7-review/direct-public/browser-results.json)
- [Exact changed files](stage7-review/changed-files.txt), plus validation logs and screenshots in the same evidence directory

`STAGE7_PRODUCTION_BROWSER_PASSED` reports UI/control assertions, not universal live-stream success. Inspect each probe's `played`, events and continuity. A single short success is not an uptime guarantee, and no fresh human station/programme identification was made. MP3 `ERR_ABORTED` records during explicit stop/context cleanup remain visible in the raw data and are not counted as decoding failures.

For a repeatable full UI run, use `scripts/verify-stage7-playback.cjs` with the existing public metadata capture, as documented in the configuration guide. For the separately scoped direct-public source retest:

```bash
RADIOBEE_PUBLIC_CATALOGUE=1 \
RADIOBEE_STATION_PROBES_ONLY=sooriyan-srilanka,vasantham-srilanka,air-nagercoil \
RADIOBEE_BROWSER_REPORT_DIR=documentation/stage7-review/direct-public \
node scripts/verify-stage7-playback.cjs
```

Manual tools use loopback only; no browser autoplay or certificate bypass was enabled. Live-source probes remain excluded from PR CI.

## Outstanding issues

Broadcaster authorization remains unconfirmed; enabling attempts does not establish public-use permission. Network/buffering failures are still possible, as the retained first-run evidence shows. Physical Android/native-only Safari validation, longer live-stream endurance testing and a fresh human station-identification listening check remain outstanding. Native-only selection is covered with controlled unit capabilities, not a physical Safari device.

The code and evidence are ready for PR review. No commits, pushes, merges, deployments, dependency reinstalls, catalogue edits or data-repository changes were made.
