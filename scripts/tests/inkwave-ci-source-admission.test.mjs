import {e1fPaintEpochSource} from './fixtures/inkwave-paint-e1f-sources.mjs';
import {paintEpochSource} from './fixtures/inkwave-paint-source-epochs.mjs';
import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyDeclaredPaintSources} from '../lib/inkwave-declared-paint-source-pair.mjs';
import {MAIN_INK_BASELINE_PATHS, planMainInkBaseline} from '../lib/inkwave-main-ink-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readWorkflow = name => fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
const sourceExpression = '${{ github.event.pull_request.head.sha || github.sha }}';
// H51 immutable dispatch contract; do not auto-detect or accept legacy moving-main routes.
const exactBranch = 'inkwave/exact-head-ci-main144-20261022';
const exactEpoch = {mode:'queue1801-byte-identical-paint-source-epoch',sha:'df83a5c4265a9c8738d930dabaffb43cd31ae902'};
const runtimeBranch = 'inkwave/runtime-acceptance-0f3-prep-20261022';
const jobs = {
  'ci-quality-gate.yml': ['verify-aplus-suite'],
  'inkwave-specials-1130.yml': ['special-fidelity', 'catalogue-browser'],
  'inkwave-reopened-six.yml': ['reopened-six'],
  'validate-inkwave-native-stage5.yml': ['contracts', 'placement-worker', 'source-geometry'],
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-ci-source-admission-'));
after(() => fs.rmSync(temporary, {recursive: true, force: true}));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
function createRepository(name, sources = new Map()) {
  const cwd = path.join(temporary, name);
  fs.mkdirSync(cwd);
  git(cwd, 'init', '--quiet');
  for (const [relative, bytes] of sources) {
    const file = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, bytes);
  }
  git(cwd, 'add', '.');
  git(cwd, '-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', name);
  return {cwd, sha: git(cwd, 'rev-parse', 'HEAD')};
}
const checkout = createRepository('checkout');
const sameTree = createRepository('same-tree-different-head');
assert.notEqual(checkout.sha, sameTree.sha);
assert.equal(git(checkout.cwd, 'rev-parse', 'HEAD^{tree}'), git(sameTree.cwd, 'rev-parse', 'HEAD^{tree}'));

