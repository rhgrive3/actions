import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planSourceTests, assertSourceSuiteCoverage} from '../ci/inkwave-source-coverage.mjs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');

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
