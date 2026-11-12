# Stage 16 breadcrumb and Ionic dropdown corrections

Branch: `feature/16-catalogue-v2-browsing-ui`. This continues the reviewed directory and usability refinements. Existing unstaged work is preserved. No data-repository changes, commits, pushes, merges or deployments are performed.

## Breadcrumb behavior

`DirectoryBreadcrumbsComponent` renders one accessible ordered navigation list for geographic and station pages. Real Ionic `chevronForwardOutline` icons separate entries, are hidden from assistive technology and stay with their following entry when the list wraps. Parents are links; the current entry is plain text with `aria-current="page"`. Colors and focus rings use RadioBee variables. Country paths start at their continent (matching the requested Asia → India pattern); World remains available through directory navigation and has its own current breadcrumb on World.

The shared pure model helper only collapses an immediately adjacent district/locality pair whose displayed labels match after NFKC normalization, whitespace normalization and case folding. The retained entry points to the district URL. Equal country/state names, distinct labels and non-consecutive duplicates are not collapsed.

For BIG FM Chennai the displayed chain is Asia → India → Tamil Nadu → Chennai → BIG FM Chennai. The Chennai link opens the district, including both streamed and discovery-only members. Both canonical Chennai locations and all assignments remain unchanged, and both still appear in station metadata. Kanyakumari → Nagercoil is preserved because those displayed names differ.

On the canonical duplicate-named locality page, the district remains a clickable Chennai breadcrumb and a localized City / Locality current-context marker follows it. This avoids duplicating Chennai while preserving both district navigation and the locality's distinct route/scope; no redirect or membership broadening occurs.

## Ionic selects

All eleven visible Stage 16 selects use one `DirectorySelectComponent`: UI Language, Theme, broadcast Language, Genre, Content theme, Network, Broadcaster, Language classification, Availability, Sort and Group. Geography remains canonical navigation links/cards, not a native select. The earlier unused browser and v1 controls are retained; the production v1 interface is stable.

The installed Ionic **9.0.10** exports standalone components from `@ionic/angular`, not `@ionic/angular/standalone`. Existing dependencies are used unchanged. The wrapper imports genuine `IonSelect` and `IonSelectOption`, uses `ionChange.detail.value`, validates known string options, ignores disabled fixed-facet changes and delegates to the existing route/persistence handlers.

Desktop uses Ionic popovers. Lists longer than eight options use Ionic modals below 900px or on Android; short lists retain popovers. Long desktop popovers use automatic sizing with a themed viewport-bounded width. Labels, selected values, arrows, borders, options and overlays use theme variables. Scoped component CSS removes the legacy global select border/padding so Ionic's own outline is not drawn twice.

Only `.rb-directory-select-overlay` receives the new global overlay styles. It respects `ion-palette-dark`, supports long/non-Latin option wrapping, keeps touch targets at least 44px and sits above the sidebar/player. Existing theme, UI-language persistence and route query contracts remain in place.

### Ionic accessibility corrections found in the real browser

The installed MD select popover defaults to `showBackdrop=false`; Ionic treats that as non-blocking and allows keyboard focus to leave. These directory selects explicitly enable the native backdrop/focus trap. After a popover is presented, the selected native radio receives focus if focus has not already moved inside; this initializes the roving radio control without selecting a different value. Native modal initial-focus behavior remains in place.

Ionic's generated popover has `aria-modal=true` without a dialog role, and its structural `ion-list` / `ion-item` wrappers conflict with the contained radiogroup. The wrapper supplies the popover dialog role/name and, on Ionic's will-present lifecycle, normalizes only its uniquely owned structural wrappers to presentation. The real radiogroup/radios and all selection behavior remain intact. Unrelated overlays and legacy v1 controls are not modified. No axe rules are disabled or dependencies patched.

Ionic modals also consume/delete ARIA entries while moving them to their native dialog wrapper. A fresh attribute bag per open preserves the accessible name on later openings. Modal dialog semantics stay on Ionic's own wrapper; no extra outer dialog role is added.

## Exact incremental changed-file inventory

