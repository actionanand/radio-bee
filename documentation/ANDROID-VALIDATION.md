# Android automation validation

Validated on 3 November 2026 in the Windows implementation checkout, branch `feature/1-basic-radio`.

| Check                                                | Result                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                             | Passed; 700 packages installed from the existing lockfile                                                                          |
| `npm run build`                                      | Passed; production output in `www`                                                                                                 |
| `npm run lint`                                       | Passed                                                                                                                             |
| `npm run typecheck`                                  | Passed                                                                                                                             |
| `npm run test:ci`                                    | Passed; 2 tests in 2 files                                                                                                         |
| `npm run test:android-scripts`                       | Passed; 14 tests                                                                                                                   |
| `npm audit --omit=dev`                               | Passed; 0 production vulnerabilities                                                                                               |
| Capacitor add/sync against installed 8.5.1           | Passed; 7 existing plugins discovered                                                                                              |
| Native patch against actual generated template       | Passed; a repeated run was byte-for-byte identical across managed Gradle/manifest/theme/ProGuard files                             |
| Actual ImageMagick asset generation                  | Passed; all 17 PNG dimensions validated, including the 512 × 512 store icon; store artwork visually inspected for padding/clipping |
| Android workflow YAML parse                          | Passed; branch trigger and 19 steps parsed                                                                                         |
| Prettier and Git whitespace checks                   | Passed                                                                                                                             |
| Gradle APK/AAB compilation                           | Not run; Java and Android SDK are unavailable locally                                                                              |
| Real keystore generation or cryptographic signing    | Not run; no signing identity requested or credentials supplied                                                                     |
| Device/emulator playback and Play Console acceptance | Not run; requires the signed CI artifacts and target devices/Console                                                               |

The host supplied Node 24.22.1 rather than the CI-pinned 24.16.0. npm was absent from PATH, so validation used an isolated npm 11.6.2 runtime in ignored `tmp/`; the reported npm commands were invoked through that runtime. ImageMagick 7.1.2-35 portable was likewise used only from ignored `tmp/`. Neither tool changed the project's dependency manifest or lockfile. Windows sandbox restrictions prevented temporary Git/file renames, so the fixture suite ran with the approved execution permission outside that restriction.

The full installation audit reported 24 moderate development/transitive findings. The separately requested production-only audit reports zero. No dependency versions were changed and no forced audit fix was applied.

The signing suite uses fake keystore bytes and mock tools exclusively in disposable fixtures. It validates PKCS12/JKS password selection, private-key alias rejection, ordering, promotion, failure cleanup and secret handling; it does not establish cryptographic validity. The version reservation suite creates disposable local Git repositories, checks persisted codes 2 then 3, and proves that a stale checkout fails without incrementing. The release collection suite rejects stale/empty outputs and preserves approved historical artifacts.

No repository commit, branch creation, push, merge, GitHub secret modification or real signing-key creation was performed. The web workflow, lockfile, original icon and favicon files are unchanged. Generated `android/`, `www/` and temporary validation tools are ignored. The generated store icon remains available at `releases/playstore-icon.png` for review.

Before production use, complete the [one-time repository setup and first build](ANDROID.md#one-time-repository-setup-and-first-build). That run must establish Gradle compilation, real signatures, bot pushes and downloadable artifacts. Then verify on-device HTTPS radio behavior and complete the Play Console release process.

## Exact changed-file inventory

Paths are relative to the repository root `C:\AR_Files\code\radio-bee`.

Modified:

- `.gitignore`
- `README.md`
- `capacitor.config.ts`
- `package.json`

Created:

- `.github/workflows/android-build.yml`
- `android-version.json`
- `scripts/android-version.cjs`
- `scripts/bump-android-version.js`
- `scripts/reserve-android-version.mjs`
- `scripts/prepare-android.mjs`
- `scripts/patch-android.mjs`
- `scripts/generate-android-assets.mjs`
- `scripts/build-android.mjs`
- `scripts/sign-android.mjs`
- `scripts/generate-keystore.mjs`
- `scripts/detect-keystore-format.mjs`
- `scripts/android-scripts.test.mjs`
- `documentation/ANDROID.md`
- `documentation/ANDROID-VALIDATION.md`
- `releases/playstore-icon.png`

The generated local `android/`, `www/`, Angular cache and temporary tool directories are ignored outputs, not source changes. `package-lock.json` and `.github/workflows/gh-pages.yml` have no diff.

## Added npm scripts

All existing scripts and dependencies remain. The following 16 scripts were added:

```text
test:ci
typecheck
android:add
android:sync
android:sync:only
android:patch
android:assets
android:open
android:release
android:version
android:version:patch
android:version:minor
android:version:major
generate-keystore
keystore:type
test:android-scripts
```

The production workflow invokes the signing helper directly with its step-scoped GitHub Secrets.
