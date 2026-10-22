import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MAIN9FE_PAINT_SOURCE_PAIR, MAIN_INK_BASELINE_PATHS, planMainInkBaseline, gitBlobSha1} from '../lib/inkwave-main-ink-baseline.mjs';
import {paintEpochSource} from './fixtures/inkwave-paint-source-epochs.mjs';
const pair = MAIN9FE_PAINT_SOURCE_PAIR;
const catalogue = 'patches/splatoon3/runtime/main-weapon-catalog.mjs';
const current = new Map(MAIN_INK_BASELINE_PATHS.map(p => [p, paintEpochSource('main9fe', p)]));
const previous = new Map(MAIN_INK_BASELINE_PATHS.map(p => [p, paintEpochSource('pr1746', p)]));
const fixtureBefore = [[...current], [...previous]];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-main9fe-paint-'));
after(() => { assert.deepEqual([[...current], [...previous]], fixtureBefore); fs.rmSync(scratch, {recursive: true, force: true}); });
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const profilePath = 'patches/splatoon3/profile.json';
const profile = fs.readFileSync(new URL('../../' + profilePath, import.meta.url), 'utf8');
function write(root, sources) {
  for (const [rel, source] of [...sources, [profilePath, profile]]) {
    const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, source);
  }
}
function repository(name, sources) {
  const root = path.join(scratch, name); fs.mkdirSync(root); write(root, sources);
  git(root, 'init', '--quiet'); git(root, 'add', '.');
  git(root, '-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', name);
  return {root, sha: git(root, 'rev-parse', 'HEAD')};
}
const base = repository('current-baseline', current), candidate = repository('current-candidate', current), old = repository('historical-baseline', previous);
assert.notEqual(base.sha, candidate.sha);
// Real source bytes and real Git repositories. Synthetic commit identities are
// deliberately recorded as such: these tests do not impersonate official HEAD.
const expectedArgs = ['--expected-mode', pair.mode, '--expected-source-base', pair.sourceBase, '--expected-source-head', pair.sourceHead];
const receipt = path.join(scratch, 'receipt.json');
const preserve = root => Object.fromEntries([...MAIN_INK_BASELINE_PATHS, profilePath].map(p => [p, fs.readFileSync(path.join(root, p), 'utf8')]));
const inputsBefore = [base, candidate, old].map(({root}) => preserve(root));
const sentinel = 'prior immutable receipt must survive';
function run(script = 'prepare-inkwave-projectile-baseline.mjs', {left = base, right = candidate, args = expectedArgs, declared = true} = {}) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../' + script, import.meta.url)), '--baseline', left.root, '--candidate', right.root, '--receipt', receipt,
    ...(declared ? ['--base-sha', left.sha, '--candidate-sha', right.sha] : []), ...args], {encoding: 'utf8', timeout: 60000});
}
function rejected(options, pattern, script) {
  fs.writeFileSync(receipt, sentinel);
  const result = run(script, options);
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, pattern); assert.equal(fs.readFileSync(receipt, 'utf8'), sentinel);
}

test('complete thirteen-leaf 9fe epoch is distinct, opt-in and source-only', () => {
  assert.deepEqual(MAIN_INK_BASELINE_PATHS.filter(p => current.get(p) !== previous.get(p)), [catalogue]);
  assert.equal(gitBlobSha1(current.get(catalogue)), '0c91c526896da0f2f8cb53f10eda0918d568949c');
  assert.equal(gitBlobSha1(previous.get(catalogue)), 'b63b0bc1ebf9380967c11e77cc934319057ec410');
  const result = planMainInkBaseline(current, new Map(current), pair);
  assert.deepEqual(result.changes, []); assert.deepEqual([...result.sources], [...current]);
  assert.equal(result.evidence.mode, pair.mode); assert.equal(result.evidence.paths.length, 13);
  assert.match(result.evidence.validationLimit, /physical-state, RNG and image comparisons remain mandatory/);
  for (const row of result.evidence.paths) {
    assert.equal(row.mode, 'main9fe-exact-paint-source'); assert.deepEqual(row.replayed, []);
    assert.equal(row.originalGitBlob, row.referenceGitBlob); assert.equal(row.originalGitBlob, row.candidateGitBlob);
  }
  assert.throws(() => planMainInkBaseline(current, current), /explicitly requested comparison epoch/);
  assert.equal(planMainInkBaseline(previous, previous).evidence.mode, 'pr1746-byte-identical-current-paint');
});

