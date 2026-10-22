// Historical 0dec529d source replay; latest PR sources use the separate reviewed-pair gate.
import {historicalSource} from '../lib/inkwave-historical-baseline-sources.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CHARACTER_POSE_PATHS, CHARACTER_POSE_MANIFEST as manifest, parseCharacterPoseManifest, planCharacterPoseBaseline, poseSourceSha256 as hash, OCT21_POSE_MAIN_BLOBS, OCT21_INTEGRATED_POSE_MAIN_BLOBS, OCT21_RESOLVED_POSE_MAIN_BLOBS, OCT21_PR1746_POSE_MAIN_BLOBS } from '../lib/inkwave-character-pose-baseline.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
// Current-owner unchanged-pose branch requires the same bytes on both sides.
const currentPosePaths = new Set(['roller.mjs', 'family-holds.mjs', 'kit.mjs', 'registry.mjs', 'stringers.mjs'].map(name => CHARACTER_POSE_PATHS.find(path => path.endsWith('/' + name))));
const candidate = () => new Map(CHARACTER_POSE_PATHS.map(rel => [rel, historicalSource('pose',rel)]));
test('only the reviewed sixteen character paths and exact final source blobs are accepted', () => {
  const files = candidate(), snapshot = [...files];
  assert.equal(CHARACTER_POSE_PATHS.length, 16);
  const reference = new Map(manifest.files.map(row => {
    let source = files.get(row.path);
    for (const edit of currentPosePaths.has(row.path) ? [] : row.candidateToReference ?? []) source = source.replace(edit.from, edit.to);
    return [row.path, source];
  }));
  assert.equal(planCharacterPoseBaseline(reference, files).changes.length, 0);
  assert.deepEqual([...files], snapshot);
  assert.ok(CHARACTER_POSE_PATHS.every(rel => !/weapons-fidelity|all-specials|paint|collision|movement/.test(rel)));
  const raw = fs.readFileSync(new URL('../fixtures/inkwave-character-pose-baseline.json', import.meta.url), 'utf8');
  assert.throws(() => parseCharacterPoseManifest(raw + ' '), /reviewed blob/);
});
test('shared-file alignment keeps independent variant additions out of the reference', () => {
  const before = new Map([['registry', 'old pose\nold variants']]);
  const after = new Map([['registry', 'new pose\nnew variants']]);
  const rows = [{ path: 'registry', beforeSha256: hash(before.get('registry')),
    candidateSha256: hash(after.get('registry')), afterSha256: hash('new pose\nold variants'),
    candidateToReference: [{ from: 'new variants', to: 'old variants' }] }];
  const reference = planCharacterPoseBaseline(before, after, rows);
  assert.equal(reference.sources.get('registry'), 'new pose\nold variants');
  assert.equal(after.get('registry'), 'new pose\nnew variants');
  assert.equal(planCharacterPoseBaseline(reference.sources, after, rows).changes.length, 0);
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
    const source = historicalSource('pose',row.path);
    const target = path.join(after, row.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
    if (row.beforeSha256 === null && !currentPosePaths.has(row.path)) continue;
    let reference = source;
    for (const edit of currentPosePaths.has(row.path) ? [] : row.candidateToReference ?? []) reference = reference.replace(edit.from, edit.to);
    const baseline = path.join(before, row.path); fs.mkdirSync(path.dirname(baseline), { recursive: true }); fs.writeFileSync(baseline, reference); originals.set(row.path, reference);
  }
  fs.appendFileSync(path.join(after, CHARACTER_POSE_PATHS.at(-1)), '\nunknown last input'); fs.writeFileSync(receipt, 'previous receipt');
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/prepare-inkwave-character-pose-baseline.mjs'), '--baseline', before, '--candidate', after, '--receipt', receipt], { encoding: 'utf8' });
  assert.notEqual(run.status, 0); assert.match(run.stderr, /unreviewed candidate/);
  for (const row of manifest.files) { const file = path.join(before, row.path); if (!originals.has(row.path)) assert.equal(fs.existsSync(file), false); else assert.equal(fs.readFileSync(file, 'utf8'), originals.get(row.path)); }
  assert.equal(fs.readFileSync(receipt, 'utf8'), 'previous receipt');
});

// #1165 changes only build-time Roller ink SDF, not a character pose. Its
// source-pair admission must recognize the exact, newer main pose epoch rather
// than replaying old sixteen-file rigs on top of it.
test('current main pose admission is exact, identity-preserving and rejects unknown edits', () => {
  const current = new Map(CHARACTER_POSE_PATHS.map(rel =>
    [rel, fs.readFileSync(path.join(root, rel), 'utf8')]));
  const sha = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
  for (const rel of CHARACTER_POSE_PATHS)
    assert.equal(sha(current.get(rel)), OCT21_PR1746_POSE_MAIN_BLOBS[rel], rel + ': reviewed main blob');
  const plan = planCharacterPoseBaseline(current, new Map(current));
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.pairEvidence.mode, 'oct21-byte-identical-current-pose');
  assert.deepEqual([...plan.sources], [...current]);
  assert.ok(plan.evidence.every(row => row.changed === false && row.mode === 'oct21-exact-current-pose'));
  for (const rel of [CHARACTER_POSE_PATHS[0], CHARACTER_POSE_PATHS[4], CHARACTER_POSE_PATHS[5]]) {
    const modified = new Map(current);
    modified.set(rel, modified.get(rel) + '\n// unauthorized character rewrite');
    assert.throws(() => planCharacterPoseBaseline(current, modified),
      /current source pair differs|unreviewed candidate|unreviewed .*pose|candidate blob/, rel);
  }
});

