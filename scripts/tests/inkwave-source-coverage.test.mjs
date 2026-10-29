import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planSourceTests, assertSourceSuiteCoverage} from '../ci/inkwave-source-coverage.mjs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');

const remainingEmittedFiles = [
  'patches/network-replication/tests/combat-boss-proof-targets.test.mjs',
  'patches/network-replication/tests/combat-native-proof-receipt.test.mjs',
  'patches/splatoon3/tests/issue-1431-hit-pose-birth.test.mjs',
  'patches/splatoon3/tests/issue-1607-zipcaster-success-minimum.test.mjs',
  'patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs',
  'patches/splatoon3/tests/charger-special-audio-cancel.test.mjs',
  'patches/splatoon3/tests/catalog-charger-remote-audio.test.mjs',
  'patches/splatoon3/tests/splatling-charge-reversal.test.mjs',
  'patches/splatoon3/tests/pad-sensitivity-rate-287.test.mjs',
  'patches/local-quality/tests/offscreen-hair-targets.test.mjs',
  'patches/local-quality/tests/native-offscreen-ground-memo.test.mjs',
  'patches/network-replication/tests/canonical-weapon-actions.test.mjs',
  'patches/network-replication/tests/canonical-weapon-modes.test.mjs',
  'patches/network-replication/tests/canonical-sub-special-traces.test.mjs',
  'patches/network-replication/tests/native-action-traces.test.mjs',
  'patches/network-replication/tests/trusted-native-replay.test.mjs',
  'patches/network-replication/tests/native-command-wire.test.mjs',
  'patches/network-replication/tests/native-turf-start-replay.test.mjs',
  'patches/network-replication/tests/native-turf-session-reconnect.test.mjs',
  'patches/splatoon3/tests/native-action-trace.test.mjs',
  'patches/splatoon3/tests/native-action-representatives.test.mjs',
  'patches/splatoon3/tests/native-action-trace-binding.test.mjs',
  'patches/splatoon3/tests/roller-paint-world-update.test.mjs',
  'patches/network-replication/tests/combat-native-birth-timing.test.mjs',
  'patches/network-replication/tests/combat-single-round-targets.test.mjs',
  'patches/splatoon3/tests/catalog-horizontal-sector-emitted.test.mjs',
  'patches/splatoon3/tests/ranked-rainmaker-current-lifecycle.test.mjs',
  'patches/splatoon3/tests/special-legacy-native-receiver.test.mjs',
];
function assertRemainingEmittedCoverage(source) {
  const core = source.match(/^  validate_core:\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/m)?.[1];
  assert.ok(core, 'mandatory core exists');
  const steps = core.split(/^      - /m).filter(step => step.startsWith('name: Verify remaining emitted combat, weapon and visual regressions\n'));
  assert.equal(steps.length, 1, 'one mandatory remaining-regression step');
  const step = steps[0];
  assert.ok(step.includes('        env:\n          INKWAVE_BUILT_SITE: ${{ github.workspace }}/_site\n'));
  assert.ok(step.includes('          node --experimental-vm-modules --test --test-concurrency=2 \\\n'));
  assert.ok(step.includes('          INKWAVE_CANONICAL_TRACE_MODULE: ${{ github.workspace }}/_site/patches/network-replication/canonical-weapon-actions.mjs\n'));
  assert.ok(step.includes('          INKWAVE_NATIVE_TRACE_COMPARE: ${{ github.workspace }}/patches/splatoon3/tests/fixtures/native-action-trace-035.json.gz\n'));
  assert.ok(step.includes('verifyRuntimeBuild(process.env.INKWAVE_BUILT_SITE, process.cwd(), process.env.SOURCE_SHA)'));
  assert.doesNotMatch(step, /^        (?:if|continue-on-error):|--test-name-pattern|--test-skip-pattern|\|\|\s*(?:true|echo)/m);
  for (const file of remainingEmittedFiles) assert.equal(step.split(file).length - 1, 1, file);
  assert.equal((step.match(/\.test\.mjs/g) || []).length, remainingEmittedFiles.length);
  const command = '          node --experimental-vm-modules --test --test-concurrency=2 \\\n';
  const files = remainingEmittedFiles.map((file,i) => '            ' + file +
    (i < remainingEmittedFiles.length - 1 ? ' \\\n' : '\n')).join('');
  assert.equal(step.slice(step.indexOf(command)), command + files,
    'exact mandatory file order and unfiltered command tail; no conditional missing-file fallback');
}

test('new remaining regressions execute once against the immutable emitted site in mandatory core', () => {
  assert.equal(remainingEmittedFiles.length,28,'all27 current entries plus the legacy native receiver regression');
  for(const file of remainingEmittedFiles)
    assert.ok(fs.statSync(new URL('../../'+file,import.meta.url)).isFile(),'mandatory file exists: '+file);
  assertRemainingEmittedCoverage(workflow);
});

