# V2 recording lifecycle investigation — 2026-11-17

Branch: `fix/real-radio-audio-capture`, base `2f32bc8`. Existing uncommitted access-check/browser-test work was preserved. No catalogue, player engine, recovery policy, environment limits or Android destination code was changed.

## Reproduced cause

Real Windows Chrome 157.0.8103.79, Playwright, actual development app at http://localhost:3042, public V2 catalogue, Sooriyan FM Sri Lanka. No generated audio or mocked recording service.

Before the fix, at **2026-11-17T06:45:22.128Z**, clicking Settings caused `RecordingService.stop()` from its unconditional `NavigationStart` subscription. The recorder had run for **3 seconds**; the resulting draft was **50,425 bytes**, while PlayerService was still `playing`. This was not the one-hour / 80-MB boundary, silence detector or a media-track error. The independent unconditional hidden-document handler could also end a web recording; it was not observed firing in this isolated Chrome session.

A second deterministic race was found: asynchronous folder-access checking happened while state remained idle. Multiple starts could enter and subsequently cancel/discard one another. Tests now exercise this with deferred folder access. A live first-click failure was not independently reproduced; do not attribute every reported start failure to that race.

## Correction

- V2 internal routes retain the singleton capture. V1 navigation behavior is retained.
- V2 browser visibility changes retain capture; native background handling and document `pagehide` still stop safely. Background execution is not guaranteed against browser/OS suspension.
- Startup is claimed before awaiting folder access, and cancellation is checked before creating capture. Folder failures leave a recoverable idle state.
- A bounded, in-memory diagnostic history records timestamps, station IDs and start/boundary/stop/finish/error/navigation/visibility reasons. It contains no stream URLs or audio. The browser harness additionally wraps the actual player boundary callback and logs MediaRecorder/track/media events.
- Unexpected native MediaRecorder termination is classified `source-ended`; silence rejection is classified `no-audio`. Genuine-audio thresholds and the existing 8-second test are unchanged.
- A real source failure/replacement still finishes and preserves the previous station's draft. EN/TA/SA interruption text explicitly says recording did not restart. Resuming playback cannot accidentally append another station to the old recording. Only an actual segment limit triggers existing automatic save/continuation.

## Actual long-capture evidence

`tmp/recording-lifecycle/baseline.json` and `baseline-navigation.png`: original navigation failure.

`tmp/recording-lifecycle/three-minute.json`, `three-minute-recording.png`, `sooriyan-three-minute.webm`: recording remained active through Settings navigation and a controlled waiting/playing buffering event until manual Pause at 185 seconds, using **one MediaRecorder**. Config checked: `MaxDurationMs=3600000`, `MaxBytes=83886080`, `AutoContinue=true`.

Actual Export wrote **2,990,879 bytes** to the chosen test directory. Chrome `decodeAudioData` decoded **185.58 seconds**, RMS **0.1828247757**, peak **0.7359243631**: genuine non-silent broadcaster audio, not a fixture. SHA-256: `4ead6aac0ff510e98077d1723478edde02bae003f34d524ec2e216e9e88b8f21`.

The long script then deliberately forced offline mode and reloaded the media element. Chrome produced a terminal media error; playback did **not** automatically recover within 45 seconds. The recording correctly retained **65,897 bytes**, stop reason `failure`, and showed Export plus the new interruption message. Thus the long run's overall JSON is `failed` for its original overly strong automatic-recovery expectation; its successful 185-second recording/export is separately documented, not promoted to an all-scenarios pass. Real offline/reload is distinct from a transient network-error event.

## Reproduction and limitations

`scripts/verify-recording-lifecycle-browser.cjs` is a manual live integration probe, excluded from normal CI. Run using WSL Linux Node with Playwright already available at `tmp/ci-tools/node_modules` (or `RADIOBEE_BROWSER_TOOLS`), actual Chrome installed, and a development server at `APP_URL` (default `http://localhost:3042`). It requires Angular development debug APIs solely to observe the real service and timestamp boundaries. It does not inject a replacement service, engine or audio signal. Default duration is 185 seconds; `RECORD_SECONDS` can shorten follow-up scenarios to a multiple of five, minimum 45. `OUTPUT_DIR` separates runs. Optional `BROWSER_BRIDGE` identifies an existing CDP bridge module exposing `attach(chromium)`; otherwise it launches real Chrome directly. No security flags are disabled. Script failures return nonzero.

