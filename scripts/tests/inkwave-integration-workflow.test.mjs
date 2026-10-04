import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
test('integration retains immutable source and downloaded artifact identity checks', () => {
  assert.equal((workflow.match(/ref: \$\{\{ inputs.source_sha \|\| github.sha \}\}/g) || []).length, 3);
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

test('long high-quality profiles preserve baseline before candidate work and cancelled diagnostics cannot become passing evidence',()=>{
 assert(workflow.includes('timeout-minutes: 90'));
 const before=workflow.indexOf('name: Profile runtime at immutable baseline'),save=workflow.indexOf('name: Preserve completed baseline runtime evidence'),after=workflow.indexOf('name: Profile candidate runtime and compare repeated evidence');
 assert(before>=0&&before<save&&save<after);
 assert(workflow.includes('inkwave-runtime-baseline-diagnostics-'));assert(workflow.includes('always() && (failure() || cancelled())'));
 assert(workflow.includes('if: success()'));
});


test('GPU completion fence precedes paint probes outside all fixed profile windows, with bounded capture budget',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const profile=source.indexOf("phase:'completed-window'"),fence=source.indexOf('probeG.renderer.getContext().finish()'),parity=source.indexOf("if(process.argv.includes('--verify-render'))"),paint=source.indexOf('await page.screenshot');
 assert(profile>=0&&profile<fence&&fence<parity&&parity<paint);
 assert.match(source,/page\.screenshot\(\{path:path\.join\(evidence,`ring-prime-\$\{repeat\}\.png`\),timeout:900000\}\)/);
 assert(900000>132545,'capture budget exceeds the observed132.5s Software GPU spike');
});

test('isolated render diagnosis cannot replace full acceptance jobs or emit passing browser receipt',()=>{
 assert(workflow.includes('if: inputs.diagnostic_only != true'));
 const diagnostic=workflow.slice(workflow.indexOf('  render-diagnostic:'));
 assert(diagnostic.includes('if: inputs.diagnostic_only == true'));
 assert(diagnostic.includes('--parity-only --quality high --verify-render'));
 assert(!diagnostic.includes('ci-result.json'));assert(!diagnostic.includes('inkwave-browser-'));
});

test('fixed runtime owner freezes at readiness before potentially blocking WebGL identity queries',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const ready=source.indexOf('if(ready&&fixed)probeG.game.debug.freeze()');
 assert(ready>=0&&ready<source.indexOf('result.active=await page.evaluate'));
});