1. `src/app/directory/directory.model.ts`
2. `src/app/directory/directory.model.spec.ts`
3. `src/app/directory/directory.routes.spec.ts`
4. `src/app/directory/directory.labels.ts`
5. `src/app/directory/directory-page.ts`
6. `src/app/directory/directory-page.html`
7. `src/app/directory/directory-page.scss`
8. `src/app/directory/station-page.ts`
9. `src/app/directory/station-page.html`
10. `src/app/directory/station-page.scss`
11. `src/app/directory/directory-shell.ts`
12. `src/app/directory/directory-shell.html`
13. `src/app/directory/directory-shell.scss`
14. `src/app/directory/directory-breadcrumbs.ts` (new)
15. `src/app/directory/directory-select.ts` (new)
16. `src/app/directory/directory-select.spec.ts` (new)
17. `src/global.scss`
18. `src/theme/directory-overlays.scss` (new)
19. `documentation/STAGE16-IONIC-CORRECTIONS.md` (new)

Prior player-presentation changes and other reviewed work remain unstaged and are not rewritten. Before-task copies of changed existing files are retained under ignored `tmp/stage16-ionic-corrections/before/`. Original recovery backups are preserved.

## Validation

All Node commands run using installed WSL Linux Node 24.16.0 after verifying `process.platform === "linux"`. No dependency reinstall is performed.

```sh
npm run lint
npm run typecheck
npm run test:ci
node --test scripts/*.test.*
npm run build:gh -- --configuration=production
npm run build:gh -- --configuration=stage16 --output-path=tmp/stage16-ionic-corrections/web
```

### Final results — 11 November 2026

| Check                         | Result                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Lint / TypeScript             | Passed, WSL Linux Node 24.16.0                                                          |
| Complete Angular suite        | **543/543**, 31 files, **20 added regressions**                                         |
| Complete Node suite           | **23/23**, no skipped/cancelled tests                                                   |
| Production build              | Passed, `/v1/`, base `/radio-bee/`, development seed excluded                           |
| Stage 16 build                | Passed, opt-in public HTTPS `/v2/`, base `/radio-bee/`                                  |
| Actual built v2 / fixture     | Identical: 117 identities, 71 stream-bearing, 46 discovery-only, 74 stream candidates   |
| Public v2 requests in browser | 48 HTTP 200 responses across reloads; 15 distinct JSON URLs                             |
| Accessibility                 | **53 axe scans, zero violations**: 52 Stage 16 states plus one production v1 base check |
| Review state                  | Unstaged; no commit/push/merge/deploy; protected refs unchanged                         |

Added tests cover normalized adjacency-only breadcrumb collapse (including Tamil/Sanskrit), preservation of both Chennai location records and the district URL, current-page semantics and chevrons in all three languages, Kanyakumari ancestry, all eleven Ionic dropdowns, filter/sort/group `ionChange` updates, theme/locale storage, responsive interface selection, disabled/unknown values, resize cleanup, owned-versus-unrelated overlay semantics, repeated ARIA attribute consumption and selected-radio focus.

### Real-browser coverage

The browser used actual built Stage 16 assets and the public HTTPS v2 catalogue. It checked:

- Chennai station → district → canonical locality, all relevant identities, current-context marker, deep refresh and browser Back/Forward.
- Kanyakumari's ten identities (two with candidate streams, eight discovery-only), followed by the unchanged Nagercoil locality/station ancestry.
- 1440×900, 375×667 and 320×568, light/dark, English/Tamil/Sanskrit. Closed directory and open theme popovers were scanned in all 18 combinations.
- Long language lists on desktop popovers and mobile modals in both themes; Tamil and Sanskrit modal states; long selected network text without horizontal overflow.
- Theme changes and reopening, native selected state, Tab containment, toolbar Tab order, Escape, Ionic Android Back priority/dismissal without navigation and focus restoration.
- Persisted non-default Tamil/dark selection after a real reload, filter query parameters, sorting/grouping and discovery-only results remaining unplayable.
- Popovers/modals above sidebar and persistent player. The selected native radio remains focused inside the overlay; the original arrow/selection implementation remains Ionic's.

