# Stage 8 validation

Branch: `feature/8-radio-ux-recording-themes`, created from freshly fetched master `b1fd194`. No commit, push, merge or deployment was performed. The adjacent data checkout was not edited.

## Production recording is permitted by configuration

All three environments finish with `RadioRecording: { Enabled: true }`. RadioApi remains exactly `true / false / false` in the requested property order. Production recording is **not a failing CI gate**. PR and Pages workflows print only this ordinary log line:

```text
RadioBee production recording: ENABLED — capture still requires user action and stream recording-policy checks.
```

Neither boolean value is rejected by the configuration tests. There is no GitHub warning annotation, configuration banner in the app, automatic flag flip or publishing-policy change. Explicit per-stream recording prohibitions still block capture; missing/unconfirmed permission requires acknowledgment. Enabling the feature does not fabricate broadcaster authorization.

## Implementation delivered

- Internet-only station cards and dynamic counts; descriptive FM information remains in Details, and the hero has no physical-frequency scale. Existing favorites survive missing IDs. No programme merging based solely on network or invented alias contract.
- Available location, network, language, genre and FM-origin metadata displayed independently of listing review status. Websites remain confined to Details. Existing popup lifecycle/focus logic is preserved.
- Independently configured deferred recording UI, real output-only capture, audio-only HLS tracks, bounded CORS preparation for native streams, elapsed status, Stop/Discard/export and robust cancellation. Maximum 2 minutes / 8 MB, one draft. No microphone, capture proxy, automatic upload or background duplicate player.
- Persisted Automatic/Light/Dark themes with early cached initialization, OS tracking, Ionic class palette and supported native status-bar integration.
- Compact Ionic dropdowns with named, localized dialogs, keyboard handling and corrected visual-list semantics. Real Ionicons are used. India-only detailed geography remains intact.
- Existing station → network → default artwork fallback and validated path rules retained.

Details and reproduction notes: [implementation guide](STAGE8-UX-RECORDING.md). [Exact changed files](stage8/changed-files.txt).

## Local checks

All Node/npm commands used WSL2 Linux Node 24.16.0 with `process.platform` checked as `linux`. Dependencies were not reinstalled, and package versions/lockfile were not changed.

| Check                                                  | Result                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Lint                                                   | Passed                                                                              |
| TypeScript                                             | Passed                                                                              |
| Complete Angular suite                                 | **256 passed, 21 files**, no skips                                                  |
| Existing Node/script suites plus recording-config test | **21 passed**, no skips                                                             |
| Production Pages build, Enabled=true                   | Passed, `/radio-bee/` base href                                                     |
| Separate production build, Enabled=false               | Passed; exact source restored in finally, final production output rebuilt with true |
| Workflow routing fallback                              | Final index/404 copied and compared locally                                         |
| Diff whitespace check                                  | Passed                                                                              |

The Node run exposed an obsolete Android-script test assertion requiring `deploy_branch: gh-pages`. Its Web isolation assertions now require the already-existing official Pages artifact/deployment actions; Android workflow, signing, application ID and versioning were unchanged.

Two existing stylesheet warnings remain, without raising budgets: station-card **2.70 kB**, station-browser **3.67 kB** (down from 3.74 kB). Recording introduces no additional component budget warning.

## Browser and accessibility

Chrome **157.0.8103.38**, real media engine, no autoplay/certificate/CORS bypass flags. Sources were fetched directly by the browser; no local technical catalogue or synthetic audio was substituted.

**79 final axe scans, zero violations**:

- Final enabled run: **76**, covering browse, opened selectors and Details at 375×667, 820×900 and 1440×900, English/Tamil/Sanskrit, light/dark; expanded recording consent in the same matrix; real recording/export and lifecycle/error states.
- Keyboard-only selector run: **1**, using focus, Enter and ArrowDown/Enter to select Light.
- Final disabled build: **2**, while actual Sooriyan and AIR playback advanced.

Explicit theme modes overrode the opposite OS setting; Automatic followed OS changes, and reload preserved selection. Dropdown Escape/focus restoration, localized popup lang attributes, unchanged card position on Details opening and website-link boundaries passed. Mobile Tamil, mobile Sanskrit recording consent, and desktop screenshots were inspected. Header selectors were kept on a compact row to retain radio-first spacing.

Enabled=false rendered **no recording component/UI**, created **zero MediaRecorder instances**, and requested **zero microphone access** while MP3 and HLS playback continued. Enabled=true also requested zero microphone access and retained one shared audio element.

The installed Ionic popover originally exposed aria-modal without a dialog role and a list containing a radio group instead of listitems. Public htmlAttributes plus a scoped visual-list role correction resolved the actual accessibility failures; axe rules were not excluded.

## Real playback and captured audio

These are actual browser decoding/capture observations, not a new human station-identification listening check. Stream rights stayed unconfirmed. Each experimental capture was started through the UI after acknowledgment. Exported Blob data was decoded in the browser and every audio channel measured; no radio recording is checked into this repository or uploaded by the test.

