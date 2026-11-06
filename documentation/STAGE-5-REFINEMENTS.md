# Stage 5 review refinements

Reviewed baseline: `03efe47c4e9c03857229b0cd98f857d872aa057c`, already checked out
on `feature/5-radio-thumbnail-ui`. These are refinements of that implementation,
with its existing palette, cards, artwork, player and catalogue pipeline retained.

## Changes

- Mobile: reduced brand/hero padding, compacted the secondary header, retained an accessible language selector, and made category shortcuts a keyboard-accessible horizontal strip. The result toolbar stays on one row. Browser regressions measure the first thumbnail at **375×667** in English, Tamil and Sanskrit, rather than testing only a taller viewport.
- Localization: Radio, Online radio, discovery/hero presentation, catalogue/saved-copy labels, player region name and technical-test label now use all three UI dictionaries. Coverage is translated; broadcast languages use catalogue native names. Station/network names, source titles and editorial notes retain their catalogue text. RadioBee's brand tagline remains unchanged.
- Player accessibility: Pause/Play/Retry reuse one native button rather than replacing the focused element. Unit and real-browser checks verify focus stays on the control when pausing. Playback continues through the unchanged PlayerService and MP3/HLS engine.
- Artwork: failures are shared across cards and the mini-player and belong to a validated catalogue snapshot via `linkedSignal`. A new successful snapshot allows another attempt at each candidate; locale changes, filtering cards out and back in, ordinary renders and failed refreshes do not clear failures. Stale error events are ignored. The bundled fallback is terminal, so its own failure cannot cycle requests.
- Styles: shared feature control/focus/reduced-motion rules are emitted once in `radio-controls.scss`. The existing decorative radio markup/styles were extracted into a focused component. Unnecessary local rules were removed. No style budget was increased.
- CI: `pr-validation.yml` runs on **pull_request only**, with `contents: read` and checkout credentials disabled. It runs lint, typecheck, the entire Angular unit suite, the workflow contract test, production Pages build and base-href/404 validation. It has no Pages actions, deployment environment, write permissions, target-branch checkout or push commands. Existing Pages and Android workflows are unchanged.

## Validation

All local Node/npm checks used WSL2 Linux Node 24.16.0 and the existing dependencies:

| Check                                                           | Result                                              |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `npm run lint`                                                  | Passed                                              |
| `npm run typecheck`                                             | Passed                                              |
| `npm run test:ci`                                               | **98 passed across 10 files**, no unhandled errors  |
| `node --test scripts/pr-validation.test.mjs`                    | **1 passed**                                        |
| `npm run build:gh -- --configuration=production`                | Passed; `/radio-bee/` confirmed in `www/index.html` |
| Isolated `live-test` build                                      | Passed                                              |
| `actionlint -shellcheck='' .github/workflows/pr-validation.yml` | Passed YAML/expression checks                       |
| `git diff --check`                                              | Passed                                              |

Final browser result: **72 axe scans, zero violations**, run serially in a
dedicated Chrome profile. Every scan asserts the actual light/dark media setting.

- **54 production scans:** 3 locales × 3 widths (375/820/1440) × 2 themes × browse/Favorites/expanded-details states. All 18 layouts had zero page errors and no page overflow; grids measured 2/4/6 columns.
- **18 real-player scans:** English/Tamil/Sanskrit × both themes; playing on 375×667 and 1440×900, plus paused on desktop. The real Sooriyan stream played through the existing local technical configuration. Pause/resume, volume, mute, Stop cleanup, and focus retention/return passed.
- Artwork HTTP regression: **2 station requests total**, initial failure plus **1 retry** after successful refresh. Filtering the card out/back and changing locale produced **no retry**; both missing station/network images fell back successfully and production playback remained blocked.

The resulting English/Tamil/Sanskrit mobile, desktop dark, and active-player
screenshots were visually inspected. Updated player examples:
[Tamil mobile](screenshots/stage5-player-375-light-ta.png) and
[desktop dark](screenshots/stage5-player-1440-dark-en.png).
Metadata-only logs are in ignored `tmp/stage5-production-browser-results.json`
and `tmp/stage5-live-browser-results.json`. No audio was recorded.

