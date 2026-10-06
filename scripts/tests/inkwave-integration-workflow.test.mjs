import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');

test('integration retains immutable source and independently rebuilt artifact identity checks', () => {
  const checkoutCount = (workflow.match(/uses: actions\/checkout@v4/g) || []).length;
  const pinnedCheckoutCount = (workflow.match(/ref: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}/g) || []).length;
  assert.ok(checkoutCount > 0);
  assert.equal(pinnedCheckoutCount, checkoutCount);
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes('node scripts/build-inkwave.mjs inkwave-public .built-site/_site'));
  assert.ok(workflow.includes('test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes("assert reports['game/browser-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
});

test('parallel browser families retain every final integration acceptance surface', () => {
  assert.ok(workflow.includes('max-parallel: 5'));
  for (const suite of ['suite: active', 'suite: catalog', 'suite: ui', 'suite: network', 'suite: range', 'suite: startup'])
    assert.ok(workflow.includes(suite), suite);
  assert.ok(workflow.includes('browsers: chromium webkit'));
  assert.ok(workflow.includes('npx playwright install --with-deps ${{ matrix.browsers }}'));
  assert.ok(!workflow.includes('needs: validate'));
  assert.ok(workflow.includes('cancel-in-progress: true'));
  for (const gate of ['browser', 'motion', 'motion-detail', 'flow-render', 'wall-render', 'motion-catalog', 'touch-layout', 'reliability', 'touch-layout-identity', 'responsive', 'network-browser', 'range', 'startup-browser', 'rematch-lifecycle'])
    assert.ok(workflow.includes(`node scripts/check-inkwave-${gate}.mjs`), gate);
  assert.ok(workflow.includes('scripts/check-inkwave-network-comparison.mjs'));
  assert.ok(workflow.includes('patches/network-replication/tests/*.test.mjs'));
  assert.ok(workflow.includes('patches/practice-range/tests/*.test.mjs'));
  assert.ok(workflow.includes('patches/loading-cache/tests/worker.test.mjs'));
});

test('all nested final integration source families trigger validation on PR and pushed main', () => {
  for (const pattern of [
    /patches\/movement-physics\/\*\*/g,
    /patches\/network-replication\/\*\*/g,
    /patches\/loading-cache\/\*\*/g,
    /patches\/practice-range\/\*\*/g,
    /scripts\/tests\/inkwave-\*\.mjs/g,
    /scripts\/lib\/inkwave-\*\.mjs/g,
  ]) assert.equal((workflow.match(pattern) || []).length, 2, pattern.toString());
});

test('successful browser artifacts require validated reports and source-bound suite receipts', () => {
  assert.ok(workflow.includes("assert report['status']=='passed'"));
  assert.ok(workflow.includes("report['contentHash']==build['contentHash']"));
  assert.ok(workflow.includes("'suite':suite"));
  assert.ok(workflow.includes('if: success()'));
  assert.ok(workflow.includes('name: inkwave-browser-${{ matrix.suite }}-${{ inputs.source_sha || github.sha }}'));
  assert.ok(workflow.includes("if suite=='network':"));
  assert.ok(workflow.includes("for name in checks: assert reports[name]['sourceSha']==os.environ['SOURCE_SHA']"));
});

test('compatibility failure preserves its primary error without a missing diagnostic upload', () => {
  assert.ok(workflow.includes("if: failure() && hashFiles('.ci-scratch/inkwave-patches/patch-tests.log') != ''"));
});

test('runtime verifier storage is prepared before runtime evidence tests and baseline checkout creation', () => {
  const prepare=workflow.indexOf('name: Prepare persistent runtime verifier fixtures');
  const tests=workflow.indexOf('name: Verify motion verifier regressions');
  assert(prepare>=0 && prepare<tests);
  assert.ok(workflow.includes('sudo chown "$(id -u):$(id -g)" "$runtime_fixtures"'));
  assert.ok(workflow.includes('test -w "$runtime_fixtures"'));
  assert(workflow.indexOf('test "$(realpath -m "$baseline_checkout")"') < workflow.indexOf('git worktree add --detach "$baseline_checkout"'));
});

test('high-quality runtime comparison is final-integration gated and preserves baseline before candidate', () => {
  assert.ok(workflow.includes('timeout-minutes: 120'));
  assert.ok(workflow.includes("github.head_ref == 'inkwave/final-nine-way-integration'"));
  assert.ok(!workflow.includes("github.head_ref == 'inkwave/integration-final-61-184-183'"));
  const before=workflow.indexOf('name: Profile runtime at immutable baseline');
  const save=workflow.indexOf('name: Preserve completed baseline runtime evidence');
  const after=workflow.indexOf('name: Profile candidate runtime and compare repeated evidence');
  assert(before>=0 && before<save && save<after);
  assert.ok(workflow.includes('inkwave-runtime-baseline-diagnostics-'));
  assert.ok(workflow.includes('always() && (failure() || cancelled())'));
  assert.ok(workflow.includes("'runtimePerformance':runtime_performance"));
});

test('range and startup evidence are distinct final acceptance receipts', () => {
  assert.ok(workflow.includes("'range':['range/range-result.json']"));
  assert.ok(workflow.includes("'startup':['startup/startup-browser-result.json']"));
  assert.ok(workflow.includes('Verify the practice range in Chromium and WebKit (desktop + phone + tablet)'));
  assert.ok(workflow.includes('Measure cold, warm, PWA restart and offline startup in Chromium'));
});

test('isolated render diagnosis cannot replace full acceptance jobs or emit passing browser receipt', () => {
  assert.ok(workflow.includes('if: inputs.diagnostic_only != true'));
  const diagnostic=workflow.slice(workflow.indexOf('  render-diagnostic:'));
  assert.ok(diagnostic.includes('if: inputs.diagnostic_only == true'));
  assert.ok(diagnostic.includes('--parity-only --quality high --verify-render'));
  assert.ok(!diagnostic.includes('ci-result.json'));
  assert.ok(!diagnostic.includes('name: inkwave-browser-'));
});
