# Stage 5 — RadioBee station interface

Client branch: `feature/5-radio-thumbnail-ui`. This work is confined to
`radio-bee`; the adjacent data repository is being handled separately.

## Interface

The home screen now combines RadioBee branding, an original radio illustration,
prominent search, category shortcuts and a thumbnail grid. Layouts use two
columns below 560px, three below 800px, four below 1200px and six on larger
screens. Cards show station name, a concise location, frequency where supplied,
favorite control and the appropriate playback or broadcaster action. Full
metadata, sources, network and technical status are in expandable details.

All stations are drawn from the catalogue. The default grid has one card per
record; **Group by network** uses the same records under their actual network.
No network is duplicated as a station.

Category shortcuts clear the current search/advanced filters:

- All stations: every catalogue station.
- Favorites: saved station IDs, intersected with search/advanced filters.
- Kanyakumari and Chennai: actual Indian district metadata.
- Sri Lanka Tamil: country `LK` and broadcast language `ta`.
- Other Tamil: Tamil-language stations outside Sri Lanka and those two Indian districts. Unspecified geography is not assigned to a city.

The advanced panel retains the complete India-only hierarchy. Other countries
and All Countries expose Country and Broadcast Language. Switching countries
clears Indian geographic state. Browser testing also found and fixed the old
country-option restriction which prevented selecting Sri Lanka after India.

The existing PlayerService, media engine, timeouts, permission rechecks and
cleanup are unchanged. Its persistent player remains outside the route outlet
and now includes station artwork. Stop returns focus to the station action (or
search if the station is outside the current results); removing a favorite from
the Favorites view returns focus to that category control.

Production Play controls appear only for `streamEligibility() === ready`.
Unapproved/unavailable stations remain discoverable. Valid HTTPS broadcaster
websites are separate external links; their presence never grants direct-play
permission. The existing local technical-test lab is collapsed and remains
disabled in production.

## JSON-driven artwork

Both `Station` and `Network` accept an optional string `logoPath`. Existing v1
catalogues and caches with no logo properties continue to validate. Malformed
property types are rejected; unusable string paths are ignored by the artwork
resolver, preserving catalogue discovery and falling back safely.

Artwork priority, including load failures:

1. Station `logoPath`.
2. Its network's `logoPath`.
3. Bundled `assets/icon/radio-fallback.svg`, with initials and a stable branded color.

Paths resolve against the configured catalogue base URL, for example
`https://actionanand.github.io/radio-bee-data/v1/` plus
`assets/logos/stations/example.webp`. The client accepts only the agreed
`assets/logos/{stations|networks}/{lowercase-hyphenated-name}.{webp|png}` contract.
Absolute URLs, query strings, fragments, traversal, percent encodings, backslashes,
credentials and other formats are excluded. HTTP 404, decoding and image-loading
errors advance to the next candidate. No stream or playback state is changed.

Images use Angular NgOptimizedImage, lazy loading, fixed intrinsic dimensions,
square containers and `object-fit: contain`. The default artwork ships in the
app, so it is available without a remote logo request once app assets are loaded.
This does not add a service worker or promise a fresh offline app launch.

Artwork provenance:

| Artwork             | Source and use                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| RadioBee brand icon | Existing `src/assets/icon/radio-bee.png`, reused unchanged.                                                                          |
| Radio fallback      | Original SVG created in this client change; no broadcaster identity or copied logo.                                                  |
| Hero radio          | Original CSS illustration created in this client change.                                                                             |
| Broadcaster logos   | None copied or introduced by this client task. Curated assets, identity and permission review belong to the separate data-side work. |

