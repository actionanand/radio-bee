# Stage 16 independent review corrections

Validated 2026-11-11 (Asia/Calcutta) on `feature/16-catalogue-v2-browsing-ui`, HEAD `319168c420de696dcf760e21d7a07f505ad1fdc6`. All changes remain unstaged. No commits, pushes, merges, deployment or protected-branch updates were performed.

## Exact corrected-file inventory

These are the changes for this review, relative to the recovered implementation. Earlier recovery changes remain available separately.

| File                                                  | Correction                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/catalog/catalog-v2.ts`                       | Keep existing ancestry/filter/sort APIs; export strict validation from its focused module; add canonical location membership counts.                                     |
| `src/app/catalog/catalog-v2.validation.ts` (new)      | Complete contract-specific v2 snapshot validation. Shares only existing URL/count utilities, never routes schema 2 through the v1 parser.                                |
| `src/app/catalog/catalog-v2-validation.spec.ts` (new) | 141 validator tests: corruption cases, positive contract/fallback cases and programme schedules.                                                                         |
| `src/app/catalog/testing/v2-invalid.fixture.ts` (new) | 131 named mutation recipes, not another station inventory. Uses the generated authoritative v2 fixture.                                                                  |
| `src/app/catalog/catalog-v2-loading.spec.ts`          | Eight added regressions; independent cloned JSON responses; assert catalogue content and cache bytes survive invalid refreshes, and invalid offline caches are rejected. |
| `src/app/catalog/v2-browser.ts`                       | Populated navigation/counts, visible primary controls, localized warnings/empty results, filter reset and focus, refresh reconciliation.                                 |
| `src/app/catalog/v2-browser.spec.ts`                  | Ten added UI regressions covering controls, destinations, sparse paths, locales, reset/focus, persistence warnings and removed geography.                                |
| `documentation/STAGE16-REVIEW-CORRECTIONS.md` (new)   | This inventory, evidence and limitations.                                                                                                                                |

The original `catalog-v2.spec.ts` and generated v2 inventory fixture are unchanged. Temporary harnesses, logs and screenshots are under `tmp/stage16-review/`; historical recovery reports/screenshots were not imported or overwritten.

## Validation root causes and fixes

The former validator checked selected references and a subset of counts, but did not provide the complete v1 safety boundary or the full v2 contract. Reusing allowlisted filenames without matching keys allowed swapped tables; incomplete record/provenance validation allowed malformed station/stream/organization metadata; missing global identity, migration and derived-count checks allowed contradictory snapshots.

The new focused validator checks:

- Manifest fields, schema/semantic version, real calendar publication date, exact locales/default, unique ISO country codes, disclaimer, all nine safe nonnegative integer counts, exact required and optional file-key mappings, and localization root.
- Required/allowed record fields, nonempty names and IDs, canonical ID formats and unique table identities, native language names, source provenance/HTTPS, network metadata and country containment, optional registries and sourced broadcaster relationships.
- Globally unique stream IDs and normalized URLs, supported contract enums, credential-free HTTPS, verified/unverified timestamps, direct-listening review/provenance/recording/redistribution metadata. Playback eligibility itself is unchanged.
- Normalized network/programme names and aliases across streamed and discovery records, nonempty playable collections and strictly metadata-only discovery records, valid public discovery websites and website kind.
- Geography types, country roots, parent levels, cycles, same-country containment and complete nonconflicting station ancestry. Localities may legitimately have district, state or country parents. No missing district is manufactured.
- Optional language-profile classifications, primary/documented languages, completeness, evidence and review dates; sourced programme schedules including IDs, days, times, IANA zones and official/publisher provenance; geography evidence; content theme references/genre membership and descriptions.
- Independent migration format version 1, unique removed IDs, valid playable canonical targets and provenance, null provenance for unavailable mappings. Historical removed IDs may still be legitimate discovery-only identities, as in the actual contract.
- Nonempty localization dictionaries, translation value types and required English catalogue title; every derived count including strict production-eligible and stream-candidate counts.

A malformed or stale optional browse-index object is discarded, and canonical records drive facets. A retrieved index JSON syntax error still takes the existing canonical fallback. Missing advertised files remain a refresh failure. Invalid canonical data cannot replace the active catalogue or overwrite its saved cache. Tests now clone mock responses so corruption cannot accidentally mutate the already validated in-memory snapshot through test-only aliasing.

## Navigation and usability

All 131 geographic records remain intact. Exactly 40 have no descendant station in the pinned snapshot; they are omitted from navigable destinations. India therefore no longer offers empty Maharashtra or Delhi destinations. Populated choices show canonical station counts, independent of current search/language/Favorites/Listen Now filters. Breadcrumbs and sparse Canada → Ontario → Toronto navigation remain functional.

Search, UI Language and Theme are always visible outside advanced filters, with localized accessible names. Catalogue storage and Favorites persistence warnings are visible polite status messages in English/Tamil/Sanskrit. Storage detail remains exact in English; other locales receive a localized summary covering saved catalogue/preference failures.

Empty results have a localized message and a reachable Clear Filters action. Reset clears geographic/language/genre/theme/network/broadcaster/classification/availability filters, search, grouping, sorting and view-only Favorites/Listen Now flags; it retains saved favorites, locale/theme preferences and player state, and focuses visible Search. A valid catalogue refresh that removes the selected geographic destination clears that stale selection safely.

## Added regression counts

- Validator: **141 new tests** (131 corruption cases, six invalid-schedule cases and four positive/fallback cases).
- Loading/cache: **8 new tests**, **12 total** in the file.
- Browser component: **10 new tests**, **11 total** in the file; prior last-favorite focus coverage retained.
- Overall: **159 added tests**, **493 passed across 28 Angular test files**, no failures/skips. All pre-existing tests remain enabled.

The independently reported duplicate stream IDs, invalid count fields, HTTP station websites, missing publication date, invalid migration mappings, conflicting network/country relationship and duplicate programme identities each have named negative regressions. Representative reported failures additionally test unchanged active catalogue content and byte-identical last-known-good cache preservation.

## Final checks and evidence

All Node/npm execution used WSL2 Linux Node v24.16.0 with platform guards and existing dependencies. No reinstall or package/lockfile changes.

| Check                                            | Result                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                   | Pass                                                                                                                                                               |
| `npm run typecheck`                              | Pass                                                                                                                                                               |
| `npm run test:ci`                                | 493/493; 28 files passed                                                                                                                                           |
| `node --test scripts/*.test.*`                   | 23/23; no failures or skips                                                                                                                                        |
| `npm run build:gh -- --configuration=production` | Pass                                                                                                                                                               |
| Stage 16 build to `tmp/stage16-review/web`       | Pass                                                                                                                                                               |
| Production environment                           | Unchanged `/v1/`, live-test flag false                                                                                                                             |
| Stage 16 environment                             | Unchanged explicit HTTPS `/v2/`, live-test flag false                                                                                                              |
| Built base href                                  | `/radio-bee/` in both artifacts                                                                                                                                    |
| Production development-seed asset                | Absent; test fixtures remain spec-only imports                                                                                                                     |
| Local generated contract/fixture                 | Exact match: schema 2/catalogue 2.0.0; 117 identities, 71 streamed, 46 discovery-only, 74 candidates                                                               |
| Local browser                                    | Actual HTTP-built snapshot, not seed; geographic paths/counts, all facets, all nine sorts, grouping, search, Listen Now, Favorites, Details and reset/focus passed |
| Local accessibility                              | 18 scans, 0 violations: en/ta/sa × light/dark × 375/1440 widths, plus Favorites, Details, empty/reset and persistence warnings                                     |
| Public HTTPS API                                 | All 16 JSON responses 200; strict final validator passed; expected 117/71/46/74 counts; Access-Control-Allow-Origin `*` observed                                   |
| Actual public browser/CORS                       | Chrome loaded all 117 via 16 direct public HTTPS `/v2/` JSON responses, no v2 metadata interception; one additional axe scan, 0 violations                         |
| Total accessibility                              | **19 scans, 0 violations**                                                                                                                                         |
| Visual checks                                    | Mobile dark controls and desktop Tamil cards inspected; actual public API desktop screenshot inspected                                                             |
| Git                                              | `git diff --check` passes; all changes unstaged; HEAD/protected refs unchanged                                                                                     |

Public integration used `https://actionanand.github.io/radio-bee-data/v2/` from a local preview origin. The separate public-browser server only retained the historical v1 interception rule, so all v2 JSON requests went directly to the public host. This is distinct from the main local snapshot and unit-fixture tests.

The first combined public-browser attempt encountered WSL localhost-port forwarding startup failure before the page loaded. The isolated public-browser retry passed, with bounded connection-refused startup retries. The successful local and public evidence is recorded separately; this was not an unresolved catalogue/CORS application failure.

Local fixture SHA256 remains `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289`. Primary raw evidence:

- `tmp/stage16-review/angular.log`, `node.log`, `lint.log`, `typecheck.log`, `production.log`, `stage16-build.log`.
- `tmp/stage16-review/contract.json`: actual local contract, fixture equality and artifact checks.
- `tmp/stage16-review/local-browser.json`: 18 passed local scans and functional checks.
- `tmp/stage16-review/public-api.json`: real HTTPS responses, counts, headers and strict validation.
- `tmp/stage16-review/public-browser.json`: actual Chrome public-API/CORS result and response URLs/statuses.
- `tmp/stage16-review/screenshots/`: fresh responsive and public-browser screenshots.

Real keyboard checks also passed in the public browser session: Tab from Search to UI Language to Theme, and Enter activation of Clear Filters from empty results returning focus to Search.

## Preservation and remaining limits

Stage 9 player, media engine, recording, eligibility, shared station cards, v1 parser and both environment configurations remain unchanged. No `radio-bee-data` files were modified. The original recovery backup remains present with all 105 backed-up changes reverified; all 419 original source-worktree file hashes are unchanged. Protected master/main-github/main-android refs remain unchanged.

The existing style warnings remain: station-card.scss **3.01 kB**, station-browser.scss **3.67 kB**, against **2 kB** warning budgets. No budget was increased; no unresolved test/build/accessibility failure remains.

Public metadata and CORS were genuinely checked in Chrome from localhost; the production client was not deployed or changed to v2. Physical Android/WebView behavior, a new audible station session, native recording and sustained live-stream availability were not revalidated. Existing playback/recording tests pass, and no broadcaster rights or verification metadata was rewritten. All changes are available unstaged for final review.
