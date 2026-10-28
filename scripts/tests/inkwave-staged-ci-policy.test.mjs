import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
const full = read('validate-inkwave-update.yml');
const quick = read('inkwave-fast-pr.yml');
const quality = read('ci-quality-gate.yml');
const weapons = read('inkwave-main-weapons.yml');
const fullJobs = ['build_site', 'validate_core', 'patch_tests', 'circleci_offload_gate', 'validate', 'browser', 'seven_claims', 'resource_paint_continuation'];

function job(source, name) {
  const start = source.indexOf('  ' + name + ':\n');
  assert(start >= 0, 'missing job: ' + name);
  const remaining = source.slice(start + name.length + 4);
  const end = remaining.search(/\n  [a-z][\w-]*:\n/);
  return end < 0 ? remaining : remaining.slice(0, end);
}
function expression(block) {
  let condition = /^    if: (.*)$/m.exec(block)?.[1];
  assert(condition, 'missing explicit job selector');
  if (condition.startsWith('${{ ') && condition.endsWith(' }}')) condition = condition.slice(4, -3);
  return condition;
}
function active(source, name, {event = 'pull_request', draft = false, diagnostic = false, offload = false} = {}) {
  const inputs = {diagnostic_only: diagnostic};
  const github = {event_name: event, event: {pull_request: {draft}}, head_ref: 'feature/test'};
  const vars = {INKWAVE_CIRCLECI_OFFLOAD: offload ? 'enabled' : ''};
  return Boolean(Function('github', 'inputs', 'vars', 'always', 'return (' + expression(job(source, name)) + ')')(github, inputs, vars, () => true));
}

test('draft PRs omit all heavy jobs; ready PRs and main preserve the full native suite', () => {
  for (const name of fullJobs) {
    assert(!active(full, name, {draft: true}), 'draft must not launch expensive ' + name);
  }
  for (const name of fullJobs.filter(name => name !== 'circleci_offload_gate')) {
    assert(active(full, name, {event: 'push'}), 'main: ' + name);
    assert(active(full, name), 'ready PR: ' + name);
  }
  assert(!active(full, 'circleci_offload_gate', {event: 'push'}));
  assert(!active(full, 'circleci_offload_gate'));
  for (const name of ['build_site', 'validate_core', 'patch_tests', 'validate', 'browser', 'seven_claims', 'resource_paint_continuation'])
    assert(!active(full, name, {diagnostic: true}), 'manual diagnostic cannot satisfy ' + name);
  assert(!active(full, 'patch_tests', {offload: true}));
  assert(!active(full, 'browser', {offload: true}));
  assert(active(full, 'circleci_offload_gate', {offload: true}));
  assert(active(full, 'validate', {offload: true}));
});

test('ready_for_review reruns full validation; converting to draft supersedes older PR runs', () => {
  assert.match(full, /^  pull_request:\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]\n    paths:/m);
  assert.match(full, /^  push:\n    branches: \[main\]/m);
  assert.match(full, /^  workflow_dispatch:/m);
  assert.match(full, /^  group: validate-inkwave-\$\{\{ github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\) \|\| format\('run-\{0\}', github\.run_id\) \}\}/m);
  assert.match(full, /^  cancel-in-progress: /m);
  assert.match(quick, /^  pull_request:\n    branches: \[main\]\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]/m);
});