| Station                   | Actual evidence                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sooriyan FM Sri Lanka     | Final full run: native MP3 played; **6.60 s WebM/Opus**, **106,517 bytes**, 48 kHz, stereo channel RMS **0.2183 / 0.2019**, aggregate **0.2103**. One audio track was recorded. Playback continued after export.                                                                                                                                                                             |
| Akashvani / AIR Nagercoil | Dedicated production probe: hls.js/MediaSource played and produced **9.06 s WebM/Opus**, **146,155 bytes**, 48 kHz; channel RMS **0.000029 / 0.11959**, aggregate **0.08456**. Audio is primarily on the right channel, so the earlier first-channel-only check was insufficient. The strict audible-signal threshold was retained.                                                          |
| AIR, intermittent failure | In the final full UI run, the original URL returned 302 to `d3hrxqn1tritdh.cloudfront.net`; the redirected playlist failed with **net::ERR_CONNECTION_RESET**, so that attempt did not play or record. It is retained as a failure, separate from the successful capture probe. The later final disabled build played AIR for **7.93 s** continuity. This is not proof of guaranteed uptime. |

The initial capture investigation found opaque native cross-origin playback and video tracks exposed by HLS containers. Native recording now checks allowed CORS access and reuses the player for a controlled restart; HLS capture excludes video. No broadcaster URL, rights value or verification value was changed to obtain success. A codec-noise-only input and silence are rejected in regression tests; file bytes alone do not establish success.

Real UI lifecycle checks passed: Pause ended capture, Resume did not restart recording, Discard stopped tracks and removed the draft, switching to another station ended the old capture, and Player Stop cleaned up. Deliberately blocking only the recording access check produced a friendly recording error while real playback continued; this injected case is **not** a broadcaster availability finding. The capture tracks ended and MediaRecorder became inactive, with one audio element retained.

Evidence:

- [Final UI, consent matrix, Sooriyan capture and lifecycle](stage8/final-browser/results.json)
- [AIR all-channel capture proof](stage8/air-channels/results.json)
- [Final recording-disabled build](stage8/final-disabled/results.json)
- [Keyboard-only check](stage8/keyboard/results.json)

## Catalogue compatibility and remaining limits

Public catalogue changed during this task from **1.3.0 (88 records, 25 candidate-bearing stations)** to **1.4.0 (24 records, 24 candidate-bearing stations)**; both had 26 stream candidates. The client loaded the new count without code changes. The old count assumption belonged to a diagnostic capture, not production logic. The [1.3 compatibility run](stage8/compatibility-1.3.0.json), existing 1.2/1.3 unit fixtures, and [unchanged 1.4 public capture](stage8/catalogue-1.4.0.json) preserve the distinction.

Both inspected publications contained **zero station/network logoPath entries**, so new public PNG/WebP assets could not be verified through the catalogue. Existing path/fallback/refresh regression tests passed; final validation of newly published broadcaster artwork remains pending that metadata.

| Recording platform/format                                      | Verified status                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Chrome, native MP3 with permitted CORS preparation → WebM/Opus | Real capture/export decoded and measured                                                                                   |
| Chrome, HLS MediaSource audio-only → WebM/Opus                 | Real capture/export decoded and measured; endpoint availability intermittent                                               |
| Ogg/Opus and MP4/M4A                                           | Runtime MIME detection implemented; no claim of real output verification in this Chrome run                                |
| Native capture without CORS access / unsupported APIs          | Friendly error; denied-access playback preservation tested                                                                 |
| Android/WebView Filesystem/Share and system bars               | Implemented using existing plugins; **not device verified**. No adb found in WSL, PATH or the default Windows SDK location |
| Safari/native-only HLS capture                                 | Not physically verified; unsupported capture leaves playback available                                                     |

Public-use authorization, longer endurance tests, native device export/system-bar/Back testing and newly published artwork remain follow-up work. Those limitations do **not** impose an automatic production recording flag gate. Both configuration values remain supported.

## Reproduction

Use existing WSL2 dependencies:

```bash
node -e 'if (process.platform !== "linux") process.exit(1)'
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs scripts/recording-config.test.mjs scripts/android-scripts.test.mjs
npm run build:gh -- --configuration=production
npm run copy-error-page
cmp www/index.html www/404.html
node scripts/report-recording-config.mjs
node scripts/capture-catalogue.cjs tmp/stage8-catalogue.json
RADIOBEE_RECORDING_UI_MATRIX=1 RADIOBEE_RECORDING_LIFECYCLE=1 node scripts/verify-stage8-browser.cjs
```

The manual driver uses existing Playwright/axe from `tmp/ci-tools/node_modules` and the project's CDP adapter, or `RADIOBEE_BROWSER_BRIDGE`. It binds its preview to loopback port 3081. Options support a separate output folder (`RADIOBEE_STAGE8_EVIDENCE`), media-only probes, station IDs, keyboard-only checks and an independently built disabled web root. Live probes are excluded from normal PR CI. Media source outcomes must be read separately from the completed UI audit count.
