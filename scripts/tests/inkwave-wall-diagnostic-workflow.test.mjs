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
    'ref: \${{ env.SOURCE_SHA }}', 'persist-credentials: false',
    '[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]', 'test "$WORKFLOW_SHA" = "$SOURCE_SHA"',
    'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"',
    'node scripts/build-inkwave.mjs inkwave-public .built-site/_site',
    'test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"',
    'esbuild@0.28.2 playwright@1.62.1', 'npx playwright install --with-deps chromium',
    guard, source, emitted, verifier,
    'uses: actions/upload-artifact@v4\n        if: always()',
    'path: ${{ env.CI_STORAGE }}/evidence/wall/',
    'name: inkwave-wall-render-diagnostic-\${{ env.SOURCE_SHA }}-${{ github.run_id }}-\${{ github.run_attempt }}'
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

// Reviewed integration adds source/clock/animation acceptance guards only.
// The later 31-PR source epoch adds its independent immutable-pair guard.
// Existing jobs, failures, thresholds and immutable builds remain required.
// Shared immutable build, additive acceptance guards,
// exact-head startup clock evidence, and complete sparse diagnostic checkouts.
const acceptedJobHashes = {
  "validate_core": "80f5bcdbcf39f3f616c231c0cbad3eea93849fed3fb19c20e22f7c063ab47a39",
  "patch_tests": "f4aed2dfb7766fc1497498fc2d6d7689ec90441f0747b854b07a4e631109c5b1",
  "validate": "54ac81f9c3cfa0e1eaed643dc62b644e9658abef0b53faced3a7d47888b790f9",
  "browser": "2d925a6bece5c03d5f5a2fefa550a622d1589e8e3ab41ac517d6d624cd93bb9c",
  "network-opening-diagnostic": "f205a8473b3bfc0f86819f43bbe4121e4c590dda71490e363f3908db658ca767",
  "seven_claims": "34ef0c57320a741be38b42f6e0e9eb62e8d7f0b9bbb55b6b9a091c26a828c3cd",
  "resource_paint_continuation": "78e0d3ebf1290c9250339e8dcef35c9b60077c82fd5a99ff51da01b3c50a442b"
};
// A reviewed repair moves the orphaned artifact name out of Bash and into an
// actual upload action. Restore only that exact edit when comparing the original
// job pins; every pre-existing test command, failure gate and hash stays fixed.
const legacyCoreEvidenceTail = '            _site-launch-packets.json\n          retention-days: 14\n';
const repairedCoreEvidenceTail = `      - name: Retain exact emitted launch packet evidence
        if: always() && hashFiles('_site-launch-packets.json') != ''
        uses: actions/upload-artifact@v4
        with:
          name: inkwave-launch-packets-\${{ env.SOURCE_SHA }}-\${{ github.run_attempt }}
          path: _site-launch-packets.json
          if-no-files-found: error
          retention-days: 14
`;
function canonicalCoreEvidence(body) {
  assert.equal(body.split(repairedCoreEvidenceTail).length, 2, 'exact reviewed upload repair required');
  assert.ok(body.includes('            patches/network-replication/tests/tower-mine-paint-admission.test.mjs\n' + repairedCoreEvidenceTail), 'all fidelity tests must run before upload');
  assert.ok(!body.includes(legacyCoreEvidenceTail), 'artifact names cannot execute as shell commands');
  return body.replace(repairedCoreEvidenceTail, legacyCoreEvidenceTail);
}
function verifyAcceptedJobs(text) {
  for(const [name, expected] of Object.entries(acceptedJobHashes)) {
    let body = job(text,name).replace(' scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs','')
      .replaceAll('          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx playwright install --with-deps', '          npx playwright install --with-deps');
    if (name === 'validate_core') body = canonicalCoreEvidence(body);
    assert.equal(createHash('sha256').update(body).digest('hex'),expected,name);
  }
}
test('accepted Turf and network job bodies retain their original pins after exact artifact repair',()=>verifyAcceptedJobs(workflow));
test('the previously pinned broken artifact command is rejected despite its original digest',()=> {
  const broken=workflow.replace(repairedCoreEvidenceTail,legacyCoreEvidenceTail);
  assert.notEqual(broken,workflow);
  assert.throws(()=>verifyAcceptedJobs(broken),/exact reviewed upload repair required/);
});
test('artifact repair cannot waive tests, paths, identity, upload errors or unrelated job edits',()=> {
  for(const [before,after] of [
    ['patches/splatoon3/tests/active-special-gauge.test.mjs',''],
    ['patches/network-replication/tests/tower-mine-paint-admission.test.mjs','patches/network-replication/tests/not-a-real-test.mjs'],
    ["if: always() && hashFiles('_site-launch-packets.json') != ''",'if: false'],
    ['path: _site-launch-packets.json','path: another-report.json'],
    ['if-no-files-found: error\n          retention-days: 14\n  # The test-file set','if-no-files-found: warn\n          retention-days: 14\n  # The test-file set'],
    ['name: inkwave-launch-packets-${{ env.SOURCE_SHA }}-${{ github.run_attempt }}','name: inkwave-launch-packets-unbound'],
    ['      - name: Retain exact emitted launch packet evidence','            true # extra shell command\n      - name: Retain exact emitted launch packet evidence'],
    ['test "$CORE_RESULT" = success','true # no core requirement']
  ]) {
    const changed=workflow.replace(before,after);
    assert.notEqual(changed,workflow,before);
    assert.throws(()=>verifyAcceptedJobs(changed),before);
  }
});