The system folder chooser is automated with a genuine OPFS directory handle. The app performs its real destination persistence and writes. This verifies successful Export, not an OS folder picker, download-dialog operation, or physical Android folder selection. Evidence audio stays local and is not committed.

Buffering events are deliberately injected while genuine radio audio runs. Offline conditions are imposed through CDP; transient-error scenarios are labelled controlled, not natural station outages. The isolated tab remained `visible` after a tab switch: hidden-tab browser behavior remains unverified; deterministic visibility handler tests cover it. No claim is made for one-hour physical runtime, an 80-MB live segment, Android hardware, deployed-site behavior, every intermittent startup failure or guaranteed future stream availability.

## Follow-up browser results

`tmp/recording-lifecycle/followup/three-minute.json`: **passed** against the real V2 controls/service. This separate 45-second follow-up covered Settings, controlled buffering, Pause/Export, terminal offline/reload, explicit Retry, Stop, controlled transient recovery, and Sooriyan → Vasantham switching. It does not replace the 185-second evidence above.

The partial draft from the forced failure exported successfully: **65,897 bytes**, decoded **4.08 seconds**, RMS **0.1880189202**, peak **0.6051114202**. A controlled transient `MediaError` code 2 triggered actual automatic reconnection and genuine playback; the recording retained its existing **48,493-byte** draft. Station switching retained the old file and created no recorder for Vasantham until an explicit user start. Earlier runner iterations failed on overly strong offline-recovery expectations and trying to use a player button after Stop removes that player; those test assumptions were corrected, not hidden as production fixes.

## Corrected-file inventory

Changes for this lifecycle task only:

- `src/app/recording/recording.service.ts`: persistent V2 lifecycle, serialized startup, diagnostics and interruption message selection.
- `src/app/recording/capture-engine.ts`: explicit native-stop/silence end reasons; original audio validation retained.
- `src/app/recording/recording.spec.ts`: nine regressions (duplicate start, inaccessible folder, cancelled preparation, pagehide draft, V1/V2 routing and visibility, preserved failure/recovery draft).
- `src/app/recording/capture-engine.spec.ts`: native recorder termination regression and accurate silence expectations.
- `src/app/catalog/ui-extras.ts`: English, Tamil and Sanskrit interruption strings.
- `scripts/verify-recording-lifecycle-browser.cjs`: reproducible manual real-Chrome lifecycle/export/decoder/accessibility probe.
- `documentation/RECORDING-LIFECYCLE.md`: investigation, evidence and limitations.

Preserved pre-existing uncommitted work: `scripts/verify-recording-browser.cjs`, `src/app/recording/capture-access.ts`, `src/app/recording/capture-access.spec.ts`, `scripts/recording-browser-support.cjs`, `scripts/verify-recording-ui-browser.cjs`, `documentation/RECORDING-REVIEW-2F32BC8.md`.

Final Angular regression result: **669 passed, zero failed, 45 files**, including ten new tests for this task. The earlier complete run before the final two edge-case tests passed **667/667**. Focused intermediate recording run passed **68/68**. Lint and TypeScript checks passed under WSL2 Linux Node 24.16.0. No dependencies were reinstalled and the lockfile was not changed.
Final production Pages build passed (`npm run build:gh -- --configuration=production`). Seven existing component stylesheet-budget warnings remain: recording-controls, directory-page, settings-page, station-page, directory-shell, station-card and station-browser. Styles and budgets were not changed.

`tmp/recording-lifecycle/accessibility/three-minute.json`: complete follow-up browser run **passed**, with **zero axe violations** for the actual recording controls + player in both active recording and interrupted/exportable-draft states. This is scoped player/control evidence, not a claim of whole-site or physical Android accessibility validation.

All changes are unstaged. HEAD remains `2f32bc87145d5f8b58dae1b7894ad76b9e8c8d14` on `fix/real-radio-audio-capture`. No commit, push, merge or deployment was performed. `git diff --check` passed.
