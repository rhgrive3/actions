import './inkwave-live-test-log.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');

test('integration retains immutable source and independently rebuilt artifact identity checks', () => {
  const checkoutCount = (workflow.match(/uses: actions\/checkout@v4/g) || []).length;
  const pinnedCheckoutCount = (workflow.match(/ref: \$\{\{ env\.SOURCE_SHA \}\}/g) || []).length;
  assert.ok(checkoutCount > 0);
  assert.ok(workflow.includes("SOURCE_SHA: ${{ inputs.source_sha || github.event.pull_request.head.sha || github.sha }}"),
    "PR validation uses its immutable head, explicit dispatch takes precedence, push falls back to github.sha");
  assert.equal(pinnedCheckoutCount, checkoutCount);
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes('node scripts/build-inkwave.mjs inkwave-public .built-site/_site'));
  assert.ok(workflow.includes('test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"'));
  assert.ok(workflow.includes("assert reports['game/browser-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
});

test('parallel browser families retain every final integration acceptance surface', () => {
  assert.ok(workflow.includes('max-parallel: 7'));
  for (const suite of ['suite: active', 'suite: catalog', 'suite: ui', 'suite: responsive', 'suite: network', 'suite: range', 'suite: startup'])
    assert.ok(workflow.includes(suite), suite);
  assert.ok(workflow.includes('browsers: chromium webkit'));
  assert.ok(workflow.includes('npx playwright install --with-deps ${{ matrix.browsers }}'));
  assert.ok(!workflow.includes('needs: validate'));
  assert.ok(workflow.includes('cancel-in-progress: true'));
  for (const gate of ['browser', 'motion', 'motion-detail', 'flow-render', 'wall-render', 'motion-catalog', 'touch-layout', 'reliability', 'touch-layout-identity', 'network-browser', 'paint-mask', 'range', 'startup-browser', 'rematch-lifecycle'])
    assert.ok(workflow.includes(`node scripts/check-inkwave-${gate}.mjs`), gate);
  // The isolated wrapper keeps every original responsive case but avoids
  // accumulating 14 persistent Chromium/WebKit contexts in one process.
  assert.ok(workflow.includes('node scripts/check-inkwave-responsive-isolated.mjs --source .built-site/_site --section all'));
  const responsive = fs.readFileSync(new URL('../check-inkwave-responsive-isolated.mjs', import.meta.url), 'utf8');
  for (const engine of ['chromium', 'webkit']) assert.ok(responsive.includes(engine), engine);
  for (const viewport of ['phone-portrait', 'phone-landscape', 'small-phone', 'tablet-portrait', 'tablet-landscape', 'tablet-split', 'desktop'])
    assert.ok(responsive.includes(viewport), viewport);
  assert.match(responsive, /report\.cases\.length === 14 && report\.shards\.length === 14/);
  assert.match(responsive, /processResult\.status===0/);
  assert.match(responsive, /--cases'/);
  assert.ok(workflow.includes('scripts/check-inkwave-network-comparison.mjs'));
  assert.ok(workflow.includes('patches/network-replication/tests/*.test.mjs'));
  assert.ok(workflow.includes('patches/practice-range/tests/*.test.mjs'));
  assert.ok(workflow.includes('patches/loading-cache/tests/worker.test.mjs'));
  assert.ok(workflow.includes("REMATCH_CYCLES: ${{ inputs.deep_lifecycle == true && '10' || '3' }}"));
  assert.ok(workflow.includes('--cycles "$REMATCH_CYCLES"'));
  assert.ok(workflow.includes("'responsive':['responsive/responsive-result.json']"));
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
  assert.ok(workflow.includes('name: inkwave-browser-${{ matrix.suite }}-${{ env.SOURCE_SHA }}'));
  assert.ok(workflow.includes("if suite=='network':"));
  assert.ok(workflow.includes("for name in checks: assert reports[name]['sourceSha']==os.environ['SOURCE_SHA']"));
});

test('ancillary paint WebGL source and emitted masks are mandatory exact-head network evidence', () => {
  assert.ok(workflow.includes('node scripts/check-inkwave-paint-mask.mjs --site .built-site/_site'));
  assert.match(workflow, /check-inkwave-paint-mask\.mjs[^\n]+--exact-source/);
  assert.ok(workflow.includes("'network':['paint-mask/paint-mask-result.json','network/network-browser-result.json','network-delay/network-browser-result.json']"));
  const probe = fs.readFileSync(new URL('../check-inkwave-paint-mask.mjs', import.meta.url), 'utf8');
  assert.match(probe, /const ROOT = path\.resolve\(fileURLToPath\(new URL\('\.\.\/', import\.meta\.url\)\)\);/);
  const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  for (const relative of ['patches/splatoon3/runtime/paint-ownership.mjs', 'patches/splatoon3/runtime/render.mjs'])
    assert.ok(path.resolve(root, relative).startsWith(root + path.sep), 'source helper requests pass the actual root containment guard');
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


test('optional focused regressions preserve the canonical gate and publish only completed source evidence', () => {
  const focus = workflow.indexOf('name: Run requested focused source regressions');
  const canonical = workflow.indexOf('name: Verify gameplay patch contracts and regressions');
  assert.ok(focus > 0 && canonical > focus);
  assert.ok(workflow.includes('run: node --experimental-vm-modules scripts/check-inkwave-patches.mjs'));
  assert.ok(workflow.includes("steps.focused_native.outcome == 'success'"));
  assert.ok(workflow.includes('FOCUSED_TESTS: ${{ inputs.focused_tests }}'));
  assert.ok(workflow.includes('FOCUSED_BASELINES: ${{ inputs.focused_baselines }}'));
  assert.ok(workflow.includes('FOCUSED_EVIDENCE_DIR: /mnt/workspace/.dev-state/agent-work/evidence/inkwave-focused-'));
});


test('worker source regressions have their pinned dependency and writable persistent storage before focused and canonical tests', () => {
  const validate=workflow.slice(workflow.indexOf('  validate:'),workflow.indexOf('  browser:'));
  const install=validate.indexOf('name: Install pinned source regression and build tool');
  const prepare=validate.indexOf('name: Prepare persistent worker regression fixtures');
  const focus=validate.indexOf('name: Run requested focused source regressions');
  const canonical=validate.indexOf('name: Verify loading/cache regressions');
  assert(install>=0 && install<focus && prepare>=0 && prepare<focus && prepare<canonical);
  assert.equal((validate.match(/npm install --no-save --no-package-lock --silent esbuild@0\.28\.2/g)||[]).length,1);
  const storage=validate.slice(prepare,validate.indexOf('name: Prepare persistent focused test evidence'));
  assert(!storage.includes('if:'), 'storage is required even when focused_tests is empty');
  assert(storage.indexOf('realpath -m')<storage.indexOf('sudo mkdir'));
  assert(storage.includes('sudo chown "$(id -u):$(id -g)" "$INKWAVE_TEST_SCRATCH"'));
  assert(storage.includes('test -w "$INKWAVE_TEST_SCRATCH"'));
  assert(workflow.includes('INKWAVE_TEST_SCRATCH: /mnt/workspace/.dev-state/agent-work/scratch/inkwave-worker-${{ github.run_id }}-${{ github.run_attempt }}'));
});

test('emitted material handoff is mandatory and runs only after a complete site build', () => {
  const build = workflow.indexOf('name: Verify emitted Tenacity lock and passive ownership');
  const name = 'name: Verify real emitted material handoff ownership and cancellation';
  const at = workflow.indexOf(name);
  assert.ok(build > 0 && at > 0 && at < build,
    'material ownership must be checked against the same generated production site');
  const block = workflow.slice(at, build);
  assert.ok(block.includes('INKWAVE_MATERIAL_HANDOFF_SITE: ${{ github.workspace }}/_site'));
  assert.ok(block.includes('node --experimental-vm-modules --test patches/local-quality/tests/material-handoff.test.mjs'));
  assert.ok(workflow.includes('patches/local-quality/tests/*.test.mjs'),
    'do not remove the original source regression gate');
});

test('emitted menu focus is mandatory in the UI shard and source-bound in its receipt', () => {
  const marker = '      - name: Verify emitted menu focus lifecycle';
  assert.equal(workflow.split(marker).length - 1, 1);
  const at = workflow.indexOf(marker), end = workflow.indexOf('\n      - name:', at + marker.length);
  const block = workflow.slice(at, end);
  assert.ok(at > workflow.indexOf('npx playwright install --with-deps ${{ matrix.browsers }}'));
  assert.ok(block.includes("if: matrix.suite == 'ui'"));
  assert.ok(block.includes('node scripts/check-inkwave-menu-focus.mjs --source .built-site/_site --evidence-dir "$CI_STORAGE/evidence/menu-focus"'));
  assert.ok(!block.includes('continue-on-error') && !block.includes('||'));
  assert.ok(workflow.includes("'ui':['menu-focus/menu-focus-result.json',"));
  assert.ok(workflow.includes("if suite=='ui': assert reports['menu-focus/menu-focus-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
});
test('emitted Bot respawn and retry regressions reuse the complete production site without replacing source coverage', () => {
  const validate = workflow.slice(workflow.indexOf('  validate:'), workflow.indexOf('  browser:'));
  const marker = '      - name: Verify emitted Bot navigation respawn and retry state';
  assert.equal(validate.split(marker).length - 1, 1);
  const at = validate.indexOf(marker);
  const build = validate.indexOf('node scripts/build-inkwave.mjs inkwave-public _site');
  const receipt = validate.indexOf('git rev-parse HEAD > _site-source-sha.txt');
  assert.ok(build >= 0 && receipt > build && at > receipt, 'use the completed production build');
  const end = validate.indexOf('\n      - name:', at + marker.length);
  assert.ok(end > at);
  const block = validate.slice(at, end);
  assert.ok(block.includes('INKWAVE_BUILT_SITE: ${{ github.workspace }}/_site'));
  assert.ok(block.includes('run: node --experimental-vm-modules --test patches/local-quality/tests/bot-navigation-respawn.test.mjs'));
  assert.ok(!/^\s+(?:if|continue-on-error):/m.test(block), 'mandatory step without failure suppression');
  assert.ok(!block.includes('||') && !block.includes('--test-name-pattern'));
  assert.ok(validate.includes('node --experimental-vm-modules --test patches/local-quality/tests/*.test.mjs'), 'retain all original source tests');
});
