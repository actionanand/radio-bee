# Alexa skill link in Radio Bee Settings

The V2 Settings screen has an optional, localized **Listen on Alexa** section. Both values are configured in **both** `src/environments/environment.ts` and `src/environments/environment.prod.ts`:

```typescript
AlexaSkill: { Enabled: true, Url: '' } satisfies AlexaSkillConfig,
```

- `Enabled: false`: remove the entire section from Settings, including its button.
- `Enabled: true` with `Url: ''`: show the section and an unavailable status, but **do not display an actionable link**.
- `Enabled: true` with `Url: 'https://...'`: render a link opening the configured HTTPS skill detail/invitation page in a new tab (with `noopener noreferrer`). The link itself **cannot silently install** a skill; Amazon handles enablement and account sign-in.

After Amazon publishes the skill, copy the **actual public Skill Store detail link** from the Alexa app/Store. Before public release, use the official **beta invitation link**, but only invited accounts can enable it. A developer-console URL, Lambda ARN, or Alexa Skill ID isn't an installation URL. Never invent an Amazon ASIN from the skill ID.

Changes to this compile-time environment config require a Web App rebuild/redeployment (GitHub Pages workflow on `main-github`); these changes do not deploy the Alexa Lambda because that runs exclusively on `main-alexa`.
