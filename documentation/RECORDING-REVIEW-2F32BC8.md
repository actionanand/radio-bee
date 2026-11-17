# Recording review corrections after 2f32bc8

Date: 2026-11-17 (Asia/Calcutta). Branch: `fix/real-radio-audio-capture`.
Base HEAD remains `2f32bc8`; this work is uncommitted and unstaged.

## Findings and changes

1. **Browser-test download cancellation:** Linux Playwright was driving Windows Chrome over CDP. Playwright's Linux temporary download/artifact path was not a usable Windows browser download directory. The same encoded recording that previously failed `download.saveAs` now completes when Chrome receives an explicit Windows directory mapped to the Linux filesystem. The new shared helper listens for actual `Browser.downloadProgress=completed`, reads the GUID-named browser download from that mapped directory, and verifies its encoded bytes by decoding the downloaded file. It does not substitute an in-memory Blob for a successful download. Same-OS test runs retain the normal Playwright saveAs path.
2. **Actual V2 coverage:** `verify-recording-ui-browser.cjs` runs the production app's Settings, player, recording service and controls. There are no mocked player/recorder states. The chooser supplies a real origin-private filesystem (OPFS) directory handle for automation; native browser file writes, persisted handle restoration and Export remain real. One test-directory write fault is injected to prove that Export failure retains the real recording and that retry succeeds. This is not validation of the Windows system folder picker or physical Android storage.
3. **Cancellation correctness:** successful GET headers are no longer rejected or stalled because `response.body.cancel()` throws, rejects or never settles. Body cancellation is best effort; the existing request-local AbortController is still aborted in finally. Header/HTTPS/credential validation, the caller's cancellation signal and the 8-second request bound remain intact. The recording silence threshold and audio validation are unchanged.
4. **GET interference:** the actual access helper ran while Sooriyan continued ordinary playback. Both public and local controls runs showed more than five seconds of advancing playback with no pause, error, emptied event or source change during that probe. The probe body is canceled immediately and never saved as raw stream audio. Recording preparation still intentionally reloads this same player element with anonymous CORS, as before. A server enforcing one connection per listener/IP could react differently; these results do not guarantee safety for every broadcaster.
5. **Direct version tests:** tests inject the real CAPTURE_ACCESS token with a V1/V2 catalogue and assert HEAD/GET respectively. Other tests cover body-cleanup rejection, synchronous exceptions and pending cleanup, including request-local abort without canceling the caller. V1 selection is unchanged.
6. **Deployment/cache/profile comparison:** the deployed app used HEAD in the actual recording service path, while this branch's V2 service used GET. Deployed `chunk-CXt919BF.js` SHA-256 was `09bee783cdcfca59e8650faa8b8776da3003f9433d5240a85e2b73d4d9efcd7e`. The final local recording module is `chunk-Dz-9oD_P.js`, SHA-256 `e5b56dd33c8642be36738b6e014b6aad44b2931fa379f4c42f9106d85876b025`. The deployed module lacked the newer media-access-error marker. All 31 deployed JS asset hashes were identical across first load, warm reload and cache-disabled reload. No service worker or Cache Storage entry existed in those isolated contexts. The test-only module used for the access-continuity probe is excluded from deployed asset fingerprints.

The deployed site is therefore a different recording implementation from the reviewed GET branch; a different hash does not prove that the affected user's browser cache is stale. Two fresh isolated Windows Chrome profiles (headed and headless) had no installed extensions. The affected user's original profile, cached resources and extensions were not attached/inspected or modified. No cache was cleared and no extension/security setting was changed.

## Actual recording and Export results

All measurements below use Windows Chrome **157.0.8103.79**, default security/autoplay behavior, and audio directly from:
`https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden`

| Scenario                           | Decoded duration |            Encoded bytes | Decoded RMS | Export verification                                        |
| ---------------------------------- | ---------------: | -----------------------: | ----------: | ---------------------------------------------------------- |
| Capture adapter, real live stream  |          12.00 s | See adapter/results.json |     0.23868 | Actual completed browser download, decoded from saved file |
| Deployed V2 controls, headless     |          10.32 s |                   166457 |     0.23399 | Actual OPFS file after UI Export/retry                     |
| Deployed V2 controls, headed       |          10.74 s |                   173235 |     0.21456 | Actual OPFS file after UI Export/retry                     |
| Final local production V2 controls |          10.32 s |                   166457 |     0.24256 | Actual OPFS file after UI Export/retry                     |

The local exported file SHA-256 is `ac836ef467e108a46ca049ea7462d94ec48785c95283ddb534d5a7286602b894`.
The headed deployed file SHA-256 is `bc8d2c571356c29ae8103c7d542fee336e6b9775908d86a2d95f6f720b1edef1`.
These are distinct actual recordings, not reused generated fixtures. Decoded RMS/peak establish non-silent signal; no human station-identification listening check is claimed in this review.