function identityContract(source, job) {
  const jobStart = source.indexOf(`  ${job}:\n`);
  assert.notEqual(jobStart, -1, 'job exists');
  const tail = source.slice(jobStart + 2);
  const nextJob = tail.search(/\n  [a-z][a-z0-9_-]*:\n/);
  const body = nextJob === -1 ? tail : tail.slice(0, nextJob);
  const steps = body.split(/(?=^      - )/m);
  const checkouts = steps.filter(step => /^        uses: actions\/checkout@v4$|^      - uses: actions\/checkout@v4$/m.test(step));
  assert.equal(checkouts.length, 1, 'each job checks out exactly one source');
  const selected = checkouts[0];
  assert.ok(selected.includes(`          ref: ${sourceExpression}\n`), 'literal event source, not a mutable branch or synthetic merge');
  const guard = steps[steps.indexOf(selected) + 1];
  assert.match(guard, /^      - name: Verify immutable checkout identity\n/);
  assert.ok(guard.includes(`          EXPECTED_SOURCE_SHA: ${sourceExpression}\n`), 'checkout and assertion use the identical event expression');
  assert.doesNotMatch(guard, /^        (?:if|continue-on-error):/m, 'identity assertion cannot be optional');
  const commands = guard.split('        run: |\n')[1]?.split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n');
  assert.ok(commands, 'real shell guard required');
  assert.ok(commands.includes('[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]'));
  assert.ok(commands.includes('actual_source_sha="$(git rev-parse HEAD)"'));
  assert.ok(commands.includes('test "$actual_source_sha" = "$EXPECTED_SOURCE_SHA"'));
  return commands;
}
for (const [workflow, names] of Object.entries(jobs)) for (const job of names) {
  const source = readWorkflow(workflow);
  test(`${workflow}/${job}: pins the same immutable PR, push or dispatch source and asserts actual checkout`, () => {
    const commands = identityContract(source, job);
    // Execute the actual YAML shell, not a mocked GitHub status/head_sha. The
    // expression itself is statically bounded above; this is not a hosted run.
    for (const [expected, pass] of [[checkout.sha, true], [sameTree.sha, false], ['f'.repeat(40), false], ['main', false], ['', false], [checkout.sha.slice(0, 12), false], [checkout.sha.toUpperCase(), false]]) {
      const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', commands], {cwd: checkout.cwd, encoding: 'utf8', env: {...process.env, EXPECTED_SOURCE_SHA: expected}});
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status === 0, pass, `${job}: ${expected}`);
      if (pass) assert.ok(result.stdout.includes(`Actual checkout: ${checkout.sha}`));
    }
    const absent = spawnSync('bash', ['-e', '-c', commands], {cwd: temporary, env: {...process.env, EXPECTED_SOURCE_SHA: checkout.sha}, encoding: 'utf8'});
    assert.notEqual(absent.status, 0, 'missing Git checkout fails closed');
  });
  test(`${workflow}/${job}: rejects regressions to unpinned or optional identity`, () => {
    const start = source.indexOf(`  ${job}:\n`);
    const mutate = edit => source.slice(0, start) + edit(source.slice(start));
    for (const altered of [
      mutate(s => s.replace(`          ref: ${sourceExpression}\n`, '')),
      mutate(s => s.replace(`          ref: ${sourceExpression}`, '          ref: main')),
      mutate(s => s.replace(`          EXPECTED_SOURCE_SHA: ${sourceExpression}`, '          EXPECTED_SOURCE_SHA: ${{ github.sha }}')),
      mutate(s => s.replace('      - name: Verify immutable checkout identity\n', '      - name: Verify immutable checkout identity\n        continue-on-error: true\n')),
      mutate(s => s.replace('test "$actual_source_sha" = "$EXPECTED_SOURCE_SHA"', 'true')),
    ]) assert.throws(() => identityContract(altered, job));
  });
}