Compiled component style warnings, as reported by Angular:

| Component       | Reviewed baseline | Refined build                              |
| --------------- | ----------------- | ------------------------------------------ |
| Home            | 3.40 kB           | Below 2 kB; warning removed                |
| Station card    | 2.81 kB           | 2.58 kB                                    |
| Station browser | 3.64 kB           | 3.58 kB, including new mobile layout rules |

Two nonblocking warnings remain. The existing 2 kB warning and 4 kB error budgets
are unchanged. Shared rules are emitted once; the extracted illustration also
stays below its warning budget.

At **375×667**, the first thumbnail is 138×138 pixels. Measured positions are the
same in light and dark themes:

| Locale   | Top      | Bottom   |
| -------- | -------- | -------- |
| English  | 447.55px | 585.55px |
| Tamil    | 515.83px | 653.83px |
| Sanskrit | 447.55px | 585.55px |

The entire first thumbnail row fits without scrolling. The category strip has
intentional local horizontal scrolling; the page has no horizontal overflow.

Screenshots for inspection:
[English mobile](screenshots/stage5-375-light.png),
[Tamil mobile](screenshots/stage5-375-light-ta.png),
[Sanskrit mobile dark](screenshots/stage5-375-dark-sa.png), and
[desktop dark](screenshots/stage5-1440-dark.png).

The browser driver has two modes, both using existing tooling:

```bash
# Production: 3 locales × 3 widths × 2 themes; browse, Favorites and expanded details.
RADIOBEE_BROWSER_BRIDGE=tmp/browser-bridge.cjs node scripts/verify-stage5-ui.cjs

# Local technical build: real Sooriyan playback; playing and paused player states.
RADIOBEE_WEB_ROOT=tmp/stage5-refined-live/browser \
RADIOBEE_LIVE_TESTS=1 RADIOBEE_BROWSER_BRIDGE=tmp/browser-bridge.cjs \
node scripts/verify-stage5-ui.cjs
```

Commands run through WSL2 after checking `process.platform === 'linux'`.
`RADIOBEE_BROWSER_BRIDGE` is the environment-owned WSL2/Chrome control transport;
other environments can use the documented `RADIOBEE_CDP_ENDPOINT` and
`RADIOBEE_BROWSER_TOOLS` options. No dependency installation is performed by the
browser driver. Its catalogue snapshot is independent of the adjacent data checkout.

The image regression forces both remote candidates to return 404. It verifies
the bundled image loads, a locale change produces no retry, and a successful
catalogue refresh produces exactly one new station-image request. Production
playback stays blocked throughout this metadata-only test.

## Scope and limitations

Stream verification, rights enforcement, PlayerService, MP3/HLS engine, Android
configuration, `/home`, `/radio-bee/`, catalogue schema and legacy cache support
are unchanged. No data repository edits, package changes, dependency reinstalls,
commits, pushes, merges or deployments were performed.

The PR workflow was validated locally, not executed on GitHub. Device-level
Android and a full manual screen-reader audit remain outside these local checks.
The live-player accessibility check uses the existing explicitly isolated
technical configuration; it does not grant production playback permission.

## Files

- `.github/workflows/pr-validation.yml`, `scripts/pr-validation.test.mjs`: PR checks and their safety contract.
- `src/app/home/home.page.{ts,html,scss}`, `radio-illustration.{ts,html,scss}`: compact existing home and extracted illustration.
- `src/theme/radio-controls.scss`, `src/global.scss`: shared feature styles.
- `src/app/catalog/station-browser.{html,scss}`, `station-card.{ts,html,scss}`, `catalog.ui.ts`: compact controls and translations.
- `src/app/catalog/station-artwork.ts`, `stage5.spec.ts`: refresh-scoped failures and focused regressions.
- `src/app/player/player.html`: localized player labels.
- `scripts/verify-stage5-ui.cjs`: expanded responsive/accessibility and real-player checks.
- `documentation/STAGE-5-REFINEMENTS.md`, `documentation/STAGE-5-UI.md`, and screenshots: review evidence.
