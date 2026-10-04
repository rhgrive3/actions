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
  assert.ok(workflow.includes('max-parallel: 3'));
  for (const suite of ['suite: active', 'suite: catalog', 'suite: ui']) assert.ok(workflow.includes(suite), suite);
  assert.ok(workflow.includes('browsers: chromium webkit'));
  assert.ok(workflow.includes('npx playwright install --with-deps ${{ matrix.browsers }}'));
  assert.ok(!workflow.includes('needs: validate'));
  assert.ok(workflow.includes('cancel-in-progress: true'));
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
  assert.equal((workflow.match(/scripts\/lib\/inkwave-\*\.mjs/g) || []).length, 2);
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
 const profile=source.indexOf("phase:'completed-window'"),fence=source.indexOf('probeG.renderer.getContext().finish()',profile),parity=source.indexOf("if(process.argv.includes('--verify-render'))"),paint=source.indexOf('await page.screenshot');
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


test('browser internal temporary storage is persistent before Playwright import and launch',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const prepare=source.indexOf("const browserTemp=persistentBrowserTemp(");
 const defaults=source.indexOf("for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=browserTemp");
 const imported=source.indexOf("const {chromium}=await import"),launch=source.indexOf('chromium.launchPersistentContext');
 assert(prepare>=0&&prepare<defaults&&defaults<imported&&imported<launch);
});


test('render and weapon FX warmup drains outside fixed profile windows',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-runtime-performance.mjs',import.meta.url),'utf8');
 const fire=source.indexOf('probeG.game.debug.fire(true)'),warm=source.indexOf('const warmup=fixedOnly&&!menuOnly?'),instrument=source.indexOf('// Instrument actual owners'),profile=source.indexOf("await cdp.send('Profiler.start')");
 assert(fire>=0&&fire<warm&&warm<instrument&&instrument<profile);
 const block=source.slice(warm,instrument);assert(block.includes("for(let i=0;i<30;i++)window.runtimeFixedStep(g,(scenario==='battle'?270:30)+i)"));assert(block.includes('probeG.renderer.getContext().finish()'));assert(block.includes('renderedSteps:30'));
});


test('CI prepares the short persistent browser cache for validator, browser and diagnostic jobs',()=>{
 assert.equal((workflow.match(/browser_tmp=\/mnt\/workspace\/\.dev-state\/agent-work\/cache\/iwrui/g)||[]).length,3);
 const prep=workflow.indexOf('name: Prepare persistent runtime verifier fixtures'),tests=workflow.indexOf('name: Verify motion verifier regressions');
 assert(workflow.indexOf('sudo chown "$(id -u):$(id -g)" "$browser_tmp"',prep)<tests);
 const browser=workflow.indexOf('name: Prepare workspace storage and browser');
 assert(workflow.indexOf('test "$(realpath -m "$CI_STORAGE")"',browser)<workflow.indexOf('sudo mkdir -p "$CI_STORAGE"',browser));
});


test('historical gameplay equality is scoped to the runtime workstream and does not block other gameplay PRs',()=>{
 assert(workflow.includes("inputs.runtime_performance == true"));
 assert(workflow.includes("github.head_ref == 'inkwave/runtime-performance-ui'"));
 assert(workflow.includes("github.head_ref == 'inkwave/integration-final-61-184-183'"));
 for(const name of ['Profile runtime at immutable baseline','Profile candidate runtime and compare repeated evidence'])assert(workflow.includes("name: "+name+"\n        if: matrix.suite == 'active' && env.RUNTIME_PERFORMANCE == 'true'"));
 assert(workflow.includes("if suite=='active' and runtime_performance:\n            checks.extend(['runtime-before/runtime-result.json','runtime-after/runtime-result.json','runtime-comparison.json'])"));
 assert(workflow.includes("'runtimePerformance':runtime_performance"));
 assert(workflow.includes("if runtime_performance:\n              assert reports['runtime-after/runtime-result.json']['sourceSha']==os.environ['SOURCE_SHA']"));
 for(const gate of ['browser','motion','motion-detail','flow-render','wall-render'])assert(workflow.includes('node scripts/check-inkwave-'+gate+'.mjs'));
});
