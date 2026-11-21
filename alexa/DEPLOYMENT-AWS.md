# Radio Bee Alexa — deploy from GitHub

**Architecture:** `radio-bee` owns the Alexa code and GitHub Actions. The release branch is `main-alexa`: every push, merge or fast-forward to that branch triggers Lambda tests and, once AWS is configured, Lambda deployment. Updates to `master` never deploy Lambda. Do not force-push `main-alexa`. To release changes from `master`, selectively merge or cherry-pick reviewed Alexa changes into `main-alexa`. The `radio-bee-data` repository publishes `alexa/station-numbers.json` and `v2/stations.json` on GitHub Pages. Lambda downloads the two data files at runtime. It does not proxy audio.

**Important:** This setup deploys to an **AWS Lambda function you own** and an Alexa Custom Skill using **Provision your own** endpoint. If you already created an **Alexa-hosted** skill, that is a different hosting model: create a separate self-managed Custom Skill or use the Alexa-hosted deployment procedure instead. Never attach a separate AWS Lambda deployment workflow to an Alexa-hosted skill without explicitly migrating its endpoint.

## One-time step 1 — AWS Lambda

1. Open https://console.aws.amazon.com/lambda/ and choose a region supported by your Alexa endpoint. For example, use **eu-west-1 (Ireland)** when you will select the Alexa Europe endpoint. Use the same region below.
2. Create a function named **radio-bee-alexa**, **Author from scratch**, runtime **Node.js 22.x**, architecture **x86_64**, and a fresh execution role with **AWSLambdaBasicExecutionRole**. This is the Lambda execution role, not the GitHub deploy role.
3. AWS may ask for initial code: leave its sample code. The GitHub workflow replaces it after configuration.
4. In Runtime settings, set handler to **index.handler**. Set timeout to **10 seconds** and memory to **128 MB**. Keep Lambda outside a VPC unless outbound internet access is configured. Record the Lambda ARN.

## One-time step 2 — Alexa Developer Console

1. In https://developer.amazon.com/alexa/console/ask create a **Custom** skill, language **English (India)**, hosting **Provision your own** (not Alexa-hosted). Do not publish yet.
2. Open **Build → Interaction Model → JSON Editor**. Copy the complete JSON from `alexa/skill-package/interactionModels/custom/en-IN.json`, save it and select **Build Model**. Fix any console validation errors before proceeding.
3. Under **Endpoint**, select **AWS Lambda ARN** and paste the function ARN into the matching geographic endpoint field (e.g. Europe for `eu-west-1`). Save endpoints. Record your skill ID (like `amzn1.ask.skill....`).
4. Add a Lambda **Alexa Skills Kit** trigger and restrict it to that exact skill ID. Verify Lambda's resource-based policy grants `alexa-appkit.amazon.com` permission to invoke that function, scoped to the Alexa Skill ID. Do not enable a public Lambda Function URL.

## Alexa trial playback eligibility