test('fast preflight binds exact PR head without installing browsers or running patch shards', () => {
  assert.match(quick, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(quick, /EXPECTED_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(quick, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE_SHA"/);
  assert.match(quick, /node scripts\/check-inkwave-patches\.mjs --quick/);
  assert.match(quick, /node --test scripts\/tests\/inkwave-staged-ci-policy\.test\.mjs scripts\/tests\/inkwave-test-shards\.test\.mjs/);
  assert.doesNotMatch(quick, /playwright install|npm install|check-inkwave-patches\.mjs\s*$/m);
  assert.match(quick, /timeout-minutes: 8/);
});

test('full gate requires native or offloaded browser evidence and both independent regressions', () => {
  const gate = job(full, 'validate');
  assert.match(gate, /needs: \[validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation\]/);
  for (const required of ['CORE_RESULT', 'PATCH_RESULT', 'CIRCLECI_RESULT', 'BROWSER_RESULT', 'SEVEN_RESULT', 'RESOURCE_RESULT'])
    assert.match(gate, new RegExp('test "\\$' + required + '" = (?:success|skipped)'));
  assert.match(gate, /test "\$BROWSER_RESULT" = skipped/);
  assert.match(gate, /test "\$BROWSER_RESULT" = success/);
  assert.doesNotMatch(gate, /continue-on-error:/);
});

test('A+ heavy game quality gate skips drafts and remains on ready PRs and main', () => {
  assert.match(quality, /^  pull_request:\n    branches: \[ main \]\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]/m);
  assert(!active(quality, 'verify-aplus-suite', {draft: true}));
  assert(active(quality, 'verify-aplus-suite'));
  assert(active(quality, 'verify-aplus-suite', {event: 'push'}));
});

test('specialized main-weapon numerical and browser work waits until Ready but runs on main', () => {
  assert.match(weapons, /^  pull_request:\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]\n    paths:/m);
  assert.match(weapons, /^  group: inkwave-main-weapons-\$\{\{ github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\) \|\| format\('run-\{0\}', github\.run_id\) \}\}/m);
  for (const name of ['numerical-main', 'browser-origins', 'roller-grip-comparison']) {
    assert(!active(weapons, name, {draft: true}), 'draft skips ' + name);
    assert(active(weapons, name), 'ready runs ' + name);
    assert(active(weapons, name, {event: 'push'}), 'main runs ' + name);
  }
});


test('full CI critical-path optimizations retain fail-closed coverage',()=>{
  const core=job(full,'validate_core');
  const install=core.slice(core.indexOf('name: Install pinned source regression and build tool'));
  const mirror=install.indexOf('sudo python3 scripts/prepare-inkwave-ci-apt.py');
  const browser=install.indexOf('npx --no-install playwright install --with-deps chromium');
  assert(mirror>0 && browser>mirror, 'apt mirror must be rewritten before dependency installation');
  const browserJob=job(full,'browser');
  assert.match(browserJob,/check-inkwave-responsive-isolated\.mjs[^\n]+--workers 2/);
  assert.doesNotMatch(browserJob,/node scripts\/check-inkwave-idle-resources\.mjs/);
  assert.match(browserJob,/chromium_pid=\$!/);
  assert.match(browserJob,/webkit_pid=\$!/);
  assert.match(browserJob,/wait "\$chromium_pid" \|\| result=1/);
  assert.match(browserJob,/wait "\$webkit_pid" \|\| result=1/);
  const resources=job(full,'resource_paint_continuation');
  assert.match(resources,/node scripts\/check-inkwave-idle-resources\.mjs[^\n]+--exact-source/);
  assert.match(resources,/assert\.equal\(report\.sourceSha,process\.env\.SOURCE_SHA\)/);
  assert.match(resources,/assert\.equal\(report\.contentHash,build\.contentHash\)/);
  assert.match(job(full,'validate'),/test "\$RESOURCE_RESULT" = success/);
  const activeChecks=browserJob.match(/'active':\[[^\n]+\]/)?.[0];
  assert(activeChecks, 'active browser receipt remains mandatory');
  assert(!activeChecks.includes('idle-resources/'), 'idle work must not double-run');
});

test('CI-admission-only edits do not launch redundant three-job weapon validation',()=>{
  const contract='scripts/tests/inkwave-added-ci-contracts.test.mjs';
  // The full core and A+ gates already execute the exact contract.
  assert(quality.includes(contract));
  assert(full.includes('node scripts/ci/run-inkwave-test-suite.mjs verifier'));
  assert(!weapons.includes(contract),'specialized weapon workflow must not own a shared CI-only test');
  assert.match(weapons,/node --experimental-vm-modules --test patches\/splatoon3\/tests\/main-weapon-catalog\.test\.mjs/);
  for (const name of ['numerical-main','browser-origins','roller-grip-comparison'])
    assert.match(weapons,new RegExp('  '+name+':\\n'));
});

