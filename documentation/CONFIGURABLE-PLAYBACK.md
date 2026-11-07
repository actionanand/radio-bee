# Stage 7: environment-controlled playback attempts

Branch: `feature/7-configurable-radio-playback`, created from freshly fetched master `089fb4426137d9d1e230a34c1a99306ce50ad2e4`. The configured SSH remote failed host-key verification; master was fetched over public HTTPS without changing remote settings or disabling host verification.

## Configuration

All three environment files (`environment.ts`, `environment.prod.ts`, `environment.live-test.ts`) explicitly define:

```ts
RadioApi: {
  AllowUnverified: true,
  CheckVerificationStatus: false,
  CheckRightsStatus: false,
}
```

These are the exact requested defaults. `RadioApiConfig` gives the properties readonly boolean types. `RADIO_API_CONFIG` provides a frozen environment-derived copy through Angular injection. Tests can inject another policy, or pass one directly to the pure eligibility functions. There is no runtime URL/query-string switch, settings UI or catalogue-driven policy override.

## Eligibility rules

| Verification check | AllowUnverified | Verified | Unverified | Explicitly unavailable                            |
| ------------------ | --------------- | -------- | ---------- | ------------------------------------------------- |
| false              | either          | Accepted | Accepted   | May be attempted; ranked below healthy candidates |
| true               | false           | Accepted | Blocked    | Blocked                                           |
| true               | true            | Accepted | Accepted   | Blocked                                           |

Rights checking is independent:

- `CheckRightsStatus=false` ignores unconfirmed rights and `directListening.needs-review` as playback-attempt blockers.
- `CheckRightsStatus=true` requires `rightsStatus=permission-granted`, and `directListening.allowed` when that optional metadata exists. Older catalogues without directListening remain compatible.
- **Explicit `directListening.restricted` is blocked under every combination**, including local technical selection.
- HTTPS, absence of credentials, supported audio format (`mp3`, `aac`, `hls`) and functional player/platform support remain required. Disabling editorial checks never permits free-form URLs or HTML/non-audio formats. The player resolves station/stream IDs against the latest loaded catalogue rather than trusting a caller's altered object. Actual MIME/codec/network failures are handled by the real decoder, not inferred from a URL's appearance.

The published 1.3.0 snapshot has 88 stations and 26 candidates across 25 stations. With valid supported formats and no explicit restriction, the defaults offer **25 station Play controls**; the 63 no-stream listings retain a compact localized unavailable indication. This is eligibility to **attempt** playback, not an uptime or authorization claim.

## One policy for the player and discovery

Cards, PlayerService play/toggle/resume, Listen now, refresh/revocation, retry and fallback all use the same injected policy and shared candidate selector. The local technical panel remains explicitly gated to a non-production, opted-in loopback build, but it does not bypass the injected RadioApi policy. Its optional stream-ID pin limits a diagnostic run to that candidate; normal cards use the full eligible pool.

The strict verification/rights implementation remains present and is tested. Existing Stage 3–6 strict contract tests explicitly inject the strict preset; new Stage 7 tests cover all eight flag combinations and the new production defaults. The historical Stage 6 browser driver encodes the old strict baseline; use the Stage 7 production driver for these defaults.

Metadata changes are evaluated against the current policy. Ignored editorial changes do not stop an otherwise valid relaxed-mode selection. A removed/changed URL, unsupported source or explicit restriction invalidates it. An eligible alternate can replace an actively playing source; if the user paused, a refresh never resumes audio automatically. With no valid alternative, playback stops and an understandable localized error is shown.

## Candidate preference and bounded fallback

Only eligible streams are ranked. Preference uses:

1. Session-local observed playing/failure outcomes, keyed by URL.
2. Existing technical verification metadata.
3. Official/broadcaster source provenance, with catalogue order as a stable tie-break.

This is a technical preference, never a permission grant. No station-specific runtime ID/URL map, fake verified flag or catalogue rewrite is introduced. In 1.3.0, Sooriyan's official source has `kind: official`, while the old root URL comes from an unverified directory lead. Thus its official port-2020 candidate is selected before the known problematic port-8006 root. Successful playback and subsequent failures update only in-memory preference, not cached catalogue metadata.

