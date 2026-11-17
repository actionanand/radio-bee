# Tamil Kadavul Murugan — intermittent recording investigation

## Current finding and bounded V2 recovery

The user's failed-session trace confirms the immediate mechanism: a running AudioContext and a live, enabled, unmuted capture track supplied **zero measured energy and zero encoded bytes throughout eight seconds**. This is a zero-frame capture failure, not a destination-file write failure. A live track flag alone is not proof of decoded audio. The lower-level reason that Chrome's capture path starves in that profile remains unconfirmed; do not claim a specific Chromium bug, server restriction or AAC incompatibility without further evidence.

V2 now permits exactly one fresh `captureStream()` acquisition when the first capture has no frames/energy after two seconds and playback is still ready. It disposes the old recorder, tracks and context, ignores their stale callbacks, and attaches the replacement to the **same existing audio element**. Playback is not restarted, no stream GET is added, and another station is never appended. Both attempts share the original eight-second validation deadline and the original one-hour/80-MB limits. Encoded silence is never retried as a zero-frame problem. Abort/Stop ends pending attachment; there is no retry loop.

If the browser still delivers no frames, EN/TA/SA UI reports that the browser did not supply recordable audio, preserves listening, and exports no silent file. V1 does not opt into recovery. Permissions, Android destination behavior and environment flags are unchanged. Diagnostics now include the capture-attempt number.

This recovery is unit-tested but **must still be verified against the restarted current build and the affected user session**. The successful recordings below predate this behavioral recovery. The controlled browser fault mode `RADIOBEE_STALL_FIRST_CAPTURE=1` supplies one live zero-frame generator track while real station audio continues, then requires the second capture to encode/export real broadcaster audio. It is an explicitly controlled fault test, not a claim of reproducing the native browser defect naturally. The latest browser run could not start because port 43655 was stopped; a new server URL was requested.

Current validation: **686 Angular tests passed / 0 failed**, 45 files; lint, typecheck and production Pages build passed under WSL Linux Node 24.16.0. Eight recovery/status regressions were added after the earlier 678-test run (five capture tests, two service policy/status tests, one EN/TA/SA status test). Existing stylesheet-budget warnings remain. No commit/push/merge/deployment.

Branch verified before edits: `fix/v2-recording-panel-first-folder`. Base HEAD: `1025e9bddfecf30c05a6947785f37239dfd7e7f1`. Initial working tree was clean. No commit, push, merge, deployment, data edit, dependency reinstall or lockfile change.

## Findings: failure not reproduced

The original app at `http://localhost:36803/` was exercised through the actual V2 UI using isolated Windows Chrome **157.0.8103.79**, controlled by Playwright running under WSL Linux Node **24.16.0**. No replacement recording service, generated audio, microphone, proxy or raw-stream downloader was used. The user subsequently confirmed that recording was working again but remained intermittent.

**Initial isolated-browser phase:** a successful attempt did not disprove the reported failure. The user subsequently supplied the zero-frame trace described above; the current V2 recovery supersedes the initial diagnostics-only phase. No browser-security or AAC incompatibility has been demonstrated.

Actual media GET and access-check GET for `https://cast6.asurahosting.com/proxy/tkmradio/stream` both returned **200**, `Content-Type: audio/aacp`, `Access-Control-Allow-Origin: *`. No redirects were observed. ICY metadata identified Tamil Kadavul Murugan, 64 kbps, 32 kHz. Chrome decoded and played it, so this MIME value did not establish an unsupported codec. An anonymous-CORS reload successfully delivered real audio to capture. Request aborts associated with the headers-only access probe, intentional source restart and Stop are expected cleanup, not evidence of CORS failure.

The capture audio track was **live and unmuted**; AudioContext was **running**. Analyser samples exceeded the existing 0.001 threshold, MediaRecorder emitted meaningful Opus/WebM chunks, and decoded samples were non-silent. The eight-second gate did not reject these successful runs; it has not been increased or bypassed.

## Initial comparison evidence

`tmp/murugan-recording/baseline.json` contains actual UI playback, GET headers, media events, track events, analyser observations, MediaRecorder events and chunks for both stations in the same browser context:

| Station               | Encoded duration |   Bytes | Decoded RMS |     Peak |
| --------------------- | ---------------: | ------: | ----------: | -------: |
| Tamil Kadavul Murugan |          18.24 s | 294,097 |    0.142704 | 0.672497 |
| Sooriyan FM Sri Lanka |          18.48 s | 297,961 |    0.216721 | 0.688450 |

The real bottom-bar Export wrote files with the matching names and sizes. These initial metrics decoded the actual recorder chunks, rather than independently reopening both exported destination files. Do not conflate them with final exported-file verification.

