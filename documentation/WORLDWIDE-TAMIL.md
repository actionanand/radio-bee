# Worldwide Tamil stations and trial listening

The data catalogue 1.6.0 expands the previous 65 listings to 85 across 14 countries. The worldwide addition contains 20 sourced stations from the UK, Canada, USA, Australia, Singapore, UAE, Malaysia, Switzerland, Germany, Norway, New Zealand and South Africa. It includes online/digital services and multilingual stations with scheduled Tamil programmes; it does not assert that every service is analogue FM or Tamil-only.

At the user's explicit request, ten worldwide feeds plus ISKCON Nagercoil are retained in normal playback data after short real browser decoding. Their verificationStatus remains unverified, lastVerifiedAt null, rightsStatus unconfirmed and directListening needs-review. The existing permissive configuration offers trial listening; strict policy and explicit restricted use status still block it. The added three-language Unverified trial stream label distinguishes this from editorial approval. Approved-listening count stays zero. IBC recording/redistribution are prohibited; existing recording policy and consent behavior are unchanged.

Data remains authoritative. The application fetches the manifest's normal and optional discovery payloads atomically. Production never loads or publishes the development seed. That file contains only a tiny fictional offline UI example, not a copied station catalogue. New stations without a usable direct feed appear through metadata-only cards, details, favourites and country filters. Existing AIR identity, Sooriyan alternatives, regional discovery, saved IDs and translations remain intact. ISKCON uses the same ID when moving from discovery to playback; it had no legacy removal tombstone.

To reproduce local review with Linux Node through WSL2:

```bash
cd ../radio-bee-data
npm run validate
npm test
npm run build
cd ../radio-bee
node -p 'process.platform' # must be linux
node scripts/generate-worldwide-fixture.mjs ../radio-bee-data/dist/v1
npm run build
RADIOBEE_PREVIEW_PORT=4314 node scripts/preview-discovery.mjs
```

Open http://localhost:4314/home. The developer-only preview maps catalogue requests to the actual built data JSON; it does not relay audio or change production configuration. Streams connect directly to their published endpoints. Stop with Ctrl+C. The generated worldwide fixture is a test subset of authoritative built data with a source hash; regenerate rather than hand-edit it. The older regional contract fixture is generated separately with scripts/generate-catalog-fixture.mjs.

Regression tests cover all twelve country filters, twenty unique identities, distinct discovery/candidate/approval counts, unverified trial gating, strict-policy denial, express restrictions, IBC recording prohibition and all three UI-language labels. Normal player, recovery, favourites, discovery-transition and Android tooling suites remain in the full checks. Short desktop decoding is not sustained reliability, independently heard Tamil speech or physical Android certification.

Evidence and remaining feed/use-review work are in radio-bee-data/docs/WORLDWIDE-TAMIL.md, docs/worldwide/stations.json, stream-checks.json, browser-checks.json and VALIDATION.md. No commit, push, merge or deployment was performed; live app availability requires a separately approved release of matching data/client changes.
