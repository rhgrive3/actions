import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash, verifyRuntimeBuild } from './inkwave-runtime-evidence.mjs';
const receipt = JSON.parse(fs.readFileSync(new URL('../../reports/inkwave-crowd-integration-inputs.json', import.meta.url)));
const cloth = receipt.parents[0];
const rigWorkflow = '.github/workflows/inkwave-crowd-rig.yml';
const routing = "    if: github.head_ref == 'codex/ipad-crowd-rig-branch-updates' || github.event_name == 'workflow_dispatch'\n";
const supportFiles = [
  '.github/workflows/inkwave-crowd-integration.yml',
  'reports/inkwave-crowd-integration-inputs.json',
  'reports/inkwave-crowd-integration.md',
  'scripts/lib/inkwave-crowd-integration.mjs',
  'scripts/tests/inkwave-crowd-integration.test.mjs',
  'scripts/verify-inkwave-crowd-integration-png.py',
  'scripts/tests/inkwave-crowd-integration-png.test.py',
  'scripts/lib/live-ray-mirror.mjs',
  'scripts/tests/live-ray-mirror.test.mjs',
  'scripts/diagnose-inkwave-native-ray-live-equivalence.mjs',
];
export const controls = {
  rig: {
    'patches/local-quality/adapter.mjs': cloth,
    'scripts/lib/inkwave-build-only-modules.mjs': cloth,
    'patches/local-quality/retarget-branch-update-adapter.mjs': null,
  },
  hidden: {
    'patches/splatoon3/adapter.mjs': cloth,
    'patches/splatoon3/runtime/weapon-models/kit.mjs': cloth,
  },
};
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const blob = (root, file) => git(root, 'hash-object', '--', file);
const tree = (root, ref) => new Map(git(root, 'ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).map(row => {const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]];}));
const sourcePath = key => {
  const roots = {upstream:'inkwave-public',patch:'patches/splatoon3','local-quality':'patches/local-quality','native-stages':'patches/native-stages','build-script':'scripts','touch-layout':'patches/touch-layout',reliability:'patches/reliability','network-replication':'patches/network-replication','loading-cache':'patches/loading-cache','practice-range':'patches/practice-range'};
  const at = key.indexOf('/'), prefix = roots[key.slice(0, at)];
  assert(prefix && !key.split('/').some(p => !p || p === '.' || p === '..'), key);
  return prefix + key.slice(at);
};
export function assertExactMapDelta(before, after, expected, label) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => before[k] !== after[k]).sort();
  assert.deepEqual(changed, [...expected].sort(), label);
  return changed;
}
export function assertCandidateSnapshot(snapshot, sha, expected = receipt) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.equal(snapshot.head, sha, 'exact candidate checkout');
  assert.deepEqual(snapshot.parents, [expected.main, ...expected.parents, ...(expected.previousIntegrationHead ? [expected.previousIntegrationHead] : [])], 'reviewed integration ancestry');
  assert.equal(snapshot.workingChanges, '', 'no working tree changes');
  for (const [file, entry] of Object.entries(expected.selected)) {
    const expectedBlob = file === expected.ciBudgetChange?.file ? expected.ciBudgetChange.candidateBlob : entry.sha;
    if (file !== rigWorkflow) assert.equal(snapshot.blobs[file], expectedBlob, 'reviewed canonical blob: ' + file);
  }
  for (const [file, blob] of Object.entries(expected.liveEvidenceFiles)) assert.equal(snapshot.blobs[file], blob, 'verified live observer blob: ' + file);
  assert.deepEqual(snapshot.changes, [...Object.keys(expected.selected), ...(expected.supportFiles || supportFiles)].sort(), 'closed integration scope');
}
export function verifyCandidate(root, sha) {
  const parents = git(root, 'cat-file', '-p', 'HEAD').split('\n').filter(s => s.startsWith('parent ')).map(s => s.slice(7));
  const actual = tree(root, 'HEAD');
  const changed = git(root, 'diff', '--name-only', receipt.main, sha).split('\n').filter(Boolean).sort();
  assertCandidateSnapshot({head:git(root, 'rev-parse', 'HEAD'),parents,workingChanges:git(root, 'diff', '--name-only', 'HEAD'),blobs:Object.fromEntries(actual),changes:changed}, sha);
  for (const [file, expected] of Object.entries(receipt.selected)) {
    if (file === rigWorkflow) continue;
    const expectedBlob = file === receipt.ciBudgetChange?.file ? receipt.ciBudgetChange.candidateBlob : expected.sha;
    assert.equal(actual.get(file), expectedBlob, 'reviewed canonical blob: ' + file);
    assert.equal(blob(root, file), expectedBlob, 'materialized canonical blob: ' + file);
  }
  for (const [file, expected] of Object.entries(receipt.liveEvidenceFiles)) {
    assert.equal(actual.get(file), expected, 'verified live observer blob: ' + file);
    assert.equal(blob(root, file), expected, file);
  }
  const original = git(root, 'show', receipt.parents[1] + ':' + rigWorkflow) + '\n';
  assert.equal(fs.readFileSync(path.join(root, rigWorkflow), 'utf8'), original.replace('  compare:\n', '  compare:\n' + routing), 'only component diagnostic routing changes');
  if (receipt.ciBudgetChange) {
    const budget = receipt.ciBudgetChange;
    assert.equal(budget.file, '.github/workflows/validate-inkwave-update.yml');
    assert.equal(budget.from, 45); assert.equal(budget.to, 60);
    assert.equal(git(root, 'rev-parse', receipt.previousIntegrationHead + ':' + budget.file), budget.previousBlob);
    const before = execFileSync('git', ['show', receipt.previousIntegrationHead + ':' + budget.file], {cwd:root,encoding:'utf8'});
    const anchor = '  validate:\n    if: inputs.diagnostic_only != true\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n';
    assert.equal(before.split(anchor).length,2,'one exact validate budget anchor');
    assert.equal(fs.readFileSync(path.join(root,budget.file),'utf8'),before.replace(anchor,anchor.replace('45','60')),'only validate runtime ceiling changes');
  }
  return { sha, parents, tree: git(root, 'rev-parse', 'HEAD^{tree}'), canonicalProductTree: receipt.canonicalProductTree, sourceChanges: changed, ciBudgetChange: receipt.ciBudgetChange };

}
export function verifyControl(root, kind) {
  const plan = controls[kind]; assert(plan, 'known control');
  const changed = git(root, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean).sort();
  assert.deepEqual(changed, Object.keys(plan).sort(), 'control-only changed paths');
  const changes = {};
  for (const [file, ref] of Object.entries(plan)) {
    if (ref === null) {assert(!fs.existsSync(path.join(root, file)), 'removed rig transformer'); changes[file] = null;}
    else {const expected = git(root, 'rev-parse', ref + ':' + file); assert.equal(blob(root, file), expected, file); changes[file] = expected;}
  }
  return { kind, sourceSha: git(root, 'rev-parse', 'HEAD'), changes };
}
export function prepareControl(root, sha, kind) {
  verifyCandidate(root, sha);
  const plan = controls[kind]; assert(plan, 'known control');
  for (const [file, ref] of Object.entries(plan)) {
    const target = path.join(root, file);
    if (ref === null) fs.unlinkSync(target);
    else {const bytes = execFileSync('git', ['show', ref + ':' + file], {cwd: root}); const temp = target + '.integration-tmp'; fs.writeFileSync(temp, bytes); fs.renameSync(temp, target);}
  }
  return verifyControl(root, kind);
}
function validateManifest(site, root) {
  const m = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  assert.equal(hash(JSON.stringify(m.artifacts)), m.contentHash);
  assert.equal(hash(JSON.stringify(m.files)), m.inputHash);
  for (const [file, sha] of Object.entries(m.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), sha, file);
  for (const [key, sha] of Object.entries(m.files)) assert.equal(hash(fs.readFileSync(path.join(root, sourcePath(key)))), sha, key);
  assert.equal(hash(fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs'))), m.build.script);
  return m;
}
export function verifyBuildPair(kind, candidateRoot, candidateSite, controlRoot, controlSite, sha) {
  const control = verifyControl(controlRoot, kind);
  assert.equal(control.sourceSha, sha);
  const candidate = verifyRuntimeBuild(candidateSite, candidateRoot, sha), baseline = validateManifest(controlSite, controlRoot);
  assert.equal(candidate.contentHash, receipt.combinedContentHash, 'pinned combined product');
  const map = m => Object.fromEntries(Object.entries(m.files).map(([k,v]) => [sourcePath(k),v]));
  const inputs = assertExactMapDelta(map(baseline), map(candidate), Object.keys(controls[kind]), 'exact control input delta');
  const clean = m => Object.fromEntries(Object.entries(m.artifacts).filter(([f]) => !f.startsWith('_versions/') && !['index.html','sw.js'].includes(f)));
  const emitted = assertExactMapDelta(clean(baseline), clean(candidate), kind === 'rig' ? ['src/game/motion/retarget.js'] : ['src/game/character.js','patches/splatoon3/runtime/weapon-models/kit.mjs'], 'exact composed output delta');
  return { kind, candidateSha: sha, candidateContentHash: candidate.contentHash, controlContentHash: baseline.contentHash, inputs, emitted, control };
}
export function verifyHiddenCounts(evidence) {
  const runs = Object.fromEntries(['A','B','B2','A2'].map(k => [k, JSON.parse(fs.readFileSync(path.join(evidence,k,'result.json')))]));
  const expected = {'full-game':[361,289], 'weapons-game':[217,145], 'full-far':[217,217], 'weapons-far':[105,105]};
  const rows = [];
  for (const [tier, counts] of Object.entries(expected)) {
    const samples = Object.fromEntries(Object.entries(runs).map(([k,r]) => {assert.equal(r.fixture.actors,8); const p=r.tiers[tier].preparation; return [k,{raw:p.zero+p.nonzero,zero:p.zero,nonzero:p.nonzero,triangles:p.triangles}];}));
    assert.deepEqual(samples.A, samples.A2); assert.deepEqual(samples.B, samples.B2);
    assert.equal(samples.A.raw,counts[0]); assert.equal(samples.B.raw,counts[1]);
    const near=tier.endsWith('game');
    assert.equal(samples.A.triangles-samples.B.triangles, near?36:0);
    assert.equal(samples.A.zero-samples.B.zero, near?36:0);
    assert.equal(samples.A.nonzero-samples.B.nonzero, near?36:0);
    rows.push({tier,...samples});
  }
  return {accepted:true,rows,claims:'Exact hidden-placeholder draw savings; no device FPS or stable whole-game speed claim.'};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command,...args] = process.argv.slice(2);
  const handlers={source:verifyCandidate,control:prepareControl,pair:verifyBuildPair,hidden:verifyHiddenCounts};
  assert(handlers[command], 'known verification command');
  console.log(JSON.stringify(handlers[command](...args),null,2));
}