`tmp/murugan-recording/matrix.json` additionally exercised actual mute and volume controls:

| Station / condition          | Decoded duration |      RMS |
| ---------------------------- | ---------------: | -------: |
| Murugan, muted               |          18.42 s | 0.137596 |
| Murugan, volume zero         |          18.24 s | 0.142893 |
| Murugan, immediate recording |          18.60 s | 0.221944 |
| Sooriyan, muted              |          18.30 s | 0.206695 |

Thus mute and zero volume did not explain the failure in this Chrome environment. Decoded PCM proves real non-silent capture, but is not a new human station-identification listening confirmation or broadcaster authorization.

## Safe changes for the next failed attempt

The initial instrumentation preserved capture behavior and added the following diagnostics. The bounded recovery at the top of this report was implemented afterward:

- Optional capture diagnostic callback reports timestamps, actual context state, track live/muted/enabled state, recorder state, encoded bytes, elapsed time, current/max RMS, qualifying signal observations and end reason.
- Snapshots are taken before cleanup, so stopping captured tracks/closing the context cannot falsely appear to be the original failure.
- V2 retains only the latest twelve snapshots, emits `radiobee-recording-diagnostic` on `window`, and logs `[RadioBee recording] No captured audio; playback may still work.` on genuine validation failure. No audio, URLs or device identifiers are included. V1 does not emit or retain this V2 evidence.
- Diagnostic observer exceptions cannot interrupt audio capture or cleanup. Terminal-state guards precede diagnostic callbacks.
- There is no automatic retry loop, automatic draft replacement, fabricated verification or silent-file export.

For an intermittent failure, enable Chrome DevTools **Preserve log** and copy the `[RadioBee recording]` warning. A short local trace can be collected before reproducing:

```js
window.rbRecordingEvidence = [];
window.addEventListener('radiobee-recording-diagnostic', event => {
  window.rbRecordingEvidence.push(event.detail);
  window.rbRecordingEvidence = window.rbRecordingEvidence.slice(-12);
});
// After failure, in Chrome DevTools:
copy(JSON.stringify(window.rbRecordingEvidence, null, 2));
```

Do not label zero analyser samples as CORS specifically: muted/inaccessible tracks, interrupted contexts, a quiet programme, output/capture bugs or actual network failures require different evidence. Wait for stable audible playback, acknowledge the notice and make one Start attempt. On failure, preserve the diagnostic trace; do not remove audio validation to make an error disappear.

## Regression and limitations

The initial real-UI regression exercised first Start folder selection, automatic panel collapse, manual collapse/reopen, controlled waiting/playing buffering with actual radio audio, Pause, Stop, station switching, draft preservation and explicit replacement confirmation/cancellation. Export was asserted absent from the panel and present only in the bottom launcher. Axe reported zero violations in the recording controls.

One exported-file verifier originally selected a file by byte size and could confuse equal-length files from the two stations. This test defect was corrected to select a newly created filename. The older duplicate Sooriyan result is not accepted as independent exported-file evidence. The final browser runner is `scripts/verify-recording-station-browser.cjs`; it reopens each new destination file and decodes its actual bytes, requiring at least 15 seconds of non-silent audio for each station.

The requested server was stopped by the user during follow-up. A temporary loopback-only listener was attempted, then explicitly stopped after the user requested control of startup. The user subsequently restarted the app at `http://localhost:43655/`; current-build verification is recorded below. No unsuccessful connection run is treated as a recording failure or a pass.

Folder chooser automation returns a genuine OPFS directory handle; the app performs actual folder persistence and writes. This is not OS folder-picker validation or physical Android testing. No one-hour live run, 80-MB live segment, extension-enabled user-profile reproduction or natural outage was verified. Recording permissions and Android destination code remain unchanged. The measurements establish technical recording in tested conditions, not independent legal clearance.

## Changed files and validation

- `src/app/recording/capture-engine.ts`: diagnostics and one bounded, cancellable V2 zero-frame re-acquisition.
- `src/app/recording/recording.service.ts`: V2 recovery opt-in, bounded evidence and truthful zero-frame failure status.
- `src/app/recording/capture-engine.spec.ts`: unchanged silence rejection with truthful diagnostics; observer exception isolation.
- `src/app/recording/recording.spec.ts`: V1 isolation, bounded V2 evidence and obsolete-callback rejection.
- `src/app/catalog/ui-extras.ts`: EN/TA/SA browser-capture-unavailable status.
- `scripts/verify-recording-station-browser.cjs`: actual UI/manual live-station regression, new-file export verification, controlled zero-frame/picker-delay modes and axe check. Existing Playwright/axe tools are reused; no new package dependency.
- `documentation/RECORDING-MURUGAN-INVESTIGATION.md`: findings and reproducible evidence instructions.