Each play request tries at most **three distinct eligible URLs**, each once. Load errors, media errors/end-of-stream and the existing 20-second buffering watchdog can advance to another candidate. Exhaustion produces Error/Retry; explicit Retry starts a fresh bounded budget and re-resolves current metadata. Observed failures deprioritize failed URLs so later manual retries can explore other candidates. Browser gesture rejection is reported directly instead of attempting to bypass it with another URL.

Pause, stop and station switching invalidate pending operations. A loaded pause/resume reuses the audio element; cold resume/retry resolves the newest candidates. Old HLS callbacks check adapter identity and generation, so a discarded adapter cannot load a source or dispatch a fatal error into its successor. Volume/mute survive fallback and switching. One real audio element remains shared by cards and the persistent mini-player.

## Website placement and interface

Play/Pause/Retry always invoke RadioBee's engine, never a website redirect. Broadcaster links exist only inside the compact Station Details popup, where an optional validated HTTPS link appears with station metadata. Cards, mini-player, hero, filters and errors do not offer an external listening fallback. Ionic icons, RGB tuner, favorites, network grouping, English/Tamil/Sanskrit, responsive layouts and India-only geographic hierarchy are preserved.

## Authorization and remaining restrictions

Relaxing these checks enables technical playback attempts; it **does not establish broadcaster authorization**. The client never changes the published rights/verification/directListening values. All 26 candidates in the tested public 1.3.0 snapshot remain rights-unconfirmed and need use review.

- Prasar Bharati's [published terms](https://prasarbharati.gov.in/en/terms-conditions/) limit website-material use and reserve other uses. A publicly reachable AIR stream or official-player provenance is not, by itself, an external-app publication grant. Direct listener-to-broadcaster streaming is distinct from relay/recording/redistribution, but the relevant publication terms still need review.
- Sri Lankan and other broadcaster sources retain their existing unconfirmed review records. Successful decoding does not change those records or establish station-programme identity.
- J1 is not in published 1.3.0 and is not included in the Stage 7 real-stream probes. Its [FAQ](https://www.j1fm.tokyo/faq/) restricts direct website audio linking and separately describes conditional mobile use; see the existing [joint policy review](J1-PUBLICATION-REVIEW.md). The unpublished J1 proposal remains unconfirmed. Under the new relaxed policy, a needs-review proposal would permit an attempt if manually loaded; **that would not resolve its Web authorization**. Do not treat the proposal or these flags as publication permission. Known explicit restrictions must remain enforced through `restricted` metadata regardless of flags.

No recording, stream relay or CORS-bypass proxy is added. Website/server CORS, redirects, offline manifests, codecs, browser gestures and platform support can still prevent playback. Deployment/public-use decisions remain separate from this local implementation, and physical Android/WebView behavior still requires device validation.

## Reproducing validation

Use WSL2 Linux and the existing dependencies; verify the platform before Node/npm commands:

```bash
test "$(node -p process.platform)" = linux
npm run lint
npm run typecheck
npm run test:ci
npm run build:gh -- --configuration=production
node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs
node scripts/capture-catalogue.cjs tmp/stage7-catalogue.json
node scripts/verify-stage7-playback.cjs
```

The browser driver uses an existing Playwright/axe installation (`RADIOBEE_BROWSER_TOOLS`) and either existing Chromium or the same local CDP adapter interface (`RADIOBEE_BROWSER_BRIDGE`) used by prior project checks. It serves the unmodified production `www/` bundle on loopback. Metadata requests are pinned to an unchanged capture of public 1.3.0 for repeatability; real media requests are not replaced, except the explicitly labelled fault-injection scenario.

Normal station probes each use a fresh context/audio/event collector and measure playing events, current-time continuity and decoded-byte increases. The separate multi-station controls scenario verifies single-player reuse, pause/resume, mute/volume, switching and stop. Deliberately blocked candidate requests prove bounded fallback/Error/Retry; those failures are not reported as actual broadcaster availability failures. Browser output and screenshots are under `documentation/stage7/`.

Final validation counts, actual probe results, screenshots and changed files are recorded in [Stage 7 validation](STAGE7-VALIDATION.md). No commits, pushes, merges, deployments, dependency reinstalls or data-repository changes are part of this task.
