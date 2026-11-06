# RadioBee Stage 3 player

The station browser and root-level player use one policy in `stream-eligibility.ts`. Station discovery, country/language filtering, listing review and network grouping never depend on eligibility.

## Eligibility and messages

| Metadata / platform condition                                   | Result                                        |
| --------------------------------------------------------------- | --------------------------------------------- |
| No streams                                                      | No online stream available                    |
| Unverified                                                      | Stream verification pending                   |
| Unavailable                                                     | Stream currently unavailable                  |
| Verified, rights not permission-granted                         | Playback permission pending                   |
| Approved but URL invalid, non-HTTPS or credential-bearing       | Invalid or insecure stream URL                |
| Approved but format unknown or platform lacks format support    | Stream format is not supported on this device |
| Approved but no functional browser engine exists                | Player is not available on this platform      |
| Verified, permission-granted, valid HTTPS and compatible engine | Ready to play; enabled Play action            |

An eligible alternative is selected when a station has multiple streams. Otherwise the policy selects the most actionable blocker, with platform/format/URL blockers before permission, verification and unavailability. Technical verification alone never means available playback. The policy is also applied at the player boundary against the latest loaded catalogue, rather than trusting a caller's copied station object. Refreshes that remove the selected stream or revoke eligibility stop playback. No data-repository records or permissions are edited by the client.

The data host inspected during implementation served **1.0.0**, not 1.1.0. Its Vasantham entry was unverified with unconfirmed rights. A regression test covers the requested 1.1.0 scenario—technically verified but rights unconfirmed—and requires `permissionPending`, with no playable stream returned. Such a listing remains discoverable under Sri Lanka + Tamil.

## Functional playback and persistence

The Web engine uses a real `HTMLAudioElement`: MP3/AAC when `canPlayType` reports support, native HLS when available, otherwise the already-installed hls.js adapter when MediaSource is supported. Runtime decoding, CORS, network and server failures can still prevent an eligible stream from playing; eligibility is not an uptime guarantee.

Selecting an enabled Play button invokes this engine. The UI reports Playing only after a browser `playing` event. The persistent root player supports pause, stop, retry, volume and mute. It remains mounted when filters hide the playing station or route content changes. It occupies its own layout space rather than covering discovery controls. Pausing disconnects the stream; resume reconnects to live audio rather than seeking to the old position.

Loading/buffering is bounded by a 20-second watchdog. Native media errors, fatal HLS errors and browser autoplay/user-activation rejection receive actionable messages. Switching stations or stopping invalidates old asynchronous attempts, so delayed callbacks cannot start an obsolete selection. Retry is manual. Player errors do not modify cached catalogue metadata or silently remove stations.

Persistence is **within the running app session**, not automatic playback after a page reload. No autoplay, recording, Media3 background service, lock-screen controls or background Android reliability is claimed. Capacitor foreground playback depends on the WebView's codec/platform capabilities and remains unverified on physical devices.

## Localization and tests

English, Tamil and Sanskrit client-owned status/control strings replace the obsolete generic preview text and the promise that playback will arrive in Stage 3. Broadcaster names and catalogue-owned metadata remain unchanged.

Unit tests cover verification/rights combinations, unsafe URLs, unsupported formats/platforms, alternative selection, latest-permission enforcement, play/pause/stop/retry, buffering timeout, volume/mute, superseded selections and permission revocation. Adapter tests cover native audio/native HLS and hls.js setup/error cleanup. Existing catalogue/cache/filter tests remain applicable.

Browser tests use only in-memory test catalogue metadata and generated, owned silent audio. No unconfirmed broadcaster endpoint is contacted. Synthetic fixtures never update the data repository or production catalogue. Successful fixture playback establishes the player wiring, not authorization or live availability of any public station. See the final implementation report for checks completed and format-specific limitations.

## Completed validation

- WSL2 Linux Node 24.16.0: lint, typecheck, all **51 tests in seven files**, and production Web build passed. The build retains `/radio-bee/` and reports no component-style budget warnings.
- Real Chromium playback decoded locally generated MPEG-1 Layer III silent frames, confirmed `currentTime` advancement and the `playing` event, and exercised persistent playback after country filtering, pause/reconnect, stop, failed media loading and retry.
- The verified/unconfirmed-rights Vasantham test fixture remained disabled under Sri Lanka + Tamil. It was not requested by the media engine.
- Full AXE analysis found zero violations at 375, 820 and 1280px in light and dark themes; no horizontal overflow was detected. Mobile player layout was visually inspected.
- Native AAC and native/MSE HLS capability and adapter setup/error paths have unit coverage, but real AAC/HLS decoding and public broadcaster streams were not exercised. Android device/background behavior remains unverified.

All Node/npm commands ran in WSL2. Its installed Chromium lacks required system libraries, so the browser checks used an isolated existing Windows Chrome driven by the WSL Node test runner through a temporary local test bridge. No dependencies or system settings were installed or changed. Temporary test tools/fixtures remain under ignored `tmp/`.

## Exact changed files

Modified:

- `README.md`
- `documentation/CATALOGUE.md`
- `documentation/WEB-DEPLOYMENT.md`
- `src/app/app.component.ts`
- `src/app/app.component.html`
- `src/app/app.component.scss`
- `src/app/catalog/catalog.models.ts`
- `src/app/catalog/catalog.service.ts` (wrap Preferences methods so dependency-injection teardown does not invoke plugin-proxy methods)
- `src/app/catalog/catalog.spec.ts`
- `src/app/catalog/catalog.ui.ts`
- `src/app/catalog/station-browser.ts`
- `src/app/catalog/station-browser.html`
- `src/app/home/home.page.html`

Added:

- `documentation/PLAYER.md`
- `src/app/catalog/stream-eligibility.ts`
- `src/app/catalog/stream-eligibility.spec.ts`
- `src/app/player/media-engine.ts`
- `src/app/player/media-engine.spec.ts`
- `src/app/player/player.service.ts`
- `src/app/player/player.service.spec.ts`
- `src/app/player/player.ts`
- `src/app/player/player.html`
- `src/app/player/player.scss`

The data repository, catalogue seed, application dependencies/lockfile, deployment workflows, Android identity/version/signing files are unchanged. No commit, push, merge or GitHub setting change was performed.
