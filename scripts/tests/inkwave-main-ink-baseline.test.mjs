import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  MAIN_INK_BASELINE_PATHS, MAIN_INK_BASELINE_MANIFEST as manifest,
  MAIN_INK_BASELINE_MANIFEST_BLOB, gitBlobSha1, parseMainInkBaselineManifest,
  planMainInkBaseline,
} from '../lib/inkwave-main-ink-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const weaponPath = 'patches/splatoon3/runtime/weapons-fidelity.mjs';
const markerBefore = 'const physicalBirth=11, physicalSpeed=71; const randomDraw=Math.random(); // BASELINE_ONLY';
const markerAfter = 'const physicalBirth=99, physicalSpeed=999; const randomDraw=Math.random()+Math.random(); // CANDIDATE_ONLY';
const oldBirth = 'const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;\np.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);';
const newBirth = 'const side=fan*(unit.SpawnPositionWidth||0)*0.5,j=unit.SpawnPositionRandomCube||0;\nconst baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;';
const oldPool = 'p.fidelitySloshUnit=null;p.fidelitySloshDownward=null;';
const newPool = 'p.fidelitySloshUnit=null;p.fidelitySloshIndex=null;p.fidelitySloshDownward=null;';
function maps() {
  const baseline = new Map(), candidate = new Map();
  for (const row of manifest.files) {
    baseline.set(row.path, row.mode === 'file' ? null : markerBefore + '\n' + row.hunks.map(h => h.before).join('\n// preserve intervening baseline code\n'));
    candidate.set(row.path, row.mode === 'file' ? row.content : markerAfter + '\n' + row.hunks.map(h => h.after).join('\n// independently changed candidate code\n'));
  }
  baseline.set(weaponPath, baseline.get(weaponPath) + '\n' + oldBirth + '\n' + oldPool);
  candidate.set(weaponPath, candidate.get(weaponPath) + '\n' + newBirth + '\n' + newPool);
  return { baseline, candidate };
}
function writeMap(root, sources) {
  for (const [rel, source] of sources) if (source !== null) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
}
function sandbox(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-paint-baseline-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const baselineRoot = path.join(temp, 'baseline'), candidateRoot = path.join(temp, 'candidate');
  const fixture = maps();
  writeMap(baselineRoot, fixture.baseline); writeMap(candidateRoot, fixture.candidate);
  const profile = JSON.stringify({ weaponsFidelityCompletion: { weapons: { roller: {
    WideSwingUnitGroupParam: [{ SpawnPositionWidth: 16 }], VerticalSwingUnitGroupParam: [{ SpawnPositionHeight: 2 }],
  } } } });
  for (const dir of [baselineRoot, candidateRoot]) fs.writeFileSync(path.join(dir, 'patches/splatoon3/profile.json'), profile);
  const receipt = path.join(temp, 'receipt.json');
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/prepare-inkwave-projectile-baseline.mjs'),
    '--baseline', baselineRoot, '--candidate', candidateRoot, '--receipt', receipt], { encoding: 'utf8' });
  return { ...fixture, baselineRoot, candidateRoot, receipt, run };
}

test('immutable original source, path allowlist and module pins are complete', () => {
  const raw = fs.readFileSync(new URL('../fixtures/inkwave-main-ink-pr1525-baseline.json', import.meta.url), 'utf8');
  assert.equal(gitBlobSha1(raw), MAIN_INK_BASELINE_MANIFEST_BLOB);
  assert.equal(manifest.sourceBase, '378dcf78d09714cb3f89c39a46e36a52ad997869');
  assert.equal(manifest.sourceHead, '8c8c26d4486ddc95c03fcd5e0201c6c1c95c6654');
  assert.deepEqual(manifest.files.map(row => row.path), MAIN_INK_BASELINE_PATHS);
  assert.equal(MAIN_INK_BASELINE_PATHS.length, 13);
  assert.equal(manifest.files.flatMap(row => row.hunks || []).length, 32);
  for (const row of manifest.files.filter(row => row.mode === 'file')) {
    assert.equal(gitBlobSha1(row.originalContent), row.originalBlob);
    assert.equal(gitBlobSha1(row.content), row.afterBlob);
  }
  assert.throws(() => parseMainInkBaselineManifest(raw.replace('378dcf78', '478dcf78')), /manifest differs/);
});

