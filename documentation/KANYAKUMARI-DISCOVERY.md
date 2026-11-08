# Kanyakumari discovery client integration

Prepared 8 November 2026 on existing feature/9-radio-playback-reliability, preserving relevant unmerged playback/recording fixes. Data counterpart: feature/10-kanyakumari-discovery, catalogue 1.5.0. No commit/push/merge/deployment.

The optional metadata-only discovery file is fetched and validated atomically; absent in legacy manifests means no extra request. Missing/broken advertised discovery leaves the previous complete cache. New metadata is merged for display/search/filter/details only, with forced empty streams and explicit eligibility refusal. No new unapproved URL can be activated through permissive flags. Existing normal streams, Sooriyan alternatives, recording implementation, themes and media engines remain unchanged.

Updated counts: 65 discoverable stations, 24 with stream candidates (26 URLs), zero with reviewed production-listening approval. The Nagercoil/Kanyakumari category has the existing AIR service plus nine metadata cards: Tamilosai, Isai Murasu, Christian Samy, Annai, ASR, Kumari Tamil Media, ISKCON, Suryan and Hello. Distinct programme IDs and original archived favourite IDs are retained. Unknown websites/languages/frequencies are not invented.

Discovery has no Play action. It shows localized status and, when verified, an official/provider link with target/rel protections; details and favourites remain accessible. English/Tamil/Sanskrit labels were added through ui-extras. New proper names retain canonical spelling. Ordinary filters/grouping operate on a validated combined view; Listen now continues to use playback eligibility. A future transition into/out of the playback array preserves the same favourite ID and never creates duplicate cards.

The development-only seed is updated to the validated data snapshot. Production still uses the remote manifest, with no seed fallback. Local visual review can use the development build; the application clearly marks seed fallback as development data. Live deployment was not changed.

Regression coverage: optional/legacy manifests, atomic cache behavior, raw research-field rejection, public-link checks, alias/ID deduplication, all nine local stations, regional network mapping, all three UI languages, website/provider navigation, favourites/refresh transition, permissive-policy and forged-payload denial, existing Sooriyan normal playback and engine capability filtering. All existing player/recovery/recording/theme tests remain in the full suite. See the data repository's docs/DISCOVERY-PUBLICATION.md and docs/expansion/VALIDATION.md for provenance, network observations, counts, exact test results, file inventory and remaining real-device/use reviews.

## Preview without deploying data

Use Linux Node through WSL2:

```bash
node -p 'process.platform'  # must print linux
npm run build -- --configuration development
node scripts/preview-discovery.mjs
```

Open `http://localhost:4312`. This loopback-only static preview deliberately blocks remote connections through a response CSP, making the existing development fallback load the validated 65-station bundled snapshot. It clearly displays DEVELOPMENT SEED, not live data. It neither rewrites production configuration nor proxies radio audio. Use it for metadata/UI review, not live playback tests. Stop with Ctrl+C. Run the ordinary production build afterward for release review; do not deploy without approval.

Browser review confirmed 65 total cards; Kanyakumari contains one AIR card and all nine metadata additions, with zero enabled Play buttons on those nine. At 390 px, English/Tamil/Sanskrit views had no horizontal overflow. Automatic/light and dark rendering were inspected; the temporary browser viewport was reset. This is responsive Web review, not a physical Android playback or recording certification.
