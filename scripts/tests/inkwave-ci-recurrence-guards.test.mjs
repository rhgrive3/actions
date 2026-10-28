import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {preflightComposition} from '../ci/check-composition-preflight.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const checker = path.join(ROOT, 'scripts/ci/check-workflow-yaml.rb');

function fixture(body, callback) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-ci-recurrence-'));
  const filename = path.join(folder, 'test.yml');
  fs.writeFileSync(filename, body);
  try { return callback(filename); }
  finally { fs.rmSync(folder, {recursive:true, force:true}); }
}

function rubyCheck(yaml) {
  return fixture(yaml, file => spawnSync('ruby', [checker, file], {encoding: 'utf8'}));
}

test('rejects duplicate action checkout with.filter and sparse-checkout keys before jobs start', () => {
  const result = rubyCheck('name: proof\njobs:\n  check:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n          sparse-checkout: |\n            /*\n          ref: abc\n          filter: blob:none\n          sparse-checkout: |\n            /*\n');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate YAML key "filter"/);
  assert.match(result.stderr, /duplicate YAML key "sparse-checkout"/);
});

test('accepts same YAML key under independent maps and does not parse run block as keys', () => {
  const result = rubyCheck('name: proof\non:\n  pull_request:\njobs:\n  one:\n    steps:\n      - run: |\n          filter: repeated text\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n  two:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          filter: blob:none\n');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects invalid syntax and multi-document workflows', () => {
  assert.equal(rubyCheck('jobs:\n  check: [unterminated\n').status, 1);
  assert.equal(rubyCheck('name: one\n---\nname: two\n').status, 1);
});

test('production preflight validates every source module read-only and exposes failing path', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-compose-preflight-'));
  try {
    fs.mkdirSync(path.join(folder, 'src/ui'), {recursive:true});
    fs.writeFileSync(path.join(folder, 'src/ui/menus.js'), 'normal anchor');
    fs.writeFileSync(path.join(folder, 'index.html'), '<title>safe</title>');
    const before = fs.readFileSync(path.join(folder, 'src/ui/menus.js'), 'utf8');
    assert.deepEqual(preflightComposition(folder, {adapt:(rel, code) => rel.endsWith('menus.js') ? code + ';safe' : code}), {files:2, changed:1});
    assert.equal(fs.readFileSync(path.join(folder, 'src/ui/menus.js'), 'utf8'), before);
    assert.throws(() => preflightComposition(folder, {adapt:(rel, code) => {
      if (rel === 'src/ui/menus.js') throw Error('expected exactly one connection (GPU-22)');
      return code;
    }}), /src\/ui\/menus\.js: expected exactly one connection \(GPU-22\)/);
  } finally {fs.rmSync(folder, {recursive:true, force:true});}
});

test('missing production source fails rather than producing a false green', () => {
  assert.throws(() => preflightComposition(path.join(os.tmpdir(), 'nonexistent-inkwave-source-does-not-exist'), {adapt:code => code}), /Missing production source directory/);
});

