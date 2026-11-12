# Stage 16 v2 client integration

Recovered on 2026-11-11 onto feature/16-catalogue-v2-browsing-ui at 319168c. The validation section below records the original source run; see STAGE16-RECOVERY.md for target-branch validation and the exact recovery inventory. Historical screenshots/reports were left in the source worktree and were not imported.

Production configuration remains on `/v1/`. The separate `stage16` build uses the future HTTPS `/v2/` base and no development seed. No data files or permissions are rewritten. The actual local `radio-bee-data/dist/v2` is the integration source, with schema 2/catalogue 2.0.0: 117 identities, 71 stream-bearing stations, 46 discovery records and 74 stream candidates.

The v2 loader uses a separate `radiobee.catalog.v2:<base>` cache, loads advertised tables and locales, rechecks the manifest before replacing a complete snapshot, and rejects v1 input. Canonical records drive navigation rather than trusting a potentially stale browse index. The independent migrations document retains format version 1. Production HTTPS/path checks remain in place.

The v2 view provides World-to-location breadcrumbs, children including skipped district levels, language chips and classification filters, genre/theme filters, network and broadcaster filters/grouping, and deterministic sorting. Broadcaster grouping falls back to namespaced network groups for unmapped organizations. Language changes only filter metadata and never select or replace streams. Existing cards, Details, Favorites actions, eligibility and persistent player remain shared with v1.

## Local preview

Use WSL2 Linux Node and the existing dependencies:

```bash
node -e 'if(process.platform!=="linux")process.exit(1)'
npm run build:gh -- --configuration=stage16 --output-path=tmp/stage16-web
RADIOBEE_API_VERSION=v2 \
RADIOBEE_WEB_ROOT=tmp/stage16-web/browser \
RADIOBEE_DATA_ROOT=/mnt/c/AR_Files/code/radio-bee-data/dist/v2 \
node scripts/preview-discovery.mjs
```

Open `http://localhost:4312/radio-bee/home`. Only catalogue requests are remapped to actual locally served files. Audio remains direct HTTPS. This does not establish deployed v2 availability or broadcaster authorization.

`scripts/generate-v2-fixture.mjs` generates the test-only snapshot from the actual built contract. It is not an application import or production asset. Tests cover actual counts, version rejection, sparse ancestry, filter intersections, explicit language classifications and preservation of playback metadata during sorting/filtering.

## Changed files for this Stage 16 work

Existing client changes from earlier stages were preserved. The Stage 16 integration touches:

- `angular.json`
- `src/app/catalog/catalog.models.ts`
- `src/app/catalog/catalog.service.ts`
- `src/app/catalog/station-browser.ts`
- `src/app/catalog/station-browser.html`
- `src/app/catalog/catalog-v2.ts` (new)
- `src/app/catalog/catalog-v2.spec.ts` (new)
- `src/app/catalog/catalog-v2-loading.spec.ts` (new)
- `src/app/catalog/v2-browser.ts` (new)
- `src/app/catalog/testing/v2.fixture.ts` (generated, test-only)
- `src/environments/environment.stage16.ts` (new)
- `scripts/generate-v2-fixture.mjs` (new)
- `scripts/preview-discovery.mjs` (extends the existing local integration helper)
- `documentation/STAGE16-V2.md`
- `documentation/stage16/browser.json` and its screenshots

The stream/discovery metadata filter distinguishes records with candidate URLs from discovery-only records. Listen Now uses the existing PlayerService eligibility function; stream-bearing counts never imply permission or reachability. The local preview does not proxy audio. Artwork still resolves against the correct future HTTPS v2 base, so normal image fallback can appear before that endpoint is deployed.

Remaining release checks: reviewed v2 deployment, actual public HTTPS/CORS and referenced artwork, and native Android validation. This task does not establish new live-stream playback outcomes or broadcaster authorization. The data repository was read only; no commits, pushes, merges or deployment were performed.

## Validation results (2026-11-10)

All Node/npm commands used WSL2 Linux Node v24.16.0 with a Linux-platform guard and the existing dependencies.

| Check                          | Result                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                 | Pass                                                                                                                                  |
| `npm run typecheck`            | Pass                                                                                                                                  |
| `npm run test:ci`              | 337 tests, 26 files passed                                                                                                            |
| `node --test scripts/*.test.*` | 23 passed, 0 failed                                                                                                                   |
| Production Pages build         | Pass; `/radio-bee/` base and `/v1/` endpoint retained                                                                                 |
| Opt-in Stage 16 build          | Pass                                                                                                                                  |
| Production seed exclusion      | Pass; no development-seed asset; v2 fixture imported by specs only                                                                    |
| Browser HTTP integration       | 16 actual metadata requests; all 117 identities loaded                                                                                |
| Browser filters/grouping       | Canada → Ontario → Toronto; India/Tamil/music intersection; 117 unique broadcaster-grouped IDs                                        |
| Browser availability           | 71 stream-bearing / 46 discovery-only; no discovery Play controls; Listen Now matches 71 eligible cards under existing relaxed policy |
| Browser accessibility          | 10 axe scans, 0 violations: en/ta/sa at 375/1440, Favorites, Details, dark mobile/desktop                                             |
| Visual inspection              | Mobile dark/collapsed controls, desktop Tamil and compact Details screenshots inspected                                               |
| `git diff --check`             | Pass                                                                                                                                  |

The two existing stylesheet warnings remain: `station-card.scss` 3.01 kB and `station-browser.scss` 3.67 kB against 2 kB warning budgets. Budgets were not increased.

No new live-audio or Android-device playback claim is made. The 71 controls reflect the current configured eligibility policy, not 71 independently auditioned streams or newly granted broadcaster permission. Production configuration was not switched to v2.

Test snapshot generation SHA256: `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289`. The fixture is generated from canonical local build files, not independently edited station inventory. Browser evidence is in `documentation/stage16/browser.json` and the adjacent PNG files.
