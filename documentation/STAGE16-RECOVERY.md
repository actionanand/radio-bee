# Stage 16 safe recovery and integration

Completed 2026-11-11 (Asia/Calcutta). All changes remain uncommitted and unstaged on `feature/16-catalogue-v2-browsing-ui` in `C:\AR_Files\code\radio-bee`.

## Source, ancestry and protection

- Source: `C:\Users\meeta\.codex\worktrees\stage9-client-integration\radio-bee`, branch `codex/stage9-v1.6-client-audit`, HEAD `1ea954c9c73c5b68c4ef036890e21db61b99292d`.
- Target: `feature/16-catalogue-v2-browsing-ui`, HEAD `319168c420de696dcf760e21d7a07f505ad1fdc6`, identical to the existing master commit.
- Common ancestor is the source HEAD. Target is three commits ahead: `32ce66b`, `819b2a5`, and PR #6 merge `319168c`. No history operation was performed.
- Target started clean. Source had 30 modified tracked files and 75 non-ignored untracked files.
- Fresh verified backup: `C:\AR_Files\code\radio-bee\tmp\stage16-recovery-20261111-003125`. `source-files/` contains all 105 changed/untracked files, with verified byte hashes; `source-tracked.patch` preserves the tracked diff. `before.json` records original status, branches, protected refs and hashes for 419 source files.
- The source checkout was read only. Its 419 tracked/non-ignored file hashes, original 105-line status and HEAD were rechecked unchanged. Ignored dependency/build/cache directories were not imported, reset or cleaned.
- Windows Git was used for source inspection; its Windows-style worktree metadata was not rewritten. Every Node/npm command ran through WSL2 Linux Node v24.16.0 after a Linux-platform check. Existing esbuild worked. No dependencies were installed or replaced.

## Recovery decisions

The problem was uncommitted Stage 16 work sitting on an ancestor of the already merged Stage 9 implementation. Copying the entire source checkout would overwrite newer baseline policy, recording, card and unrelated audit revisions. Recovery therefore used the reviewed Stage 16 paths and hunks only.

Six existing files were updated:

1. `angular.json`: add the explicit stage16 configuration; preserve baseline assets, production settings and budgets.
2. `scripts/preview-discovery.mjs`: version-selectable local metadata transport; v1 default, loopback binding and path guards retained.
3. `src/app/catalog/catalog.models.ts`: optional v2 language profile, themes and broadcaster fields.
4. `src/app/catalog/catalog.service.ts`: strict version dispatch, separate whole-snapshot v2 cache, advertised metadata loading, manifest consistency and canonical fallback for malformed optional index JSON. Baseline development-seed wording retained.
5. `src/app/catalog/station-browser.ts`: import the v2 view.
6. `src/app/catalog/station-browser.html`: select the v2 view only for schema 2; retain the existing v1 view.

Eight new source files were recovered:

7. `documentation/STAGE16-V2.md` (historical source validation explicitly identified).
8. `scripts/generate-v2-fixture.mjs`.
9. `src/app/catalog/catalog-v2.ts`.
10. `src/app/catalog/catalog-v2.spec.ts`.
11. `src/app/catalog/catalog-v2-loading.spec.ts`.
12. `src/app/catalog/v2-browser.ts`.
13. `src/app/catalog/testing/v2.fixture.ts`.
14. `src/environments/environment.stage16.ts` (explicit `AllowProhibitedRecording: false`, matching merged behavior).

Three additional review files were created:

15. `src/app/catalog/v2-browser.spec.ts`.
16. `documentation/STAGE16-RECOVERY.md` (this report).
17. `documentation/STAGE16-RECOVERY-INVENTORY.json`.

A target-only integration correction keeps Favorites and Listen Now outside collapsed Refine controls and restores the shared card's `data-category="favorites"` focus contract. Removing the final filtered favorite now focuses the reachable Favorites control. One Angular test and an actual-browser check cover this behavior. The shared card itself was not changed.

## Deliberate exclusions

The complete 105-path inventory, individual hashes and reasons are in `documentation/STAGE16-RECOVERY-INVENTORY.json`: 14 recovered, 39 already present identically, and 52 differing non-Stage-16 paths excluded. The two new audit files and one additional regression test are listed separately.

Historical Stage 9/v1.6 reports and generated screenshots were not imported into the feature tree. Different discovery/worldwide research helpers, old development-seed changes, source popup revisions/tests and unrelated policy/recording revisions were retained in the original checkout and backup. Existing target discovery fixtures/tests, independent unverified-playback gating, recording controls, playback recovery and popup implementation were preserved. No older media-engine, player, recording, eligibility or station-card file replaced the merged revision.