// CI gates are transitive: heavy jobs need build_site, and build_site needs
// admission_preflight. Reject explicit job status functions that could make
// GitHub bypass its default success() dependency condition.
function jobBlock(yaml, name) {
  const match = yaml.match(new RegExp('^  ' + name + ':\\n(?:(?!^  [A-Za-z0-9_-]+:)[^\\n]*\\n)*', 'm'));
  assert.ok(match, 'Missing workflow job ' + name);
  return match[0];
}
function assertAdmissionDag(yaml) {
  assert.match(yaml, /^  admission_preflight:\n/m);
  for (const [name, need] of [['build_site', 'admission_preflight'],
    ...['validate_core', 'patch_tests', 'browser', 'seven_claims', 'resource_paint_continuation'].map(n => [n, 'build_site']), ['circleci_offload_gate', 'validate_core']]) {
    const block = jobBlock(yaml, name);
    assert.deepEqual(block.match(/^    needs:.*$/gm), ['    needs: ' + need], name + ' dependency');
    const ifLine = block.match(/^    if: (.+)$/m)?.[1];
    assert.ok(ifLine, name + ' job condition');
    assert.doesNotMatch(ifLine, /\b(?:always|failure|cancelled|success)\s*\(/i, name + ' overrides default dependency success');
    assert.doesNotMatch(block, /^\s*(?:-\s*)?continue-on-error:/m, name + ' cannot mask job failure');
  }
  const admission = jobBlock(yaml, 'admission_preflight');
  assert.doesNotMatch(admission, /^\s*(?:-\s*)?continue-on-error:/m, 'preflight cannot mask failure');
  assert.doesNotMatch(admission, /^        if:/m, 'preflight steps cannot be conditional');
  assert.doesNotMatch(admission.match(/^    if: (.+)$/m)?.[1] ?? '', /\b(?:always|failure|cancelled|success)\s*\(/i);
  assert.match(admission, /^      - name: Reject invalid or duplicated YAML workflow definitions\n        run: ruby scripts\/ci\/check-workflow-yaml\.rb \.github\/workflows$/m);
  assert.match(admission, /^      - name: Reject production composition anchor drift before heavy lanes\n        run: node scripts\/ci\/check-composition-preflight\.mjs$/m);
  assert.match(admission, /^      - name: Verify source combat receipt and Boss admission fixtures\n        run: node --test scripts\/tests\/inkwave-combat-provenance\.test\.mjs scripts\/tests\/inkwave-boss-positive-proof\.test\.mjs$/m);
  assert.ok(admission.indexOf('run: node scripts/ci/check-composition-preflight.mjs') < admission.indexOf('run: node --test scripts/tests/inkwave-combat-provenance.test.mjs'), 'source admission follows production composition');
  const gate = jobBlock(yaml, 'validate');
  assert.ok(gate.includes("    if: ${{ always() && inputs.diagnostic_only != true && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) }}\n"), 'validate must run for failed prerequisites in admitted full CI');
  assert.doesNotMatch(gate, /^    defaults:|^        shell:/m, 'validate uses GitHub default fail-fast shell');
  const needs = gate.match(/^    needs: \[([^\]]+)\]\s*$/m)?.[1].split(',').map(s => s.trim());
  assert.ok(needs, 'validate needs list');
  for (const name of ['admission_preflight', 'build_site', 'validate_core', 'patch_tests', 'circleci_offload_gate', 'browser', 'seven_claims', 'resource_paint_continuation']) assert.ok(needs.includes(name), 'validate missing ' + name);
  const bindings = {PREFLIGHT_RESULT:'admission_preflight', BUILD_RESULT:'build_site', CORE_RESULT:'validate_core', PATCH_RESULT:'patch_tests', CIRCLECI_RESULT:'circleci_offload_gate', BROWSER_RESULT:'browser', SEVEN_RESULT:'seven_claims', RESOURCE_RESULT:'resource_paint_continuation'};
  for (const [envName, name] of Object.entries(bindings)) assert.ok(gate.includes('          ' + envName + ': ${{ needs.' + name + '.result }}\n'), envName + ' must bind ' + name);
  assert.ok(gate.includes("          CONTRACTS_ONLY: ${{ needs.build_site.outputs.contracts_only }}\n"), 'scope output must bind build_site');
  assert.ok(gate.includes("          OFFLOAD_ACTIVE: ${{ vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration' }}\n"), 'offload must use its approved activation condition');
  assert.doesNotMatch(gate, /^        if:/m, 'validate step cannot be conditional');
  assert.match(gate, /^          test "\$PREFLIGHT_RESULT" = success$/m);
  assert.doesNotMatch(gate, /^\s*(?:-\s*)?continue-on-error:/m, 'validate cannot mask failure');
  const body = gate.match(/^        run: \|\n((?:          .*\n|\n)+)/m)?.[1];
  assert.ok(body, 'validate gate script');
  const script = body.replace(/^ {10}/gm, '');
  const env = {PATH:process.env.PATH || '/usr/bin:/bin', PREFLIGHT_RESULT:'success', BUILD_RESULT:'success', CONTRACTS_ONLY:'false', CORE_RESULT:'success', PATCH_RESULT:'success', CIRCLECI_RESULT:'skipped', BROWSER_RESULT:'success', SEVEN_RESULT:'success', RESOURCE_RESULT:'success', OFFLOAD_ACTIVE:'false'};
  const run = overrides => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {env:{...env,...overrides}, encoding:'utf8'});
  assert.equal(run({}).status, 0, 'validate positive control');
  for (const state of ['failure', 'cancelled', 'skipped']) assert.notEqual(run({PREFLIGHT_RESULT:state}).status, 0, 'preflight ' + state + ' must fail validate');
  for (const name of ['BUILD_RESULT', 'CORE_RESULT', 'PATCH_RESULT', 'BROWSER_RESULT', 'SEVEN_RESULT', 'RESOURCE_RESULT']) for (const state of ['failure','cancelled','skipped']) assert.notEqual(run({[name]:state}).status, 0, name + '=' + state + ' must fail');
  for (const state of ['failure','cancelled','success']) assert.notEqual(run({CIRCLECI_RESULT:state}).status, 0, 'normal path requires CircleCI skipped');
  const offload = {OFFLOAD_ACTIVE:'true',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'success',BROWSER_RESULT:'skipped'};
  assert.equal(run(offload).status, 0, 'offload positive control');
  for (const state of ['failure','cancelled','skipped']) assert.notEqual(run({...offload,PREFLIGHT_RESULT:state}).status, 0, 'offload preflight ' + state + ' must fail');
  for (const name of ['CIRCLECI_RESULT','CORE_RESULT','SEVEN_RESULT','RESOURCE_RESULT']) for (const state of ['failure','cancelled','skipped']) assert.notEqual(run({...offload,[name]:state}).status, 0, 'offload ' + name + '=' + state + ' must fail');
  for (const name of ['PATCH_RESULT','BROWSER_RESULT']) for (const state of ['failure','cancelled','success']) assert.notEqual(run({...offload,[name]:state}).status, 0, 'offload ' + name + '=' + state + ' must fail');
  const contracts = {CONTRACTS_ONLY:'true',CORE_RESULT:'skipped',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'skipped',BROWSER_RESULT:'skipped',SEVEN_RESULT:'skipped',RESOURCE_RESULT:'skipped'};
  assert.equal(run(contracts).status, 0, 'contracts-only positive control');
  for (const state of ['failure','cancelled','skipped']) assert.notEqual(run({...contracts,PREFLIGHT_RESULT:state}).status, 0, 'contracts preflight ' + state + ' must fail');
  for (const name of ['CORE_RESULT','PATCH_RESULT','CIRCLECI_RESULT','BROWSER_RESULT','SEVEN_RESULT','RESOURCE_RESULT']) for (const state of ['failure','cancelled','success']) assert.notEqual(run({...contracts,[name]:state}).status, 0, 'contracts ' + name + '=' + state + ' must fail');
}
function mutateJob(yaml, name, transform) {
  const original = jobBlock(yaml, name), changed = transform(original);
  assert.notEqual(changed, original, 'mutation must alter ' + name);
  return yaml.replace(original, () => changed);
}

