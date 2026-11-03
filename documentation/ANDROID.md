# RadioBee Android releases

RadioBee — **Stay tuned. Stay buzzing.** The web source remains the application source. Capacitor generates the ignored `android/` project reproducibly; normal web development needs no Android SDK.

## Identity and branch responsibilities

| Setting                        | Value                                     |
| ------------------------------ | ----------------------------------------- |
| Application / application ID   | RadioBee / `com.actionanand.radiobee.app` |
| Web output / native base href  | `www` / `/`                               |
| Node / Java                    | 24.16.0 / 21                              |
| Minimum / compile / target SDK | 24 / 36 / 36                              |
| Build tools                    | 36.0.0                                    |
| Primary source                 | `master`                                  |
| Current implementation         | `feature/1-basic-radio`                   |
| Web deployment only            | `main-github` → `gh-pages`                |
| Android releases only          | `main-android`                            |

The locked Capacitor core/CLI/Android version is 8.5.1. Its installed Android template uses Android Gradle Plugin 8.13.0, Gradle wrapper 8.14.3 and Java 21 source/target compatibility. The template's SDK values are already 24/36/36; our patch enforces them and explicitly selects build tools 36.0.0. AGP 8.13 supports API 36 and requires at least Gradle 8.13 / JDK 17; Capacitor requires Java 21. See [AGP compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes) and [Gradle Java compatibility](https://docs.gradle.org/current/userguide/compatibility.html). Keep the checked-in lockfile; no framework downgrade or forced installation is necessary.

## Local commands

