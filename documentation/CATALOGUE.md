# RadioBee catalogue integration — Stage 2

RadioBee consumes the independent [radio-bee-data](https://github.com/actionanand/radio-bee-data) static JSON catalogue. The [Stage 3 Web player](PLAYER.md) applies separate permission and compatibility gates; discovery remains independent of playback. Recording and native background media services are not implemented.

## Data and compatibility

Both Angular environment files configure `catalogUrl`, initially `https://actionanand.github.io/radio-bee-data/v1/`. Keep the trailing slash. The loader reads `index.json` first, accepts only schema **1**, validates the three-component `catalogVersion`, then follows the six manifest `files` entries and `localizationRoot` for English, Tamil and Sanskrit. Paths must remain under the HTTPS catalogue root. It validates required record fields, unique IDs, enums, counts, network/language/category/source references, location hierarchy and stream metadata before publishing a snapshot.

On **6 November 2026**, the public manifest returned **GitHub Pages 404 / Site not found**. The data repository must deploy its Pages site independently before production can load fresh data. No client CI or repository settings were changed to work around this. Network/CORS behavior from the real host and Android WebView remains to be verified after that deployment.

The current repository snapshot is version **1.0.0**, published 2026-11-03: 81 listings, 16 networks, 89 locations, three unverified stream leads and zero verified streams. A listing or FM frequency does not establish a playable internet stream.

## Cache, refresh and offline use

`CatalogService` is a root singleton using signals. It initializes once per app session, reads a saved snapshot and then attempts refresh. Ordinary navigation does not refetch the catalogue. Manual refresh reloads and validates the whole snapshot. Each fetch has a 12-second timeout. Errors release the loading state and explain whether saved data is available.

One serialized snapshot, keyed by base URL and schema, is stored with the existing Capacitor **Preferences** plugin: localStorage on Web and native preferences on Capacitor. Cached data is revalidated on startup. Partial/invalid downloads never replace a valid cache or in-memory snapshot. Last successful retrieval time is distinct from manifest `publishedOn`; refresh failures preserve the original timestamp. Storage failures are reported, while a successfully validated in-memory catalogue remains usable. Clearing app/site data removes the snapshot and language preference.

Offline catalogue browsing works when the app shell is already available and a valid snapshot has been saved. This change does not install a service worker: a fresh browser navigation while completely offline is not guaranteed to load the Web app itself. Capacitor bundles its app shell.

## Explicit development fallback

Development builds configure `catalogSeedUrl: 'assets/catalog-development-seed.json'`. If no valid remote or cached catalogue exists, a failed remote load may use that complete, validated snapshot copied from the actual data repository. A prominent **DEVELOPMENT SEED — not live data** notice identifies it. It is not written into the live cache and receives no invented successful-update timestamp. Refresh continues trying the remote host.

Production sets `catalogSeedUrl: null`, so production never automatically uses the seed, even though the static snapshot asset is present in the build. First production launch with an unavailable host and no saved catalogue shows an actionable error instead. Use `npm run develop` to preview seed-backed discovery while the data host is undeployed.

The seed and test fixture preserve original data, including uncertain listings, notes, source IDs and unverified leads. Source: [v1 catalogue files](https://github.com/actionanand/radio-bee-data/tree/master/data/v1), retrieved during implementation. The original MIT notice is retained in `src/assets/catalog-seed-LICENSE.txt`; it grants no broadcaster, audio or stream rights. Refresh the development snapshot deliberately when upstream data changes; never substitute it silently for production data.

## Models, filtering and grouping

- Stations retain canonical `id`, `name`, `networkId`, `countryCode`, `regionId`, `districtId`, `localityId`, `broadcastLanguages`, `genres`, `delivery`, `coverage`, `listingStatus`, `frequencyMHz`, `website`, `sourceIds`, `streams` and `notes`.
- Networks are distinct entities grouped solely by `networkId`. Indian `suryan-in` and Sri Lankan `sooriyan-lk` remain separate. Expand a network to browse its stations and expand station details for notes, categories and source titles.
- Locations follow country → state/province → district → locality using `parentId`. Selecting a parent clears descendant selections. Options follow the selected hierarchy, with India and Sri Lanka taken directly from the catalogue.
- Stage 3B exposes Country and Broadcast Language for All Countries, Sri Lanka and every other non-Indian country. Selecting India additionally exposes State / Union Territory, District and City / Locality. Country changes clear the geographic selections; hidden geography cannot restrict results. Genre is retained as station metadata, not a filter.
- Active filters combine with AND. Search matches canonical station/network names and assigned place names. Country matches its code and broadcast language matches array membership. Detailed geographic IDs apply only when Country is India; helpers ignore stale geographic values for every other country selection, including All Countries.
- Null/unspecified geography is not a wildcard. A national or region-wide station with no locality is visible in broad results, but does not appear as a city-specific station after locality filtering. Empty broadcast-language arrays remain unspecified rather than invalidating a legitimate listing.
- Clear filters restores the full catalogue. Empty states explain strict locality behavior. Coverage and review labels remain distinct from stream health.

## Localization and stream restrictions

Catalogue-owned labels, category labels and approved country/region names come from its `i18n/en.json`, `ta.json` and `sa.json`, with English fallback for missing selected-language keys. Canonical broadcaster names and unlocalized places are preserved. Existing ngx-translate packages were installed but not configured in this starter; this feature uses a small signal-based dictionary accessor and client-owned localized control labels without adding dependencies. Diagnostic messages and some metadata annotations remain English.

UI language is saved separately from broadcast-language filters and sets the browser section's `lang` attribute. Changing it never changes which station languages are selected. Language options display their Unicode native names.

`listingStatus: reviewed` means metadata review only; candidates show the catalogue's needs-review label. The shared Stage 3 policy checks verification, rights, URL, format and actual platform support before enabling Play. Unverified, unavailable and unapproved listings remain visible with their specific blocker messages. Only explicit user playback of an eligible stream creates media requests; broadcaster websites are never substituted for audio endpoints. There is no autoplay or recording.

## Future upstream updates

Data maintainers publish compatible edits under `/v1/` with an updated `catalogVersion`, publication date and correct counts. Users obtain them on next app-session refresh or manual refresh without a new client APK/Web release. Invalid updates leave the last good snapshot intact. Breaking schemas require a separate `/v2/` and a reviewed client migration. The current manifest has no content hashes, so validation enforces structure/references/counts rather than cryptographic snapshot consistency.

## Validation and changed files

Run `npm run lint`, `npm run typecheck`, `npm run test:ci` and `npm run build:gh -- --configuration=production`. Tests cover the actual snapshot, schema/version rejection, incomplete downloads, references, filters, hierarchy, grouping, localization fallback, seed isolation, timeout recovery, offline startup and playback restrictions. The production base href remains `/radio-bee/`.

Implementation validation: all four commands passed, with **17 tests in three files** and **no component-style budget warnings**. Headless Chrome with the actual repository snapshot served as mocked catalogue responses passed the full AXE ruleset at **375, 820 and 1280px** in both light and dark themes, with no horizontal overflow. Browser checks also confirmed Tamil/Sanskrit switching, persisted language and offline data-host reload with the saved catalogue. Screenshots were inspected for desktop and mobile layout. These checks do not establish availability of the live data host or native-device behavior. Local Node was 24.22.1; CI Node configuration was untouched.

Modified: `src/app/home/home.page.{ts,html,scss,spec.ts}`, both `src/environments/environment*.ts`, `README.md`, and the stale starter-page statement in `documentation/WEB-DEPLOYMENT.md`.

Added: `src/app/catalog/catalog.{models,validation,service,ui,spec,fixture}.ts`, `src/app/catalog/station-browser.{ts,html,scss}`, `src/assets/catalog-development-seed.json`, `src/assets/catalog-seed-LICENSE.txt`, and this guide.

The test fixture is used only by tests. No application dependencies, deployment workflows, Android signing scripts, application ID or Android version values were changed. No commits, pushes, merges or GitHub settings changes were performed.
