import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('PR validation runs required checks with read-only access and no publishing capability', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pr-validation.yml', import.meta.url), 'utf8');
  const trigger = workflow.split('\non:')[1].split('\npermissions:')[0];
  assert.match(trigger, /^\s*pull_request:\s*$/);
  assert.match(workflow, /permissions:\s*\n  contents: read\s*\n/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(
    workflow,
    /\bwrite\b|deploy-pages|upload-pages|configure-pages|git push|main-github|pull_request_target/,
  );
  for (const command of [
    'npm ci',
    'npm run lint',
    'npm run typecheck',
    'npm run test:ci',
    'npm run build:gh -- --configuration=production',
    'node --test scripts/pr-validation.test.mjs scripts/web-preview.test.cjs scripts/playback-evidence.test.cjs',
  ]) {
    assert.ok(workflow.includes('run: ' + command), 'Missing required PR check: ' + command);
  }
  assert.doesNotMatch(workflow, /run:.*(?:verify-stage[678]|compare-hls-engines)/);
});
