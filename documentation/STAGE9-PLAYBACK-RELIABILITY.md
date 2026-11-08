# Stage 9: bounded playback recovery

## Confirmed defect and external factors

Before this change, `PlayerService` stored attempted URLs in a Set. Its limit of three applied to distinct URLs, not three actual attempts. AIR Nagercoil has one candidate; a first failure excluded it for the remainder of that session. Manual Retry reset the Set. The HLS adapter also collapsed fatal failures into a generic error, losing the information required to choose safe automatic retries.

Stage 8 observed intermittent connection resets after the unchanged official AIR URL redirected to CloudFront, alongside successful decoded HLS playback and capture. The client exclusion defect is confirmed by code and deterministic tests. CDN, connection, CORS and decoder failures remain distinct external possibilities; a reset alone does not prove an engine or permanent endpoint defect. Stage 9 does not change broadcaster URLs, add cache-busting parameters, pin CDN redirects, modify catalogue metadata or grant permissions.

## Exact recovery policy

`RECOVERY_POLICY` is the single named budget configuration:

| Limit                                  | Value                              |
| -------------------------------------- | ---------------------------------- |
| Distinct URLs admitted per session     | 3                                  |
| Fresh attempts per admitted URL        | 2                                  |
| Total actual `engine.load()` attempts  | 6                                  |
| Same-URL backoff                       | 500–750 ms, injected random source |
| Startup watchdog                       | 20 seconds                         |
| Rebuffer watchdog                      | 12 seconds                         |
| HLS attachment/manifest initialization | 15 seconds                         |
| Diagnostic history                     | Latest 80 transitions              |

Each selection rechecks the current catalogue and the existing shared eligibility policy. Ranked untried eligible alternatives are preferred, then previously attempted URLs whose latest failure was transient and whose per-URL budget remains. Example: one transiently failing URL gets `A → delay → A → final error`. Three transiently failing URLs get `A → B → C → delay → A → delay → B → delay → C → final error`. An unknown/decoder failure can move to a fresh eligible alternative but never repeats that URL automatically. HTTP permission denials and autoplay rejection terminate without trying alternatives. User cancellation pauses without recovery.

Budgets do not reset when playback starts or rebuffering begins, preventing endless runtime reconnect loops. Manual Retry starts a fresh bounded session; successful ordinary Pause/Resume reuses the retained source. If the paused source was cleared or revoked, explicit Resume begins a fresh selection. Eligibility is checked again before every delayed attempt; removed or restricted candidates are never retried.

## Classification and HLS lifecycle

Native MediaError codes distinguish aborted, network, decode and unsupported errors. DOMException names distinguish autoplay, cancellation, security and unsupported operations. Generic message text is never parsed to guess a transient failure.

HLS download failures preserve whitelisted `type`, `details`, `fatal` and numeric HTTP status only. Manifest/playlist and fragment/key failures are separate. Download status 0, missing status, 408, 429 and 5xx can be transient; 401/403 are permission denials. Other 4xx, parsing failures, unsupported codecs and decoder errors do not repeat the same URL. A status-0 browser failure cannot by itself distinguish CORS from a network reset; the one additional attempt is bounded, not a CORS workaround.

hls.js manifest retries are disabled so fresh manifest recovery belongs to the player. Playlist, segment and key policies have no inner timeout retry and at most one 250 ms error retry for explicit transient responses. Manifest/playlist/key requests have 8-second first-byte/load limits; fragments have 8-second first-byte and 10-second total limits. These limits replace the installed library's longer nested retries. They do not claim to eliminate broadcaster interruptions. See the installed `hls.js` load-policy types and [official API documentation](https://github.com/video-dev/hls.js/blob/master/docs/API.md#loadpolicy), and [native MediaError codes](https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code).

The production engine continues to prefer hls.js/MediaSource where supported, with native HLS on native-only platforms. MP3/AAC remain native. One audio element is retained. Generation checks reject obsolete adapter callbacks; pending initialization rejects on Clear and has a timeout. A fatal callback can signal both a rejected initialization promise and an audio error, but the player's attempt token admits only one recovery. All pending watchdog/backoff work is cancelled on Pause, Stop, station switch, destruction and loss of eligibility. Native pause during rebuffering also cancels recovery. Volume and mute survive replacement.

