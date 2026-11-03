# RadioBee Web deployment

RadioBee — Stay tuned. Stay buzzing.

The **RadioBee Web Build and Deploy** workflow automatically publishes pushes to `main-github`. You can also rebuild and deploy that branch manually, without an empty commit. The workflow runs only when `github.ref` is `refs/heads/main-github`; dispatches selecting any other branch skip the deployment job.

## Manual deployment

1. Open the repository on GitHub → **Actions**.
2. Select **RadioBee Web Build and Deploy**.
3. Click **Run workflow**.
4. Select **main-github**.
5. Click **Run workflow** to trigger deployment.
6. Open the completed run, check all validation/publishing steps and read its summary.
7. Visit [RadioBee](https://actionanand.github.io/radio-bee/).

GitHub requires the workflow definition with `workflow_dispatch` to exist on the default branch before showing the manual control. This repository's default branch is `master`: integrate the workflow there and into `main-github`. The guard still allows deployment only from `main-github`; adding the definition to `master` does not enable deployments from `master`. See [GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Validation and publishing

The workflow uses Node 24.16.0, installs the unchanged lockfile with `npm ci`, and runs:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build:gh -- --configuration=production
```

The existing `build:gh` script supplies `/radio-bee/` once. npm's `--` separator forwards the production flag to Angular. The workflow checks that `www/index.html` is nonempty and has the correct base href, then runs the existing `copy-error-page` command and checks `www/404.html` matches the index for the routing fallback.

Publishing continues through `peaceiris/actions-gh-pages@v3`, using `GITHUB_TOKEN`, `publish_dir: www`, `publish_branch: gh-pages` and the existing Jekyll setting. The unsupported old `deploy_branch` input is replaced by `publish_branch`; the unsupported `base_href` input and its package-name extraction are removed. Angular controls the base href. Action versions are unchanged.

Web runs share a branch-specific concurrency group with cancellation disabled, preventing overlapping publishes. The summary always reports the actual build and publishing step outcomes, trigger and checked-out event SHA. A skipped or failed publishing step is never reported as successful. Publishing success means the generated branch was updated; GitHub's subsequent Pages hosting process may take time or fail independently, so also check the Pages deployment and live URL.

## Branch policy and history-preserving integration

| Branch         | Responsibility                                                  |
| -------------- | --------------------------------------------------------------- |
| `master`       | Primary source and default-branch workflow definitions          |
| `main-github`  | Web builds and publishing                                       |
| `gh-pages`     | Generated hosting content; do not merge it into source branches |
| `main-android` | Android APK/AAB builds only, when created                       |

The Web workflow never invokes Android scripts or changes `android-version.json`. The Android workflow and dependencies are unchanged.

At implementation inspection, `main-github` contained empty deployment-trigger commit `9284183` on top of `master` (`c4cb082`); their source trees were identical. Preserve that commit. Do not reset branches, force-push, squash it away or cherry-pick it (which would give it a different identity).

After reviewing and committing this change on the implementation branch, use the following procedure in a clean checkout **only when you are ready to integrate and push**. These are instructions; the implementation does not execute them:

```bash
git fetch origin
git switch master
git pull --ff-only origin master

# Preserve the complete Web-branch history, including 9284183.
git merge origin/main-github

# Integrate the reviewed implementation; use the appropriate reviewed branch.
git merge feature/1-basic-radio

# Check ancestry and run the validations above before publishing source changes.
git merge-base --is-ancestor 9284183 HEAD
git merge-base --is-ancestor origin/main-github HEAD
git push origin master

git switch main-github
git pull --ff-only origin main-github
git merge --ff-only master
git push origin main-github
```

When `master` has not otherwise advanced, the first merge simply fast-forwards it through the empty commit. If both branches have advanced, a normal merge preserves both histories; review and resolve any conflicts. Required pull requests/protection rules take precedence: use an approved merge commit that preserves ancestry instead of a squash or rebase merge. The feature integration above may likewise be performed through the repository's required PR process.

If a fast-forward check or push fails because someone changed a branch, fetch and inspect the new history, then incorporate the new commits through a normal merge on `master` before retrying. Never reset or force-push. Once the Web-only history is incorporated into `master`, future releases can fast-forward `main-github` to `master` while `main-github` has no new divergent commits. Manual dispatch removes the need for further empty trigger commits. No new work is required on `main-android` for this Web change.

## Repository settings

- Ensure the updated workflow exists on default branch `master` and deployment branch `main-github`.
- Under **Settings → Actions → General**, ensure repository/organization policy permits these actions and a token with `contents: write`. The workflow declares that permission; repository rules must also permit its publishing commit to `gh-pages`.
- Preserve the existing **Settings → Pages** branch-publishing configuration: **Deploy from a branch**, branch **gh-pages**, folder **/(root)**. This workflow uses the existing branch-publishing mechanism rather than the separate Pages artifact deployment mechanism.
- Follow source-branch protection and PR requirements during integration. No additional secret is required; publishing uses the automatically supplied `GITHUB_TOKEN`.

The implementation does not modify repository settings or remote history. After integration, verify one real manual run on `main-github` and optionally dispatch another branch to confirm it is skipped. Local validation cannot prove that remote publishing permissions or GitHub Pages hosting succeed.

## Local verification

Validated on 3 November 2026:

- `npm ci`, lint, typecheck and both existing app tests passed.
- `npm run build:gh -- --configuration=production` passed and expanded to `ng build --base-href /radio-bee/ --configuration=production`, with each flag present once.
- The output contains a nonempty HTML index with `/radio-bee/` as its base href. The existing `copy-error-page` command passed under Git Bash; `www/404.html` is byte-for-byte identical to `www/index.html`.
- YAML structure and branch guards were checked: push/dispatch support, only `main-github` allowed for Web publishing, and only `main-android` allowed by the untouched Android workflow.
- Every workflow shell command passed Bash syntax validation. The summary was executed with simulated success, failure and skipped outcomes and reported each accurately.
- Dependency files, Angular configuration, Android workflow and Android version file were verified byte-for-byte unchanged from the source commit. Formatting and Git whitespace checks passed.

The local host uses Node 24.22.1; CI remains pinned to the requested 24.16.0. Because npm is absent from the host PATH, checks used an isolated npm runtime under ignored `tmp/`. The temporary structural/summary validation scripts are also ignored local checks; no application dependencies or permanent test scaffolding were added. No Android compilation or version bump was run. Actual GitHub event dispatch, branch publishing and Pages hosting remain to be verified after the approved changes are integrated.
