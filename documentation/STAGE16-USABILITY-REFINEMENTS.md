# Stage 16 final directory usability refinements

Branch: `feature/16-catalogue-v2-browsing-ui`. This is a focused continuation of the reviewed directory implementation, not a replacement. Changes are left unstaged; no commit, push, merge or deployment is performed.

## Curated Featured Radios

The client keeps only this editorial list of canonical IDs; station names, metadata, stream URLs, availability and permissions continue to come from the validated catalogue. No new catalogue records or authorization flags are introduced.

| Canonical ID          | Selection rationale                                              |
| --------------------- | ---------------------------------------------------------------- |
| `air-nagercoil`       | Canonical Nagercoil identity and local candidate-stream coverage |
| `suryan-nagercoil`    | Local FM discovery-only coverage                                 |
| `hello-nagercoil`     | Another local FM discovery-only identity                         |
| `annai-kuzhithurai`   | Kanyakumari locality discovery coverage beyond the city          |
| `air-chennai-rainbow` | Broader Tamil Nadu coverage                                      |
| `sooriyan-srilanka`   | Sri Lankan Tamil coverage                                        |
| `vasantham-srilanka`  | A second Sri Lankan Tamil broadcaster                            |
| `ibc-tamil-uk`        | UK Tamil community coverage                                      |
| `oli-968-sg`          | Singapore Tamil coverage                                         |
| `atbc-au`             | Australian Tamil community discovery coverage                    |

Home still shows ten cards. With the actual v2 snapshot this includes four Kanyakumari identities and four discovery-only stations overall. Selection order is editorial, not a popularity, quality, verified-playback or authorization ranking. The selection disclosure is localized in English, Tamil and Sanskrit.

If a curated ID is missing, it is skipped. Remaining slots are filled using existing catalogue stations ordered by NFKC-normalized, case-insensitive canonical name, with canonical ID as a tie-breaker. Duplicates are excluded; source data is not mutated; small or partially missing catalogues remain supported. Tests remove some/all preferred IDs and reverse input order.

## Global toolbar Search

Toolbar Search always navigates to `/world?q=...`, dropping geographic, facet, availability and Favorites scope from the new results URL. It does not modify the original listing filters. The first transition from another route pushes one history entry; later typing on World replaces that entry. Back returns to the original district/filter URL and Forward restores the final search. The persistent Search input keeps focus and its DOM identity.

Scoped listing dropdowns, direct routes and breadcrumb navigation remain available. Regression tests in all three languages start at Kanyakumari with discovery-only filtering (eight results), search Sooriyan outside India, and confirm the Sri Lankan identity appears with only the global query active. A separate test checks push-versus-replace history behavior and stale World filters.

## Mobile player presentation

Only `player.html` and `player.scss` change. Below 600 pixels the existing player uses a two-row grid, smaller decorative artwork and tighter padding. Play/Pause/Retry, Stop and Mute retain genuine Ionic icons and localized accessible names; their text becomes visually hidden on mobile rather than removed from accessibility. Buttons keep 44-pixel targets. Volume stays directly available; no expansion is required for playback controls. Desktop text labels and layout remain intact.

The existing recording entry/panel, consent, drafts, capture, export, Stop behavior, root player placement and safe-area handling are preserved. No PlayerService, player component TypeScript, media engine, eligibility, playback recovery or recording service is changed. No additional audio element is created. This shared mobile presentation also applies to the v1 player; the production catalogue and route isolation remain unchanged.

## Exact files changed in this refinement

1. `src/app/directory/directory.model.ts`
2. `src/app/directory/directory.model.spec.ts`
3. `src/app/directory/directory-shell.ts`
4. `src/app/directory/directory.routes.spec.ts`
5. `src/app/directory/directory.labels.ts`
6. `src/app/player/player.html`
7. `src/app/player/player.scss`
8. `documentation/STAGE16-DIRECTORY.md`
9. `documentation/STAGE16-USABILITY-REFINEMENTS.md`

Earlier reviewed directory changes remain in place. The task baseline copies are retained in ignored `tmp/stage16-refinements/before/`; the original recovery backup and source worktree are preserved. Data repository access is read-only.

## Validation evidence

Commands run exclusively with installed WSL Linux Node 24.16.0 after checking `process.platform === "linux"`:

```sh
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/*.test.*
npm run build:gh -- --configuration=production
npm run build:gh -- --configuration=stage16 --output-path=tmp/stage16-refinements/web
```

### Results — 11 November 2026

| Check                          | Result                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Lint / TypeScript              | Passed using WSL Linux Node 24.16.0                                                                             |
| Complete Angular suite         | **523/523**, 30 files, including **7 added regressions**                                                        |
| Complete Node suite            | **23/23**, no skipped/cancelled tests                                                                           |
| Production build               | Passed; `/v1/` endpoint, `/radio-bee/` base, seed excluded                                                      |
| Stage 16 build                 | Passed; opt-in public HTTPS `/v2/`, `/radio-bee/` base                                                          |
| Actual built v2 / fixture      | Identical; 117 identities, 71 stream-bearing, 46 discovery-only, 74 stream candidates                           |
| Real public v2 browser loading | 64 HTTP 200 responses, 15 distinct JSON URLs across reloads/deep links                                          |
| Browser accessibility          | **40 axe scans, zero violations**                                                                               |
| Narrow player geometry         | **18 combinations**: 320×568, 375×667, 390×844 × light/dark × EN/TA/SA                                          |
| Keyboard/history               | Global Search focus, Back/Forward, Reset/Tab order, drawer focus/Escape and simulated Ionic Android Back passed |

