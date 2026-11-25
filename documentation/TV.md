# RadioBee native Google TV / Android TV

The persistent `android-tv/` project is independent of Angular and Capacitor. It uses the existing Play application ID **`com.actionanand.radiobee.app`**, with Kotlin namespace **`com.actionanand.radiobee.tv`**. It is TV-only: Leanback is required, touchscreen is optional, and only `LEANBACK_LAUNCHER` is advertised. Web/mobile code, release branches, recording settings and mobile artwork are unchanged.

## Architecture and pinned tools

- Kotlin 2.2.21; Android Gradle Plugin 8.13.0; checked-in Gradle wrapper 8.14.3 with distribution SHA-256.
- JDK 21 for building; Java 17 bytecode; core-library desugaring 2.1.5; minimum Android API 23, compile/target API 36.
- Compose BOM 2025.10.01; TV Material 1.0.1; Activity 1.11.0; Lifecycle 2.9.4.
- Native SVG artwork: [AndroidSVG 1.4](https://bigbadaboom.github.io/androidsvg/) (the catalogue predominantly uses SVG); no WebView, external SVG resolver or internal XML entities.
- Media3 ExoPlayer, HLS and Session 1.9.4; DataStore Preferences 1.1.7; coroutines 1.10.2.
- JUnit 4.13.2, JSON 20250517 and coroutine virtual-time tests. Instrumentation uses Compose UI tests and AndroidX JUnit 1.3.0.

`data/` owns V2 parsing, the network repository, validated atomic cache and persistent preferences. `playback/` owns one ExoPlayer inside `RadioPlaybackService`, a MediaSession, bounded retries, buffering deadlines and sleep timer. `ui/` contains the TV screens, focusable cards, dialogs and bounded SVG/bitmap artwork loader. `MainActivity` connects a MediaController while started, releases its future/controller on Stop, and reconnects on Start; it never creates a second player. Lifecycle-aware flows update the UI.

Preferences retain language, background playback, favorites, last selected station, sleep deadline and the last 20 genuinely played stations. Selection is restored without autoplay. Clearing catalogue cache leaves favorites/settings intact. Storage errors are visible. No microphone, recording, storage permission, analytics, accounts or screen-control workarounds are included.

## Build and install

Use Linux/WSL2 for Node commands. Do not reinstall the existing npm dependencies. Native builds need JDK 21 and Android SDK platform 36/build-tools 36.0.0; AGP can also request build-tools 35.0.0. Accept SDK licenses interactively. Configure `ANDROID_HOME`, `JAVA_HOME`, or an ignored `android-tv/local.properties` pointing to the SDK.

```bash
cd /mnt/c/AR_Files/code/radio-bee/android-tv
./gradlew --no-daemon --max-workers=2 testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest
./gradlew --no-daemon --max-workers=2 lintRelease assembleRelease bundleRelease
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.actionanand.radiobee.app/com.actionanand.radiobee.tv.MainActivity
```

Open **`android-tv/`**, not the generated mobile `android/` folder, in Android Studio. Use one consistent SDK/Gradle environment; do not share generated build directories between simultaneous Windows and Linux Gradle processes. The wrapper can run via `gradlew.bat` for native Android Studio development; this does not authorize Windows npm operations.

Debug output: `android-tv/app/build/outputs/apk/debug/app-debug.apk`. Local release outputs are **unsigned**: `app/build/outputs/apk/release/app-release-unsigned.apk`, `app/build/outputs/bundle/release/app-release.aab`, with `app/build/outputs/mapping/release/mapping.txt`.

The package ID is shared with mobile. A debug certificate cannot update an installed release-signed app; a same-package install also replaces the other form-factor binary. Use a dedicated TV/emulator. Do not automatically uninstall a user's app or delete its data.

## Catalogue and playback policy

Runtime data comes exclusively from [RadioBee V2](https://actionanand.github.io/radio-bee-data/v2/). No production catalogue is copied into Kotlin. The small JUnit fixture contains two real canonical stations and their referenced contract records; it is not packaged as a runtime seed.

The loader fetches the manifest, referenced canonical tables, English/Tamil/Sanskrit dictionaries and optional Home editorial selection, then rechecks the manifest to detect publication races. Parsing validates identifiers, provenance/references, sparse geographic ancestry, counts, stream contracts, translations and migrations before publishing or replacing an AtomicFile snapshot in app-private `filesDir/catalogue-v2.json`. Android may reclaim `cacheDir`, so it is no longer the authoritative offline store. A failed refresh retains the last valid snapshot. AtomicFile backup recovery runs before the cache size/existence check, including legacy interrupted-write recovery. A valid legacy `cacheDir/catalogue-v2.json` is validated before atomic migration and deleted only after a successful durable write. Failed migration writes retain the legacy snapshot for offline use. Migration, writes and clearing are serialized so a concurrent Clear Cache cannot be undone by legacy promotion. Explicit Clear Cache removes both snapshot locations without changing loaded data, favorites or settings. The optional browse index is not needed: membership is derived from canonical records. Discovery-only entries remain unplayable. Source URLs can legitimately be null.

Station names use selected-locale dictionaries with canonical English fallback. Search recognizes canonical names, translations and aliases independently of UI language. Broadcaster/network names remain canonical. Home's Featured row uses the data-owned `home-stations.json`; other rows use favorites, recent IDs, actual Tamil language membership and actual devotional genre/theme membership. Browsing filters expose only values represented by loaded stations.

The policy mirrors current client defaults: allow unverified candidates; do not require verification or rights approval to attempt playback. Explicit `directListening.status=restricted` always blocks playback. URL credentials and non-audio formats are rejected. `verificationStatus=unavailable` can be attempted when verification checking is disabled, as in the current client. **Technical eligibility is not broadcaster authorization.** Keep broadcaster/public-use review separate and change policy only through reviewed source changes.

HTTPS is the default for catalogue, artwork, websites and streams. Native HTTP stream support is an explicit build opt-in (`-PtvAllowHttpStreams=true`), enabling both parser/policy support and Android cleartext permission; it does not bypass rights restrictions. Do not use this option casually for release. No proxy or arbitrary user-entered stream URL is accepted. MP3/AAC/HLS and unknown-format sniffing use Media3 platform codecs; unsupported formats remain discoverable. Station SVG/bitmap artwork falls back to network artwork then the original RadioBee logo. SVG rendering is capped at 512×512 pixels; downloaded assets are capped at 2 MB, and DTD/entities are rejected. External artwork resources are not fetched by the SVG renderer.

## Remote, player and sleep timer

Use D-pad arrows, Select/Enter and Back. TV components provide visible focus, scrollable rows/filter dialogs and focus restoration after a station page. Cards expose full station names to accessibility despite two-line visual truncation. Now Playing offers Play/Pause, Stop, Favorite, sleep timer, metadata and connection/retry status. Hardware media Play/Pause/Stop uses the active MediaSession. System/own controllers can control transport; station/sleep custom commands require the application's UID/package, and unknown controllers are rejected.

ExoPlayer owns audio focus and becoming-noisy handling. There is one player and one MediaSession; station switching replaces its media item. Only actual `isPlaying` confirms playback/recent history. Errors/end-of-stream use at most three distinct URLs, three attempts per URL and six total attempts per user selection. Fresh alternatives precede retrying the failing URL; transient repeats back off 500/1000 ms. Permanent HTTP failures do not retry the same URL. Each continuous buffering episode has a 30-second deadline consuming the same budget. Pause, Stop, focus interruption, catalogue revocation and station switching cancel stale delayed work. Retry from the UI is an explicit new user attempt. Terminal Stop, sleep expiry, unavailable/revoked selections, exhausted retries and service destruction cancel pending work and call Pause before Stop and Clear Media Items, explicitly clearing `playWhenReady`. The separate retry hold stops loading while retaining play intent and the selected item.

Sleep options are Off/15/30/45/60 minutes. The service owns a persisted wall-clock deadline and stops playback when it expires, without a visible Activity. Replacement/cancellation are tested. It is not an exact alarm and cannot run in a killed/force-stopped process; if restarted after an expired deadline, playback remains stopped. Changing device time affects a wall-clock deadline.

Background playback defaults on. Media3 supplies the foreground media notification/system controls while playing. Turning it off pauses on Activity `onStop`; app navigation within the Activity does not pause. Home invokes Activity `onStop`; recent-task dismissal invokes service `onTaskRemoved`. Active playback and bounded retry backoff survive Home when background playback is enabled. Task dismissal retains only foreground Ready/Buffering playback; idle retry gaps and non-foreground sessions stop using the Media3 shutdown API. Screensavers are allowed: no KEEP_SCREEN_ON, display wake lock, Wi-Fi lock or display power control is used. Media3 alone manages the playback-scoped partial CPU wake lock. Ambient Mode/screen-off continuity depends on firmware and OS policy. **Power/standby, force-stop, network suspension and manufacturer battery restrictions can terminate audio.** No universal television Power-button playback guarantee is made. Cold-start media resumption after process death is not implemented; open the app and select Play. No recording is implemented in TV.

## Version allocation and shared Play identity

`tv-version.json` starts at versionName `1.0.0`, versionCode `1000000000`. This is a development seed, not a published reservation. Automatic release reservation increments first, so the first eligible release is `1000000001`.

| Form factor | Enforced version-code range |
| ----------- | --------------------------- |
| Mobile      | 1–999999999                 |
| TV          | 1000000000–2099999999       |

The only necessary shared mobile-source change is a tested upper-bound guard in `scripts/android-version.cjs`; the existing mobile code/name/history are not reset. **Before the first TV release, reviewed synchronization must deliver this guard to both `master` and `main-android`.** The TV allocator checks those remote refs and blocks otherwise. Separate ranges avoid concurrent cross-form-factor collisions. Google Play chooses compatible higher codes: keep TV's required-Leanback filtering and verify form-factor targeting in Play Console before publishing.

```bash
# Optional explicit semantic bump on a reviewed development change; never lower codes.
node -e 'if(process.platform!=="linux")process.exit(1)'
node scripts/bump-tv-version.mjs --patch  # or --minor / --major
```

Only `main-tv` may run `reserve-tv-version.mjs`. It requires a clean tracked tree, exact latest remote HEAD, enforced remote mobile guards, no rollback relative to TV version history or retained release filenames, then commits and non-force-pushes the reservation **before** building. Failure burns a reserved code; never reuse it. Concurrent advancement rejects the push and requires a fresh workflow run. Preserve reservation history when synchronizing reviewed source changes; never replace `tv-version.json` with an older feature/master copy.

No `main-tv` branch is created by this implementation. Branch responsibilities remain master=reviewed integration, main-github=Web, main-android=mobile, future main-tv=TV. A reviewed branch setup and any branch-protection permission for reservation/artifact bot commits are release prerequisites, not actions performed by this task.

## CI/CD and signing

`tv-validation.yml` runs a read-only PR path for native/release-tool changes: Java/SDK setup, wrapper validation, Node release regression tests, Kotlin tests/lint/debug/instrumentation compilation, debug identity/signature/native-page checks and downloadable debug APK. It needs no signing secrets and allocates no version.

`tv-build.yml` runs only on future `main-tv` push or an explicit `release=true` manual dispatch **on main-tv**. Branch-scoped concurrency never cancels a release in progress. It validates first, persists the version reservation, builds optimized release APK/AAB, reuses existing secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, signs candidates, verifies them, preserves R8 mapping and uploads artifacts for 30 days. No Google Play publishing occurs.

The signer supports existing JKS/PKCS12 identities, passes passwords through environment references, checks a private-key alias, signs APK v1/v2/v3 as appropriate and the AAB with jarsigner, and cleans its own temporary keystore on normal/error/always-workflow paths. It never creates a new production keystore. A failed verification cannot promote signed-looking outputs. The release job commits only uniquely named `releases/tv/RadioBee-TV-<name>-<code>.{apk,aab}` plus matching mapping, retaining only the newest TV output set. It never deletes mobile releases. Reservation/artifact commits use `[skip ci]`. Downloadable Actions artifacts survive a subsequent Git publish failure.

`validate-tv-artifacts.py` checks application ID, exact reserved version, TV-only launcher/features, target SDK, release debuggability, APK/AAB signatures, zip alignment, bundle contents, 64-bit counterparts and 16-KB alignment of bundled 64-bit ELF load segments. Runtime codecs are Android system codecs; no extra native decoder package is introduced. Inspect the actual output on each release rather than assuming dependency compatibility.

## Testing and TV release checklist

```bash
cd /mnt/c/AR_Files/code/radio-bee
node -e 'if(process.platform!=="linux")process.exit(1)'
node --test scripts/tv-release.test.mjs scripts/android-scripts.test.mjs
python3 -B -m unittest discover -s scripts -p tv_artifacts_test.py
cd android-tv
./gradlew testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest lintRelease assembleRelease bundleRelease
# With a connected TV/emulator:
./gradlew connectedDebugAndroidTest
# Optional real-data parser acceptance (a snapshot with manifest/tables/localization/home):
./gradlew verifyCatalogSnapshot -PtvCatalogSnapshot=/absolute/path/to/snapshot.json
```

Create an Android Studio Device Manager **Google TV/Android TV** AVD, not a phone AVD, with API 36 or a supported API 23+ TV image. Enable hardware acceleration; on Linux/WSL check KVM access, and use a Windows-hosted Android Studio TV emulator if WSL lacks it. Connect adb explicitly. Exercise launch → Home → card → audible playback → Favorite → Back/focus restoration → Browse/search/filter → Settings → all languages → sleep dialog. Test transport keys, interruptions, network failure/recovery, standby/screensaver, service background and background-off behavior. Use a real TV remote and TalkBack/accessibility review; compiled instrumentation is not evidence of executed navigation or audible playback.

Before Play submission:

- Review this PR into master; safely synchronize the mobile range guard before TV releases. Set up main-tv only after approval.
- Confirm existing Play app/signing identity, enable Android TV form factor and its separate internal testing/release track. Verify phone/TV device targeting and globally unique codes against the actual Play Console release history before the first TV upload.
- Verify current [TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality), [target API requirements](https://developer.android.com/google/play/requirements/target-sdk), [TV distribution](https://developer.android.com/training/tv/publishing/distribute) and [16-KB guidance](https://developer.android.com/guide/practices/page-sizes) at submission time.
- Supply TV screenshots from actual executed builds, 320×180 localized launcher banners (included), appropriate store icon/feature graphics, listing translations, privacy URL, content rating, Data Safety and rights disclosures. Do not use rendered placeholders as screenshots.
- Test APK/AAB and bundle-derived TV installation on at least one real Google TV/Android TV device; check accessibility/focus, process recreation and background/standby behavior.
- Confirm source listening authorization independently of relaxed technical playback settings. No recording permission is requested.
- Upload manually through the approved Play process; these workflows do not publish to Play.

See [MediaSessionService guidance](https://developer.android.com/media/media3/session/background-playback) and [Compose TV focus](https://developer.android.com/develop/ui/compose/touch-input/focus/focus-search) for the underlying platform behavior.

## Initial implementation verification

Validated on 23 November 2026 with WSL2 Linux Node 24.16.0, isolated Temurin 21.0.13 and Android SDK 36. No npm dependencies were reinstalled and no lockfile changed.

| Check                                                                    | Result                                                                                                                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native JUnit                                                             | **45 passed**, zero failures: parser 20, repository 6, persistence 1, playback/timers 14, SVG safety 4                                                           |
| Gradle `lintDebug` / `lintRelease`                                       | Passed; zero errors, 16 warnings (14 dependency-update notices, icon density coverage, bitmap KTX suggestion)                                                    |
| Debug APK / Android test APK                                             | Built successfully; three instrumentation tests compiled, **not executed**                                                                                       |
| Optimized release APK / AAB / R8 mapping                                 | Built successfully, unsigned local release outputs                                                                                                               |
| Public V2 snapshot parser acceptance                                     | **2.8.16: 405 stations, 410 stream candidates, 16 featured**; actual fetched files, not the minimal fixture                                                      |
| Native artifact tests                                                    | **5 passed**: alignment, matching 64-bit counterpart, invalid ELF, no-native case                                                                                |
| TV + existing Android release-script tests                               | **40 passed**; local bare-Git fixtures exercise reservations and retention, without touching real deployment branches                                            |
| Workflow syntax / wrapper                                                | actionlint 1.7.12 passed; official Gradle wrapper JAR SHA-256 and distribution checksum verified                                                                 |
| Real local signing smoke                                                 | Existing Gradle debug identity signed optimized APK/AAB in a temporary fixture; signatures, identity, alignment and cleanup verified; **not production signing** |
| Existing Web lint / typecheck                                            | Passed                                                                                                                                                           |
| Existing Angular suite                                                   | **758 passed / 55 files** on serial run                                                                                                                          |
| Existing PR/preview/playback/recording/integration/social Node contracts | **30 passed**                                                                                                                                                    |
| Web production Pages build / artifact assertions                         | Passed; eight existing stylesheet-budget warnings, budgets unchanged; 14 social routes and `/radio-bee/` routing validated                                       |

The first Angular run overlapped native Gradle compilation and had two five-second timeouts (756/758 passed). The complete unchanged suite passed when executed without competing Gradle work: 758/758 in 67.29 seconds. No tests were skipped, assertions weakened, timeouts increased or web test sources changed.

Acceptance commands:

```bash
# In android-tv, with JDK/SDK configured:
./gradlew --no-daemon --max-workers=2 testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest verifyCatalogSnapshot lintRelease assembleRelease bundleRelease -PtvCatalogSnapshot=/absolute/path/to/downloaded-v2-snapshot.json
# In repository root, Linux Node:
node --test scripts/tv-release.test.mjs scripts/android-scripts.test.mjs
python3 -B -m unittest discover -s scripts -p tv_artifacts_test.py
python3 scripts/validate-tv-artifacts.py --apk android-tv/app/build/outputs/apk/debug/app-debug.apk --debug
python3 scripts/validate-tv-artifacts.py --apk android-tv/app/build/outputs/apk/release/app-release-unsigned.apk --aab android-tv/app/build/outputs/bundle/release/app-release.aab --unsigned
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs scripts/recording-config.test.mjs scripts/integration-contract.test.cjs scripts/social-preview.test.mjs
npm run build:gh -- --configuration=production
npm run copy-error-page
node scripts/generate-social-pages.mjs
node scripts/check-web-artifact.mjs
```

The debug APK is 26,251,667 bytes; the optimized unsigned APK is 2,907,671 bytes; the AAB is 6,026,798 bytes. APK identity is `com.actionanand.radiobee.app`, development version `1.0.0 (1000000000)`. Both APK and AAB contain matching ARM32/ARM64 and x86/x86_64 libraries; their 64-bit ELF load segments passed the 16-KB check. The original logo was copied byte-for-byte, and all three 320×180 launcher banners were inspected visually.

No TV is connected (`adb devices` empty), and the WSL user cannot use `/dev/kvm`. No emulator/physical-device install, audible native radio playback, TV screenshots, D-pad instrumentation execution, TalkBack, power/standby or Ambient Mode test is claimed. Those checks and Play Console form-factor/authorization review remain release gates. The real-data check validates parsing, not live audio availability. The production signing secrets were not read; production-signed artifacts and GitHub workflow execution remain unverified until an approved release setup.

Implementation remains on the existing `feature/google-tv-native`; no protected branch, data repository or Web/Android deployment workflow was modified. The only shared mobile change is the documented version-range guard. No main-tv branch, production release, merge or deployment was created.

## PR #105 persistence and shutdown corrections

The [review](https://github.com/actionanand/radio-bee/pull/105#pullrequestreview-6015133727) identified a reclaimable offline snapshot and terminal `stop()` calls retaining playback intent. The production code now shares explicit terminal/pause/retry-hold boundaries, and all affected service paths were reviewed: controller Stop/Pause, sleep expiry, unavailable tuning/loading, catalogue revocation, retry exhaustion/backoff, task removal and destruction. The existing audio-focus/noisy interruption handling, eligibility policy, retry budget, sleep configuration and single-player ownership are preserved.

Seven new JVM persistence regressions use real temporary filesystem directories and the real catalogue parser/repository: offline cold-start after simulated OS cache eviction, valid legacy migration and restart, invalid migration rejection, durable precedence, explicit clearing without resurrection or preference loss, disk-full migration fallback, and malformed-refresh protection. Nine lifecycle regressions exercise the production lifecycle delegate against a controlled Media3 Player interface whose Stop deliberately retains play intent, matching the Media3 contract. They cover Stop → Home, sleep expiry → Home, exhausted retries → Home, active background playback, retry-backoff retention, background-disabled Home/task removal, delayed-retry cancellation and repeated cleanup.

An additional Android instrumentation regression uses actual AtomicFile-backed storage under isolated files/cache test directories. It is compiled with the existing device tests; execution still requires a TV/emulator. JVM tests simulate Home via the same Activity background-policy function used in production and separately test the task-removal delegate; they do not claim physical remote or OS service execution.

Local validation on 23 November 2026:

| Check                                       | Result                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `testDebugUnitTest`                         | 61 passed, zero failures/errors/skips                                                                                |
| `testReleaseUnitTest`                       | 61 passed, zero failures/errors/skips                                                                                |
| New JVM regressions                         | 16 unique cases (7 persistence, 9 lifecycle), executed in both variants                                              |
| `lintDebug`, `lintRelease`                  | Passed: zero errors, 16 existing warnings per variant                                                                |
| `assembleDebug`, `assembleDebugAndroidTest` | Passed; four device tests compiled, not executed                                                                     |
| `assembleRelease`, `bundleRelease`          | Passed; optimized unsigned APK/AAB and R8 mapping generated                                                          |
| TV + Android release-script tests           | 40 passed, zero failures/skips                                                                                       |
| Native artifact tests                       | 5 passed                                                                                                             |
| Generated artifact validation               | Passed: application ID, version, TV targeting, debug signature/alignment and APK/AAB native-library/page-size checks |

Commands (JDK 21 and SDK 36 configured in WSL2; Linux Node 24.16.0 verified before Node commands):

```bash
cd android-tv
./gradlew --no-daemon --max-workers=2 test lintDebug lintRelease assembleDebug assembleDebugAndroidTest assembleRelease bundleRelease
cd ..
node --test scripts/tv-release.test.mjs scripts/android-scripts.test.mjs
python3 -B -m unittest discover -s scripts -p tv_artifacts_test.py
python3 scripts/validate-tv-artifacts.py --apk android-tv/app/build/outputs/apk/debug/app-debug.apk --debug
python3 scripts/validate-tv-artifacts.py --apk android-tv/app/build/outputs/apk/release/app-release-unsigned.apk --aab android-tv/app/build/outputs/bundle/release/app-release.aab --unsigned
```

No assertions were weakened, tests skipped, timeouts raised or lint failures suppressed. Native device/emulator execution remains pending: adb lists no devices, and KVM is not writable by the WSL user. Physical Home/task-removal behavior, audible playback, standby and production signing remain release gates. Web application behavior, stream URLs, eligibility policy, package versions and signing secrets were not changed or reconfigured for this correction. Existing Web/Android deployment workflows and branches are untouched; no main-tv branch or release is created by this correction.

## PR #105 follow-up: wake mode and foreground lifetime (25 November 2026)

The follow-up review is addressed against the **pinned Media3 1.9.4**, not an assumed older default:

- [ExoPlayer.Builder](https://github.com/androidx/media/blob/1.9.4/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/ExoPlayer.java) documents local wake mode by default unless a stuck-playback detector is disabled. [ExoPlayerImpl](https://github.com/androidx/media/blob/1.9.4/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/ExoPlayerImpl.java) implements that conditional default. The old manifest lacked the normal `WAKE_LOCK` permission; the SDK therefore logged a warning and could not acquire its CPU lock. `RadioPlayer.kt` now states `C.WAKE_MODE_LOCAL` explicitly and the TV-only manifest declares the permission. No runtime permission dialog is needed.
- The [pinned WakeLockManager](https://github.com/androidx/media/blob/1.9.4/libraries/common/src/main/java/androidx/media3/common/util/WakeLockManager.java) owns a partial CPU lock. In Ready/Buffering it follows play intent, with an offload-sleep exemption; Pause, Idle/Ended and Release relinquish it. The application does not create a lock, keep the screen on, enable network wake mode, request battery-policy exemptions or manipulate standby. Long active playback may keep the CPU awake, as intended for screen-off audio. Actual Power/deep-standby behavior remains firmware-dependent and must be checked on supported TVs.
- [Android TV foreground-service guidance](https://developer.android.com/training/tv/playback/memory#foreground-services) requires background audio foreground services to stop after audio ends. Media3's default ten-minute user-engagement grace is unsuitable for that TV policy. The service sets the supported `setForegroundServiceTimeoutMs(0)` before creating its session and leaves notification promotion/demotion to Media3. It does not manually override foreground notifications or add a timeout workaround.
- [MediaSessionService 1.9.4](https://github.com/androidx/media/blob/1.9.4/libraries/session/src/main/java/androidx/media3/session/MediaSessionService.java) also documents that bound controllers prevent destruction and recommends releasing Activity controllers in `onStop`. A small started-controller owner now closes pending or connected futures on Stop and reconnects on Start. Late success/failure callbacks cannot repopulate a hidden or newly restarted Activity. Navigation within the Activity is unaffected; active audio remains owned by the same service/player.
- Framework binding groups are tracked with `Intent.FilterComparison`, including multiple distinct bindings. Idle shutdown waits until all clients unbind and Media3 has demoted foreground operation. The check is deferred by one main-loop turn after notification updates, then rechecks live bindings, state and retry intent; this is event ordering, not a time delay. A still-bound UI is kept usable for Play. Headless terminal Stop, sleep expiry, failure or inactive Pause stops the started service without waiting for task removal. A queued idle check cannot stop a rebind, resumed playback or bounded recovery.
- Task dismissal differs from Home: Media3 requires a non-foreground service to terminate on task removal. Such sessions, and stale Idle/Ended sessions, now use `pauseAllPlayersAndStopSelf()`. Foreground Ready/Buffering playback may continue when the background preference allows it. Normal Home/rebuffering/backoff behavior remains supported; an idle retry gap is not retained after explicit task dismissal.

Regression coverage includes nine idle-service lifetime cases, seven asynchronous controller ownership cases and four additional task-removal cases (20 new JVM tests). The former retry/task-removal assertion was updated to assert the necessary distinction between Home and task dismissal; cancellation and cleared-media assertions were strengthened. The release contract now requires the exact five intended permissions and local wake mode, while rejecting network/app-owned wake locks and screen-on overrides. The earlier blanket prohibition on `WAKE_LOCK` was replaced by this explicit reviewed policy.

Two new device tests are compiled: `PlaybackWakeLockTest` checks the real production player factory and pinned SDK lock release on Pause, Stop and Release; its synthetic MediaSource tests only SDK resource ownership, **not real radio playback**. Its read-only reflection is limited to pinned debug SDK internals, with no production reflection. `ServiceVisibilityTest` drives Activity Start/Stop, checks an idle bound service remains available, verifies cleanup after hiding the Activity and checks reconnect on return. It uses the platform's deprecated but own-app-scoped running-service query solely in instrumentation. Actual TV standby and remote behavior are not inferred from JVM tests.

Local checks on 25 November 2026 (WSL2 Linux, Node 24.16.0, JDK 21, SDK 36):

| Check                            | Result                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Debug Kotlin tests               | 81 passed; zero failures/errors/skips                                                             |
| Release Kotlin tests             | 81 passed; zero failures/errors/skips                                                             |
| Native lint                      | Debug and release passed; zero errors, 16 existing advisories each                                |
| Debug APK and Android test APK   | Built; six instrumentation tests compiled, not executed                                           |
| Release APK, AAB and R8 mapping  | Built successfully; local release outputs unsigned                                                |
| Release-script tests             | 40 passed, zero failures/skips                                                                    |
| Native artifact tests            | 5 passed                                                                                          |
| APK/AAB checks                   | Identity, version, TV filtering, debug signature/alignment and 64-bit/16-KB library checks passed |
| Permission in compiled artifacts | WAKE_LOCK verified in both debug and release APK badging                                          |

Native command: `./gradlew --no-daemon --max-workers=2 test lintDebug lintRelease assembleDebug assembleDebugAndroidTest assembleRelease bundleRelease`. Release scripts: `node --test scripts/tv-release.test.mjs scripts/android-scripts.test.mjs`; artifact tests: `python3 -B -m unittest discover -s scripts -p tv_artifacts_test.py`. The unchanged artifact validator was run against both generated variants and the release AAB.

The SDK XML-version notice and the instrumentation-only deprecated running-service query warning are non-fatal. No assertions were weakened, failures suppressed or dependencies reinstalled to pass tests. No Android device is attached and the WSL user lacks KVM access, so no instrumentation execution, measured wake-lock release, physical-TV standby, native audible playback or production-signing pass is claimed. Run `./gradlew connectedDebugAndroidTest` on a supported TV/emulator, then manually test Ambient Mode versus actual Power/standby, interruptions, Home, task dismissal, sleep expiry, Stop and exhausted retries before release.
No deployment branch, release version, data repository, stream URL, catalogue schema or playback-eligibility policy is changed by this follow-up.