test('all 32 hunks align without changing input maps or baseline physics/RNG code', () => {
  const { baseline, candidate } = maps(), snapshot = [...baseline];
  const plan = planMainInkBaseline(baseline, candidate);
  assert.deepEqual([...baseline], snapshot);
  assert.equal(plan.changes.length, 13);
  assert.equal(plan.evidence.paths.length, 13);
  for (const row of manifest.files) {
    const source = plan.sources.get(row.path);
    if (row.mode === 'hunks') {
      assert.ok(source.includes(markerBefore), row.path + ' retains baseline birth/speed/RNG');
      assert.ok(!source.includes('CANDIDATE_ONLY'), row.path + ' excludes unrelated candidate changes');
      for (const hunk of row.hunks) assert.ok(source.includes(hunk.after));
      assert.match(plan.evidence.paths.find(entry => entry.path === row.path).nonPaintSha256, /^[a-f0-9]{64}$/);
    } else assert.equal(source, row.content);
  }
  // Paint alignment itself does not replay the separately reviewed birth/pool.
  assert.ok(plan.sources.get(weaponPath).includes(oldBirth));
  assert.ok(plan.sources.get(weaponPath).includes(oldPool));
});

test('already aligned files are a no-op; original new modules upgrade only by pinned blob', () => {
  const { baseline, candidate } = maps();
  for (const row of manifest.files.filter(row => row.mode === 'file')) baseline.set(row.path, row.originalContent);
  const first = planMainInkBaseline(baseline, candidate);
  const second = planMainInkBaseline(first.sources, candidate);
  assert.equal(second.changes.length, 0);
  assert.deepEqual(second.sources, first.sources);
});

test('every shared hunk rejects unknown and duplicate code on either side', () => {
  for (const row of manifest.files.filter(row => row.mode === 'hunks')) for (const hunk of row.hunks) {
    for (const side of ['baseline', 'candidate']) for (const mode of ['unknown', 'duplicate']) {
      const fixture = maps(), source = fixture[side].get(row.path), block = side === 'baseline' ? hunk.before : hunk.after;
      fixture[side].set(row.path, mode === 'unknown' ? source.replace(block, 'UNKNOWN_REVIEWED_HUNK\n') : source + '\n' + block);
      const snapshot = [...fixture.baseline];
      assert.throws(() => planMainInkBaseline(fixture.baseline, fixture.candidate), /unknown, duplicate or incomplete/, row.path + '/' + hunk.id + '/' + side + '/' + mode);
      assert.deepEqual([...fixture.baseline], snapshot, 'failed planning has no side effects');
    }
  }
});

test('candidate legacy/partial paint and unreviewed module revisions are rejected', () => {
  for (const row of manifest.files) {
    const fixture = maps();
    if (row.mode === 'hunks') {
      const hunk = row.hunks[0];
      fixture.candidate.set(row.path, fixture.candidate.get(row.path).replace(hunk.after, hunk.before));
      assert.throws(() => planMainInkBaseline(fixture.baseline, fixture.candidate), /candidate.*hunk/);
    } else {
      fixture.candidate.set(row.path, row.content + '\n// unknown candidate module\n');
      assert.throws(() => planMainInkBaseline(fixture.baseline, fixture.candidate), /not the pinned final blob/);
      fixture.candidate.set(row.path, row.content);
      fixture.baseline.set(row.path, row.originalContent + '\n// unknown baseline module\n');
      assert.throws(() => planMainInkBaseline(fixture.baseline, fixture.candidate), /neither absent nor a reviewed full blob/);
    }
  }
});