const allPrBranch = 'integrate/inkwave-all-prs-20261022';
const allPrEpoch={mode:'current-pair-with-gameplay-differences',sha:'26a4db4123d23162a3dbf8a12150b1b5bc6ccf64',head:'992b670084d11560a5621041a5e456bd10a7b75c'};
const queueBranch = 'fix/queue-30-recovery-20261022';
const queueEpoch = {mode:'queue1801-reviewed-paint-source-pair',sha:'28d2c888704d32304d1c938c51d7d2d230eddbbd',head:'df83a5c4265a9c8738d930dabaffb43cd31ae902'};
const integrationBranch = 'integrate/all-open-prs-20261022';
const integrationEpoch = {mode:'mainceb58-byte-identical-paint-source-epoch',sha:'ceb58f24d8188d3a5179e013399ba37ef4c41f47'};
const a350Branch = 'inkwave/runtime-main-a350-integration-20261022';
const a350Epoch = {mode:'maina350-byte-identical-paint-source-epoch',sha:'a350b6b89e4cb86abe37273db6315c74085f8ac5'};
const epoch = {mode: 'maine1f-byte-identical-paint-source-epoch', sha: 'e1fa66ad8465bf87caaf232d51543def72c35875'};
const controlName = 'Bind reviewed source controls to declared immutable Git source leaves';
const prepareName = 'Replay reviewed Roller births, pool reset and pinned paint in the main reference';
const step = (source, name) => {
  const marker = `      - name: ${name}\n`;
  assert.equal(source.split(marker).length, 2, name + ': exactly one step');
  return source.split(marker)[1].split('      - name: ')[0];
};
const shell = body => body.split('        run: |\n')[1]?.split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n');
function enabled(body, context) {
  const expression = body.match(/^        if: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression, 'explicit step selector required');
  // Execute this workflow's bounded boolean selector, not the GitHub API or a
  // hosted runner. These expressions use only equality, &&, || and parentheses.
  assert.match(expression, /^[a-zA-Z0-9_.'/= !&|()\-]+$/);
  return Function('github', 'matrix', `return Boolean(${expression});`)(context.github, context.matrix);
}
function context(branch, number, {event = 'pull_request', baseRef = 'main', side = 'before', headRepo = 'rhgrive3/actions'} = {}) {
  return {github: {event_name: event, repository: 'rhgrive3/actions', head_ref: branch, event: {pull_request: {number, base: {ref: baseRef}, head: {repo: {full_name: headRepo}}}}}, matrix: {side}};
}
function policyEnv(c) {
  return {...process.env, PAIR_EVENT_NAME: c.github.event_name, PAIR_BASE_REF: c.github.event.pull_request.base.ref,
    PAIR_HEAD_REPO: c.github.event.pull_request.head.repo.full_name, PAIR_REPOSITORY: c.github.repository,
    DISPATCH_MODE: epoch.mode, DISPATCH_SOURCE_BASE: epoch.sha, DISPATCH_SOURCE_HEAD: epoch.sha,
    PAIR_HEAD_REF: c.github.head_ref, PAIR_PR_NUMBER: c.github.event.pull_request.number,
    INKWAVE_REFERENCE_ROOT: '.ci-baseline', DECLARED_BASE_SHA: '1'.repeat(40), DECLARED_HEAD_SHA: '2'.repeat(40)};
}
function probe(body, c, failure = 0) {
  const commands = shell(body); assert.ok(commands, 'real selector shell required');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c',
    'node() { printf "<call>\\n"; printf "%s\\n" "$@"; return "$PROBE_EXIT"; }\n' + commands],
    {encoding: 'utf8', env: {...policyEnv(c), PROBE_EXIT: String(failure)}});
  assert.equal(result.error, undefined); assert.equal(result.signal, null);
  return {result, calls: result.stdout.split('<call>\n').slice(1).map(row => row.trimEnd().split('\n'))};
}
function sourceRouteContract(source) {
  const bodies = [step(source, controlName), step(source, prepareName)];
  for (const body of bodies) {
    assert.doesNotMatch(body, /^        continue-on-error:/m);
    assert.equal((body.match(/elif \[ "\$PAIR_EVENT_NAME" = "pull_request" \] && \[ "\$PAIR_BASE_REF" = "main" \]/g) || []).length, 6, 'all reviewed PR shells retain event and base guards');
    for (const [name, value] of [['PAIR_EVENT_NAME', 'github.event_name'], ['PAIR_BASE_REF', 'github.event.pull_request.base.ref'],
      ['PAIR_HEAD_REF', 'github.head_ref'], ['DECLARED_BASE_SHA', 'github.event.pull_request.base.sha || inputs.base_sha'], ['DECLARED_HEAD_SHA', 'github.event.pull_request.head.sha || inputs.candidate_sha'],
      ['PAIR_HEAD_REPO','github.event.pull_request.head.repo.full_name'], ['PAIR_REPOSITORY','github.repository'],
      ['DISPATCH_MODE','inputs.expected_mode'], ['DISPATCH_SOURCE_BASE','inputs.expected_source_base'], ['DISPATCH_SOURCE_HEAD','inputs.expected_source_head']])
      assert.ok(body.includes('          ' + name + ': ${{ ' + value + ' }}\n'), name + ': dynamic immutable event declaration');
  }
  const cases = [
    [context(allPrBranch,'1843'),true,true,'allpr'],
    [context(allPrBranch+'-foreign','1843'),false,true,'legacy'],
    [context(allPrBranch,'1843',{headRepo:'foreign/repo'}),false,true,'legacy'],
    [context(allPrBranch,'1843',{baseRef:'not-main'}),false,true,'legacy'],
    [context(allPrBranch,'1843',{side:'after'}),false,false,'none'],
    [context(exactBranch,'1817'),true,true,'exact'],
    [context(exactBranch+'-foreign','1817'),false,true,'legacy'],
    [context(exactBranch,'1817',{headRepo:'foreign/repo'}),false,true,'legacy'],
    [context(exactBranch,'1817',{headRepo:''}),false,true,'legacy'],
    [context(exactBranch,'1817',{baseRef:'not-main'}),false,true,'legacy'],
    [context(exactBranch,'1817',{event:'push'}),false,true,'legacy'],
    [context(exactBranch,'1817',{side:'after'}),false,false,'none'],
    [context(exactBranch,'1817',{event:'workflow_dispatch'}),true,true,'dispatch'],
    [context(exactBranch,'1817',{event:'workflow_dispatch',side:'after'}),false,false,'none'],
    [context(queueBranch,'1801'),true,true,'queue'],
    [context(queueBranch+'-foreign','1801'),false,true,'legacy'],
    [context(queueBranch,'1801',{baseRef:'not-main'}),false,true,'legacy'],
    [context(queueBranch,'1801',{event:'workflow_dispatch'}),true,true,'dispatch'],
    [context(queueBranch,'1801',{side:'after'}),false,false,'none'],
    [context(integrationBranch, '1796'), true, true, 'integration'],
    [context(integrationBranch+'-foreign', '1796'), false, true, 'legacy'],
    [context(integrationBranch, '1796', {baseRef:'not-main'}), false, true, 'legacy'],
    [context(integrationBranch, '1796', {event:'workflow_dispatch'}), true, true, 'dispatch'],
    [context(integrationBranch, '1796', {side:'after'}), false, false, 'none'],
    [context(a350Branch, '1788'), true, true, 'a350'],
    [context(a350Branch + '-unreviewed', '1788'), false, true, 'legacy'],
    [context(a350Branch, '1788', {baseRef: 'not-main'}), false, true, 'legacy'],
    [context(a350Branch, '1788', {event: 'workflow_dispatch'}), true, true, 'dispatch'],
    [context(a350Branch, '1788', {side: 'after'}), false, false, 'none'],
    [context(runtimeBranch, '1770'), true, true, 'current'],
    [context(runtimeBranch, '1758'), true, true, 'current'],
    [context(runtimeBranch, '1758', {baseRef: 'not-main'}), true, true, 'declared-legacy'],
    [context(runtimeBranch, '1758', {event: 'workflow_dispatch'}), true, true, 'dispatch'],
    [context('test/inkwave-combined-qa-20261021', '0'), true, true, 'declared-legacy'],
    [context('historical', '1758'), true, true, 'declared-legacy'],
    [context(runtimeBranch + '-unreviewed', '0'), false, true, 'legacy'],
    [context('other', '0'), false, true, 'legacy'],
    [context(runtimeBranch, '1770', {baseRef: 'not-main'}), false, true, 'legacy'],
    [context(runtimeBranch, '1770', {event: 'workflow_dispatch'}), true, true, 'dispatch'],
    [context('', '', {event: 'workflow_dispatch', baseRef: ''}), true, true, 'dispatch'],
    [context('', '', {event: 'push', baseRef: ''}), false, true, 'legacy'],
    [context(runtimeBranch, '1770', {side: 'after'}), false, false, 'none'],
    [context('historical', '1651'), false, false, 'none'],
  ];
  for (const [c, controls, prepare, route] of cases) for (const [index, active] of [[0, controls], [1, prepare]]) {
    const body = bodies[index]; assert.equal(enabled(body, c), active, JSON.stringify(c));
    if (!active) continue;
    const {result, calls} = probe(body, c); assert.equal(result.status, 0, result.stderr); assert.equal(calls.length, 1);
    const script = index === 0 ? 'check-inkwave-current-pair-controls' : 'prepare-inkwave-projectile-baseline';
    const receipt = index === 0 ? 'current-pair-controls' : 'baseline-birth-adjustment';
    const chosenEpoch = route === 'allpr' ? allPrEpoch : route === 'exact' ? exactEpoch : route === 'queue' ? queueEpoch : route === 'integration' ? integrationEpoch : route === 'a350' ? a350Epoch : epoch;
    const wanted = [`scripts/${script}.mjs`, '--baseline', '.ci-baseline', '--candidate', '.',
      ...(route === 'legacy' ? [] : ['--base-sha', '1'.repeat(40), '--candidate-sha', '2'.repeat(40)]),
      ...(['allpr','current','a350','integration','queue','exact','dispatch'].includes(route) ? ['--expected-mode', chosenEpoch.mode, '--expected-source-base', chosenEpoch.sha, '--expected-source-head', chosenEpoch.head || chosenEpoch.sha] : []),
      '--receipt', `.ci-scratch/projectile-visuals/before/${receipt}.json`];
    assert.deepEqual(calls[0], wanted, route + ': exact original/new consumer arguments');
  }
  for (const body of bodies) for (const selectedBranch of [allPrBranch,runtimeBranch,a350Branch,integrationBranch,queueBranch,exactBranch]) {
    const {result, calls} = probe(body, context(selectedBranch, '1770'), 42);
    assert.equal(result.status, 42, 'current-epoch rejection must stop the step');
    assert.equal(calls.length, 1, 'no retry or legacy fallback after current-epoch rejection');
  }
  for (const body of bodies) {
    const {result,calls}=probe(body,context('', '', {event:'workflow_dispatch',baseRef:''}),42);
    assert.equal(result.status,42,'dispatch rejection stops without fallback');
    assert.equal(calls.length,1,'dispatch cannot retry or infer an epoch');
  }
  return bodies;
}