Install Node, Java 21, Android SDK platform 36/build tools 36.0.0 and ImageMagick. Set `ANDROID_HOME` and `JAVA_HOME`, and put `magick` on PATH. Linux ImageMagick 6 `convert` is supported; Windows' unrelated `convert.exe` is never invoked.

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm run test:ci
npm run test:android-scripts
npm audit --omit=dev
npm run android:sync
npm run android:open
npm run android:release
```

`android:sync` explicitly builds production Angular with `/` as base href, adds Android if absent, syncs Capacitor, patches native settings and generates artwork. `android:sync:only` performs the same native sequence using existing `www`; CI uses it after its explicit production build. `android:add` only generates the platform. `android:patch` and `android:assets` can be rerun independently. Never use `build:gh` (which uses `/radio-bee/`) for native assets.

`android:release` produces **unsigned development** APK/AAB and the R8 mapping under `releases/`. They are explicitly suffixed `-unsigned`; production signing is mandatory in CI. Local commands never increment the version automatically or create a keystore. Changing native files under ignored `android/` persists locally, but changes needed on CI must also be captured in a reviewed patch or source resource.

## CI release pipeline and version reservations

`.github/workflows/android-build.yml` runs on pushes to `main-android` and manual dispatches selecting `main-android`. A job-level ref guard rejects every other branch. The existing GitHub Pages workflow remains unchanged and builds only `main-github`.

Branch-specific concurrency with `cancel-in-progress: false` serializes allocation and building. Checkout explicitly resolves the latest `main-android`, rather than using an old event SHA. After locked installation, lint, typecheck and both test suites, the reservation helper fetches the branch again and requires it to match the validated checkout. It increments the code exactly once and commits **only** `android-version.json` with `[skip ci]`, then performs a normal fast-forward push. A concurrent writer causes rejection; no stale version commit is rebased or force-pushed. A changed branch requires rerunning validation from a fresh checkout. Compilation begins only after that push succeeds.

`android-version.json` is the single version source. Initial values are code `1`, name `1.0.0`; the first successful reservation builds code `2`. Each workflow attempt that reaches compilation reserves one new code, including reruns. A failed build may consume a persisted code. An allocation rejected before persistence never compiles. `github.run_number` is not used. GitHub concurrency may replace pending runs; only attempts actually proceeding to compile require a reservation. Do not restore an older version file when integrating source changes into `main-android`.

Valid codes are integers 1–2100000000. Version names are three nonnegative safe integer components without leading zeros or prerelease suffixes. Incrementing beyond either numeric limit fails without changing the file. Routine CI preserves the name. To prepare a visible version change:

```bash
npm run android:version        # code +1 only
npm run android:version:patch  # 1.0.0 -> 1.0.1, code +1
npm run android:version:minor  # 1.0.1 -> 1.1.0, code +1
npm run android:version:major  # 1.1.0 -> 2.0.0, code +1
```

Review and commit manual version changes normally; CI then adds its own one-code reservation. Never reduce the persisted code on `main-android`.

After reservation, CI builds Angular, generates/syncs/patches Android, generates artwork, runs Gradle clean/assembleRelease/bundleRelease, and collects nonempty unsigned files plus R8 mapping. Clean builds and removal of expected old outputs prevent stale output collection. Signing uses temporary candidates, verifies both signatures, then atomically renames each verified file. Failures remove both signed-looking outputs and all candidates. CI has **no unsigned fallback**.

## Artwork and release files

`src/assets/icon/radio-bee.png` is the unchanged canonical artwork. The ImageMagick helper preserves aspect ratio, adds padding and validates PNG dimensions. It creates five launcher densities, round icons, adaptive foreground/background resources and splash artwork. The splash theme references the generated padded logo. Original artwork and both favicon assets remain unchanged.

For name `1.0.0`, code `2`, verified outputs are:

```text
releases/RadioBee-1-0-0-2.apk
releases/RadioBee-1-0-0-2.aab
releases/RadioBee-1-0-0-2-mapping.txt
releases/playstore-icon.png
```

The store icon is opaque 512 × 512 PNG. R8 and resource shrinking are enabled, with Capacitor bridge/plugin and JavaScript-interface keep rules. Retain the exact matching mapping for each published version to deobfuscate crash reports in Play Console. Generated native patches do not add plugins or permissions.

Download `radiobee-android-1.0.0-2` from the completed Actions run's **Artifacts** section (30-day retention). Only exact verified current-version files are uploaded, not historical or unsigned files. Approved outputs are also committed to `releases/` on `main-android` with `[skip ci]`. The release-output commit alone may be rebased onto unrelated branch updates; conflicts or rejected pushes fail safely without force-pushing. A failed output commit can leave a verified downloadable Actions artifact; fix branch permissions and run a new build, which reserves a new code. The job summary records the actual reserved build SHA, versions, branch, filenames, signature status, mapping and artwork result.

## Keystore creation and secure backup

Generate a signing identity **once**, only when needed, on a trusted machine with Java keytool. `npm run generate-keystore` reads `KEYSTORE_PASSWORD` from the environment, requires at least 12 characters and refuses password arguments or an existing keystore. It generates RSA 3072 / PKCS12 directly, alias `radiobee`, with no unencrypted PEM intermediate. The filename is `release-keystore.jks`; the extension does not determine its format.

For Bash, enter the password without echo or shell-history exposure:

```bash
read -r -s -p 'Keystore password: ' KEYSTORE_PASSWORD; printf '\n'
export KEYSTORE_PASSWORD
npm run generate-keystore
npm run keystore:type
unset KEYSTORE_PASSWORD
```

For PowerShell:

```powershell
$securePassword = Read-Host 'Keystore password' -AsSecureString
$env:KEYSTORE_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
try {
  npm run generate-keystore
  npm run keystore:type
} finally {
  Remove-Item Env:KEYSTORE_PASSWORD
  $securePassword.Dispose()
}
```

Keep encrypted offline backups of the keystore, alias and password in separate secure storage. Reuse the signing identity for updates. Do not generate an identity during CI or replace an existing app's signing key casually.

## GitHub Actions Secrets

Under **Repository Settings → Secrets and variables → Actions**, add these repository secrets:

| Secret              | Value                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Complete Base64 encoding of the keystore                         |
| `KEYSTORE_PASSWORD` | Store password                                                   |
| `KEY_ALIAS`         | `radiobee` for the supplied generator                            |
| `KEY_PASSWORD`      | Private-key password; set equal to the store password for PKCS12 |

Encode into an ignored local file without printing the keystore:

```bash
# Linux
base64 -w 0 release-keystore.jks > keystore.b64.txt
# macOS
base64 < release-keystore.jks | tr -d '\n' > keystore.b64.txt
```

```powershell
[IO.File]::WriteAllText((Join-Path $PWD 'keystore.b64.txt'), [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PWD 'release-keystore.jks'))))
```

Copy the file contents into `KEYSTORE_BASE64` through GitHub's secret editor, then delete the export securely according to your workstation policy. Base64 is encoding, not encryption. No signing material belongs in Git.

All four secrets are required. CI decodes only into a private runner temporary directory, detects JKS/PKCS12 using keytool and verifies the alias is a private-key entry. PKCS12 uses the store password for the key; JKS uses `KEY_PASSWORD`. Credentials are passed with `:env` / `env:` options, never literal command arguments. Tool output is captured so failures cannot dump credentials. An `always()` workflow cleanup removes the temporary keystore and candidate files even if signing or publication fails; the signing helper also cleans in `finally`.

APK signing uses build-tools 36.0.0 zipalign (16KB alignment) and apksigner. It checks the signature and alignment. AAB signing uses jarsigner and requires its positive `jar verified.` output, since jarsigner can exit zero for unsigned inputs. Self-signed upload certificates are expected; certificate trust warnings alone are not signature failures.

For independent downloaded-artifact verification, using the matching SDK tools:

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs releases/RadioBee-1-0-0-2.apk
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 4 releases/RadioBee-1-0-0-2.apk
jarsigner -J-Duser.language=en -verify -verbose -certs releases/RadioBee-1-0-0-2.aab
```

