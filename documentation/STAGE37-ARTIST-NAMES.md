# Stage 37: localized artist display names

`CatalogService.artistName(artist)` uses the selected locale's optional `artistNames` entry and falls back to the canonical English name for English, missing, empty or whitespace-only entries. It reads the existing catalogue and locale signals, so names update without reloads. Older cached snapshots remain supported.

Artist directory cards, facet headings/page titles, filter options, grouping headings and station metadata links use the shared resolver. Link text supplies accessible names. Existing geographic breadcrumbs contain no artist names and remain unchanged. Global search recognizes canonical artist names, all translated names and existing aliases regardless of selected locale; matched stations retain their original artist IDs/group membership. Canonical catalogue objects are not rewritten.

Integration source: locally built radio-bee-data v2.8.6, with 31/31 artist names in both Tamil and Sanskrit (zero English fallbacks in the published dictionaries). English and older dictionaries always retain canonical fallback. No production endpoint or playback changes are included. Existing station-name localization is preserved.

Validation uses WSL2 Linux Node 24.16.0, the complete client suite, lint, typecheck and production build. Local browser evidence is recorded under ignored tmp/stage37, using the existing loopback-only metadata preview harness and the actual data build. No physical Android or audible playback testing is claimed for this presentation change.

Branches are independent of unfinished toolbar work; no branches are merged by this task.

Verification: data validation, 203 tests and dual-version static build passed; client 555 tests, targeted fallback tests, lint, typecheck and production build passed. Chrome checked 12 desktop/mobile × en/ta/sa × light/dark states against the actual built v2.8.6 output with zero Axe violations; localized facet titles and cross-locale search passed. Screenshots were inspected. Three pre-existing client stylesheet budget warnings remain; no budgets changed. No public deployment or physical Android validation is claimed.