test('reviewed PR and explicit immutable dispatch routes select their exact epoch in both actual YAML shells', () => {
  sourceRouteContract(readWorkflow('inkwave-projectile-visuals.yml'));
});

test('workflow policy rejects missing/changed epoch flags, unsafe selection, fallback and stale SHA declarations', () => {
  const source = readWorkflow('inkwave-projectile-visuals.yml');
  const currentCall = ' --expected-mode ' + epoch.mode;
  for (const [mutation, changed] of [
    source.replace(currentCall, ''), source.replace(epoch.mode, 'unknown-source-epoch'),
    source.replace('--expected-source-base ' + epoch.sha, '--expected-source-base ' + 'f'.repeat(40)),
    source.replace('--expected-source-head ' + epoch.sha, '--expected-source-head ' + 'f'.repeat(40)),
    source.replaceAll('PAIR_EVENT_NAME: ${{ github.event_name }}', 'PAIR_EVENT_NAME: pull_request'),
    source.replace('DECLARED_BASE_SHA: ${{ github.event.pull_request.base.sha || inputs.base_sha }}', 'DECLARED_BASE_SHA: ' + epoch.sha),
    source.replace('DECLARED_HEAD_SHA: ${{ github.event.pull_request.head.sha || inputs.candidate_sha }}', 'DECLARED_HEAD_SHA: ${{ github.sha }}'),
    source.replaceAll('if [ "$PAIR_EVENT_NAME" = "pull_request" ] && ', 'if '),
    source.replace(' && [ "$PAIR_BASE_REF" = "main" ]', ''),
    source.replace('current-pair-controls.json\n', 'current-pair-controls.json || true\n'),
    source.replace('          else\n            node scripts/check-inkwave-current-pair-controls.mjs',
      '          else\n            node scripts/check-inkwave-current-pair-controls.mjs' + currentCall),
    source.replaceAll('DISPATCH_MODE: ${{ inputs.expected_mode }}','DISPATCH_MODE: legacy'),
    source.replaceAll('DISPATCH_SOURCE_BASE: ${{ inputs.expected_source_base }}','DISPATCH_SOURCE_BASE: '+epoch.sha),
    source.replaceAll('DISPATCH_SOURCE_HEAD: ${{ inputs.expected_source_head }}','DISPATCH_SOURCE_HEAD: '+epoch.sha),
    source.replace('--expected-mode "$DISPATCH_MODE"', ''),
    source.replace('--expected-source-base "$DISPATCH_SOURCE_BASE"', ''),
    source.replace('--expected-source-head "$DISPATCH_SOURCE_HEAD"', ''),
    source.replaceAll(' && [ "$PAIR_HEAD_REPO" = "$PAIR_REPOSITORY" ]',''),
    source.replace(exactEpoch.mode,'unknown-exact-epoch'),
    source.replace(a350Epoch.mode, 'unknown-a350-epoch'),
    source.replace('--expected-source-base '+a350Epoch.sha, '--expected-source-base '+'f'.repeat(40)),
    source.replace('--expected-source-head '+a350Epoch.sha, '--expected-source-head '+'f'.repeat(40)),
  ].entries()) { assert.notEqual(changed, source, 'mutation must actually change workflow '+mutation); assert.throws(() => sourceRouteContract(changed), undefined, 'policy mutation ' + mutation); }
});