Final Angular suite: **678 passed / 0 failed across 45 files** (baseline before the four added tests: 674 passed). Lint and TypeScript checks passed in WSL Linux. Final production build result and post-restart browser results are recorded below when available. All changes remain unstaged.

To run the browser regression in WSL after starting the development app:

```sh
# Verify Linux before Node/npm. Chrome and existing Playwright/axe must be available.
node -p process.platform
APP_URL=http://localhost:36803 \
RADIOBEE_CDP_BRIDGE=tmp/recording-lifecycle/bridge.cjs \
RADIOBEE_RECORDING_EVIDENCE=tmp/murugan-recording/final \
node scripts/verify-recording-station-browser.cjs
```

The optional CDP bridge must expose `attach(chromium)` and target an isolated real Chrome. Without it, the script launches installed Chrome directly. Angular development debug APIs are used for observation only; all service actions run through the real controls. Normal CI runs deterministic tests, not live broadcaster probes.

Final production build: **passed** (`npm run build:gh -- --configuration=production`). An earlier build emitted existing stylesheet-budget warnings; the final cached build did not repeat them. `git diff --check` passed. Final live verification passed on the user-started port 43655; the intermittent failing-profile trace is still needed to identify its root cause.

## Restarted application: port 43655

Actual current-build browser regression **passed**. `tmp/murugan-recording/43655/regression.json` and `regression.png` contain first-folder selection, collapsed/reopened panel, controlled buffering, Pause, Stop, explicit replacement/cancellation, old-draft preservation across station switching, bottom-bar-only Export and zero axe violations for recording controls.

Each destination file was independently reopened by its **new filename**, decoded, and copied locally:

| Station               | Exported file                                                  |   Bytes | Duration |      RMS |     Peak |
| --------------------- | -------------------------------------------------------------- | ------: | -------: | -------: | -------: |
| Tamil Kadavul Murugan | `RadioBee-Tamil-Kadavul-Murugan-2026-11-17T10-11-43-848Z.webm` | 276,693 |  17.16 s | 0.186824 | 0.931640 |
| Sooriyan FM Sri Lanka | `RadioBee-Sooriyan-FM-Sri-Lanka-2026-11-17T10-12-12-743Z.webm` | 276,693 |  17.16 s | 0.240340 | 0.754454 |

Murugan's real pre-cleanup capture diagnostic showed context running, a live/unmuted/enabled track, recorder recording, 85 qualifying signal observations, `heard=true`, maximum RMS 0.336791. Thus this run did not reproduce the user's eight-second failure.

The first restarted browser-run iteration had an evidence-writer variable collision (`output` as both directory and decoded-file metadata). That script-only bug was corrected and the complete scenario rerun successfully. It was not an application recording failure.

The supplied screenshot shows "Waiting for stream audio… – 5 s" and active playback controls; it cannot establish which track/context/signal condition failed at eight seconds. The user reported three failures when starting directly with Murugan and choosing Downloads/rb. Destination writes occur after capture, so a folder-save failure must not be misdiagnosed as an audio-validation failure. A delayed-picker experiment is separate from actual Windows folder-dialog validation.

Requested failed-session evidence: immediately after failure, run the following in Chrome DevTools and paste the copied measurements:

```js
copy(
  JSON.stringify(
    ng.getComponent(document.querySelector('app-recording-controls')).recorder.captureDiagnostics(),
    null,
    2,
  ),
);
```

No further application-code changes were made after the user restarted port 43655. Subsequent edits affected the browser probe and this report only. No stream is falsely marked unsupported; neither its authorization nor future capture reliability is inferred from these successful trials.

### Delayed first-folder experiment

`RADIOBEE_PICKER_DELAY_MS=20000` delays the automated first-folder response by twenty seconds, simulating picker/user-decision latency without changing any application timeout. The full actual-service/UI regression passed again at port 43655. Murugan's newly exported file decoded to **17.04 s**, **274,761 bytes**, RMS **0.147227**, peak **0.864898**. Sooriyan's separately exported file decoded to **17.10 s**, **275,711 bytes**, RMS **0.194554**, peak **0.698277**. Evidence: `tmp/murugan-recording/43655-delay/regression.json`. This tests picker timing using OPFS, not the real Windows Downloads/rb folder dialog or its filesystem permissions. Picker latency alone did not reproduce the reported failure.

Remaining blocker: measurements from a real failed attempt in the user's Chrome profile. That earlier diagnostics-only phase was superseded by the failed-session trace and bounded recovery described at the top. Current affected-session success remains unverified. No server was started or stopped after the user supplied port 43655.