// Historical epochs come from fixed, hash-verified blobs, independently of
// live source changes. Mutations and mixed tuples must still reject.
function poseEpochFixtures() {
  const read=kind=>new Map(CHARACTER_POSE_PATHS.map(rel=>[rel,historicalSource(kind,rel)]));
  const old=read('oct21Pose'),current=read('oct21IntegratedPose');
  const sha=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
  for(const [map,pins]of [[old,OCT21_POSE_MAIN_BLOBS],[current,OCT21_INTEGRATED_POSE_MAIN_BLOBS]])
    for(const rel of CHARACTER_POSE_PATHS)assert.equal(sha(map.get(rel)),pins[rel],rel+': exact complete epoch');
  return {old,current};
}
const rejectPoseWithoutMutation = (before,after) => {
  const b=[...before],a=[...after];assert.throws(()=>planCharacterPoseBaseline(before,after));
  assert.deepEqual([...before],b);assert.deepEqual([...after],a);
};
test('old and integrated complete pose epochs remain independently identity-preserving',()=>{
  const {old,current}=poseEpochFixtures();
  for(const [map,epoch] of [[old,'ad4cc54cf5fbba65635ec0929a1da901c8c619db'],[current,'785faf01055a361bebc69a8c32ccac18a609c24a']]) {
    const other=new Map(map),before=[...map],after=[...other],plan=planCharacterPoseBaseline(map,other);
    assert.deepEqual(plan.changes,[]);assert.deepEqual([...plan.sources],before);
    assert.deepEqual([...map],before);assert.deepEqual([...other],after);
    assert.equal(plan.pairEvidence.sourceBase,epoch);assert.equal(plan.pairEvidence.sourceHead,epoch);
    assert.ok(plan.evidence.every(row=>row.changed===false&&row.replayed.length===0));
  }
});
test('both complete pose epochs reject every missing, modified and paired-drift input',()=>{
  const {old,current}=poseEpochFixtures();
  for(const map of [old,current]) for(const rel of CHARACTER_POSE_PATHS) {
    for(const side of [0,1]) for(const missing of [false,true]) {
      const pair=[new Map(map),new Map(map)];
      if(missing)pair[side].delete(rel);else pair[side].set(rel,pair[side].get(rel)+'\n// unreviewed source');
      rejectPoseWithoutMutation(...pair);
    }
    const drift=new Map(map);drift.set(rel,drift.get(rel)+'\n// both-side drift');
    rejectPoseWithoutMutation(drift,new Map(drift));
  }
});
test('whole and partial pose epoch mixing cannot be admitted or replayed',()=>{
  const {old,current}=poseEpochFixtures();
  rejectPoseWithoutMutation(old,current);rejectPoseWithoutMutation(current,old);
  for(const rel of CHARACTER_POSE_PATHS.filter(rel=>old.get(rel)!==current.get(rel))) {
    const mixed=new Map(current);mixed.set(rel,old.get(rel));
    rejectPoseWithoutMutation(mixed,current);rejectPoseWithoutMutation(current,mixed);rejectPoseWithoutMutation(mixed,new Map(mixed));
  }
});

test('current pose CLI writes only identity receipt and preserves it on late rejection', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-current-pose-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const before=path.join(temp,'before'),after=path.join(temp,'after'),receipt=path.join(temp,'receipt.json');
  const {current}=poseEpochFixtures();
  for(const dir of [before,after]) for(const [rel,text] of current) {
    const file=path.join(dir,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
  }
  const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/prepare-inkwave-character-pose-baseline.mjs'),'--baseline',before,'--candidate',after,'--receipt',receipt],{encoding:'utf8'});
  const ok=run();assert.equal(ok.status,0,ok.stderr);
  const prior=fs.readFileSync(receipt,'utf8'),data=JSON.parse(prior);
  assert.deepEqual(data.writtenPaths,[]);assert.equal(data.sourceBase,'785faf01055a361bebc69a8c32ccac18a609c24a');
  assert.ok(data.paths.every(row=>row.changed===false&&row.replayed.length===0));
  for(const dir of [before,after])for(const [rel,text] of current)assert.equal(fs.readFileSync(path.join(dir,rel),'utf8'),text);
  const last=CHARACTER_POSE_PATHS.at(-1),altered=current.get(last)+'\n// late current-pose drift';
  fs.writeFileSync(path.join(after,last),altered);
  const bad=run();assert.notEqual(bad.status,0);assert.equal(fs.readFileSync(receipt,'utf8'),prior);
  for(const [rel,text] of current) {
    assert.equal(fs.readFileSync(path.join(before,rel),'utf8'),text);
    assert.equal(fs.readFileSync(path.join(after,rel),'utf8'),rel===last?altered:text);
  }
});