Manifest parsing and a fulfilled `audio.play()` promise do not mean Playing. Only the current ready, unpaused media element's actual `playing` event sets Playing. Late media/HLS callbacks after cancellation cannot restart it.

## Recording and user interface

Playback boundaries synchronously stop capture before replacing the source. Automatic recovery does not restart recording; the user must request a new recording. A completed draft remains exportable under the existing lifecycle. Recording preparation cannot start a fresh ordinary session over an already scheduled player reconnect. Consent, explicit recording prohibitions, no-microphone architecture, two-minute/eight-MiB limits and Capacitor export remain intact. Production `RadioRecording.Enabled` remains true; this change adds no recording configuration banner, CI gate or warning annotation.

The existing tuner, station-card and mini-player show localized Connecting, Reconnecting, Buffering and Playing states. Final actionable error/Retry appears only after exhaustion or a terminal failure. There are no technical codes or countdowns. Broadcaster links remain confined to Station Details.

Diagnostics are bounded, read-only in-memory history, also emitted as `radiobee-diagnostic` on the existing audio element for opt-in local testing. Rows contain safe catalogue IDs, attempt counts, phase, timestamps, retry decision/delay and sanitized failure categories. No URL, signed query, raw message, audio, private user data, console stream or external telemetry is recorded by the player.

## Validation and reproducibility

The live harness is explicitly opt-in and is not executed by CI. It serves the production artifact on loopback without injecting catalogue metadata, and scopes each fresh-context attempt's actual network/media events separately. Request interception is used only in labelled failure-injection cases; the recovered audio still comes from the unchanged broadcaster URL. No synthetic playing/error events are used as real playback evidence.

WSL2 Linux Node 24.16.0 commands:

```bash
node -e 'if (process.platform !== "linux") process.exit(1)'
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs scripts/recording-config.test.mjs scripts/android-scripts.test.mjs
npm run build:gh -- --configuration=production
node scripts/capture-catalogue.cjs tmp/stage9-catalogue.json
node scripts/verify-stage9-playback.cjs
```

The live harness uses the existing client-local Playwright/axe installations in `tmp/ci-tools` and the existing Windows Chrome CDP bridge in `tmp/browser-bridge-stage7.*` on port 9371. Start an owned Chrome profile with `--headless=new --remote-debugging-port=9371`; do not disable autoplay or certificate checks. `RADIOBEE_STAGE9_CASES` selects comma-separated cases, `RADIOBEE_WEB_ROOT` selects an already-built artifact, and `RADIOBEE_STAGE9_EVIDENCE` selects the evidence folder. A disabled-recording artifact can be checked with `RADIOBEE_RECORDING_EXPECTED=false`; never change production defaults merely to run that check. Network evidence strips query strings and credentials. Successful playback requires real playing events, advancing time and decoded bytes, not just a manifest or UI label. This does not establish broadcaster authorization or constitute a new human listening/identity check.

### Local results, 8 November 2026

All Node commands ran under WSL2 Linux Node 24.16.0, without dependency installation or package changes.

| Check                                             | Result                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                    | Passed                                                                                                          |
| `npm run typecheck`                               | Passed                                                                                                          |
| `npm run test:ci`                                 | 304 passed, 22 files; 48 additional tests over the 256-test baseline                                            |
| Five existing Node regression suites listed above | 21 passed                                                                                                       |
| Production Pages build                            | Passed; existing station-card 2.70 kB and station-browser 3.67 kB stylesheet warnings remain; budgets unchanged |
| Recording-disabled production variant             | Build passed; genuine Sooriyan playback and pause/resume/volume/mute/stop passed; no recording controls         |
| Pages routing                                     | `/radio-bee/` base href; `404.html` identical to `index.html`                                                   |
| Physical Android                                  | No adb available in WSL or the default Windows SDK path; not device-verified                                    |