test('missing, duplicate, filtered, raw-source and optional remaining coverage is rejected', () => {
  const name = 'name: Verify remaining emitted combat, weapon and visual regressions\n';
  for (const change of [
    ...remainingEmittedFiles.map(file => source => source.replace(file, 'missing.test.mjs')),
    source => source.replace('          INKWAVE_CANONICAL_TRACE_MODULE:', '          OMITTED_CANONICAL_TRACE_MODULE:'),
    source => source.replace('          INKWAVE_NATIVE_TRACE_COMPARE:', '          OMITTED_NATIVE_TRACE_COMPARE:'),
    source => source.replace('verifyRuntimeBuild(process.env.INKWAVE_BUILT_SITE, process.cwd(), process.env.SOURCE_SHA)', 'void 0'),
    source => source.replace(name, name + '        if: false\n'),
    source => source.replace(name, name + '        continue-on-error: true\n'),
    source => source.replace(name, 'name: omitted remaining regressions\n'),
    source => source.replace('          INKWAVE_BUILT_SITE: ${{ github.workspace }}/_site\n',
      '          INKWAVE_BUILT_SITE: ${{ github.workspace }}/inkwave-public\n'),
    source => source.replace('node --experimental-vm-modules --test --test-concurrency=2 \\\n', 'node --experimental-vm-modules --test --test-name-pattern=only --test-concurrency=2 \\\n'),
    ...remainingEmittedFiles.map(file => source => source.replace(file, file + ' ' + file)),
    source => source.replace('patches/splatoon3/tests/catalog-horizontal-sector-emitted.test.mjs',
      'patches/splatoon3/tests/catalog-horizontal-sector-aim.test.mjs'),
    source => source.replace('          node --experimental-vm-modules --test --test-concurrency=2 \\\n',
      '          if test -d _site; then\n          node --experimental-vm-modules --test --test-concurrency=2 \\\n')
      .replace('            patches/splatoon3/tests/special-legacy-native-receiver.test.mjs\n',
        '            patches/splatoon3/tests/special-legacy-native-receiver.test.mjs\n          fi\n'),
  ]) {
    const mutant = change(workflow);
    assert.notEqual(mutant, workflow, 'negative control changes the actual workflow');
    assert.throws(() => assertRemainingEmittedCoverage(mutant));
  }
});

test('network and quality run their entire discovered source inventory exactly once', () => {
  for (const suite of ['network', 'quality']) {
    const plan = assertSourceSuiteCoverage(workflow, suite);
    assert.ok(plan.all.length > 100);
    assert.deepEqual(plan.tests.filter(file => plan.all.includes(file)), plan.all);
    assert.equal(plan.tests.length, new Set(plan.tests).size);
  }
  for (const name of ['queue-inkflight-owned-profile', 'slosher-birth-sampling', 'issue-1101-adoption-cooldown', 'robustness-timing', 'comparison', 'composed-hit-unit-packet'])
    assert.ok(planSourceTests('network').tests.includes('patches/network-replication/tests/' + name + '.test.mjs'));
  assert.match(workflow, /INKWAVE_IDLE_BUILD:/);
  assert.match(workflow, /INKWAVE_BUILT_SITE:/);
});

test('disabled, filtered, duplicated and non-source invocations cannot certify source coverage', () => {
  const command = 'run: node --experimental-vm-modules scripts/check-inkwave-patches.mjs';
  const marker = 'name: Verify gameplay patch contracts and regressions (shard ${{ matrix.shard }})';
  for (const changed of [
    workflow.replace(command + '\n', 'run: echo patches\n'),
    workflow.replace(command + '\n', command + ' --quick\n'),
    workflow.replace(marker, marker + '\n        if: false'),
    workflow.replace(marker, marker + '\n        continue-on-error: true'),
    workflow.replace("INKWAVE_TEST_SHARD_COUNT: '8'", "INKWAVE_TEST_SHARD_COUNT: '1'"),
    workflow.replace('needs: [admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]', 'needs: [validate_core, patch_tests, circleci_offload_gate]'),
    workflow.replace('shard: [0, 1, 2, 3, 4, 5, 6, 7]', 'shard: [0, 1, 2, 3, 4, 5, 6]'),
    workflow.replace('shard: [0, 1, 2, 3, 4, 5, 6, 7]', 'shard: [0, 1, 2, 3, 4, 5, 6, 6]'),
    workflow.replace('INKWAVE_TEST_SHARD_INDEX: ${{ matrix.shard }}', 'INKWAVE_TEST_SHARD_INDEX: 0'),
    workflow.replace('fail-fast: false', 'fail-fast: true'),
    workflow.replace("runs-on: ${{ matrix.shard == 2 && 'ubuntu-22.04' || 'ubuntu-latest' }}", "runs-on: ubuntu-latest"),
    workflow.replace("INKWAVE_TEST_CONCURRENCY: ${{ matrix.shard == 2 && '1' || '2' }}", "INKWAVE_TEST_CONCURRENCY: '2'"),
    workflow.replace('needs: [admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]', 'needs: [admission_preflight, build_site, validate_core, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]'),
    workflow.replace('needs: [admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]', 'needs: [build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]'),
    workflow.replace("INKWAVE_REQUIRE_BROWSER_TESTS: '1'", "INKWAVE_REQUIRE_BROWSER_TESTS: '0'"),
    workflow.replace('      - name: Verify remote combat provenance', '      - name: redundant source file\n        run: node --experimental-vm-modules --test patches/network-replication/tests/comparison.test.mjs\n      - name: Verify remote combat provenance'),
  ]) { assert.notEqual(changed, workflow); assert.throws(() => assertSourceSuiteCoverage(changed, 'network')); }
});

test('new source tests join the suite automatically, empty discovery fails', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-coverage-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'patches/network-replication/tests'), {recursive: true});
  assert.throws(() => planSourceTests('network', root), /Empty/);
  const file = 'patches/network-replication/tests/new-default.test.mjs';
  fs.writeFileSync(path.join(root, file), '');
  assert.deepEqual(planSourceTests('network', root), {all: [file], tests: [file]});
});
