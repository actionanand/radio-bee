# Stage 16 routable radio directory

Latest focused refinements and validation: [Stage 16 usability refinements](STAGE16-USABILITY-REFINEMENTS.md). The original directory validation below records the earlier reviewed baseline.

The opt-in Stage 16 build has a desktop sidebar, native-dialog mobile drawer, visible Search/UI Language/Theme controls, and shared directory routes. Production still uses the classic `/home` browser with the `/v1/` endpoint; the new shell requires the configured HTTPS `/v2/` endpoint. No data or eligibility policy is changed.

## Navigation and station ownership

Routes below are relative to the existing `/radio-bee/` base:

- `/home`: ten **Featured Radios**. Selection uses ten explicitly curated canonical IDs highlighting Nagercoil/Kanyakumari, Tamil radio and international communities, including discovery-only entries. Missing IDs are skipped and slots filled by normalized canonical name order, with ID tie-breaking. See the linked usability report for the exact selection. This is not a popularity or availability ranking.
- `/world`, `/world/:continent`, then the actual location ID ancestry, for example `/world/asia/in/in-tn/in-tn-kanyakumari`. Sparse paths use only real ancestors. Contradictory paths are rejected. Destination counts are canonical membership counts, independent of active filters; empty destinations are omitted.
- `/languages`, `/genres`, `/networks`, `/broadcasters` and their `/:facetId` pages.
- `/favorites`, `/listen-now`, `/radios/:stationId`.

All station identities, aliases, locations, descriptions, frequencies, genres, languages, broadcaster/network relationships, artwork references and websites come from the validated catalogue. Only the deterministic country-to-continent mapping is client-owned. Unknown future country codes fall back to Other; no geography records are fabricated.

Kanyakumari preserves ten identities, two with stream candidates and eight discovery-only. `air-nagercoil` remains a single identity. Its frequency is currently null in the catalogue and is omitted rather than inferred from a name. The station page links the full geographic ancestry and shows nine other district stations.

Cards show up to three documented language labels with an extra-count indicator. The station page exposes the full list through a native keyboard-operable disclosure when needed. Names, artwork and Details navigate internally. Play remains a separate button calling the existing PlayerService. Validated official/provider websites appear only on the dedicated details page or existing legacy details popup; there are no external card listening redirects.

## Player, focus and compatibility

App's existing root PlayerComponent and PlayerService remain the sole player. No new audio element, engine or recording service is created. The shell scrolls above the root player; existing safe-area handling remains in place. Shared card routing is opt-in (`directoryLinks` defaults false), preserving legacy popup behavior and v1 presentation.

Route navigation focuses the new h1. Query-only filtering and live search preserve input focus. Toolbar Search always opens global World results and drops scoped filters from that results URL; the first navigation pushes a history entry and later query edits replace it, preserving the original scoped page for Back. Reset returns focus to Search; removing the last routed favorite focuses its heading. The modal drawer uses native focus containment, Escape/backdrop dismissal and menu-button restoration. Simulated Ionic Android Back closes the drawer before using owned route history. Physical Android testing is separate.

Existing v2 validation, snapshot/cache behavior, original browsing helpers, Favorites storage, playback recovery, diagnostics, eligibility, volume/mute and recording implementations are unchanged.

## Changed files for this redesign

- `src/app/app.routes.ts`
- `src/app/directory/directory.model.ts`
- `src/app/directory/directory.labels.ts`
- `src/app/directory/directory-shell.ts`
- `src/app/directory/directory-shell.html`
- `src/app/directory/directory-shell.scss`
- `src/app/directory/directory-page.ts`
- `src/app/directory/directory-page.html`
- `src/app/directory/directory-page.scss`
- `src/app/directory/station-page.ts`
- `src/app/directory/station-page.html`
- `src/app/directory/station-page.scss`
- `src/app/directory/directory.model.spec.ts`
- `src/app/directory/directory.routes.spec.ts`
- `src/app/catalog/station-card.ts`
- `src/app/catalog/station-card.html`
- `src/app/catalog/station-card.scss`
- `src/app/home/radio-illustration.ts`
- `src/app/home/radio-illustration.html`
- `src/app/home/radio-illustration.scss`
- `scripts/integration-contract.test.cjs` (allows internal card routing; continues rejecting external redirects)
- `documentation/STAGE16-DIRECTORY.md`

## Reproduction

Use the installed WSL Linux Node 24.16.0; verify `process.platform === "linux"`. No dependency reinstall is required.

```sh
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/*.test.*
npm run build:gh -- --configuration=production
npm run build:gh -- --configuration=stage16 --output-path=tmp/stage16-directory/web
```

Browser evidence and its harness are local ignored artifacts in `tmp/stage16-directory/`. The harness uses existing Playwright/axe dependencies and an owned headless Chrome profile. It serves the built Stage 16 application over loopback and fetches the actual public HTTPS v2 JSON without catalogue interception. The separate production check serves the production output with local v1 catalogue responses to validate compatibility; it is not a production deployment.

## Original directory validation — 11 November 2026 (before usability refinements)

Target: `feature/16-catalogue-v2-browsing-ui`, current HEAD `7811f75060eccfe2a21818886dd6955b2f967d5a`. The redesign is unstaged on top of the recovered/validated Stage 16 baseline. No commits, pushes, merges or deployments were performed.

