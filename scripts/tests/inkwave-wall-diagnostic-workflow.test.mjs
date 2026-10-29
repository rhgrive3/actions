import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = expandTestSuiteSteps(readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8'));
const job = (text, name) => {
  const marker = `  ${name}:\n`, start = text.indexOf(marker, text.indexOf('\njobs:\n'));
  assert.ok(start >= 0, `Missing ${name}`);
  const rest = text.slice(start + marker.length), end = rest.search(/^  [\w-]+:\n/m);
  return end < 0 ? rest : rest.slice(0, end);
};
const condition = (text, name) => job(text, name).match(/^    if: (.+)$/m)?.[1];
const fullCondition = "inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false)";
const nativeOffloadCondition = "${{ "+fullCondition+" && !(vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration') }}";
const guard = 'node --test scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs';
const source = 'node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-gates.test.mjs patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const emitted = 'INKWAVE_BUILT_SITE=.built-site/_site node --experimental-vm-modules --test patches/splatoon3/tests/wall-render-production-contract.test.mjs';
const verifier = 'node scripts/check-inkwave-wall-render.mjs --site .built-site/_site --evidence-dir "$CI_STORAGE/evidence/wall" --profile-dir "$CI_STORAGE/cache/wall" --exact-source';
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
function verify(text) {
  assert.match(text, /      wall_render_diagnostic:\n        description: [^\n]+\n        type: boolean\n        default: false\n/);
  assert.equal(condition(text, 'wall-render-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic == true");
  assert.equal(condition(text, 'render-diagnostic'), 'inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic != true');
  assert.equal(condition(text, 'network-opening-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true");
  for (const name of ['validate_core','seven_claims','resource_paint_continuation']) assert.equal(condition(text,name), fullCondition);
  for (const name of ['patch_tests','browser']) assert.equal(condition(text,name), nativeOffloadCondition);
  assert.equal(condition(text,'validate'), '${{ always() && inputs.diagnostic_only != true && (github.event_name != \'pull_request\' || github.event.pull_request.draft == false) }}');
  assert.ok(text.includes("inputs.wall_render_diagnostic == true && '-wall-render-diagnostic' || ''"));
  assert.ok(text.includes("group: validate-inkwave-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || format('run-{0}', github.run_id) }}"));
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
    'npm ci --no-audit --no-fund', 'sudo python3 scripts/prepare-inkwave-ci-apt.py', 'npx playwright install --with-deps chromium',
    guard, source, emitted, verifier,
    'uses: actions/upload-artifact@v4\n        if: always()',
    'path: ${{ env.CI_STORAGE }}/evidence/wall/',
    'name: inkwave-wall-render-diagnostic-\${{ env.SOURCE_SHA }}-${{ github.run_id }}-\${{ github.run_attempt }}'
  ]) assert.ok(native.includes(literal), `Missing ${literal}`);
  for (const [name, version] of [['esbuild', '0.28.2'], ['playwright', '1.62.1']]) {
    assert.equal(lock.packages[''].devDependencies[name], version);
    assert.equal(lock.packages['node_modules/' + name].version, version);
  }
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
  if (expression === fullCondition) return c.diagnostic_only !== true && c.ciOnly !== true && (c.event !== 'pull_request' || c.draft === false);
  if (expression === nativeOffloadCondition) return c.diagnostic_only !== true && c.ciOnly !== true && (c.event !== 'pull_request' || c.draft === false) && !(c.offload === true && c.event === 'pull_request' && !['inkwave/runtime-performance-ui','inkwave/final-nine-way-integration'].includes(c.head_ref));
  return expression.split(' && ').every(term=> {
    if(term === "github.event_name == 'workflow_dispatch'") return c.event === 'workflow_dispatch';
    const match = term.match(/^inputs\.(diagnostic_only|network_opening_diagnostic|wall_render_diagnostic) (==|!=) true$/);
    assert.ok(match, `Unexpected predicate ${term}`);
    return match[2] === '==' ? c[match[1]] === true : c[match[1]] !== true;
  });
}
test('wall-only route retains exact-head, real build, full verifier and always evidence', ()=>verify(workflow));
test('all event and flag combinations isolate wall from full, network and broad render jobs', ()=> {
  for(const event of ['workflow_dispatch','push','pull_request']) for(const diagnostic_only of [false,true]) for(const network_opening_diagnostic of [false,true]) for(const wall_render_diagnostic of [false,true]) for(const offload of [false,true]) for(const head_ref of ['topic','inkwave/runtime-performance-ui','inkwave/final-nine-way-integration']) {
    const c={event,diagnostic_only,network_opening_diagnostic,wall_render_diagnostic,offload,head_ref,draft:false};
    const wall=evaluate(condition(workflow,'wall-render-diagnostic'),c);
    assert.equal(wall,event==='workflow_dispatch' && diagnostic_only && !network_opening_diagnostic && wall_render_diagnostic);
    if(wall) for(const name of ['validate_core','patch_tests','browser','network-opening-diagnostic','render-diagnostic','seven_claims','resource_paint_continuation']) assert.equal(evaluate(condition(workflow,name),c),false,name);
  }
});
test('missing identity, real build, source/emitted contracts or full verifier fail closed', ()=> {
  for(const literal of ['test "$WORKFLOW_SHA" = "$SOURCE_SHA"','test "$(git rev-parse HEAD)" = "$SOURCE_SHA"','test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"','npm ci --no-audit --no-fund','node scripts/build-inkwave.mjs inkwave-public .built-site/_site',source,emitted,verifier,guard]) {
    const changed=workflow.replaceAll(literal,'true # removed'); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});
test('scope, timeout, evidence, failure suppression and concurrency mutations are rejected',()=> {
  for(const [before,after] of [["inputs.wall_render_diagnostic == true && '-wall-render-diagnostic'", "inputs.wall_render_diagnostic == true && '-full'"],['inputs.wall_render_diagnostic != true\n    runs-on:', 'inputs.wall_render_diagnostic == true\n    runs-on:'],['timeout-minutes: 30','timeout-minutes: 300'],['if: always()','if: success()'],['  wall-render-diagnostic:\n','  wall-render-diagnostic:\n    continue-on-error: true\n'],['default: false\n      deep_lifecycle:', 'default: true\n      deep_lifecycle:'],['cancel-in-progress: ${{ !(inputs.diagnostic_only == true && (inputs.network_opening_diagnostic == true || inputs.wall_render_diagnostic == true)) }}','cancel-in-progress: true']]) {
    const changed=workflow.replaceAll(before,after); assert.notEqual(changed,workflow); assert.throws(()=>verify(changed));
  }
});

// Main replaced whole historical job-body pins with focused semantic contracts.
// Retain this branch's reviewed additive emitted coverage without restoring the
// obsolete pins or accepting omitted, duplicated or relocated regressions.
const guidePhaseMarker = '      - name: Verify emitted source-backed inertia, launch, charge and hurtbox behavior\n';
const guidePhaseNext = '      - name: Verify built weapons fidelity measurements and packet parity\n';
const guidePhaseCommand = guidePhaseMarker + '        env:\n          INKWAVE_BUILT_SITE: ${{ github.workspace }}/_site\n          INKWAVE_EDGECASE_SITE: ${{ github.workspace }}/_site\n        run: >-\n          node --experimental-vm-modules --test\n';
const existingEmittedSourceTests = [
  'patches/splatoon3/tests/catalog-player-inertia-native.test.mjs',
  'patches/splatoon3/tests/catalog-slosher-birth-speed.test.mjs',
  'patches/splatoon3/tests/projectile-pool-slosher-index.test.mjs',
  'patches/splatoon3/tests/spinner-kinematics-source.test.mjs',
  'patches/splatoon3/tests/spinner-charge-family.test.mjs',
  'patches/splatoon3/tests/jump-recovery-airborne-native.test.mjs',
  'patches/splatoon3/tests/player-collision-source-1130.test.mjs',
];
const approvedEmittedGuidePhaseTests = [
  'patches/native-stages/tests/collision-revision-producers.test.mjs',
  'patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs',
  'patches/splatoon3/tests/catalog-slosher-initial-splash.test.mjs',
];
const emittedLines = files => files.map(file => '          ' + file + '\n').join('');
const approvedEmittedGuidePhaseLines = emittedLines(approvedEmittedGuidePhaseTests);
function verifyEmittedGuidePhaseCoverage(text) {
  const core = job(text, 'validate_core');
  assert.equal(core.split(guidePhaseMarker).length, 2, 'one emitted source-backed step in validate_core');
  assert.equal(text.split(guidePhaseMarker).length, 2, 'emitted step cannot be duplicated outside its owner');
  const start = core.indexOf(guidePhaseMarker), end = core.indexOf(guidePhaseNext, start);
  assert.ok(end > start, 'emitted guide/phase coverage remains before fidelity measurements');
  assert.equal(core.slice(start, end), guidePhaseCommand + emittedLines([...existingEmittedSourceTests, ...approvedEmittedGuidePhaseTests]),
    'exact emitted input site, VM command, existing arguments and additive placement remain required');
  for (const file of approvedEmittedGuidePhaseTests)
    assert.equal(text.split(file).length, 2, file + ' must run exactly once');
  return true;
}
test('reviewed guide and phase regressions run exactly once on the emitted site in the owned core step', () => verifyEmittedGuidePhaseCoverage(workflow));
test('reviewed emitted guide and phase coverage rejects omission, duplication, relocation and weaker commands', () => {
  const anchor = emittedLines([existingEmittedSourceTests.at(-1)]);
  const edits = [
    ...approvedEmittedGuidePhaseTests.map(file => [emittedLines([file]), '']),
    [approvedEmittedGuidePhaseLines, ''],
    [approvedEmittedGuidePhaseLines, approvedEmittedGuidePhaseLines + approvedEmittedGuidePhaseLines],
    [approvedEmittedGuidePhaseLines, emittedLines([...approvedEmittedGuidePhaseTests].reverse())],
    [approvedEmittedGuidePhaseLines, '          patches/splatoon3/tests/unreviewed.test.mjs\n'],
    [approvedEmittedGuidePhaseLines, approvedEmittedGuidePhaseLines + '          patches/splatoon3/tests/unreviewed.test.mjs\n'],
    [anchor, ''],
    [guidePhaseCommand, guidePhaseCommand.replace('        run: >-', '        if: false\n        run: >-')],
    [guidePhaseCommand, guidePhaseCommand.replace('        run: >-', '        continue-on-error: true\n        run: >-')],
    [guidePhaseCommand, guidePhaseCommand.replace('node --experimental-vm-modules --test', 'echo')],
    [guidePhaseCommand, guidePhaseCommand.replace('github.workspace }}/_site', 'github.workspace }}/unverified')],
    [guidePhaseCommand, guidePhaseCommand.replace('          INKWAVE_EDGECASE_SITE: ${{ github.workspace }}/_site\n', '')],
    [guidePhaseCommand, guidePhaseCommand.replace('INKWAVE_EDGECASE_SITE: ${{ github.workspace }}/_site', 'INKWAVE_EDGECASE_SITE: ${{ github.workspace }}/unverified')],
    [approvedEmittedGuidePhaseLines + guidePhaseNext, guidePhaseNext + approvedEmittedGuidePhaseLines],
  ];
  for (const [before, after] of edits) {
    const changed = workflow.replace(before, after);
    assert.notEqual(changed, workflow, before);
    assert.throws(() => verifyEmittedGuidePhaseCoverage(changed), before);
  }
});