test('actual current owner source requires identical current baseline; legacy/current mixing is rejected', () => {
  const { baseline } = maps();
  const candidate = new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, fs.readFileSync(path.join(root, rel), 'utf8')]));
  assert.throws(() => planMainInkBaseline(baseline, candidate), /mixed physics\/paint epochs/);
  const plan = planMainInkBaseline(new Map(candidate), candidate);
  assert.equal(plan.evidence.paths.length, 13);
  assert.equal(plan.changes.length, 0);
});

test('prepare rejects a last-path candidate drift before writing any source or receipt', t => {
  const fixture = sandbox(t);
  const rel = MAIN_INK_BASELINE_PATHS.at(-1), row = manifest.files.at(-1);
  fs.writeFileSync(path.join(fixture.candidateRoot, rel), fixture.candidate.get(rel).replace(row.hunks[0].after, 'UNKNOWN_LAST_PATH\n'));
  fs.writeFileSync(fixture.receipt, 'prior receipt must survive\n');
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /unknown, duplicate or incomplete candidate hunk/);
  for (const [pathName, source] of fixture.baseline) {
    const file = path.join(fixture.baselineRoot, pathName);
    if (source === null) assert.equal(fs.existsSync(file), false, 'new module was not created');
    else assert.equal(fs.readFileSync(file, 'utf8'), source, pathName);
  }
  assert.equal(fs.readFileSync(fixture.receipt, 'utf8'), 'prior receipt must survive\n');
});

test('prepare composes Roller 2, pool 1 and paint once, records hashes, and is repeatable', t => {
  const fixture = sandbox(t);
  const first = fixture.run();
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
  assert.deepEqual(receipt.changes.map(row => row.name), ['horizontal-total-width', 'vertical-indexed-height', 'native-pool-slosher-index-reset']);
  assert.equal(receipt.paint.paths.length, 13);
  assert.equal(receipt.paint.manifestGitBlob, MAIN_INK_BASELINE_MANIFEST_BLOB);
  assert.equal(receipt.writtenPaths.length, 13);
  const result = fs.readFileSync(path.join(fixture.baselineRoot, weaponPath), 'utf8');
  assert.ok(result.includes(markerBefore) && !result.includes('CANDIDATE_ONLY'));
  assert.ok(result.includes('const side=fan*(unit.SpawnPositionWidth||0)*0.5'));
  assert.ok(result.includes(newBirth));
  assert.ok(result.includes(newPool) && !result.includes(oldPool));
  const second = fixture.run();
  assert.equal(second.status, 0, second.stderr);
  const again = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
  assert.deepEqual(again.changes, []);
  assert.deepEqual(again.writtenPaths, []);
  assert.equal(fs.readFileSync(path.join(fixture.baselineRoot, weaponPath), 'utf8'), result);
});

test('prepare upgrades the known compact reference and leaves all paint files aligned', t => {
  const fixture = sandbox(t);
  assert.equal(fixture.run().status, 0);
  const file = path.join(fixture.baselineRoot, weaponPath);
  const corrected = fs.readFileSync(file, 'utf8');
  const reviewed = newBirth.slice(newBirth.indexOf('\n') + 1);
  const compact = 'p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(vertical?offset:1)*(unit.SpawnPositionHeight||0);';
  const legacy = corrected.replace(reviewed, compact);
  assert.notEqual(legacy, corrected);
  fs.writeFileSync(file, legacy);
  const otherFiles = new Map(MAIN_INK_BASELINE_PATHS.filter(rel => rel !== weaponPath)
    .map(rel => [rel, fs.readFileSync(path.join(fixture.baselineRoot, rel), 'utf8')]));
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
  assert.deepEqual(receipt.changes.map(row => row.name), ['vertical-indexed-height']);
  assert.deepEqual(receipt.writtenPaths, [weaponPath]);
  assert.ok(receipt.paint.paths.every(row => row.replayed.length === 0));
  assert.equal(fs.readFileSync(file, 'utf8'), corrected);
  for (const [rel, source] of otherFiles) assert.equal(fs.readFileSync(path.join(fixture.baselineRoot, rel), 'utf8'), source);
});