Added regressions cover partial/all missing curated IDs, bounded selection, and global Search in English/Tamil/Sanskrit plus push/replace history and removal of stale World filters. Existing selection tests now assert the curated canonical order, four local identities, four discovery-only entries, determinism and metadata immutability.

The full functional suites passed before a final consolidation of redundant CSS declarations. Final CSS was linted, rebuilt in both configurations and verified in the browser matrix; no functional TypeScript or recording code changed during that consolidation. It eliminated the temporary new player stylesheet warning without raising budgets.

### Measured player height

With Sooriyan playing, the existing recording entry visible and a 375×667 viewport:

| UI language | Player | Recording entry |   Combined |
| ----------- | -----: | --------------: | ---------: |
| English     | 117 px |           57 px | **174 px** |
| Tamil       | 122 px |           57 px | **179 px** |
| Sanskrit    | 125 px |           57 px | **182 px** |

The earlier equivalent Tamil layout measured **241 px**, so this saves **62 px** of vertical space. Measured playback targets are at least 44×44 pixels. The main scrolling region ends at the player's top; no player controls are clipped and no horizontal document overflow occurs across the 18 combinations. Expanded recording controls were checked in light/dark without acknowledging consent or starting capture. That panel retains its existing scrolling/consent behavior.

The real browser also verified:

- Exact curated Home order from the public catalogue, including four discovery-only cards.
- Global Search from Kanyakumari with discovery-only filtering: eight local results → Sooriyan outside the district, focused Search, query-only global URL, Back to the original eight and Forward to the final query, in EN/TA/SA.
- All 117 identities, Kanyakumari's ten (two candidate-bearing/eight discovery-only), canonical station pages, breadcrumbs and nine nearby identities.
- Favorites removal/focus, Listen Now eligibility, filters, grouping, sorting, deep refresh, history, language expansion and legacy v1 details popup.
- Desktop/mobile light/dark in English, Tamil and Sanskrit; drawer focus containment, Escape and simulated route Back.

### Actual media, separate from automated UI success

Sooriyan FM Sri Lanka returned HTTP 200 `audio/mpeg; charset=UTF-8`, without a redirect in this attempt. Real Chrome `playing` events occurred; playback advanced **103.4832 seconds**, with **1,660,134 decoded bytes** and no media error before pause. Volume 0.35 and mute survived genuine internal navigation and viewport/language/theme changes. Pause, Resume and Stop passed. Exactly one audio instance was created in the relevant document. No generated audio, capture, redistribution or CORS-bypass proxy was used.

This is media-engine evidence, not a fresh human listening/identity check or permission grant. No AIR/HLS availability guarantee or new recording capability claim is made.

### Screenshots and machine-readable evidence

Screenshots were opened and inspected:

- `tmp/stage16-refinements/screenshots/desktop-home.png`
- `tmp/stage16-refinements/screenshots/desktop-player.png`
- `tmp/stage16-refinements/screenshots/375-light-en.png`
- `tmp/stage16-refinements/screenshots/375-dark-ta.png`
- `tmp/stage16-refinements/screenshots/player-320.png`
- `tmp/stage16-refinements/screenshots/player-375.png`
- `tmp/stage16-refinements/screenshots/player-390.png`
- `tmp/stage16-refinements/screenshots/mobile-recording-expanded.png`
- Additional district/details/drawer and locale/theme screenshots in the same directory.

`browser.json` contains scoped media events/responses, 40 axe reports and all 18 measured layouts. `contract.json` records snapshot/build checks; command logs, harness and baseline copies remain under `tmp/stage16-refinements/`. These artifacts are intentionally ignored by Git. The actual v2 snapshot SHA256 remains `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289`.

### Outstanding limitations and review state

- Three existing production stylesheet warnings remain: directory shell 2.43 kB, station card 3.32 kB, station browser 3.67 kB, against the unchanged 2 kB warning / 4 kB error thresholds. The refined player introduces no warning. No compiler warnings in the Stage 16 build.
- Physical Android/WebView, actual hardware Back and device safe-area behavior were not tested. Android Back was simulated using Ionic's registered handlers.
- Axe/keyboard checks are not manual NVDA/VoiceOver/TalkBack speech testing. New recording capture, draft export and live HLS probes were not performed; existing recording/recovery/engine tests passed and their implementations are unchanged.
- The expanded recording consent/draft panel is deliberately unchanged. Its existing independently scrollable presentation remains a separate follow-up if further space reduction is wanted.

Production remains on `/v1/`; v2 remains opt-in. The data repository, stream metadata, permissions, strict validation, caches, dependencies and protected branches were not modified. All changes remain unstaged for review; no commit, push, merge or deployment was performed.
