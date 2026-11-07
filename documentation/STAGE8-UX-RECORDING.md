# Stage 8 — internet radio, themes and optional recording

Client branch: `feature/8-radio-ux-recording-themes`, from master `b1fd194`. The companion data checkout is not edited or required for client validation.

## Production recording configuration and CI

All three environments independently declare:

```ts
RadioRecording: { Enabled: true } satisfies RadioRecordingConfig
```

RadioApi remains `AllowUnverified: true`, `CheckVerificationStatus: false`, `CheckRightsStatus: false`. Recording is independent of technical-test mode. Per the user's clarification, **Enabled=true is permitted in production**. PR and Pages CI print the production setting through `scripts/report-recording-config.mjs`. This is an ordinary log line: no failing release gate, GitHub warning annotation, build-summary warning or end-user build-configuration banner is introduced. The script never flips the flag.

Enabled does not establish broadcaster authorization. Recording-prohibited or explicitly restricted sources remain blocked, independent of playback flags. A stream with missing/unconfirmed recording permission requires an explicit user acknowledgment before each requested capture. A listening permission is not treated as recording permission.

When disabled, the player does not render the deferred recording component. It does not instantiate the recorder service, initialize capture APIs, request microphone access, register recording routes or expose hidden recording actions. Ordinary playback remains available. Recording code is a deferred chunk, not a required playback dependency.

## Capture and export

Recording captures the **existing player's media output**, using `HTMLMediaElement.captureStream()` and MediaRecorder. It never calls getUserMedia, captures a microphone, relays a source, downloads the original stream in the background or uploads a recording. No Web Audio rerouting of the playback element is introduced. A separate analyser of the captured stream checks that genuine signal energy and advancing source time exist. Encoded bytes alone are not proof of sound: the UI remains Waiting until signal and data are observed, and empty/silent capture is rejected.

Capture explicitly retains audio tracks only and stops any video tracks exposed by an HLS container. Signal proof requires three observations above RMS 0.001 (−60 dBFS), advancing playback time and encoded data. Tiny codec noise and a single click do not qualify; an eight-second silent/near-silent attempt is discarded. This conservative threshold can reject very quiet material rather than offer an inaudible recording. Encoder errors remain errors and are not overwritten by a later empty-file stop event.

For a native cross-origin source, Start Recording first checks capabilities and makes an explicit, bounded, credential-free CORS HEAD request. If allowed, the **same player/audio element** restarts with anonymous CORS access; recording starts only after real playing and a fresh permission check. There is no background duplicate player. Denied/unsupported access leaves ordinary playback intact. A failed capture-mode restart restores the previous CORS setting and makes at most one ordinary playback restoration, still using the existing bounded candidate policy. Pause, Stop, Discard or station switching cancel preparation and never trigger that restoration. HLS MediaSource output does not need this native-source preparation. Playback requests are not globally forced into CORS mode just because recording is configured on.

Supported containers are selected dynamically using MediaRecorder.isTypeSupported: WebM/Opus, then Ogg/Opus, then audio MP4/M4A. **MP3 export is not implemented or assumed.** File extensions follow the actual recorder container. Filenames include the station and ISO timestamp and preserve Tamil/Sanskrit combining marks without allowing path separators.

Limits: **2 minutes or 8 MB**, one in-memory draft at a time. Stop offers export and Discard; starting another capture replaces the prior draft only after an explicit action. Discard/destruction releases data and captured tracks. Capture tracks stop synchronously before the player changes source, pauses, stops or falls back, so a single file cannot collect a successor station. Pause ends capture; playback Resume never silently restarts recording. Stream failures, navigation, page hiding and native background notifications end the attempt. Final data is retained for export if it contains genuine audio; destruction discards it.

Browser export opens a user-initiated Blob download. Native export uses existing Capacitor Filesystem Cache and Share, cleans up its temporary cache file and requests no new storage/microphone permissions. Export errors retain the bounded draft for Retry. Opening a download/share flow is not proof that a user saved a file.

### Platform limits

| Platform/source                                                                       | Capability                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chrome + origin-clean accessible media, including supported hls.js MediaSource        | Eligible for capture; real results recorded in validation evidence                                                                                                             |
| Cross-origin native MP3/AAC/HLS                                                       | Explicit capture action can prepare CORS access where permitted; otherwise playback may work while capture is denied/muted. No CORS bypass or globally forced playback setting |
| Browsers without captureStream, MediaRecorder, a supported audio MIME or AudioContext | Recording unsupported; playback continues                                                                                                                                      |
| Safari/native-only HLS                                                                | Runtime detection only; not promised without device verification                                                                                                               |
| Android/WebView                                                                       | Same capture capability checks, plus native cache/share export; requires actual device verification                                                                            |