test('current-epoch tests and fixture-only changes retain mandatory source and native comparison gates', () => {
  const source = readWorkflow('inkwave-projectile-visuals.yml');
  for (const p of ['scripts/lib/inkwave-source-admission-cli.mjs', 'scripts/lib/inkwave-declared-paint-source-pair.mjs',
    'scripts/tests/inkwave-ci-source-admission.test.mjs', 'scripts/tests/inkwave-main9fe-paint-admission.test.mjs', 'scripts/tests/inkwave-maine1f-paint-admission.test.mjs',
    'scripts/tests/fixtures/inkwave-paint-source-epochs.mjs', 'scripts/fixtures/inkwave-paint-catalogue-epochs.json.gz',
    'scripts/tests/fixtures/inkwave-paint-e1f-sources.mjs', 'scripts/fixtures/inkwave-paint-e1f-catalogue.json.gz'])
    assert.ok(source.split('  workflow_dispatch:')[0].includes(`      - '${p}'\n`), p + ': PR trigger');
  const native = step(source, 'Native visual, source-value and gameplay regressions');
  assert.match(native, /matrix\.side == 'after'/); assert.doesNotMatch(native, /continue-on-error/);
  assert.match(native, /node --test scripts\/tests\/inkwave-main9fe-paint-admission\.test\.mjs scripts\/tests\/inkwave-maine1f-paint-admission\.test\.mjs scripts\/tests\/inkwave-ci-source-admission\.test\.mjs/);
  for (const name of ['ci-quality-gate.yml', 'validate-inkwave-update.yml'])
    assert.match(readWorkflow(name), /run: node --test[^\n]*scripts\/tests\/inkwave-ci-source-admission\.test\.mjs scripts\/tests\/inkwave-main9fe-paint-admission\.test\.mjs scripts\/tests\/inkwave-maine1f-paint-admission\.test\.mjs/);
  const general = readWorkflow('validate-inkwave-update.yml');
  for (const p of ['scripts/tests/fixtures/inkwave-paint-source-epochs.mjs', 'scripts/fixtures/inkwave-paint-catalogue-epochs.json.gz',
    'scripts/tests/fixtures/inkwave-paint-e1f-sources.mjs', 'scripts/fixtures/inkwave-paint-e1f-catalogue.json.gz'])
    assert.equal(general.split(`      - "${p}"\n`).length - 1, 2, 'both PR and push fixture-only triggers');
  for (const required of ['prepare-inkwave-character-pose-baseline.mjs', 'verify-inkwave-projectile-pr-diff-baseline.mjs',
    'Build selected reference with explicit alignment provenance', 'Build complete candidate production composition',
    'Capture native reference, not necessarily untouched public main', 'Capture candidate native game including desktop and mobile workloads',
    'Exercise camera, RNG, contact, retirement and paint comparison gates', 'Preserve independent capture and original image evidence']) assert.ok(source.includes(required));
  assert.match(source, /compare-inkwave-projectile-captures\.py[^\n]*--require-complete/);
  const combined = readWorkflow('inkwave-combined-qa.yml');
  assert.ok(!combined.includes(epoch.mode)); assert.ok(!combined.includes(runtimeBranch));
});