[TamilRadios](https://www.tamilradios.com/) was inspected for its search/category/
thumbnail navigation. Its artwork, station records and streams were not copied.

## Favorites, language and caching

Favorites use the existing Capacitor Preferences package with the key
`radiobee.favorites.v1`, storing station IDs rather than positions. The adapter
wraps plugin calls so Angular lifecycle inspection never treats the Capacitor
proxy as an Angular service. Early toggles merge safely with asynchronously
loaded preferences. Storage failures retain session selections and show a
localized warning. Unknown saved IDs are retained for later catalogue updates.

New discovery, favorite, filter and player controls have English, Tamil and
Sanskrit labels. Broadcaster names remain unchanged. Existing catalogue refresh,
locale selection, validation and caching continue through CatalogService.

The published catalogue inspected on 6 November 2026 was **1.2.0, 88 stations,
18 networks**. `testing/published-1.2.fixture.ts` is an independent test-only
snapshot of that published MIT-licensed metadata; the runtime never imports it.
Tests also retain the original 1.0.0 fixture to cover legacy caches. No client
test reads the adjacent data checkout.

## Validation and review

WSL2 Linux Node 24.16.0, using the existing dependencies:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:ci`: **94 tests passed across 10 files**, with no unhandled errors. Tests include production eligibility in all three languages, optional logos, unsafe paths, image-error fallback, favorites persistence/races, category/filter integration, legacy and published catalogue compatibility, player controls and keyboard focus return.
- `npm run build:gh -- --configuration=production`: passed. Three component styles exceed the existing 2 kB warning budget (card 2.81 kB, home 3.40 kB, browser 3.64 kB); all remain below the unchanged 4 kB error budget.
- `www/index.html`: `/radio-bee/` base href confirmed; `/home` retained.
- `git diff --check`: passed.

The optional regression driver `scripts/verify-stage5-ui.cjs` exercises the built
production UI in Chrome at 375px, 820px and 1440px in light/dark themes. It checks
grid columns, search, favorites across reloads, India/Sri Lanka filters,
keyboard tab order, overflow, image geometry, axe checks and station/network HTTP
404 fallback. It uses a snapshot of the published 1.2.0 metadata, not the adjacent
data checkout or fabricated production rights.

Final production result: **all six layouts passed with zero axe violations,
zero horizontal overflow and zero page errors**. Grids measured 2/4/6 columns;
fallback images remained square. Both HTTP 404 candidates fell through to the
bundled image and production playback remained blocked. Results are in ignored
`tmp/stage5-production-browser-results.json`; screenshots below are the production
build, except the explicitly labelled local technical player capture.

The driver requires existing Playwright/axe tooling and an accessible Chrome CDP
endpoint; it does not install dependencies or launch/close your regular browser.
For an environment with those tools already available:

```bash
RADIOBEE_BROWSER_TOOLS=/path/to/existing/node_modules \
RADIOBEE_CDP_ENDPOINT=http://localhost:9222 \
node scripts/verify-stage5-ui.cjs
```

`RADIOBEE_CATALOG_SNAPSHOT` optionally points to a JSON catalogue snapshot; if the
default local snapshot is absent the driver reads the published catalogue.
`RADIOBEE_WEB_ROOT` defaults to `www`. `RADIOBEE_BROWSER_BRIDGE` can point to an
environment-owned CDP transport adapter exporting `attach(chromium)` for WSL2
to Windows Chrome. That bridge carries browser-control messages, not audio.

Separate live-test browser verification used the real Sooriyan endpoint through
the existing local technical configuration. Playback reached `playing`, and
pause/resume, volume, mute and stop passed with the redesigned mini-player.
No generated audio or mocked playback engine was used for that browser check.
The local technical-test screenshot is distinct from production screenshots.

Screenshots: [desktop light](screenshots/stage5-1440-light.png),
[desktop dark](screenshots/stage5-1440-dark.png),
[mobile light](screenshots/stage5-375-light.png),
[mobile dark](screenshots/stage5-375-dark.png),
[tablet light](screenshots/stage5-820-light.png),
[tablet dark](screenshots/stage5-820-dark.png), and
[local technical mini-player](screenshots/stage5-player-mobile.png).

Android device verification and a full manual screen-reader audit remain to be
performed. Favorites use Capacitor's existing Web/native Preferences adapter;
the Web persistence path and injectable storage contract are covered here.
Actual broadcaster-logo availability depends on separately reviewed and
published data assets. The client ships an original fallback regardless.

To review locally, run through the existing WSL2 Linux Node environment:

```bash
nvm use 24.16.0
test "$(node -p process.platform)" = linux
cd /mnt/c/AR_Files/code/radio-bee
npm start -- --host=127.0.0.1 --port=3056
```

Open `http://localhost:3056/home`. A production Pages build uses:

```bash
npm run build:gh -- --configuration=production
```

The `/radio-bee/` base href and `/home` route are retained. No deployment workflow,
Android configuration, stream verification/rights metadata, package versions or
lockfile is changed. No dependencies were reinstalled; no commits, pushes or
merges were performed.

## Changed files

- `src/app/home/home.page.{ts,html,scss}` and its spec: branded responsive home and local-lab placement.
- `src/app/catalog/station-browser.{ts,html,scss}`, `station-browser.spec.ts`: search, categories, compact filters and grouping.
- `src/app/catalog/station-card.{ts,html,scss}`: focused thumbnail card, details, actions and focus handling.
- `src/app/catalog/station-artwork.ts`, `src/assets/icon/radio-fallback.svg`: safe image priority and original fallback.
- `src/app/catalog/favorites.service.ts`, `discovery.ts`: persistent IDs and pure category rules.
- `src/app/catalog/catalog.models.ts`, `catalog.validation.ts`, `catalog.ui.ts`: optional logo fields and localized controls.
- `src/app/player/player.{ts,html,scss}`: persistent player presentation and focus return.
- `src/global.scss`: shared light/dark design tokens.
- `src/app/catalog/stage5.spec.ts`, `station-playback.spec.ts`, `testing/published-1.2.fixture.ts`: regression/integration coverage.
- `documentation/STAGE-5-UI.md`, `documentation/screenshots/stage5-*.png`: report and visual evidence.
- `scripts/verify-stage5-ui.cjs`: repeatable production browser regression driver using optional existing test tooling.
