# Stage 35: catalogue v2 station-name localization

The client consumes optional `stationNames` dictionaries from catalogue localization files. `CatalogService.stationName()` delegates to the shared pure `stationDisplayName()` resolver. The selected locale is reactive; English always uses the canonical station name. Missing, empty, whitespace-only or unknown translations fall back to that canonical name. Older v1/v2 snapshots remain supported.

Cards (including Favorites and search results), station details, station-page headings, browser titles, breadcrumbs, mini-player names and station-specific accessible control names use this resolver. Search recognizes names from every loaded localization dictionary as well as canonical English and existing aliases, independently of the selected language. Canonical sorting, IDs, routes, Favorites membership, stream URLs and playback/recording behavior are unchanged. Card names wrap without the previous two-line clipping limit; location text retains its existing truncation behavior.

## Integration source and coverage

Validated against the actual local `radio-bee-data` source at commit `6e829ae`, catalogue v2.8.5, 240 stations. No data-repository changes or copied production translation inventories are included in this client branch. The production endpoint remains unchanged; localized production names depend on publication of these dictionaries by the data repository.

Tamil: 224 local-script names; 16 canonical-English fallbacks.
Sanskrit: 224 local-script names; 16 canonical-English fallbacks.

Both locales retain English for the same reviewed fallback IDs:

- aural-radio
- mauradio-mu
- jei-fm-my
- otran-vaanoli-ie
- radio-norge-no
- suomipop-fi
- znad-wilii-lt
- stad-den-haag-nl
- sveriges-radio-p1-se
- radio-dla-doroslych-pl
- nagham-fm-eg
- 77h-fm-br
- stage29-vaalai-fm
- stage29-sree-kurumba-fm
- stage29-kanal-music
- stage29-kandhakapookkal-radio

## Verification

WSL2 Linux Node 24.16.0 only; existing dependencies retained.

- Six new regression tests cover en/ta/sa resolution, missing/unknown/blank fallback, cross-script search, canonical-data preservation and immediate locale switching through the shared service.
- Existing card/player/recording test doubles call the real resolver instead of inventing separate display logic.
- Complete Angular suite: 553 tests. Lint, TypeScript checks and production Pages build pass.
- The actual v2.8.5 snapshot passes the client validator; every one of its 240 stations resolves and is searchable under each of en/ta/sa (720 station/language combinations).
- Chrome: 12 states at 1440px and 375px, en/ta/sa, light/dark; actual dictionary names and card accessible labels verified, no horizontal overflow, zero Axe violations in each state. Routed detail names, current-station breadcrumb and Tamil search while Sanskrit is selected also pass.
- Browser tests use the production output and the existing loopback-only preview harness serving the local v2.8.5 metadata. Production HTTPS validation/configuration is unchanged. These are local integration results, not evidence that v2.8.5 has been deployed publicly.
- No audible radio or physical Android tests were performed for this presentation-only change.
- Three existing component-style budget warnings remain; no budgets changed.

Ignored detailed logs, actual-catalogue coverage and screenshots are under `tmp/stage35/`.

## Changed files

- src/app/catalog/catalog.models.ts
- src/app/catalog/catalog.service.ts
- src/app/catalog/station-names.spec.ts
- src/app/catalog/station-card.html
- src/app/catalog/station-card.scss
- src/app/catalog/station-details-content.ts
- src/app/catalog/stage5.spec.ts
- src/app/catalog/worldwide-publication.spec.ts
- src/app/directory/station-page.html
- src/app/directory/station-page.ts
- src/app/player/player.html
- src/app/recording/recording.spec.ts
- documentation/STAGE35-STATION-NAMES.md