Separate deterministic coverage generated a CORS-clean 440 Hz signal: 12.00 decoded seconds, RMS 0.17250, successful actual browser download. Generated silence produced no successful recording/file. A controlled endpoint granted CORS to HEAD but denied GET; Chrome rejected capture while ordinary non-CORS playback remained possible. Generated audio is not evidence of live radio availability.

UI scenarios passed for starting-disabled during connecting/buffering, genuine elapsed recording, retaining an active capture across controlled waiting/playing events, Pause, Stop, station switching, retained drafts, Export failure and successful retry. The controlled buffering test dispatches media events over real ongoing playback; it is not a naturally occurring network outage. No microphone request was made in the UI tests.

## Validation

All Node/npm work used WSL2 Linux Node 24.16.0 with an explicit process.platform guard. No dependency installation, version or package-lock change.

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:ci`: **659/659** tests, 45 files, no failures/skips.
- `npm run build:gh -- --configuration=production`: passed; existing style-budget warnings remain, budgets unchanged.
- Direct access-method/cleanup tests: **10/10** passed, including five added regressions.
- Adapter browser suite: passed generated signal, silence, genuine live download/decode and HEAD-versus-GET CORS cases.
- Public headless, public headed and final local production UI suites: passed.
- Extra `node --test scripts/*.test.*`: **24/25** passed. The unchanged Android workflow contract test fails with EISDIR at scripts/android-scripts.test.mjs:342 because its readdir('scripts').map(readFileSync) treats the already-tracked scripts/native directory as a file. Both the directory and test exist at HEAD 2f32bc8 and were not changed here. This is a separate baseline issue, not hidden as a passing check.
- Git whitespace checks: passed.

The recording engine, player, recording permission logic, 1-hour/80-MB/automatic-continuation environment configuration, Android destination code, catalogue and URLs are unchanged. A full hour or 80 MB was not recorded in the browser; existing bounded/continuation unit coverage remains in the complete suite.

## Reproduction and evidence

Existing Playwright/browser tooling is required; these manual browser scripts do not install dependencies and unstable live probes are not added to normal CI.

From WSL in the client repository, verify Linux first:

```bash
node -e 'if (process.platform !== "linux") throw Error("WSL Linux required")'
```

Same-OS Linux browser:

```bash
node scripts/verify-recording-browser.cjs
RADIOBEE_LIVE_STREAM_URL=https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden node scripts/verify-recording-browser.cjs
RADIOBEE_DATA_ROOT=../radio-bee-data/dist/v2 node scripts/verify-recording-ui-browser.cjs
RADIOBEE_RECORDING_APP_URL=https://actionanand.github.io/radio-bee node scripts/verify-recording-ui-browser.cjs
```

`RADIOBEE_BROWSER_TOOLS` selects an existing node_modules folder containing Playwright (default tmp/ci-tools/node_modules). `RADIOBEE_CDP_URL` can connect an already running diagnostic Chrome; `RADIOBEE_CDP_BRIDGE` accepts an existing local bridge module exporting attach(chromium), for WSL/Windows transports. Do not disable web security/CORS/autoplay protections.

For Windows Chrome controlled from WSL, both mappings must refer to the same dedicated test-download directory:

```bash
RADIOBEE_BROWSER_DOWNLOAD_DIR='C:\AR_Files\code\radio-bee\tmp\recording-review\downloads' \
RADIOBEE_NODE_DOWNLOAD_DIR=/mnt/c/AR_Files/code/radio-bee/tmp/recording-review/downloads \
RADIOBEE_CDP_BRIDGE=tmp/recording-review/bridge.cjs \
RADIOBEE_LIVE_STREAM_URL=https://radio.lotustechnologieslk.net:2020/stream/sooriyanfmgarden \
node scripts/verify-recording-browser.cjs
```

Ignored evidence under tmp/recording-review includes adapter/results.json and downloaded WebM files; public-ui/results.json; public-headed/results.json; local-ui/results.json and the UI-exported files; recording screenshots; cache-comparison.json and the public recording bundle; and all validation logs. Local loops serve existing metadata through the existing loopback-only preview harness. No public data repository or production endpoint is changed.

## Status and unresolved reproduction

The six review corrections are ready for source review. The reported affected-profile failure ("Waiting for stream audio… – 0 s" followed by an empty result) **still did not reproduce** in these isolated deployed-site tests, including headed Chrome. This work must not be described as a confirmed fix for that profile-specific failure. Its cause remains unproven; extension interference, a different cached bundle or a browser/device-specific capture state have not been demonstrated. Physical Android, the user's original profile/system folder chooser and arbitrary single-connection broadcasters remain unverified.

No commit, push, merge or deployment has been performed.

Changed files:

- src/app/recording/capture-access.ts
- src/app/recording/capture-access.spec.ts
- scripts/verify-recording-browser.cjs
- scripts/recording-browser-support.cjs
- scripts/verify-recording-ui-browser.cjs
- documentation/RECORDING-REVIEW-2F32BC8.md
