import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// These are transport contracts, not native diagnostic or acceptance results.
const workflow = readFileSync(new URL('../../.github/workflows/inkwave-native-diagnostic-pr.yml', import.meta.url), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const sourceQA = 'c364095373b0d92201dd76af67351bf111af85f8';
const wiperQA = '8b18f6e99437dd148ad4a095bb85f3c1ff709eaf';
const headBranch = 'diagnostic/native-ci-route-20261022';
const baseBranch = 'inkwave/qa-browser-followon-20261022';
const expectedGuard = "github.event_name == 'pull_request' && github.event.action == 'opened' && github.repository == 'rhgrive3/actions' && github.event.pull_request.head.repo.full_name == 'rhgrive3/actions' && github.event.pull_request.base.repo.full_name == 'rhgrive3/actions' && github.head_ref == 'diagnostic/native-ci-route-20261022' && github.base_ref == 'inkwave/qa-browser-followon-20261022' && github.event.pull_request.base.sha == 'c364095373b0d92201dd76af67351bf111af85f8' && github.event.pull_request.state == 'open'";
const expectedHeader = "name: INKWAVE frozen native diagnostic PR route\n# One-shot diagnostic transport only. Never a Validate acceptance gate or merge route.\non:\n  pull_request:\n    types: [opened]\n    branches: [inkwave/qa-browser-followon-20261022]\n    paths:\n      - .github/workflows/inkwave-native-diagnostic-pr.yml\n      - tools/native-diagnostic-pr/route.test.mjs\npermissions:\n  contents: read\nconcurrency:\n  group: inkwave-native-diagnostic-pr-${{ github.event.pull_request.number }}\n  cancel-in-progress: false\njobs:\n";
const suffixHashes = {
  "network-opening-diagnostic": "f9216be51527d0fb291e27424f1307b57e18b819ef6a3671a30a95e52966e591",
  "wall-render-diagnostic": "d1b8464318dcb0948756e4801083e7a7e519400ba6a6d26a9b2d64cba5bfd9fb",
  "wiper-lifecycle-diagnostic": "7f90e5ccb6b657884bb09ff24b639a596425ca1dbbd7a3b1cdda733d96a95b80"
};
const acceptedFiles = {
  "network-opening-diagnostic": {
    ".github/workflows/validate-inkwave-update.yml": "2a4e5368da0a4ba3cf3514663dd512000a8f4390dd0c07db33f97c4cea39d5ec"
  },
  "wall-render-diagnostic": {
    ".github/workflows/validate-inkwave-update.yml": "2a4e5368da0a4ba3cf3514663dd512000a8f4390dd0c07db33f97c4cea39d5ec"
  },
  "wiper-lifecycle-diagnostic": {
    ".github/workflows/inkwave-wiper-rng-observation.yml": "64a1b5d85cbfb1951e18be5d56d61cc60eb072848ff190cc8cb0e1362791ce89",
    "scripts/check-inkwave-wiper-plane-native.mjs": "2b70faf7b45de067aa2f907357b899cc10d509d4c43fd6480f8a106878bd79cc",
    "scripts/lib/inkwave-wiper-resource-lifecycle.mjs": "56c6f616d7926efe4fbc854bd33aa62d64cd88dd51e44e9e76b079c214bd2fb3",
    "scripts/tests/inkwave-wiper-resource-lifecycle.test.mjs": "eb9faeb0a5c06db4e5c8ec7829eb36dc338754978392ca4238233e9ac0e77914"
  }
};
const laneNames = Object.keys(suffixHashes);
function job(text, name) {
  const start = text.indexOf(`  ${name}:\n`, text.indexOf('\njobs:\n'));
  assert.ok(start >= 0, `Missing ${name}`);
  const rest = text.slice(start + name.length + 4);
  const end = rest.search(/^  [\w-]+:\n/m);
  return end < 0 ? rest : rest.slice(0, end);
}
const condition = (text, name) => job(text, name).match(/^    if: (.+)$/m)?.[1];
function diagnosticTail(body) {
  const start = body.indexOf('      - uses: actions/setup-node@v4\n');
  const end = body.indexOf('      - name: Preserve route identity separately from native source evidence\n');
  assert.ok(start >= 0 && end > start);
  return body.slice(start, end).trimEnd();
}
function verify(text) {
  assert.equal(text.slice(0, text.indexOf('jobs:\n') + 6), expectedHeader);
  assert.deepEqual([...text.slice(text.indexOf('jobs:\n') + 6).matchAll(/^  ([\w-]+):$/gm)].map(m => m[1]), laneNames);
  assert.doesNotMatch(text, /secrets\.|contents: write|pull_request_target|continue-on-error|\|\| true|workflow_dispatch:\n|inputs:\n/);
  for (const name of laneNames) {
    const body = job(text, name);
    const qa = name.startsWith('wiper') ? wiperQA : sourceQA;
    assert.equal(condition(text, name), expectedGuard);
    assert.match(body, /^    runs-on: ubuntu-latest$/m);
    assert.match(body, new RegExp(`^    timeout-minutes: ${name.startsWith('wiper') ? 180 : 30}$`, 'm'));
    for (const literal of [
      `SOURCE_SHA: ${qa}`,
      'WORKFLOW_SHA: ${{ github.workflow_sha }}',
      'ROUTE_HEAD_SHA: ${{ github.event.pull_request.head.sha }}',
      'ref: ${{ env.SOURCE_SHA }}',
      'ref: ${{ github.workflow_sha }}',
      'ref: ${{ github.event.pull_request.head.sha }}',
      '[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]',
      '[[ "$WORKFLOW_SHA" =~ ^[0-9a-f]{40}$ ]]',
      '[[ "$ROUTE_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]',
      `test "$SOURCE_SHA" = ${qa}`,
      'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"',
      'test "$(git -C .diagnostic-route/execution rev-parse HEAD)" = "$WORKFLOW_SHA"',
      'test "$(git -C .diagnostic-route/head rev-parse HEAD)" = "$ROUTE_HEAD_SHA"',
      'cmp .diagnostic-route/execution/.github/workflows/inkwave-native-diagnostic-pr.yml .diagnostic-route/head/.github/workflows/inkwave-native-diagnostic-pr.yml',
      'cmp .diagnostic-route/execution/tools/native-diagnostic-pr/route.test.mjs .diagnostic-route/head/tools/native-diagnostic-pr/route.test.mjs',
      'route_workflow_sha=%s\\nroute_pr_head_sha=%s\\naccepted_qa_source_sha=%s\\n',
      'run: node --test .diagnostic-route/head/tools/native-diagnostic-pr/route.test.mjs',
      `DIAGNOSTIC_LANE: ${name}`,
      'DIAGNOSTIC_ACCEPTED_ROOT: ${{ github.workspace }}',
      'name: Preserve route identity separately from native source evidence\n        if: always()',
      'path: .diagnostic-route/evidence/\n          include-hidden-files: true'
    ]) assert.ok(body.includes(literal), `${name}: missing ${literal}`);
    assert.doesNotMatch(body, /test "\$WORKFLOW_SHA" = "\$SOURCE_SHA"|test "\$ROUTE_HEAD_SHA" = "\$SOURCE_SHA"/);
    const checkouts = body.split('uses: actions/checkout@v4').slice(1);
    assert.equal(checkouts.length, name.startsWith('wiper') ? 4 : 3);
    for (const checkout of checkouts) assert.ok(checkout.split(/\n      - /)[0].includes('persist-credentials: false'));
    assert.equal((body.match(/sparse-checkout-cone-mode: false/g) || []).length, 2);
    for (const [path, hash] of Object.entries(acceptedFiles[name])) {
      assert.ok(body.includes(`printf '%s  %s\\n' '${hash}' '${path}' | sha256sum --check --strict`));
    }
    assert.equal(sha(diagnosticTail(body)), suffixHashes[name], `${name}: accepted diagnostic steps changed`);
    assert.ok(body.indexOf('Verify separate route and accepted source identities') < body.indexOf('Verify bounded PR route contracts'));
    assert.ok(body.indexOf('Setup pinned Node for route guards') < body.indexOf('Verify bounded PR route contracts'));
    assert.ok(body.includes('Setup pinned Node for route guards\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22'));
    assert.ok(body.indexOf('Verify bounded PR route contracts') < body.indexOf('      - uses: actions/setup-node@v4'));
  }
  const wiper = job(text, 'wiper-lifecycle-diagnostic');
  assert.ok(wiper.includes('Record independently verified Wiper runtime and reference identities'));
  assert.ok(wiper.includes('runtime_source_sha=%s\\nruntime_source_tree=%s\\nreference_sha=%s\\n'));
  assert.ok(wiper.includes('ref: c0938a3f84768474df91713f7b372f9d7f8fe96a\n          path: work/source\n          fetch-depth: 0\n          persist-credentials: false'));
  assert.equal((wiper.match(/if: \$\{\{ github.event_name == 'workflow_dispatch' && inputs.full_capture == true \}\}/g) || []).length, 2);
  return true;
}
function evaluate(expression, context) {
  return expression.split(' && ').every(term => {
    const m = term.match(/^(github(?:\.[a-z_]+)+) == '([^']+)'$/);
    assert.ok(m, `Unsupported predicate ${term}`);
    return context[m[1]] === m[2];
  });
}
const allowed = {
  'github.event_name': 'pull_request', 'github.event.action': 'opened',
  'github.repository': 'rhgrive3/actions',
  'github.event.pull_request.head.repo.full_name': 'rhgrive3/actions',
  'github.event.pull_request.base.repo.full_name': 'rhgrive3/actions',
  'github.head_ref': headBranch, 'github.base_ref': baseBranch,
  'github.event.pull_request.base.sha': sourceQA, 'github.event.pull_request.state': 'open'
};
test('one-shot route is read-only and preserves all accepted diagnostic steps', () => verify(workflow));
test('actual predicates admit only the owned dedicated open PR on frozen base', () => {
  const variants = {
    'github.event_name': ['pull_request', 'pull_request_target', 'push', 'workflow_dispatch', 'workflow_run', undefined],
    'github.event.action': ['opened', 'synchronize', 'reopened', 'closed', 'ready_for_review', undefined],
    'github.repository': ['rhgrive3/actions', 'attacker/actions', undefined],
    'github.event.pull_request.head.repo.full_name': ['rhgrive3/actions', 'attacker/actions', undefined],
    'github.event.pull_request.base.repo.full_name': ['rhgrive3/actions', 'attacker/actions', undefined],
    'github.head_ref': [headBranch, `${headBranch}-suffix`, 'main', undefined],
    'github.base_ref': [baseBranch, 'main', undefined],
    'github.event.pull_request.base.sha': [sourceQA, '0000000000000000000000000000000000000000', undefined],
    'github.event.pull_request.state': ['open', 'closed', undefined]
  };
  let count = 0, admitted = 0;
  const dimensions = Object.entries(variants);
  function visit(index, context) {
    if (index < dimensions.length) {
      const [key, values] = dimensions[index];
      for (const value of values) visit(index + 1, { ...context, [key]: value });
      return;
    }
    count++;
    const expected = Object.entries(allowed).every(([key, value]) => context[key] === value);
    for (const lane of laneNames) assert.equal(evaluate(condition(workflow, lane), context), expected);
    if (expected) admitted++;
  }
  visit(0, {});
  assert.equal(count, 104976);
  assert.equal(admitted, 1);
});
test('PR route can never enable Wiper full capture, even with forged true inputs', () => {
  const longCapture = (event, fullCapture) => event === 'workflow_dispatch' && fullCapture === true;
  for (const fullCapture of [false, true, 'true', undefined]) assert.equal(longCapture(allowed['github.event_name'], fullCapture), false);
  assert.equal(evaluate(expectedGuard, { ...allowed, 'github.event_name': 'workflow_dispatch' }), false);
});
test('trigger, fork, head, base and permission mutations are rejected', () => {
  for (const [before, after] of [
    ['types: [opened]', 'types: [opened, synchronize]'],
    [`branches: [${baseBranch}]`, 'branches: [main]'],
    ['contents: read', 'contents: write'],
    ['cancel-in-progress: false', 'cancel-in-progress: true'],
    [" && github.event.pull_request.head.repo.full_name == 'rhgrive3/actions'", ''],
    [" && github.event.pull_request.base.repo.full_name == 'rhgrive3/actions'", ''],
    [` && github.event.pull_request.base.sha == '${sourceQA}'`, ''],
    [`github.head_ref == '${headBranch}'`, "github.head_ref != 'main'"],
    ["github.event.action == 'opened'", "github.event.action != 'closed'"]
  ]) { const changed = workflow.replaceAll(before, after); assert.notEqual(changed, workflow); assert.throws(() => verify(changed)); }
});
test('missing immutable identities, checkout credentials or accepted bytes fail closed', () => {
  for (const [before, after] of [
    ['test "$(git rev-parse HEAD)" = "$SOURCE_SHA"', 'true # removed'],
    ['test "$(git -C .diagnostic-route/execution rev-parse HEAD)" = "$WORKFLOW_SHA"', 'true # removed'],
    ['test "$(git -C .diagnostic-route/head rev-parse HEAD)" = "$ROUTE_HEAD_SHA"', 'true # removed'],
    ['cmp .diagnostic-route/execution/.github/workflows/inkwave-native-diagnostic-pr.yml', 'true .diagnostic-route/execution/.github/workflows/inkwave-native-diagnostic-pr.yml'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['sha256sum --check --strict', 'sha256sum'],
    ['ref: c0938a3f84768474df91713f7b372f9d7f8fe96a', 'ref: main']
  ]) { const changed = workflow.replaceAll(before, after); assert.notEqual(changed, workflow); assert.throws(() => verify(changed)); }
});
test('diagnostic assertions, storage, dependencies and failure evidence cannot weaken', () => {
  for (const [before, after] of [
    ['--exact-source', '--skip'],
    ['--visibility-probe', '--dental-pilot'],
    ["inputs.full_capture == true", "inputs.full_capture != true"],
    ['esbuild@0.28.2', 'esbuild@latest'],
    ['if: always()', 'if: success()'],
    ['timeout-minutes: 30', 'timeout-minutes: 300'],
    ['node scripts/check-inkwave-wiper-visibility-pair.mjs', 'true scripts/check-inkwave-wiper-visibility-pair.mjs'],
    ['node scripts/check-inkwave-combat-ceiling-browser.mjs', 'true scripts/check-inkwave-combat-ceiling-browser.mjs']
  ]) { const changed = workflow.replaceAll(before, after); assert.notEqual(changed, workflow); assert.throws(() => verify(changed)); }
});
test('when supplied, the executing lane uses exact accepted workflow and Wiper bytes', { skip: !process.env.DIAGNOSTIC_ACCEPTED_ROOT }, () => {
  const lane = process.env.DIAGNOSTIC_LANE;
  assert.ok(laneNames.includes(lane));
  const root = process.env.DIAGNOSTIC_ACCEPTED_ROOT;
  for (const [path, hash] of Object.entries(acceptedFiles[lane])) assert.equal(sha(readFileSync(resolve(root, path))), hash, path);
  const original = readFileSync(resolve(root, lane.startsWith('wiper') ? '.github/workflows/inkwave-wiper-rng-observation.yml' : '.github/workflows/validate-inkwave-update.yml'), 'utf8');
  const originalJob = job(original, lane.startsWith('wiper') ? 'capture' : lane);
  assert.equal(sha(originalJob.slice(originalJob.indexOf('      - uses: actions/setup-node@v4\n')).trimEnd()), suffixHashes[lane]);
  if (!lane.startsWith('wiper')) {
    assert.equal(condition(original, 'network-opening-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true");
    assert.equal(condition(original, 'wall-render-diagnostic'), "github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic == true");
    assert.equal(condition(original, 'render-diagnostic'), 'inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true && inputs.wall_render_diagnostic != true');
  }
});