Radio Bee attempts direct AudioPlayer playback from catalogue stream candidates on HTTPS port 443, using supported listed formats MP3, AAC and HLS. Zeno feeds with an unknown catalogue format may be attempted as a trial, not asserted to have a verified codec. AWS Lambda does **not** proxy, record, cache or redistribute station audio. URLs that require another port (or fail Alexa's TLS, codec or playlist requirements) cannot be made playable by relaxing catalogue flags.

For trial playback, Lambda does not use `verificationStatus`, `rightsStatus` or `directListening.status` as an eligibility gate; the published catalogue values are **not changed** and still represent unverified technical status and unconfirmed rights. This is not broadcaster authorization or a guarantee of playback. Before public publication, obtain any required stream permissions and confirm device playback. Changing the release branch `main-alexa` automatically deploys the Alexa Lambda code, while station catalogue metadata remains in `radio-bee-data`.

## Add English (US) support to this same skill

The skill supports two English locale models in source: `alexa/skill-package/interactionModels/custom/en-IN.json` and `en-US.json`. Do **not** create a separate Alexa skill or Lambda. In the Alexa Developer Console:

1. Open **Build → Language Settings** from the locale dropdown and **Add new language → English (US)**. Optionally copy existing locale content from English (India) if offered.
2. Select **English (US) → Interaction Model → JSON Editor** and import `en-US.json`. **Save Model**, then **Build Model**.
3. Verify the **Audio Player** interface and the existing AWS Lambda endpoint `arn:aws:lambda:eu-west-1:915238400460:function:radio-bee-alexa` are applied to en-US. The Skill ID and Lambda remain shared.
4. Complete **Distribution → Skill Preview → English (US)** and save required details. Use the same brand artwork. Re-run certification validation as needed; an existing submission may require an update submission.
5. Under **Test**, choose **English (US)** and verify launch and channel playback directives. Set the Alexa phone language to English (US) for device testing. The same `alexa/station-numbers.json` catalogue (which retains `locale: "en-IN"`) powers both locales.

Updating files in GitHub or deploying the Lambda **does not** configure the Alexa locale in Amazon's developer console. The interaction model must be copied/imported and built there.

## One-time step 3 — GitHub OIDC (no long-lived AWS keys)

In AWS IAM create an OpenID Connect provider:

- URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

Create an IAM role `RadioBeeAlexaDeploy` with the following trust policy. Replace `AWS_ACCOUNT_ID` with your 12-digit AWS account ID:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:actionanand/radio-bee:ref:refs/heads/main-alexa"
        }
      }
    }
  ]
}
```

Attach **only** these permissions to the GitHub deploy role; replace `AWS_ACCOUNT_ID` and `AWS_REGION`. If you chose a different Lambda name, change it here and in GitHub variables.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration"
      ],
      "Resource": "arn:aws:lambda:AWS_REGION:AWS_ACCOUNT_ID:function:radio-bee-alexa"
    }
  ]
}
```

## One-time step 4 — GitHub Actions variables

Go to https://github.com/actionanand/radio-bee/settings/variables/actions and add these **repository variables** (do not store AWS access keys):

| Variable | Example |
| --- | --- |
| `ALEXA_AWS_REGION` | `eu-west-1` |
| `ALEXA_AWS_ROLE_ARN` | `arn:aws:iam::AWS_ACCOUNT_ID:role/RadioBeeAlexaDeploy` |
| `ALEXA_LAMBDA_FUNCTION_NAME` | `radio-bee-alexa` |

Use the real ARN from IAM. These variables are not secret credentials. GitHub Actions gets short-lived AWS credentials through OIDC.

## Deploy and test

A push, merge, or fast-forward to `main-alexa` automatically launches this workflow. A one-time manual run is optional when testing AWS credentials or retrying after configuration changes; updates to IAM trust policies and GitHub Actions variables do **not** themselves produce a GitHub push event.

1. Merge the workflow PR after its checks pass, then use the dedicated `main-alexa` release branch. GitHub's workflow file must be on the default `master` branch for manual `workflow_dispatch` discovery; the actual deployment always checks out `main-alexa`. Every new commit on `main-alexa` triggers deployment, not just Alexa-file changes.
2. Go to https://github.com/actionanand/radio-bee/actions/workflows/deploy-alexa-lambda.yml , choose **Run workflow**, branch **main-alexa**. It runs Alexa unit tests first, builds a ZIP from `index.js`, `catalogue.js` and `package.json`, and updates the existing Lambda function.
3. Ensure the GitHub Actions run ends with successful `LastUpdateStatus`. If the AWS variables have not been set, the test runs but deploy is **skipped** with a warning.
4. In the Alexa Developer Console's **Test** tab enable development testing, try **open radio bee**, **play channel one**, **play channel two**, and **stop**. Check Lambda CloudWatch logs if the invocation fails.
5. This workflow deploys **Lambda code only**. Interaction model edits must be saved and rebuilt manually in the Alexa Console. The data repository publishes channel changes separately, so channel registry updates do not require Lambda redeployment.

## Playback limits

The existing handler intentionally refuses to stream unless the catalogue marks the stream **verified**, rights **permission-granted** and direct listening **allowed**. It additionally restricts codec and HTTPS requirements. A deployed skill can respond to voice commands while still refusing audio playback. Verify streaming rights and compatibility before release.

## Security and rollback

Avoid AWS administrator permissions for the deploy role. Review workflow edits in pull requests. To roll back, revert the offending Lambda change on `main-alexa` and rerun the workflow; Lambda versions/aliases may be added later for more robust rollback. Review AWS CloudWatch logs and costs after the first test.
