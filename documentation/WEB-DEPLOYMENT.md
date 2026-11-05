# RadioBee Web deployment

RadioBee — Stay tuned. Stay buzzing.

**RadioBee Web Build and Deploy** uses GitHub's official Pages artifact pipeline. Pushes to `main-github` deploy automatically, and `workflow_dispatch` supports manual builds. Both jobs require `github.ref == 'refs/heads/main-github'`; selecting another branch skips them.

The application now has the branded RadioBee home and Stage 2 station-discovery browser. Playback is reserved for Stage 3. Catalogue availability is independent of client deployment; see the [catalogue integration guide](CATALOGUE.md) for data-host status and development fallback behavior.

## Build and deployment

The build job checks out the triggering commit, configures Node **24.16.0**, installs the unchanged lockfile with `npm ci`, and runs:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build:gh -- --configuration=production
```

`actions/configure-pages@v5` reads the existing Pages configuration. Automatic enablement remains disabled; repository settings must already select GitHub Actions. Angular's existing `build:gh` script supplies `/radio-bee/` exactly once, and npm's `--` separator passes the production flag to Angular.

Before uploading, the workflow checks that `www/index.html` is nonempty and contains `<base href="/radio-bee/">`. It runs the existing `copy-error-page` script, checks `www/404.html` is nonempty, and compares both files byte-for-byte to preserve Angular's routing fallback.

`actions/upload-pages-artifact@v4` archives the contents of **`www/`**, with `index.html`, `404.html`, JavaScript, CSS and assets at the site root. The artifact is named `github-pages`. The repository root and a `dist` directory are never uploaded.

The separate deploy job has an explicit `needs: build` dependency, so validation or artifact-upload failure prevents deployment. It uses `actions/deploy-pages@v4` with the `github-pages` artifact and environment. The environment URL comes from `steps.deployment.outputs.page_url`.

Permissions are scoped to each job: the build has `contents: read` and `pages: read`; deployment has `pages: write` and `id-token: write`. No contents-write permission or publishing-token secret is required. Branch-specific workflow concurrency with cancellation disabled prevents competing runs from publishing simultaneously.

The summaries report the actual source SHA, Angular build/artifact outcomes and deployment outcome. A deployed URL appears only after the deployment action succeeds. Check the **github-pages deployment record and its URL**, then visit [RadioBee](https://actionanand.github.io/radio-bee/).

**This workflow creates no commits in `gh-pages`.** That branch remains unchanged as legacy generated content; it is no longer the deployment source. An unchanged branch is expected and does not indicate a failed artifact deployment. The workflow contains no third-party publisher, branch-publishing inputs or Git push steps.

See GitHub's [custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Run manually

1. Open the repository on GitHub → **Actions**.
2. Select **RadioBee Web Build and Deploy**.
3. Click **Run workflow**.
4. Select **main-github**.
5. Click **Run workflow** and open the resulting run.
6. Confirm the build job uploads `github-pages`, then the deploy job succeeds in the `github-pages` environment.
7. Open its deployment URL and check [the live application](https://actionanand.github.io/radio-bee/).

GitHub requires the workflow definition with `workflow_dispatch` on the default branch before manual dispatch is available. The default branch is **`master`**. The updated definition must be integrated into both `master` and `main-github`; the branch guard still prevents deployment from `master`. See [GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Inspected source and safe integration

Remote inspection on **6 November 2026** found:

| Ref                           | Commit    | State                                                                     |
| ----------------------------- | --------- | ------------------------------------------------------------------------- |
| `master`                      | `b69c31a` | Default branch; legacy publishing workflow, no manual trigger             |
| `main-github`                 | `c5f857d` | One merge commit behind master; identical source tree and legacy workflow |
| Local implementation checkout | `b69c31a` | Matches current remote master before this fix                             |

The official workflow is prepared locally. **It is not yet on remote `master` or `main-github`** until the reviewed change is committed and integrated with approval. The previous empty trigger commit `9284183` is already in the inspected source history and must remain there. Future manual deployments need no empty commit.

The following commands are instructions for a clean checkout **after approval**, not actions performed by this implementation. First review and commit the two changed files on the current implementation branch through the repository's normal process. Then integrate while preserving history:

```bash
git fetch origin
git switch master
git pull --ff-only origin master