| Check                             | Result                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| WSL Linux Node                    | 24.16.0, platform guard passed                                                               |
| Lint / TypeScript                 | Passed on final source                                                                       |
| Complete Angular suite            | **516/516**, 30 files; **23 new directory tests**                                            |
| Node suite                        | **23/23**, no skips or failures                                                              |
| Production Pages build            | Passed, `/radio-bee/` base, production `/v1/`, development seed excluded                     |
| Stage 16 build                    | Passed, `/radio-bee/` base, opt-in public HTTPS `/v2/`                                       |
| Actual local v2 / fixture         | Identical snapshot SHA256 `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289` |
| Catalogue counts                  | 117 identities, 71 stream-bearing, 46 discovery-only, 74 stream candidates                   |
| Actual public v2 browser requests | 64 successful HTTP 200 responses over reload/deep-link cases, 15 distinct JSON URLs          |
| Accessibility                     | **23 axe scans, zero violations**                                                            |
| Whitespace / staged files         | `git diff --check` passed; zero staged paths                                                 |

The 23 new Angular tests cover deterministic selection, country mapping, sparse/canonical geographic paths, membership, all three UI languages, deep-link routes, canonical station metadata and frequency omission, artwork/name links, Play remaining in-app, compact/full language lists, Favorites focus, invalid routes, the v1 guard, drawer focus wrapping, Android Back priority, and root player continuity with a controlled media adapter.

Real Chrome checks exercised World → Asia → India → Tamil Nadu → Kanyakumari → canonical station, all ten district identities (2/8), nine related stations, direct refresh, Back/Forward, simulated Ionic Android route Back, drawer Escape/focus containment, Favorites removal, Search/Reset keyboard order, language/genre/network/broadcaster pages, Listen Now eligibility, the 46-record discovery filter with no Play buttons, sorting and network/broadcaster grouping. The separate production build retained classic v1 Home, its guard and the legacy details popup.

The browser matrix covered 375×667 and 1440×900, light/dark, English/Tamil/Sanskrit, active player, drawer, empty results, expanded languages, district and dedicated station pages. Screenshots were opened and inspected. Browser testing found and corrected both fallback-artwork label/name conflicts and reverse-Tab escaping the mobile drawer. Artwork now uses a separate labelled hit area over decorative artwork; drawer boundary Tab presses are explicitly wrapped.

### Real media evidence, distinct from controlled tests

Sooriyan FM Sri Lanka returned HTTP 200 `audio/mpeg; charset=UTF-8`, without a redirect in this attempt. Chrome emitted real `playing`, reached readyState 4, advanced to **35.575 seconds**, and decoded **573,858 bytes** before pause. The same stream/audio survived genuine internal UI navigation, with volume 0.35 and mute preserved. Pause set the audio to paused; Resume emitted another playing event; Stop reset playback and readyState to zero. One audio instance and one root player persisted. No generated audio, recording or stream proxy was used.

This does not establish broadcaster authorization, independently verify station identity by listening, guarantee endpoint availability, or test every stream. No human listening check or new recording was performed in this redesign task. Recording/recovery/HLS behavior is covered by the complete existing automated suites; those implementations were not edited.

### Screenshots and raw evidence

Local artifacts, intentionally ignored by Git:

- `tmp/stage16-directory/screenshots/desktop-home.png`
- `tmp/stage16-directory/screenshots/desktop-district.png`
- `tmp/stage16-directory/screenshots/desktop-station.png`
- `tmp/stage16-directory/screenshots/desktop-player.png`
- `tmp/stage16-directory/screenshots/mobile-home.png`
- `tmp/stage16-directory/screenshots/mobile-drawer.png`
- `tmp/stage16-directory/screenshots/mobile-station.png`
- `tmp/stage16-directory/screenshots/mobile-ta-dark-district.png`
- `tmp/stage16-directory/screenshots/mobile-ta-dark-station.png`
- Twelve width/theme/locale screenshots, including `375-dark-ta.png`.
- `browser.json`, `results.json`, `contract.json`, full command logs, browser harness and screenshot directory under `tmp/stage16-directory/`.

### Warnings and remaining limits

Production emits three component-style warnings against the existing 2 kB warning threshold: directory shell **2.43 kB**, station card **3.32 kB**, existing station browser **3.67 kB**. All remain below the existing 4 kB error threshold; no budgets were increased. Stage 16 build passes without compiler warnings. Further style consolidation can be reviewed separately.

Physical Android/WebView, device safe-area behavior and hardware Back were not tested; Android Back was simulated through Ionic's registered event handlers. Keyboard and axe checks are not manual NVDA/VoiceOver/TalkBack speech testing. No new live recording or AIR/HLS endpoint availability claim is made.

Player/recording services, audio engines, eligibility, strict v2 validation, v1 parser, catalogue service, environments, dependencies and build configurations remain unchanged. Later mobile player HTML/CSS refinements are documented in the linked usability report. The data repository was read only. Original source worktree verification matched all 419 file hashes and the retained recovery backup matched all 105 copied paths; protected master/main-github refs remained unchanged. The owned headless Chrome profile was closed after validation; screenshots, logs and recovery backups remain available.
