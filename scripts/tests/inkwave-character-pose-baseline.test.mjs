import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CHARACTER_POSE_PATHS, CHARACTER_POSE_MANIFEST as manifest, parseCharacterPoseManifest, planCharacterPoseBaseline, poseSourceSha256 as hash } from '../lib/inkwave-character-pose-baseline.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const candidate = () => new Map(CHARACTER_POSE_PATHS.map(rel => [rel, fs.readFileSync(path.join(root, rel), 'utf8')]));
test('only the reviewed eight character paths and exact final source blobs are accepted', () => {
  const files = candidate(), snapshot = [...files];
  assert.equal(CHARACTER_POSE_PATHS.length, 8);
  assert.equal(planCharacterPoseBaseline(files, files).changes.length, 0);
  assert.deepEqual([...files], snapshot);
  assert.ok(CHARACTER_POSE_PATHS.every(rel => !/weapons-fidelity|all-specials|paint|collision|movement/.test(rel)));
  const raw = fs.readFileSync(new URL('../fixtures/inkwave-character-pose-baseline.json', import.meta.url), 'utf8');
  assert.throws(() => parseCharacterPoseManifest(raw + ' '), /reviewed blob/);
});
test('reference planning preserves unrelated physical code and supports only reviewed before/after states', () => {
  const rows = [{ path: 'pose', beforeSha256: hash('old pose'), afterSha256: hash('reviewed pose') },
    { path: 'new-pose', beforeSha256: null, afterSha256: hash('new module') }];
  const before = new Map([['pose', 'old pose'], ['physics', 'baseline damage/RNG']]);
  const after = new Map([['pose', 'reviewed pose'], ['new-pose', 'new module'], ['physics', 'candidate changed damage/RNG']]);
  const snapshot = [...before], plan = planCharacterPoseBaseline(before, after, rows);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.sources.get('physics'), 'baseline damage/RNG');
  assert.deepEqual([...before], snapshot);
  assert.equal(planCharacterPoseBaseline(plan.sources, after, rows).changes.length, 0);
});
for (const side of ['candidate', 'baseline']) test('rejects unknown ' + side + ' edits instead of resetting them', () => {
  const before = candidate(), after = candidate(), target = side === 'candidate' ? after : before;
  const rel = CHARACTER_POSE_PATHS[4]; target.set(rel, target.get(rel) + '\n// unrelated change');
  assert.throws(() => planCharacterPoseBaseline(before, after), new RegExp('unreviewed ' + side));
});
test('late candidate rejection leaves planned new modules and previous receipt untouched', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-pose-baseline-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const before = path.join(temp, 'before'), after = path.join(temp, 'after'), receipt = path.join(temp, 'receipt.json');
  fs.mkdirSync(before); fs.mkdirSync(after);
  const originals = new Map();
  for (const row of manifest.files) {
    const source = fs.readFileSync(path.join(root, row.path), 'utf8');
    const target = path.join(after, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
    if (row.beforeSha256 === null) continue;
    const baseline = path.join(before, row.path); fs.mkdirSync(path.dirname(baseline), { recursive: true }); fs.writeFileSync(baseline, source); originals.set(row.path, source);
  }
  fs.appendFileSync(path.join(after, CHARACTER_POSE_PATHS.at(-1)), '\nunknown last input'); fs.writeFileSync(receipt, 'previous receipt');
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/prepare-inkwave-character-pose-baseline.mjs'), '--baseline', before, '--candidate', after, '--receipt', receipt], { encoding: 'utf8' });
  assert.notEqual(run.status, 0); assert.match(run.stderr, /unreviewed candidate/);
  for (const row of manifest.files) { const file = path.join(before, row.path); if (!originals.has(row.path)) assert.equal(fs.existsSync(file), false); else assert.equal(fs.readFileSync(file, 'utf8'), originals.get(row.path)); }
  assert.equal(fs.readFileSync(receipt, 'utf8'), 'previous receipt');
});