# Preserve any Web-branch commits added since inspection.
git merge origin/main-github

# Integrate the reviewed change from the current implementation branch.
git merge feature/1-basic-radio

# Confirm both histories are retained, then run the validations listed above.
git merge-base --is-ancestor 9284183 HEAD
git merge-base --is-ancestor origin/main-github HEAD
git push origin master

git switch main-github
git pull --ff-only origin main-github
git merge --ff-only master
git push origin main-github
```

At the inspected history, incorporating `origin/main-github` into `master` is already up to date. If branches advance, normal merges preserve both histories. If a fast-forward or push fails, fetch and inspect the new commits, incorporate them into `master` with a reviewed normal merge, then retry the fast-forward. Do not reset, rebase away existing shared commits, force-push or delete branches. Where protection requires PRs, use an approved merge process that preserves ancestry. Leave `gh-pages` and `main-android` untouched.

After integration, confirm both remote branch versions of `.github/workflows/gh-pages.yml` contain the official actions and `workflow_dispatch` before running a manual deployment.

## Repository settings to check

- **Settings → Pages → Build and deployment → Source: GitHub Actions.** The user has already switched this setting; verify it remains selected. Do not select branch publishing.
- **Settings → Environments → github-pages:** allow deployments from **main-github**. Replace an old restriction that permits only the default branch or `gh-pages`; retain any intentional reviewer approvals.
- **Settings → Actions → General:** ensure repository/organization policy permits the official actions and the job-declared Pages/OIDC permissions. The workflow needs no `contents: write`, personal token, deploy key or additional secret.
- Integrate the manual-trigger definition onto default branch **master** as well as **main-github**, observing source-branch protections.
- Disable any separately configured legacy Web publisher if one exists. Retain the generated `gh-pages` branch without using it as a source or altering its history.

The Android workflow, signing scripts, application ID, dependencies and Android version file are outside this change. `main-android` remains the only Android release branch; `main-github` remains the only Web deployment branch.

## Verification limits

Local checks on **6 November 2026** passed:

- `npm ci`, lint, TypeScript checks, both app tests and the production `build:gh` command.
- actionlint 1.7.12 validation of workflow YAML, action inputs, GitHub expressions, step references, permissions and job dependencies; all shell blocks also passed Bash syntax checks.
- Structural checks for both branch guards, exact artifact-name matching, build-before-deploy ordering, and absence of legacy publishers or Git push commands.
- The index/base-href checks and existing 404-generation command. The fallback was byte-for-byte identical to the index.
- Packaging and extraction of a local archive using the official action's tar rules: **27 entries, 829440 bytes**, including root `index.html`, `404.html`, artwork, and all **7 referenced JavaScript/CSS files**. Repository sources and Android files were absent from the archive. This verifies local packaging, not an upload to GitHub.
- Summary simulations for success, failure and skipped deployment outcomes; only success displayed a deployed URL.
- Byte-for-byte checks that dependency files, Angular/Capacitor configuration, Android workflow, version file and all existing scripts were untouched. Formatting and Git whitespace checks passed.

The host used Node 24.22.1 and an isolated npm runtime; CI keeps Node 24.16.0. Validation tools and archives are under ignored `tmp/`, with no new application dependency or permanent test scaffolding.

A pre-existing resource issue was discovered: `src/index.html` references `assets/icon/favicon.png`, but the available favicon files are `favicon.ico` and `favicon (1).png`. That link was not changed by this infrastructure fix; the JavaScript/CSS, routing files and existing artwork were verified separately.

Local validation can prove build output, artifact contents, YAML/action expressions, branch guards and summary behavior. It cannot establish a new live Pages deployment without an approved integration and workflow run. After integration, verify the deployment record and URL rather than looking for a new `gh-pages` commit. A manual dispatch targeting another branch should have both jobs skipped.
