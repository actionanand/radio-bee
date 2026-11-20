# RadioBee Alexa custom skill (English India)

This is **source code**, not a deployed or published Alexa skill. It lives separately from the Angular/Ionic web app and Android build. The existing data repository remains the single source for stations.

## Architecture

- Alexa-hosted Node.js Lambda: `alexa/lambda/index.js` (handler: `index.handler`).
- en-IN interaction model: `alexa/skill-package/interactionModels/custom/en-IN.json`.
- Published channel registry: https://actionanand.github.io/radio-bee-data/alexa/station-numbers.json
- Published stations: https://actionanand.github.io/radio-bee-data/v2/stations.json
- Echo AudioPlayer fetches the broadcaster's URL directly. Lambda never proxies audio.

The station data has a five-minute in-memory cache. It remains authoritative at GitHub Pages; editing channel numbers alone does not require a Lambda deployment. The invocation name “radio bee” and utterances must still be accepted by the Alexa interaction-model validator.

## Channel policy

English (India) for voice recognition. Only catalogue entries exclusively tagged Tamil (`ta`), English (`en`), or both are eligible. **Channel 1** is Tamil Kadavul Murugan and **channel 2** is Mugugan Songs FM (“Murugan Songs FM” is a recognized alias). All assigned channel numbers are permanent; never renumber existing station IDs after release.

## Safety and availability

**A listed station is not necessarily Alexa-playable.** The skill refuses streams unless all three conditions are satisfied: `verificationStatus=verified`, `rightsStatus=permission-granted`, and `directListening.status=allowed`. It also requires HTTPS on port 443 and an MP3/AAC/HLS candidate. The current catalogue generally has unverified, unapproved candidates, so do **not** advertise the skill as ready for radio playback yet. Confirm permissions, codecs, TLS, redirects, and playback on a real Echo for each channel before launch. An HTTP or non-443 URL must not be relayed through AWS without explicit approval and cost assessment.

## Test locally

```bash
cd alexa/lambda
npm test
```

Tests use Node's built-in test runner; there are no extra npm dependencies. The root Angular build and dependencies are unchanged.

## Deploy manually when ready

1. Open the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), create a **Custom / Alexa-hosted (Node.js)** skill, and choose **English (India)**.
2. Copy/build the `en-IN` interaction model and validate it. The skill must use the invocation name approved by Amazon.
3. Deploy `alexa/lambda/index.js` and `alexa/lambda/catalogue.js` to the Alexa-hosted Lambda function. Set the handler to `index.handler`. The deployed Lambda function must be able to fetch HTTPS from GitHub Pages.
4. Use the developer console test interface and an Echo to verify name matching, number matching, session handling, streaming formats, permissions, and next/stop/resume. Resume depends on Alexa retaining AudioPlayer context; no persistent history store is implemented.
5. Only after rights and playback verification, prepare store metadata, privacy materials, certification, and publication. This repository does not contain Amazon authentication credentials or an automatic deployment workflow.

Changes to the voice model require deploying/rebuilding the Alexa interaction model. Changes to Alexa Lambda logic require redeploying the Lambda. Changes to the station registry or V2 streams require only the existing data site's GitHub Pages deployment.