Fresh browser screenshots and temporary harnesses are in the ignored recovery directory; they were generated against the target build, not copied from historical source evidence. No package/lockfile, workflow, Android, signing, production-environment or data-repository file was modified.

## Validation

| Check                                                                                                | Final result                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                       | Pass, including final source pass                                                                                                                             |
| `npm run typecheck`                                                                                  | Pass, including final source pass                                                                                                                             |
| `npm run test:ci`                                                                                    | 334 passed across 27 files; 0 failures or skips                                                                                                               |
| `node --test scripts/*.test.*`                                                                       | 23 passed; 0 failures or skips                                                                                                                                |
| `npm run build:gh -- --configuration=production`                                                     | Pass                                                                                                                                                          |
| `npm run build:gh -- --configuration=stage16 --output-path=tmp/stage16-recovery-20261111-003125/web` | Pass                                                                                                                                                          |
| Production configuration                                                                             | Existing HTTPS `/v1/`, live-test flag false, unchanged from target HEAD                                                                                       |
| Built HTML                                                                                           | `/radio-bee/` in production and preview; accepts valid self-closing preview base tag                                                                          |
| Production assets                                                                                    | Development seed absent; v2 fixture imported only by tests                                                                                                    |
| Actual local v2 contract                                                                             | schema 2/catalogue 2.0.0; 117 identities, 71 stream-bearing, 46 discovery-only, 74 stream candidates                                                          |
| Fixture provenance                                                                                   | Recovered fixture exactly matches all advertised local dist/v2 data and locale JSON                                                                           |
| Browser data loading                                                                                 | 16 real local HTTP metadata requests; all 117 identities loaded without a development seed                                                                    |
| Geographic browser navigation                                                                        | India → state → district; World restoration; Canada → Ontario → Toronto without invented district                                                             |
| Filters                                                                                              | Language chips, all language classifications, genre, content theme, network, broadcaster and AND intersections checked against actual canonical records       |
| Sorting/grouping                                                                                     | All 9 deterministic sort modes; unique network and broadcaster memberships                                                                                    |
| Existing functionality                                                                               | Search, Listen Now, Favorites, Details/Escape and last-favorite keyboard focus checked; no links in station cards                                             |
| Availability separation                                                                              | 71 candidate-bearing versus 46 discovery records; discovery has no Play controls; Listen Now matches shared eligibility                                       |
| Responsive/accessibility                                                                             | 14 axe scans, 0 violations: en/ta/sa × light/dark × 375/1440 widths, plus Favorites and Details; mobile dark and desktop Tamil screenshots visually inspected |
| Preservation                                                                                         | 419 original source files unchanged; all 105 backups reverified; only six intended baseline tracked files differ                                              |
| Git                                                                                                  | `git diff --check` passes; no staged changes; source/target HEADs and master/main-github/main-android refs unchanged                                          |

The 334-test result comprises 322 existing merged-baseline tests, 11 recovered Stage 16 tests and one new focus test. The original source's 337 tests included 15 popup tests versus the target's 9, and 28 recording tests versus the target's 30. Those unrelated source suites were not substituted or skipped. All existing target tests remain intact.

The two existing style warnings remain: station-card.scss 3.01 kB and station-browser.scss 3.67 kB, against 2 kB warning budgets. No budget was increased. No failing application checks remain. A temporary artifact assertion was corrected to accept both normal and self-closing HTML base syntax; the application base URL was already correct.

V2 fixture SHA256: `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289`. Source of truth: actual `/mnt/c/AR_Files/code/radio-bee-data/dist/v2/`, interpreted using `docs/API-V2.md`. This task only read that repository.

Raw logs, contract evidence, preservation proof, temporary browser harness and fresh screenshots: `tmp/stage16-recovery-20261111-003125/validation/`. The browser evidence is `validation/screenshots/browser.json`.

## Remaining scope and review status

Ready for review on the requested local feature branch. There are six modified tracked files and eleven new review files, all unstaged. The original worktree and backup remain available. No commits, pushes, merges, rebases, resets, cleaning, pruning or deployment were performed; no protected branch moved.

Public v2 deployment, public HTTPS/CORS/artwork availability, physical Android behavior and a new real-station listening/recording session were not validated or claimed. Shared playback/recording regression tests pass and their implementation remains unchanged. Offering Play under the existing configured policy does not grant broadcaster authorization or guarantee every stream will play. Production continues to use `/v1/`; preview metadata interception is development-only and never proxies audio.