The regression suites cover transient/permanent structured errors, single/multiple URL budgets, alternative ordering, startup/rebuffer timeout, autoplay/cancellation/restrictions, stale HLS callbacks, initialization timeout and attach exceptions, duplicate error signals, native MP3/AAC/HLS, mute/volume, revocation during backoff, manual Retry, destruction, and recording failure/preparation/draft retention. Existing eight-flag policy combinations, catalogue/localization, Android scripts and PR workflow contracts remain passing. Live probes are not added to normal CI.

### Real production-artifact browser results

Public catalogue **v1.4.0, 24 stations, 26 candidates** loaded directly. Production technical mode stayed off, the RadioApi policy stayed unchanged, and no local catalogue metadata was injected.

| Case                                      | Observed outcome                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AIR cold start 1                          | Both allowed attempts redirected from the official URL and failed at CloudFront with `net::ERR_CONNECTION_RESET`; no decoded audio, final error, no loop            |
| AIR cold start 2                          | MediaSource playing, 7.705 seconds continuity and 65,035 additional decoded bytes                                                                                   |
| AIR cold start 3                          | MediaSource playing, 8.011 seconds continuity and 67,486 additional decoded bytes                                                                                   |
| AIR first-request failure injected        | First manifest request aborted; automatic same-URL attempt 2 reached genuine playing, 7.996 seconds continuity and 67,270 additional decoded bytes; no manual Retry |
| AIR persistent manifest failures injected | Exactly two fresh attempts, then actionable final error; no additional requests during observation                                                                  |
| Stop / Pause during backoff               | Only the initial attempt; cancelled source stays paused with no later recovery                                                                                      |
| Switch during AIR backoff                 | Sooriyan genuinely played; previous AIR recovery cancelled, one audio element retained                                                                              |
| Sooriyan                                  | Native MP3 playing, 8.049 seconds continuity and 128,732 additional decoded bytes; volume 0.35, mute, Pause/Resume and source-clearing Stop passed                  |
| Vasantham                                 | Native MP3 playing, 8.045 seconds continuity and 128,731 additional decoded bytes                                                                                   |

These are separate observations, not a claim that every AIR start succeeds. The client defect is corrected while genuine upstream resets remain possible. The bounded retry successfully recovers the controlled first-play failure; persistent external failure still terminates. The official endpoint was never replaced by its temporary redirect destination.

Evidence is in `stage9/results.json`, `stage9/recovery-ui/results.json`, `stage9/recording/results.json` and `stage9/disabled/results.json`. Every playback case retains its own genuine media events, redirects/responses, failures, decoded-byte deltas and continuity. The initial multi-language pending-UI audit took longer than the 8-second held-manifest deadline and correctly reached final error during its third language assertion. That harness timing failure is retained in the initial report rather than erased. The corrected harness selects language/theme before Play and uses independent contexts: all three reconnecting language assertions then passed, without extending production timeouts.

Across these runs, **33 axe scans reported zero violations**: 23 initial scans, three corrected reconnecting scans, six capture scans and one disabled-recording scan. Coverage includes English/Tamil/Sanskrit, 375 px mobile and 1440 px desktop, Light/Dark/Automatic, active playback, reconnecting and terminal error. Horizontal document overflow and broadcaster links outside Details were also checked. Mobile Light/Dark and reconnecting screenshots were inspected; the mini-player and controls remain within the viewport.

Genuine capture was repeated using the existing `verify-stage8-browser.cjs` with `RADIOBEE_MEDIA_ONLY=1`, `RADIOBEE_RECORDING_LIFECYCLE=1` and `RADIOBEE_STAGE8_EVIDENCE=documentation/stage9/recording`. Sooriyan produced a decoded 7.26-second WebM/Opus draft (117,143 bytes, aggregate RMS 0.228); AIR produced a decoded 7.38-second draft (119,091 bytes, RMS 0.127). Playback advanced after capture. Pause ends capture without recording again on Resume; discard stops tracks/removes the file; injected capture-access denial preserves listening; station switch ends capture; Stop cleanup passes. Downloads were cancelled after verifying export, and no audio recording is committed. Deterministic tests separately verify that a playback failure ends capture before replacement, retains completed drafts and never automatically records the recovered stream. All inspected cases used one audio element and no microphone requests.