The first final v1 smoke assertion incorrectly assumed native `select` elements. Source inspection showed that the unchanged legacy browser already uses Ionic language/theme controls. That assertion was corrected and the production compatibility check was run separately: classic Home with 117 identities, original language/theme selectors, no Stage 16 wrapper, legacy Details popup, Escape and base-page axe all passed. The 51 already-passed Stage 16 scans were retained, not falsely reported as a single uninterrupted run. Original intermediate evidence is retained in `browser-before-legacy-check.json`. A final unobscured desktop-dark station screenshot added one separate passing axe scan.

### Playback evidence, separate from UI checks

Sooriyan reached real `playing`, readyState 4, no media error, about **5.09 seconds** and **86,518 decoded bytes** through an open modal and navigation to Favorites. One audio instance was used. The test then stopped playback. No generated audio, recording, data permissions change or stream proxy was used. This was a brief continuity check, not a fresh human listening check, broadcaster authorization, HLS availability test or extended stability guarantee. Existing playback/recovery/recording tests passed, and their internals were not edited.

### Screenshots and retained artifacts

Screenshots were opened and inspected, including:

- `tmp/stage16-ionic-corrections/screenshots/desktop-light-breadcrumbs.png`
- `tmp/stage16-ionic-corrections/screenshots/desktop-dark-breadcrumbs.png`
- `tmp/stage16-ionic-corrections/screenshots/mobile-light-breadcrumbs.png`
- `tmp/stage16-ionic-corrections/screenshots/mobile-dark-breadcrumbs.png`
- `tmp/stage16-ionic-corrections/screenshots/1440-light-popover.png`
- `tmp/stage16-ionic-corrections/screenshots/1440-dark-popover.png`
- `tmp/stage16-ionic-corrections/screenshots/1440-light-long-options.png`
- `tmp/stage16-ionic-corrections/screenshots/1440-dark-long-options.png`
- `tmp/stage16-ionic-corrections/screenshots/375-light-long-options.png`
- `tmp/stage16-ionic-corrections/screenshots/375-dark-long-options.png`
- `tmp/stage16-ionic-corrections/screenshots/mobile-tamil-dark-modal.png`
- `tmp/stage16-ionic-corrections/screenshots/mobile-modal-with-active-player.png`
- `tmp/stage16-ionic-corrections/screenshots/production-v1-unchanged.png`

`browser.json` includes all scan results, overlay bounds/colors/z-index, native keyboard focus traces, Android Back priorities and scoped media evidence. `contract.json`, full command logs, corrected browser/legacy harnesses and task-baseline copies are retained under `tmp/stage16-ionic-corrections/`, intentionally ignored by Git. Snapshot SHA256 remains `a1e4ad0e6ed4dcedad966449a21fdafa4dec53bf233de69d991070f17d5f0289`.

### Remaining limitations

- Physical Android/WebView, hardware Back and device safe areas are pending. adb was not available in PATH or the standard local SDK location; no tools were installed. Mobile checks are Chrome viewport tests and simulated Ionic Back events.
- Axe and keyboard checks are not manual NVDA/VoiceOver/TalkBack speech validation. No new recording capture or long live-station/HLS probe was performed.
- Three existing production stylesheet warnings remain: directory shell **2.42 kB**, station card **3.32 kB**, station browser **3.67 kB** against unchanged 2 kB warning / 4 kB error budgets. New components add no warnings; Stage 16 has no compiler warnings.
- Ionic's owned-overlay semantic normalization is version-specific compatibility code for the installed Ionic 9 markup. Its focused tests and real overlay axe checks should be retained when upgrading Ionic. Dependencies and the framework itself were not modified.

Production remains `/v1/`; Stage 16 remains opt-in `/v2/`. PlayerService, media engine, recording, Favorites storage, strict snapshot validation, catalogue service, eligibility/permissions, environments and protected branches remain unchanged. The original source worktree still matches all 419 baseline hashes; recovery backups are preserved. All corrections remain unstaged for review.
