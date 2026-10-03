import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
test('integration retains immutable source and downloaded artifact identity checks', () => {
  assert.equal((workflow.match(/ref: \$\{\{ inputs.source_sha \|\| github.sha \}\}/g) || []).length, 2);
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes('test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes("assert reports['game/browser-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
});
test('bounded browser families keep motion, WebKit, responsiveness and negative identity gates', () => {
  assert.ok(workflow.includes('max-parallel: 2'));
  assert.ok(workflow.includes('suite: [active, catalog, ui]'));
  assert.ok(workflow.includes('npx playwright install --with-deps chromium webkit'));
  for (const gate of ['browser', 'motion', 'motion-detail', 'flow-render', 'wall-render', 'motion-catalog', 'touch-layout', 'reliability', 'touch-layout-identity', 'responsive']) {
    assert.ok(workflow.includes(`node scripts/check-inkwave-${gate}.mjs`), gate);
  }
  assert.ok(workflow.includes('patches/touch-layout/**'));
  assert.ok(workflow.includes('patches/reliability/**'));
});
test('successful browser artifacts require validated reports and distinct suite receipts', () => {
  assert.ok(workflow.includes("assert report['status']=='passed'"));
  assert.ok(workflow.includes("assert report['contentHash']==build['contentHash']"));
  assert.ok(workflow.includes("'suite':suite"));
  assert.ok(workflow.includes('if: success()'));
  assert.ok(workflow.includes('name: inkwave-browser-${{ matrix.suite }}-${{ inputs.source_sha || github.sha }}'));
});

test('nested INKWAVE guard changes trigger both pull request and pushed-main validation', () => {
  assert.equal((workflow.match(/scripts\/tests\/inkwave-\*\.mjs/g) || []).length, 2);
});
test('compatibility failure preserves its primary error without a missing diagnostic upload', () => {
  assert.ok(workflow.includes("if: failure() && hashFiles('.ci-scratch/inkwave-patches/patch-tests.log') != ''"));
});
test('runtime verifier storage is prepared before tests and baseline checkout is resolved before creation',()=>{
 const prepare=workflow.indexOf('name: Prepare persistent runtime verifier fixtures'),tests=workflow.indexOf('name: Verify motion verifier regressions');
 assert(prepare>=0&&prepare<tests);assert(workflow.includes('sudo chown "$(id -u):$(id -g)" "$runtime_fixtures"'));assert(workflow.includes('test -w "$runtime_fixtures"'));
 assert(workflow.indexOf('test "$(realpath -m "$baseline_checkout")"')<workflow.indexOf('git worktree add --detach "$baseline_checkout"'));
});