test('manual projectile dispatch is immutable and rejects omitted explicit epoch without rebaselining', () => {
  const source = readWorkflow('inkwave-projectile-visuals.yml');
  assert.doesNotMatch(source.split('permissions:')[0], /^  push:/m, 'this workflow has no main-push trigger');
  assert.match(source, /^  workflow_dispatch:/m);
  assert.ok(source.includes('github.event.pull_request.base.sha || inputs.base_sha'), 'manual baseline is explicitly declared');
  assert.ok(!source.includes("github.event.pull_request.base.sha || 'main'"), 'moving main cannot return');
  const sources = new Map(MAIN_INK_BASELINE_PATHS.map(p => [p, e1fPaintEpochSource(p)]));
  sources.set('patches/splatoon3/profile.json', fs.readFileSync(path.join(root, 'patches/splatoon3/profile.json'), 'utf8'));
  const baseline = createRepository('manual-current-baseline', sources), candidate = createRepository('manual-current-candidate', sources);
  const c = context('', '', {event: 'workflow_dispatch', baseRef: ''});
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c',
    'node() { command "$NODE_BINARY" "$SCRIPT_ROOT/$1" "${@:2}"; }\n' + shell(step(source, prepareName))],
    {cwd: candidate.cwd, encoding: 'utf8', env: {...policyEnv(c), INKWAVE_REFERENCE_ROOT: baseline.cwd, NODE_BINARY: process.execPath, SCRIPT_ROOT: root, DECLARED_BASE_SHA:baseline.sha, DECLARED_HEAD_SHA:candidate.sha, DISPATCH_MODE:''}});
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /complete --expected-mode/);
  assert.equal(fs.existsSync(path.join(candidate.cwd, '.ci-scratch')), false, 'rejected manual route creates no receipt');
  for (const repository of [baseline, candidate]) for (const [p, bytes] of sources)
    assert.equal(fs.readFileSync(path.join(repository.cwd, p), 'utf8'), bytes);
});