test('every missing or changed leaf rejects, including identical both-side drift and last-leaf drift', () => {
  let rejected = 0;
  for (const p of MAIN_INK_BASELINE_PATHS) for (const sides of [[0], [1], [0, 1]]) for (const missing of [false, true]) {
    const inputs = [new Map(current), new Map(current)];
    for (const side of sides) if (missing) inputs[side].delete(p); else inputs[side].set(p, inputs[side].get(p) + '\n// unknown drift');
    const before = inputs.map(m => [...m]);
    assert.throws(() => planMainInkBaseline(...inputs, pair), /differs from declared main9fe source epoch/);
    assert.deepEqual(inputs.map(m => [...m]), before); rejected++;
  }
  assert.equal(rejected, 78);
});

test('cross-epoch physics, wrong explicit epoch and whole-epoch substitution never become unchanged', () => {
  for (const [b, c] of [[previous, current], [current, previous], [previous, previous]])
    assert.throws(() => planMainInkBaseline(b, c, pair), /differs from declared main9fe source epoch/);
  for (const [b, c] of [[previous, current], [current, previous]])
    assert.throws(() => planMainInkBaseline(b, c), /old\/new physics/);
  for (const invalid of [{...pair, sourceBase: 'unknown'}, {...pair, sourceHead: 'unknown'}, {...pair, mode: 'pr1746-byte-identical-current-paint'}])
    assert.throws(() => planMainInkBaseline(current, current, invalid), /explicitly requested comparison/);
  for (const invalid of [{}, {...pair, extra: true}, {mode: pair.mode}])
    assert.throws(() => planMainInkBaseline(current, current, invalid), /complete expected source-pair contract/);
});