Require `jar verified.` and compare certificate fingerprints to your trusted signing identity. Unsigned artifacts are neither install-ready nor Play-ready.

## One-time repository setup and first build

1. Review/commit this implementation on `feature/1-basic-radio` and integrate the approved source into `main-android` using your normal repository process. Keep `master` as primary source and `main-github` for web only. This implementation does not create branches, push, merge or configure secrets for you.
2. Create/back up the intended upload keystore and configure all four secrets above.
3. Under Settings → Actions → General → Workflow permissions, permit read/write repository contents. Ensure organization policy and protection/rulesets for `main-android` allow the Actions bot's version and release-output commits. Required PRs, signed-commit rules or status checks may otherwise block direct bot pushes. Use a narrowly scoped repository-approved exemption or approved workflow arrangement; the workflow never bypasses protections or force-pushes. `contents: write` alone cannot override protection.
4. Ensure `main-android` contains the workflow and current version file. Push an approved source change without `[skip ci]`, or select **Actions → RadioBee Android APK and AAB → Run workflow → main-android**. For dispatch visibility, GitHub requires the workflow to exist on the default branch too; its job guard still restricts builds to `main-android`.
5. Inspect the run summary and download the artifact. Verify filenames, versions, signatures and on-device playback. The initial untouched version file reserves code 2 / name 1.0.0.

Bot commits contain `[skip ci]`; pushes made with `GITHUB_TOKEN` also do not trigger another push workflow. Manual dispatch remains available after skipped commits. Do not replace the token with a personal token without reviewing recursion and privilege implications.

## Play Console and troubleshooting

CI does not publish to Google Play or create a GitHub Release. Set up the application ID in Play Console, Play App Signing and the matching upload certificate, then manually upload the verified AAB. Complete listing assets, privacy policy, Data Safety, content rating, testing and current Console requirements before rollout. Keep the higher versionCode and matching mapping for every upload. Test a device/emulator release before production, including HTTPS streams and plugins after R8.

- **No build:** select `main-android`; check skipped commits and workflow availability on the default branch.
- **Reservation fails:** the branch advanced or bot push was denied. Resolve permissions, rerun from the latest checkout; never manually reuse a consumed code.
- **Missing/invalid secret or alias:** verify all four secret names, Base64 export, store password, PKCS12/JKS type and private-key alias. CI fails and publishes no unsigned fallback.
- **Gradle/toolchain failure:** check Java 21, `ANDROID_HOME`, platform 36, tools 36.0.0 and access to Google/Maven repositories. SDK installation alone does not prove compilation.
- **Unsupported native template/custom network config:** review the native customization and extend the managed patch with tests rather than replacing user files wholesale.
- **Artwork failure:** install ImageMagick and verify canonical PNG availability; source assets are never rewritten.
- **Play version conflict:** retain the highest persisted code and reserve a larger one. Never reset the Android branch version from another branch.
- **Plugin regression after shrinking:** investigate the actual plugin and add narrowly scoped keep rules; the bridge/plugin rules are already retained.

## Security, privacy and validation

Release WebViews disable debugging, mixed content and Capacitor logging. HTTPS and the INTERNET permission remain available for authorized radio streaming. Cleartext HTTP streams are blocked intentionally. The manifest disables app backups, preserves unrelated native settings and permissions, and introduces no microphone, SMS, contacts, location or storage permission. Recording and Media3 playback are outside this change. Existing JavaScript functionality and locked dependencies remain intact.

`test:android-scripts` uses temporary native/Git fixtures and mocked signing tools. It checks version transitions/limits, persisted reservations and stale reads, patch idempotency, asset paths, filenames, branch isolation, signing verification ordering and failure cleanup. These tests do not prove real cryptographic signatures or Android runtime behavior. See [validation results](ANDROID-VALIDATION.md) for the checks actually performed in the implementation environment; the first Actions run must establish native compilation and real signing success.