test('specialized CI preserves relevant paths and skips unrelated test/CI-only edits',()=>{
  function matches(pattern,file){
    let r='^';for(let i=0;i<pattern.length;i++){
      const c=pattern[i];
      if(c==='*'){if(pattern[i+1]==='*'){r+='.*';i++;}else r+='[^/]*';}
      else if(c==='?')r+='[^/]';
      else r+=/[a-zA-Z0-9/_-]/.test(c)?c:'\\'+c;
    }
    return new RegExp(r+'$').test(file);
  }
  function routed(source,file){
    const section=source.split('  pull_request:\n')[1]?.split(/^  (?:push|workflow_dispatch|permissions):/m)[0]||'';
    const entries=section.split('\n').filter(s=>/^      - ['"]/.test(s)).map(s=>s.trim().slice(3,-1));
    assert(entries.length>0,'missing PR paths');
    let accepted=false;
    for(const entry of entries){const excluded=entry.startsWith('!');if(matches(excluded?entry.slice(1):entry,file))accepted=!excluded;}
    return accepted;
  }
  const asset=read('inkwave-character-asset-qa.yml'),touch=read('inkwave-touch-frame-pacing.yml');
  const account=read('zevant-account.yml'),relay=read('inkwave-relay-security.yml');
  for(const target of [asset,touch])assert(!routed(target,'patches/local-quality/tests/drive-visual-audio.test.mjs'));
  assert(!routed(asset,'patches/splatoon3/tests/charger-fresh-start.test.mjs'));
  assert(routed(asset,'patches/local-quality/character-shadow-batch-adapter.mjs'));
  assert(routed(asset,'patches/splatoon3/runtime/install.mjs'));
  assert(routed(touch,'patches/local-quality/tests/range-frame-pacing.test.mjs'));
  assert(routed(touch,'patches/local-quality/tests/quality.test.mjs'));
  assert(routed(touch,'patches/local-quality/roller-motion.mjs'));
  for(const target of [account,relay]){
    assert(!routed(target,'scripts/ci/inkwave-responsive-child-pool.mjs'));
    assert(routed(target,'scripts/ci/run-inkwave-test-suite.mjs'));
    assert(routed(target,'scripts/ci/inkwave-test-suites.json'));
  }
  assert(!routed(weapons,'scripts/tests/inkwave-added-ci-contracts.test.mjs'));
  const reopened=read('inkwave-reopened-six.yml'),paint=read('inkwave-paint-hotpath.yml');
  const frame=read('inkwave-runtime-frame-parity.yml'),native=read('inkwave-nondrive-queue.yml');
  for(const workflow of [reopened,paint,frame]) {
    assert(!routed(workflow,'patches/local-quality/tests/drive-visual-audio.test.mjs'),'unrelated test must not run specialist workflow');
    assert(routed(workflow,'patches/local-quality/tests/quality.test.mjs') || workflow===reopened,'owned gate must remain reachable');
  }
  assert(!routed(reopened,'patches/splatoon3/tests/catalog-stringer-other.test.mjs'));
  assert(routed(reopened,'patches/splatoon3/tests/superjump-gameplay.test.mjs'));
  assert(routed(reopened,'patches/splatoon3/runtime/roller.mjs'));
  assert(routed(paint,'patches/local-quality/tests/paint-hotpath.test.mjs'));
  assert(routed(frame,'patches/local-quality/tests/runtime-frame-scratch.test.mjs'));
  assert(!routed(native,'.github/workflows/zevant-account.yml'));
  assert(!routed(native,'.github/workflows/inkwave-weapon-lod-boundaries.yml'));
  assert(routed(native,'patches/native-stages/runtime/native-world.mjs'));
});