test('declared source verification binds all existing admitted leaves to real Git HEAD and rejects drift', () => {
  const sources = new Map(MAIN_INK_BASELINE_PATHS.map(relative => [relative, paintEpochSource('pr1746', relative)]));
  const baseline = createRepository('baseline', sources), candidate = createRepository('candidate', sources);
  assert.notEqual(baseline.sha, candidate.sha);
  const options = {baseline: new Map(sources), candidate: new Map(sources), baseGitRoot: baseline.cwd, candidateGitRoot: candidate.cwd, baseSha: baseline.sha, candidateSha: candidate.sha};
  const verified = verifyDeclaredPaintSources(options);
  assert.equal(verified.evidence.paths.length, 13);
  assert.equal(verified.evidence.declaredBaseCommit, baseline.sha);
  assert.equal(verified.evidence.declaredCandidateCommit, candidate.sha);
  const admitted = planMainInkBaseline(verified.baseline, verified.candidate);
  assert.equal(admitted.evidence.mode, 'pr1746-byte-identical-current-paint');
  assert.deepEqual(admitted.changes, []);
  for (const key of ['baseSha', 'candidateSha']) for (const value of [undefined, 'main', 'f'.repeat(40)])
    assert.throws(() => verifyDeclaredPaintSources({...options, [key]: value}));
  for (const side of ['baseline', 'candidate']) for (const relative of MAIN_INK_BASELINE_PATHS) {
    const changed = new Map(sources);
    changed.set(relative, changed.get(relative) + '\n// unreviewed drift\n');
    assert.throws(() => verifyDeclaredPaintSources({...options, [side]: changed}), /working source differs/);
  }
  assert.deepEqual([...verified.baseline], [...sources]);
  assert.deepEqual([...verified.candidate], [...sources]);
});

test('source contracts supplement A+ and the General source gate, without expanding the combined QA branch', () => {
  for (const name of ['ci-quality-gate.yml', 'validate-inkwave-update.yml'])
    assert.match(readWorkflow(name), /run: node --test[^\n]*scripts\/tests\/inkwave-ci-source-admission\.test\.mjs/);
  const combined = readWorkflow('inkwave-combined-qa.yml');
  assert.match(combined, /    if: github\.head_ref == 'test\/inkwave-combined-qa-20261021'\n/);
  assert.ok(!combined.includes(runtimeBranch));
});
