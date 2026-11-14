# Consistent station cards and overflow-only tooltips

Branch: `feat/consistent-station-cards`, based on master `557e819e3da0d21d64c28e719d861212171b01bd`.

## Layout

The supplied Tamil reference shows a four-line Rainbow Chennai title moving its Play and Details controls below neighboring cards. The shared card now reserves two line-height-based rows for the title, complete language information and geography. `app-ellipsis-text` uses CSS line clamping; it never slices Unicode strings. Complete language lists replace the previous three-label/+N abbreviation so the tooltip can expose every language.

Card hosts/articles fill equal fractional grid rows, square artwork retains its existing responsive aspect ratio, and the card body uses Flexbox with a consistent action slot and bottom Details row. No fixed pixel card/artwork height is introduced. Review-notice slots remain conditional on the existing `hideStreamReviewNotices` flag. Directory and related-station grids use two columns below 560px; the legacy grid keeps its existing six/four/three/two-column breakpoints.

## Shared component

`<app-ellipsis-text [text]="name" [lines]="2" />` requires text and defaults to two lines. Overflow is measured from the actual rendered element. ResizeObserver, viewport changes, font readiness/loading and inherited style/class changes schedule a new measurement. Observers, listeners, frames and interaction timers are cleaned up on destruction.

Only genuinely truncated text opens a Material-style tooltip. A native manual popover renders in the browser top layer, outside the card's overflow clipping, and is positioned within the viewport. Tooltip text uses textContent, never HTML. Hover, keyboard focus and touch are supported; Escape, blur, outside taps, scrolling and changing text/geometry dismiss stale tooltips. A short hover-exit grace period makes the tooltip reachable with the mouse.

A surrounding title link remains the only title tab stop and retains its RouterLink destination. Ordinary taps/clicks/Enter still navigate. A 500ms long press reveals the full linked title; only that held activation is stopped before Angular RouterLink handles it. Static text gets a keyboard stop only when truncated. Existing aria-describedby values are preserved. No Angular Material, tooltip library or package changes are included.

## Scope

No API records, translations, station order/IDs, stream URLs, player logic, artwork resolution, Favorites associations or protected branches are modified. radio-bee-data is read only for local verification. No merge or deployment is performed.

## Regression coverage

Eleven shared-component tests cover fitting text, long English, Tamil compound text, Sanskrit, language/location values, genuine overflow, configurable line limits, locale/text changes, resize/zero-width behavior, focus/touch/outside/Escape, linked titles without duplicate tab stops, long-press activation suppression, observer/font notifications and cleanup. Existing directory language-summary coverage now verifies the complete clamped list and full details metadata. The legacy publication test double uses the real language resolver because the shared card now renders that row universally.

## Files

- src/app/shared/ellipsis-text.ts
- src/app/shared/ellipsis-text.spec.ts
- src/app/catalog/station-card.ts
- src/app/catalog/station-card.html
- src/app/catalog/station-card.scss
- src/app/catalog/station-browser.scss
- src/app/catalog/worldwide-publication.spec.ts
- src/app/directory/directory-page.scss
- src/app/directory/station-page.scss
- src/app/directory/directory.routes.spec.ts
- documentation/CONSISTENT-STATION-CARDS.md

## Evidence and limits

Ignored command logs, geometry results and screenshots are under `tmp/consistent-cards/`. The browser harness uses the actual production build with the existing loopback-only metadata preview. Directory data uses the existing local generated v2 output (240 stations); mixed streamed/discovery coverage uses the existing 117-station contract fixture and a minimal temporary Home selection. The temporary Home file is test infrastructure, not an editorial/data change. Legacy checks use an ignored build copy with only its catalogue endpoint switched to the existing v1 snapshot; production source/configuration remains untouched.

The 18-state directory matrix covers 1600px/six columns, 768px/three columns and 375px/two columns; English/Tamil/Sanskrit; light/dark. Measurements compare every card's height, square artwork, title/language/location two-line boxes and relative action/Details offsets. Initial Axe scans cover each of those states; final interaction tests repeat against the final bundle. Home, Favorites, related stations and mixed discovery cards receive separate geometry checks.

Native Popover API support is required for the top-layer tooltip; current Chrome was exercised. No public deployment, live audio recording, physical Android device, Safari or Firefox validation is claimed. Existing stylesheet warning thresholds remain unchanged.

## Final results

- WSL2 Linux Node 24.16.0; no dependency installation/version/lockfile changes.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:ci`: 597/597 tests across 39 files, including 11 new ellipsis regressions; zero skipped/failed tests.
- `npm run build:gh`: passed (production default, Pages base href `/radio-bee/`).
- 18 v2 layout states passed; initial Axe scans reported zero violations in all 18. Final geometry/interaction checks used the final build; no console page errors. The first local harness runs deliberately exposed a stale previous bundle, missing fixture Home selection and the long-press RouterLink race; these were corrected rather than counted as passing evidence.
- Mixed streamed/discovery grid: 117 cards with equal heights and matching action/Details offsets; Favorites, nine related cards and ten Home cards also passed. The temporary Home selection exists only in ignored harness data.
- Legacy v1: 12 desktop/mobile × en/ta/sa × light/dark states passed with 117 cards and equal geometry. Only the ignored test-build copy changed its catalogue endpoint.
- Native tooltip hover/focus/Escape, unclipped placement, linked-title long press without navigation, regular Enter navigation and navigation with a tooltip still open passed in Chrome. No extra title tab stop.
- Existing warning thresholds were not raised. Five component-style warnings remain: station-card 3.20 kB, station-browser 3.69 kB, directory-shell 2.54 kB, station-page 2.60 kB and radio-illustration 2.59 kB against 2 kB warnings (4 kB error limit). See build-final.log for exact measured sizes.
- Git whitespace checks passed. No protected branch, data-repository file, station order, playback implementation or deployment was changed.
