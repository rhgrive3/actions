import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
const job = (text, name) => {
  const marker = `  ${name}:\n`, start = text.indexOf(marker, text.indexOf('\njobs:\n'));
  assert.ok(start >= 0, `Missing ${name}`);
  const rest = text.slice(start + marker.length), end = rest.search(/^  [\w-]+:\n/m);
  return end < 0 ? rest : rest.slice(0, end);
};
const condition = (text, name) => job(text, name).match(/^    if: (.+)$/m)?.[1];
const guard = 'node --test scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs';
const source = 'node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-gates.test.mjs patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const emitted = 'INKWAVE_BUILT_SITE=.built-site/_site node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const verifier = 'node scripts/check-inkwave-wall-render.mjs --site .built-site/_site --evidence-dir "$CI_STORAGE/evidence/wall" --profile-dir "$CI_STORAGE/cache/wall" --exact-source';
function verify(text) {
  assert.match(text, /      wall_render_diagnostic:\n        description: [^\n]+\n        type: boolean\n        default: false\n/);
  assert.equal(condition(text, 'wall-render-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic == true");
  assert.equal(condition(text, 'render-diagnostic'), 'inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic != true');
  assert.equal(condition(text, 'network-opening-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true");
  for (const name of ['validate_core','patch_tests','browser','seven_claims','resource_paint_continuation']) assert.equal(condition(text,name), 'inputs.diagnostic_only != true');
  assert.equal(condition(text,'validate'), '${{ always() && inputs.diagnostic_only != true }}');
  assert.ok(text.includes("inputs.wall_render_diagnostic == true && '-wall-render-diagnostic' || ''"));
  assert.ok(text.includes('cancel-in-progress: ${{ !(inputs.diagnostic_only == true && (inputs.network_opening_diagnostic == true || inputs.wall_render_diagnostic == true)) }}'));
  const native = job(text,'wall-render-diagnostic');
  assert.match(native, /^    timeout-minutes: 30$/m);
  for (const literal of [
    'timeout-minutes: 30', 'runs-on: ubuntu-latest', 'WORKFLOW_SHA: ${{ github.workflow_sha }}',
    'ref: ${{ env.SOURCE_SHA }}', 'persist-credentials: false',
    '[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]', 'test "$WORKFLOW_SHA" = "$SOURCE_SHA"',
    'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"',
    'node scripts/build-inkwave.mjs inkwave-public .built-site/_site',
    'test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"',
    'esbuild@0.28.2 playwright@1.62.1', 'npx playwright install --with-deps chromium',
    guard, source, emitted, verifier,
    'uses: actions/upload-artifact@v4\n        if: always()',
    'path: ${{ env.CI_STORAGE }}/evidence/wall/',
    'name: inkwave-wall-render-diagnostic-${{ env.SOURCE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}'
  ]) assert.ok(native.includes(literal), `Missing ${literal}`);
  assert.ok(job(text,'validate_core').includes('scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs'));
  assert.ok(native.indexOf(source) < native.indexOf('node scripts/build-inkwave.mjs'));
  assert.ok(native.indexOf(emitted) > native.indexOf('node scripts/build-inkwave.mjs'));
  assert.ok(native.indexOf(verifier) > native.indexOf(emitted));
  assert.doesNotMatch(native, /continue-on-error|\|\| true|INKWAVE_DISABLE|--skip|--baseline|check-inkwave-(?:runtime-performance|combat-ceiling|motion|weapon)/);
  const checks = [...native.matchAll(/node (scripts\/check-[^\s]+)/g)].map(m=>m[1]);
  assert.deepEqual(checks, ['scripts/check-inkwave-wall-render.mjs']);
  return true;
}
function evaluate(expression, c) {
  return expression.split(' && ').every(term=> {
    if(term === "github.event_name == 'workflow_dispatch'") return c.event === 'workflow_dispatch';
    const match = term.match(/^inputs\.(diagnostic_only|network_opening_diagnostic|wall_render_diagnostic) (==|!=) true$/);
    assert.ok(match, `Unexpected predicate ${term}`);
    return match[2] === '==' ? c[match[1]] === true : c[match[1]] !== true;
  });
}
test('wall-only route retains exact-head, real build, full verifier and always evidence', ()=>verify(workflow));
test('all event and flag combinations isolate wall from full, network and broad render jobs', ()=> {
  for(const event of ['workflow_dispatch','push','pull_request']) for(const diagnostic_only of [false,true]) for(const network_opening_diagnostic of [false,true]) for(const wall_render_diagnostic of [false,true]) {
    const c={event,diagnostic_only,network_opening_diagnostic,wall_render_diagnostic};
    const wall=evaluate(condition(workflow,'wall-render-diagnostic'),c);
    assert.equal(wall,event==='workflow_dispatch' && diagnostic_only && !network_opening_diagnostic && wall_render_diagnostic);
    if(wall) for(const name of ['validate_core','patch_tests','browser','network-opening-diagnostic','render-diagnostic','seven_claims','resource_paint_continuation']) assert.equal(evaluate(condition(workflow,name),c),false,name);
  }
});
test('missing identity, real build, source/emitted contracts or full verifier fail closed', ()=> {
  for(const literal of ['test "$WORKFLOW_SHA" = "$SOURCE_SHA"','test "$(git rev-parse HEAD)" = "$SOURCE_SHA"','test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"','node scripts/build-inkwave.mjs inkwave-public .built-site/_site',source,emitted,verifier,guard]) {
    const changed=workflow.replaceAll(literal,'true # removed'); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});
test('scope, timeout, evidence, failure suppression and concurrency mutations are rejected',()=> {
  for(const [before,after] of [["inputs.wall_render_diagnostic == true && '-wall-render-diagnostic'", "inputs.wall_render_diagnostic == true && '-full'"],['inputs.wall_render_diagnostic != true\n    runs-on:', 'inputs.wall_render_diagnostic == true\n    runs-on:'],['timeout-minutes: 30','timeout-minutes: 300'],['if: always()','if: success()'],['  wall-render-diagnostic:\n','  wall-render-diagnostic:\n    continue-on-error: true\n'],['default: false\n      deep_lifecycle:', 'default: true\n      deep_lifecycle:'],['cancel-in-progress: ${{ !(inputs.diagnostic_only == true && (inputs.network_opening_diagnostic == true || inputs.wall_render_diagnostic == true)) }}','cancel-in-progress: true']]) {
    const changed=workflow.replaceAll(before,after); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});

// Reviewed 29-PR integration adds source/clock/animation acceptance guards only.
// Existing jobs, failures, thresholds and immutable builds remain required.
// Shared immutable build, additive acceptance guards,
// exact-head startup clock evidence, and complete sparse diagnostic checkouts.
const acceptedJobHashes = {
  "validate_core": "7d98e11540f36b16d67357a008aa01e48b05bcf1bfe73a8e654d62d7850cc708",
  "patch_tests": "f4aed2dfb7766fc1497498fc2d6d7689ec90441f0747b854b07a4e631109c5b1",
  "validate": "54ac81f9c3cfa0e1eaed643dc62b644e9658abef0b53faced3a7d47888b790f9",
  "browser": "2d925a6bece5c03d5f5a2fefa550a622d1589e8e3ab41ac517d6d624cd93bb9c",
  "network-opening-diagnostic": "f205a8473b3bfc0f86819f43bbe4121e4c590dda71490e363f3908db658ca767",
  "seven_claims": "34ef0c57320a741be38b42f6e0e9eb62e8d7f0b9bbb55b6b9a091c26a828c3cd",
  "resource_paint_continuation": "78e0d3ebf1290c9250339e8dcef35c9b60077c82fd5a99ff51da01b3c50a442b"
};
test('accepted Turf and network job bodies are preserved without gate weakening',()=> {
  for(const [name, expected] of Object.entries(acceptedJobHashes)) {
    // Reviewed setup-only addition: the signed Ubuntu archive transport helper
    // runs immediately before the same browser install. All acceptance bytes
    // still match the independently pinned job bodies below.
    const body = job(workflow,name).replace(' scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs','')
      .replaceAll('          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx playwright install --with-deps', '          npx playwright install --with-deps');
    assert.equal(createHash('sha256').update(body).digest('hex'),expected,name);
  }
});
