# Radio Bee — Alexa Custom Skill (English India and English US)

Radio Bee uses a self-managed AWS Lambda (Node.js 22.x) with the same custom skill ID for **English (India), `en-IN`**, and **English (United States), `en-US`**. It does not need two separate skills, Lambda functions, or station catalogues.

## Source files and deployments

- Alexa voice models: `alexa/skill-package/interactionModels/custom/en-IN.json` and `en-US.json`.
- AWS Lambda handler: `alexa/lambda/index.js` (`index.handler`).
- Shared Alexa channel list: https://actionanand.github.io/radio-bee-data/alexa/station-numbers.json
- Shared V2 stations: https://actionanand.github.io/radio-bee-data/v2/stations.json
- Both models use the **radio bee** invocation name, channel numbers and station names.
- The station-number registry has a legacy `locale: "en-IN"` field for its original catalogue schema. **Do not change it** to `en-US` or duplicate the registry; the runtime uses the same numbering for both locales.
- Stream playback is issued directly to the Alexa AudioPlayer interface. Lambda never relays the audio itself.

## Enable en-US in the existing Alexa skill

1. Sign in to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), open the **existing Radio Bee skill** (don't create a second skill).
2. Under **Build**, open the locale selector (currently **English (IN)**), then **Language Settings → Add new language → English (US)** and save. Amazon's **Copy from an existing locale** option may let you copy the en-IN model and store metadata directly.
3. Under **English (US) → Build → Interaction Model → JSON Editor**, import the full `en-US.json` model from this repository. Click **Save Model** and **Build Model**.
4. Confirm the **Audio Player** interface is enabled for en-US. In **Endpoint**, verify the same Radio Bee AWS Lambda ARN is selected for en-US (you can reuse the existing function). Save if needed.
5. Under **Distribution → Skill Preview → English (US)**, complete or copy the store listing, icon, example phrases and any required locale-specific details, then save. Revisit validation/certification when adding en-US to a published or submitted skill.
6. Under **Test**, select **English (US)** and try `open radio bee` and `ask radio bee to play channel one`. For mobile beta testing, set **Alexa on This Phone → Language** to **English (United States)**. Test live sound on a compatible Alexa device.

**Important:** A GitHub push or AWS Lambda deployment does **not** create a locale in Amazon's console, build the Alexa voice model, or publish changes to an already-certified skill. These console steps remain manual unless you configure ASK CLI / SMAPI access.

## Tests

```bash
cd alexa/lambda
npm test
```

The repository CI validates both locale JSON models and exercises the Alexa backend. Changes pushed to `main-alexa` run tests and update the deployed AWS Lambda. Source updates must be merged separately to `master` and fast-forwarded to `main-github` for repository synchronization; the Web App does not host the Alexa model.

## Playback and restrictions

The handler currently attempts trial playback for configured HTTPS port-443 MP3/AAC/HLS streams and some Zeno candidates with unknown format, irrespective of metadata approval flags. Catalogue rights and verification status remain unchanged. Public HTTPS does not establish broadcast permissions, and actual device playback is not guaranteed. Confirm technical compatibility and broadcaster authorization before public release. Existing channel numbers are permanent; **1 is Tamil Kadavul Murugan** and **2 is Mugugan Songs FM**.
