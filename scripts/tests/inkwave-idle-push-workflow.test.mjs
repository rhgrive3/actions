import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowPath = '.github/workflows/inkwave-idle-gl-attribution.yml';
// Exact reviewed e632 recipe, with only push isolation, immutable push source,
// and this extra serial guard added. This is diagnostic evidence, not acceptance.
const expectedBlob = 'a9ee3888f093e33582b772327dcbd1b7639dc3c1';
const expected = fs.readFileSync(path.join(root, workflowPath), 'utf8');
const pins = {
  "scripts/check-inkwave-idle-resources.mjs": "371b9cb4b7d218cdb6356b99eafca9da78ca5746",
  "scripts/tests/inkwave-idle-diagnostic-workflow.test.mjs": "9da8c393510e4f73a85175b8420f800cba5d0516",
  "scripts/tests/inkwave-idle-evaluate-deadline.test.mjs": "0dcb6fe498086c81a2c5218347ca7cd8f451274f",
  "scripts/tests/inkwave-idle-resources-gates.test.mjs": "097952e670404718e81a0a29d580ee34bd1be91d",
  "scripts/tests/inkwave-results-work-progress.test.mjs": "9e18a720588d37a2e8051c2a911786c17aa0a2f7",
  "scripts/tests/inkwave-network-diagnostic-workflow.test.mjs": "4db895a703b2ea29c2e16801072ccadd30f78953",
  "scripts/tests/inkwave-wall-diagnostic-workflow.test.mjs": "333b071e36753f1a940327c2547c03b9b35104d8"
};
const read = p => fs.readFileSync(path.join(root, p));
function gitBlob(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function verifyWorkflow(source) {
  assert.equal(gitBlob(Buffer.from(source)), expectedBlob, 'exact single-job push-only reviewed diagnostic recipe');
}
function verifyWorkload(readFile) {
  for (const [p, sha] of Object.entries(pins)) {
    assert.equal(gitBlob(readFile(p)), sha, 'reviewed workload/guard bytes: ' + p);
  }
}
test('dedicated workflow is exact, push-only, one job, read-only and immutable', () => {
  verifyWorkflow(read(workflowPath).toString('utf8'));
});
test('reviewed workload and existing serial guards are unchanged', () => {
  verifyWorkload(read);
});
const mutations = [
  ['main trigger', 'branches: [test/inkwave-idle-gl-attribution-20261024]', 'branches: [main]'],
  ['wildcard trigger', 'branches: [test/inkwave-idle-gl-attribution-20261024]', 'branches: ["test/**"]'],
  ['PR trigger', 'on:\n  push:', 'on:\n  pull_request:\n  push:'],
  ['manual trigger', 'on:\n  push:', 'on:\n  workflow_dispatch:\n  push:'],
  ['extra job', 'jobs:\n', 'jobs:\n  unrelated:\n    runs-on: ubuntu-latest\n    steps: []\n'],
  ['mutable source', 'SOURCE_SHA: ${{ github.sha }}', 'SOURCE_SHA: main'],
  ['mismatched workflow identity', 'WORKFLOW_SHA: ${{ github.workflow_sha }}', 'WORKFLOW_SHA: main'],
  ['mutable checkout', 'ref: ${{ env.SOURCE_SHA }}', 'ref: main'],
  ['missing source equality', '          test "$WORKFLOW_SHA" = "$SOURCE_SHA"\n', ''],
  ['missing checkout equality', '          test "$(git rev-parse HEAD)" = "$SOURCE_SHA"\n', ''],
  ['write permissions', 'contents: read', 'contents: write'],
  ['expanded permissions', 'contents: read', 'contents: read\n  actions: write'],
  ['missing new guard', 'scripts/tests/inkwave-idle-push-workflow.test.mjs ', ''],
  ['parallel CPU guards', '--test-concurrency=1 ', ''],
  ['missing existing guard', 'scripts/tests/inkwave-idle-evaluate-deadline.test.mjs ', ''],
  ['missing exact-source', ' --exact-source', ''],
  ['changed checker arguments', ' --exact-source', ' --exact-source --frames 1'],
  ['changed browser dependencies', 'playwright@1.62.1', 'playwright@latest'],
  ['changed Node', 'node-version: 22', 'node-version: 24'],
  ['changed build', 'node scripts/build-inkwave.mjs inkwave-public .built-site/_site', 'echo skip-build'],
  ['missing evidence preservation', 'if: always()', 'if: success()'],
  ['weakened identity gate', "if: github.event_name == 'push'", "if: true || github.event_name == 'push'"],
  ['missing GL attribution', "INKWAVE_IDLE_GL_DIAGNOSTICS: '1'", "INKWAVE_IDLE_GL_DIAGNOSTICS: '0'"],
];
for (const [name, from, to] of mutations) {
  test('rejects ' + name, () => {
    assert.ok(expected.includes(from), 'mutation anchor exists');
    const mutated = expected.replace(from, to);
    assert.notEqual(mutated, expected);
    assert.throws(() => verifyWorkflow(mutated), /exact single-job/);
  });
}
for (const p of Object.keys(pins)) {
  test('rejects changed reviewed bytes: ' + p, () => {
    assert.throws(() => verifyWorkload(file => file === p ? Buffer.concat([read(file), Buffer.from('\n// altered workload\n')]) : read(file)), /reviewed workload\/guard bytes/);
  });
}