Primary API references: [MDN captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream), [MediaRecorder MIME detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static), [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem), [Capacitor Share](https://capacitorjs.com/docs/apis/share). Browser playback success alone does not imply capture access.

## Internet-only catalogue compatibility

Only records with nonempty candidate lists are normal station cards. Candidate discovery remains independent of stream playback eligibility; explicitly unplayable candidates still have Details. Terrestrial-only records remain intact in the loaded/cached catalogue but do not clutter the internet browser. Counts are computed from actual visible records and filters; no production logic assumes 88 stations or 25 playable controls.

FM frequencies are descriptive Details metadata only. The RGB hero retains its identity and activity display, but no longer shows an 88–108 tuning scale. Cards always identify internet radio and never imply physical transmitter tuning.

The existing 1.3.0 split transmitter/online listings are resolved for display by omitting stream-less records. Canonical identity remains data-owned: unrelated regional programmes are never merged because they share a network, and names/URLs are not used to invent station mappings. A forthcoming deduplicated schema-compatible catalogue works before or after this client deployment. All optional logo and directListening compatibility is retained.

Favorite IDs are **not erased** when a record disappears or becomes hidden. Existing IDs become visible again if the catalogue returns. Until a data-side canonical mapping is confirmed, no guessed migration is executed. Proposed future migration contract, for discussion only: an explicit versioned retired-ID → canonical-ID map, with nonempty unique IDs, no cycles/chains and targets present in the validated catalogue. Once confirmed, migration should add the canonical favorite idempotently while preserving the retired ID as a recovery record, serialize writes through FavoritesService and run only after a successful validated refresh. This document does not introduce or require an unpublished schema field.

Details display available country, region, district, locality, network, languages, genres and FM-origin information independently of listingStatus. Only IDs actually referenced by the station and found in the validated catalogue are rendered; no national-stream city is invented, and absent fields produce no rows or Unknown placeholders. Official HTTPS broadcaster links remain **only in Details**. Existing popover session/focus/dismissal behavior is unchanged.

## Themes, dropdowns and artwork

Theme modes are Automatic (default), Light and Dark. Capacitor Preferences persists the selection; a small synchronous local cache initializes the html class before Angular/styles, reducing startup flash. Explicit modes override OS appearance, while Automatic responds to OS changes. The [documented Ionic class palette](https://ionicframework.com/docs/theming/dark-mode) replaces dark.system.css. RadioBee and Ionic variables, color-scheme, theme-color and supported native status-bar styling follow the same mode. Native bar failures cannot prevent app startup; no Android configuration change is required.

UI language and all geographic/language filters use Ionic select/option popovers with shared RadioBee overlay variables, accessible labels and 44px triggers. India alone exposes the complete hierarchy, and changing country/ancestors still clears hidden descendants. Native select styling is no longer relied upon. Reduced motion and the premium green/RGB design remain intact.

The installed Ionic 9 popover adds aria-modal without a dialog role, and wraps a radio group in a visual ion-list without listitems. Named dialog htmlAttributes and a narrowly scoped will-present hook mark that visual list as presentation. This preserves Ionic's radio keyboard/focus behavior while correcting the actual accessibility tree; axe rules are not disabled. The hook applies only to RadioBee select popovers, not Details or unrelated overlays.

Artwork keeps the existing station → network → bundled fallback chain, path validation, object-fit containment and per-snapshot failure cache. Refresh can retry a failed catalogue-owned PNG/WebP without loops. No arbitrary remote origins or unvalidated paths are accepted. The public 1.3.0 and subsequently published 1.4.0 captures had **zero station/network logoPath records**; actual new public logo validation therefore depends on that metadata being published and must not be falsely reported as complete.

## Validation

Exact final checks, browser capture evidence, disabled-build results, remaining device/source limitations and changed files are recorded in [Stage 8 validation](STAGE8-VALIDATION.md). All Node/npm commands run through WSL2 Linux with the platform checked. No dependency reinstalls, version/lockfile changes, data-repository edits, commits, pushes, merges or deployments are part of this task.
