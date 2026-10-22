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

test('dedicated runtime branch invokes both full declared-pair validators with explicit SHA arguments', () => {
  const source = readWorkflow('inkwave-projectile-visuals.yml');
  const admission = source.split('      - name: Bind reviewed source controls to declared immutable Git source leaves\n')[1]?.split('      - name: ')[0];
  assert.ok(admission);
  assert.ok(admission.includes(`github.head_ref == '${runtimeBranch}'`));
  assert.ok(admission.includes('matrix.side == \'before\''));
  assert.match(admission, /DECLARED_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(admission, /DECLARED_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(admission, /node scripts\/check-inkwave-current-pair-controls\.mjs .*--base-sha "\$DECLARED_BASE_SHA" --candidate-sha "\$DECLARED_HEAD_SHA"/);
  const replay = source.split('      - name: Replay reviewed Roller births, pool reset and pinned paint in the main reference\n')[1]?.split('      - name: ')[0];
  assert.ok(replay);
  const run = replay.split('        run: |\n')[1].split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n');
  // Log argv in place of node, executing the actual branch selector. No
  // validator is replaced in production, and no source admission is inferred.
  const probe = 'node() { printf "%s\\n" "$*"; }\n' + run;
  for (const [branch, number, declared] of [[runtimeBranch, '1770', true], ['test/inkwave-combined-qa-20261021', '0', true], ['other', '1758', true], [runtimeBranch + '-unreviewed', '0', false], ['other', '0', false]]) {
    const result = spawnSync('bash', ['-e', '-c', probe], {encoding: 'utf8', env: {...process.env, PAIR_HEAD_REF: branch, PAIR_PR_NUMBER: number, INKWAVE_REFERENCE_ROOT: '.ci-baseline', DECLARED_BASE_SHA: '1'.repeat(40), DECLARED_HEAD_SHA: '2'.repeat(40)}});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('--base-sha ' + '1'.repeat(40) + ' --candidate-sha ' + '2'.repeat(40)), declared);
    assert.match(result.stdout, /scripts\/prepare-inkwave-projectile-baseline\.mjs/);
  }
  assert.match(source, /node scripts\/prepare-inkwave-character-pose-baseline\.mjs/);
  assert.match(source, /compare-inkwave-projectile-captures\.py[^\n]*--require-complete/);
});

test('declared source verification binds all existing admitted leaves to real Git HEAD and rejects drift', () => {
  const sources = new Map(MAIN_INK_BASELINE_PATHS.map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]));
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