## Exact changed files

Application and regression code:

- `src/app/player/playback-failure.ts` — safe structured native/HLS classification.
- `src/app/player/recovery-policy.ts` — named budgets and injectable jitter.
- `src/app/player/player.service.ts` — per-URL attempts, cancellation, watchdog phases and bounded diagnostics.
- `src/app/player/media-engine.ts` — bounded HLS load policies, classified failures and initialization cancellation.
- `src/app/player/player.html` — accurate localized pending phase.
- `src/app/player/recovery.spec.ts` — 41 deterministic recovery/classification cases.
- `src/app/player/media-engine.spec.ts` — adapter initialization/load-policy regressions.
- `src/app/player/hls-player.spec.ts` — real adapter/service duplicate-signal and runtime/init recovery regressions.
- `src/app/player/player.service.spec.ts` — updated bounded buffering-timeout expectation.
- `src/app/player/configurable-player.spec.ts` — updated actual-attempt timeout budget.
- `src/app/recording/recording.service.ts` — prevent capture preparation from replacing scheduled recovery with a new session.
- `src/app/recording/recording.spec.ts` — safe failure/draft retention and capture-preparation budget regressions.
- `src/app/catalog/catalog.ui.ts` — English/Tamil/Sanskrit reconnecting and distinct buffering/timeout messages.
- `src/app/catalog/station-card.ts` — current pending action label.
- `src/app/catalog/station-card.html` — current pending badge label.
- `src/app/home/radio-illustration.html` — current tuner phase.
- `scripts/verify-stage9-playback.cjs` — opt-in live browser/recovery/accessibility harness.
- `documentation/STAGE9-PLAYBACK-RELIABILITY.md` — this report.

Evidence files:

- `documentation/stage9/results.json`
- `documentation/stage9/Light-English.png`
- `documentation/stage9/Light-தமிழ்.png`
- `documentation/stage9/Light-संस्कृतम्.png`
- `documentation/stage9/Dark-English.png`
- `documentation/stage9/Dark-தமிழ்.png`
- `documentation/stage9/Dark-संस्कृतम्.png`
- `documentation/stage9/persistent-error.png`
- `documentation/stage9/reconnecting-English.png`
- `documentation/stage9/reconnecting-தமிழ்.png`
- `documentation/stage9/recovery-ui/results.json`
- `documentation/stage9/recovery-ui/reconnecting-en.png`
- `documentation/stage9/recovery-ui/reconnecting-ta.png`
- `documentation/stage9/recovery-ui/reconnecting-sa.png`
- `documentation/stage9/recording/results.json`
- `documentation/stage9/disabled/results.json`

## Android review and remaining manual checks

No Android application ID, signing, versioning, release workflow or native configuration is changed. The engine selects MediaSource according to real capability support and retains native-HLS compatibility. Browser media pause, cancellation and cleanup are handled; a background audio service or platform audio-focus integration is not introduced. Recording already observes Capacitor app inactivity, pagehide and visibility changes and stops capture; it never automatically restarts in the foreground.

Physical Android verification is still required:

| Scenario                                                  | Expected manual result                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AIR cold Play, network reset then restoration             | At most one same-URL fresh retry, genuine audio or final Retry                             |
| Persistent failure / airplane mode                        | Bounded exhaustion, no continuous request loop                                             |
| Pause/Stop/switch during backoff                          | No later old-station audio; one audio element                                              |
| Background/foreground, screen lock                        | No surprise resumed playback; active recording ends on inactivity                          |
| Call, notification and Bluetooth/audio-route interruption | Verify WebView/OS audio focus and native pause behavior; no untested background guarantees |
| Network change Wi-Fi/mobile                               | Bounded reconnect with retained volume/mute                                                |
| Active capture then source failure/switch                 | Separate completed draft; no mixed or restarted recording                                  |
| MP3/AAC/native HLS and MediaSource WebViews               | Platform-appropriate engine, usable localized statuses/controls                            |

Public-source access, regional/network restrictions and broadcaster permission remain independent of the client recovery policy. Native media APIs expose less failure detail than hls.js. No retry policy can guarantee a live broadcaster remains reachable.