test('actual prepare CLI verifies genuine epoch bytes against real immutable Git and records zero replay', () => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(evidence.mode, pair.mode); assert.equal(evidence.paint.mode, pair.mode);
  assert.equal(evidence.declaredSources.declaredBaseCommit, base.sha);
  assert.equal(evidence.declaredSources.declaredCandidateCommit, candidate.sha);
  assert.equal(evidence.paint.sourceBase, pair.sourceBase);
  assert.deepEqual(evidence.writtenPaths, []); assert.deepEqual(evidence.changes, []);
  assert.match(evidence.scope, /changed Bloblobber floor-contact physics relative to PR1746/);
  assert.match(evidence.scope, /not evidence of an improvement/);
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('CLI rejects absent, partial or conflicting explicit declarations before touching receipt or sources', () => {
  rejected({declared: false}, /requires declared immutable Git source commits/);
  rejected({args: []}, /explicitly requested comparison epoch/);
  rejected({args: ['--expected-mode', pair.mode]}, /complete --expected-source-base/);
  rejected({args: [...expectedArgs, '--expected-mode', pair.mode]}, /duplicate --expected-mode/);
  rejected({args: ['--expected-mode', pair.mode, '--expected-source-base', 'f'.repeat(40), '--expected-source-head', pair.sourceHead]}, /explicitly requested comparison/);
  rejected({left: old}, /differs from declared main9fe source epoch/);
  rejected({right: old}, /differs from declared main9fe source epoch/);
  rejected({left: old, right: old}, /differs from declared main9fe source epoch|separate checkout/);
  const wrong = {...base, sha: candidate.sha};
  rejected({left: wrong}, /declared commit must match Git HEAD/);
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('dirty same-HEAD replacement and both-side identical drift cannot pass immutable verification', () => {
  const file = path.join(base.root, catalogue);
  fs.writeFileSync(file, previous.get(catalogue));
  try { rejected({}, /working source differs from declared immutable Git blob/); assert.equal(git(base.root, 'rev-parse', 'HEAD'), base.sha); }
  finally { fs.writeFileSync(file, current.get(catalogue)); }
  const last = MAIN_INK_BASELINE_PATHS.at(-1);
  for (const side of [base, candidate]) fs.appendFileSync(path.join(side.root, last), '\n// identical unauthorized change');
  try { rejected({}, /working source differs from declared immutable Git blob/); }
  finally { for (const side of [base, candidate]) fs.writeFileSync(path.join(side.root, last), current.get(last)); }
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('actual current-pair-controls consumer executes positive CLI and all 79 rejection controls', () => {
  const result = run('check-inkwave-current-pair-controls.mjs'); assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(evidence.mode, pair.mode);
  assert.deepEqual(evidence.counts, {positiveCli: 2, cliRejected: 53, helperRejected: 26});
  assert.equal(evidence.originalInputsUnchanged, true); assert.equal(evidence.scratchRemoved, true);
  assert.equal(evidence.declaredSources.declaredBaseCommit, base.sha);
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('current-pair-controls requires explicit immutable declaration and rejects cross-epoch physics', () => {
  for (const [options, pattern] of [[{declared: false}, /requires declared immutable Git source commits/], [{args: []}, /explicitly requested comparison epoch/], [{left: old}, /differs from declared main9fe source epoch/]])
    rejected(options, pattern, 'check-inkwave-current-pair-controls.mjs');
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

const scripts = ['prepare-inkwave-projectile-baseline.mjs', 'check-inkwave-current-pair-controls.mjs'];
function rawRun(script, argv) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../' + script, import.meta.url)), ...argv], {encoding: 'utf8', timeout: 60000});
}
function completeArgs(output = receipt, left = base, right = candidate) {
  return ['--baseline', left.root, '--candidate', right.root, '--receipt', output,
    '--base-sha', left.sha, '--candidate-sha', right.sha, ...expectedArgs];
}
function rejectOutput(script, output, pattern = /receipt must not/) {
  const result = rawRun(script, completeArgs(output));
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, pattern);
}

test('both CLIs reject direct and hardlinked receipts for every leaf and profile on either side before mutation', () => {
  let rejected = 0;
  for (const script of scripts) for (const side of [base, candidate]) for (const relative of [...MAIN_INK_BASELINE_PATHS, profilePath]) {
    const input = path.join(side.root, relative), original = fs.readFileSync(input), linked = path.join(scratch, 'hardlink-receipt');
    rejectOutput(script, input); assert.deepEqual(fs.readFileSync(input), original); rejected++;
    fs.linkSync(input, linked);
    try {
      rejectOutput(script, linked, /receipt must not alias an input inode/);
      assert.deepEqual(fs.readFileSync(input), original); assert.deepEqual(fs.readFileSync(linked), original); rejected++;
    } finally { fs.unlinkSync(linked); }
  }
  assert.equal(rejected, 112);
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('both CLIs reject symlink, symlink-ancestor and directory receipts without altering sources', () => {
  for (const script of scripts) for (const side of [base, candidate]) {
    const input = path.join(side.root, MAIN_INK_BASELINE_PATHS.at(-1));
    const alias = path.join(scratch, 'receipt-symlink'), ancestor = path.join(scratch, 'receipt-parent');
    fs.symlinkSync(input, alias); fs.symlinkSync(path.dirname(input), ancestor, 'dir');
    try {
      rejectOutput(script, alias); rejectOutput(script, path.join(ancestor, path.basename(input)));
      rejectOutput(script, path.dirname(input), /receipt must be a regular file/);
      assert.equal(fs.readlinkSync(alias), input); assert.equal(fs.readlinkSync(ancestor), path.dirname(input));
    } finally { fs.unlinkSync(alias); fs.unlinkSync(ancestor); }
  }
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('both CLIs reject projected aliases to missing inputs through existing symlink ancestors', () => {
  const relative = MAIN_INK_BASELINE_PATHS.at(-1);
  for (const script of scripts) for (const side of [base, candidate]) {
    const input = path.join(side.root, relative), bytes = fs.readFileSync(input), parent = path.join(scratch, 'absent-parent');
    fs.unlinkSync(input); fs.symlinkSync(path.dirname(input), parent, 'dir');
    try {
      rejectOutput(script, path.join(parent, path.basename(input)), /receipt must not replace or overlap an input/);
      assert.equal(fs.existsSync(input), false);
    } finally { fs.unlinkSync(parent); fs.writeFileSync(input, bytes); }
  }
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('both CLIs reject every duplicate singleton flag and missing-value form before touching inputs or receipt', () => {
  let duplicates = 0, missing = 0;
  for (const script of scripts) {
    const argv = completeArgs();
    if (script.startsWith('prepare')) argv.push('--base-git-root', base.root, '--candidate-git-root', candidate.root);
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index], value = argv[index + 1];
      for (const extra of [value, 'deliberately-conflicting-value']) {
        fs.writeFileSync(receipt, sentinel);
        const result = rawRun(script, [...argv, flag, extra]);
        assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
        assert.ok(result.stderr.includes('duplicate ' + flag), result.stderr); assert.equal(fs.readFileSync(receipt, 'utf8'), sentinel); duplicates++;
      }
      const without = argv.filter((_, i) => i !== index && i !== index + 1);
      for (const tail of [[flag], [flag, ''], [flag, '--not-a-value']]) {
        fs.writeFileSync(receipt, sentinel);
        const result = rawRun(script, [...without, ...tail]);
        assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
        assert.ok(result.stderr.includes('complete ' + flag), result.stderr); assert.equal(fs.readFileSync(receipt, 'utf8'), sentinel); missing++;
      }
    }
  }
  for (const script of scripts) {
    fs.writeFileSync(receipt, sentinel);
    const result = rawRun(script, [...completeArgs(), '--unknown-admission-flag', 'unrecognized']);
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.match(result.stderr, /unknown argument/);
    assert.equal(fs.readFileSync(receipt, 'utf8'), sentinel);
  }
  assert.equal(duplicates, 36); assert.equal(missing, 54);
  assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
});

test('both CLIs protect immutable Git metadata and hardlinked metadata receipts', () => {
  for (const script of scripts) for (const side of [base, candidate]) {
    const head = path.join(side.root, '.git', 'HEAD'), bytes = fs.readFileSync(head), alias = path.join(scratch, 'git-head-hardlink');
    rejectOutput(script, head, /receipt must not overwrite Git metadata/);
    rejectOutput(script, path.join(side.root, '.git', 'new-receipt'), /receipt must not overwrite Git metadata/);
    fs.linkSync(head, alias);
    try { rejectOutput(script, alias, /receipt must not overwrite a multiply-linked file/); assert.deepEqual(fs.readFileSync(alias), bytes); }
    finally { fs.unlinkSync(alias); }
    assert.deepEqual(fs.readFileSync(head), bytes); assert.equal(git(side.root, 'rev-parse', 'HEAD'), side.sha);
  }
});

test('both CLIs still accept nested in-checkout .ci-scratch receipts and preserve all source inputs', () => {
  for (const script of scripts) {
    const output = path.join(candidate.root, '.ci-scratch', 'paint-admission', script + '.json');
    for (const exists of [false, true]) {
      if (exists) fs.writeFileSync(output, sentinel);
      const result = rawRun(script, completeArgs(output));
      assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
      const evidence = JSON.parse(fs.readFileSync(output, 'utf8')); assert.equal(evidence.mode, pair.mode);
      if (script.startsWith('prepare')) assert.deepEqual(evidence.writtenPaths, []);
      else assert.equal(evidence.originalInputsUnchanged, true);
      assert.deepEqual([base, candidate, old].map(({root}) => preserve(root)), inputsBefore);
    }
  }
});


test('prepare protects external immutable Git roots supplied for scratch-source comparison', () => {
  const target = path.join(old.root, '.git', 'HEAD'), before = fs.readFileSync(target);
  const result = rawRun(scripts[0], [...completeArgs(target), '--base-git-root', old.root]);
  assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.match(result.stderr, /receipt must not overwrite Git metadata/);
  assert.deepEqual(fs.readFileSync(target), before);
});