test('heavy full-CI lanes require successful admission preflight and final gate refuses failure', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/validate-inkwave-update.yml'), 'utf8');
  assertAdmissionDag(yaml);
});

test('admission DAG and final shell gate reject dependency and status bypass mutations', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/validate-inkwave-update.yml'), 'utf8');
  const mutations = [
    ['build_site', s => s.replace('needs: admission_preflight', 'needs: unrelated')],
    ...['validate_core', 'patch_tests', 'browser', 'seven_claims', 'resource_paint_continuation'].map(name => [name, s => s.replace('needs: build_site', 'needs: unrelated')]),
    ['circleci_offload_gate', s => s.replace('needs: validate_core', 'needs: unrelated')],
    ...['always()', 'failure()', 'cancelled()', '!success()'].map(status => ['patch_tests', s => s.replace(/^    if: /m, '    if: ' + status + ' || ')]),
    ['admission_preflight', s => s.replace('      - name: Reject invalid or duplicated YAML workflow definitions', '      - if: false\n        name: Reject invalid or duplicated YAML workflow definitions')],
    ['admission_preflight', s => s.replace('run: node scripts/ci/check-composition-preflight.mjs', 'run: echo bypass')],
    ['admission_preflight', s => s.replace('run: node scripts/ci/check-composition-preflight.mjs', 'run: node scripts/ci/check-composition-preflight.mjs\n        if: false')],
    ['admission_preflight', s => s.replace('run: node --test scripts/tests/inkwave-combat-provenance.test.mjs scripts/tests/inkwave-boss-positive-proof.test.mjs', 'run: echo bypass source admission')],
    ['admission_preflight', s => s.replace('run: node --test scripts/tests/inkwave-combat-provenance.test.mjs scripts/tests/inkwave-boss-positive-proof.test.mjs', 'run: node --test scripts/tests/inkwave-combat-provenance.test.mjs')],
    ['admission_preflight', s => s.replace('      - name: Reject production composition', '      - continue-on-error: true\n        name: Reject production composition')],
    ['build_site', s => s.replace('    needs: admission_preflight', '    needs: admission_preflight\n    continue-on-error: true')],
    ['validate', s => s.replace('always() && ', '')],
    ['validate', s => s.replace('always() && ', 'always() && false && ')],
    ['validate', s => s.replace('needs.build_site.outputs.contracts_only', 'needs.unrelated.outputs.contracts_only')],
    ['validate', s => s.replace("OFFLOAD_ACTIVE: ${{ vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled'", "OFFLOAD_ACTIVE: ${{ vars.INKWAVE_CIRCLECI_OFFLOAD != 'enabled'")],
    ['validate', s => s.replace('needs: [admission_preflight, ', 'needs: [')],
    ['validate', s => s.replace('        run: |', '        shell: sh\n        run: |')],
    ...['admission_preflight','build_site','validate_core','patch_tests','circleci_offload_gate','browser','seven_claims','resource_paint_continuation'].map(name => ['validate', s => s.replace('needs.' + name + '.result', 'needs.unrelated.result')]),
    ['validate', s => s.replace('        env:\n          PREFLIGHT_RESULT:', '        if: false\n        env:\n          PREFLIGHT_RESULT:')],
    ['validate', s => s.replace('test "$PREFLIGHT_RESULT" = success', 'test "$PREFLIGHT_RESULT" = success || true')],
    ['validate', s => s.replace('      - name: Require every source', '      - continue-on-error: true\n        name: Require every source')],
    ['validate', s => s.replace('          test "$PREFLIGHT_RESULT" = success', '          set +e\n          test "$PREFLIGHT_RESULT" = success')],
  ];
  for (const [name, mutate] of mutations) assert.throws(() => assertAdmissionDag(mutateJob(yaml, name, mutate)), undefined, 'mutation in ' + name + ' was accepted');
});

test('external Charger waveform research cannot auto-trigger from pull requests or pushes', () => {
  const yaml = fs.readFileSync(path.join(ROOT, '.github/workflows/inkwave-charger-video-waveform.yml'), 'utf8');
  const triggers = yaml.slice(0, yaml.indexOf('\npermissions:'));
  assert.match(triggers, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(triggers, /^\s{2}(?:pull_request|push|schedule):/m);
  assert.match(yaml, /cancel-in-progress: true/);
});
