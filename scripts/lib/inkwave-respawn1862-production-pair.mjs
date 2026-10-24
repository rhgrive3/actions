import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readCurrentPairGitTree, scanCurrentPairProduction} from './inkwave-projectile-current-pair.mjs';
import {readMain26a4GitTree} from './inkwave-main26a4-production-epoch.mjs';
import {CHARACTER_POSE_PATHS, planCharacterPoseBaseline} from './inkwave-character-pose-baseline.mjs';
import {RESPAWN_1862_POSE_PAIR} from './inkwave-respawn1862-source-pair.mjs';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';

export const RESPAWN_PRODUCTION_MODE = 'pr1862-main3003-f253-production-pair';
export const RESPAWN_BASE = '3003088e7d3da6e3b41829a96714698a348b555b';
export const RESPAWN_HEAD = 'f253b8aa2e23bcb9e40805a9d389a8220ad6dbec';
export const RESPAWN_QA_PATHS = Object.freeze([
  '.github/workflows/inkwave-projectile-visuals.yml',
  'scripts/fixtures/inkwave-projectile-current-pair-20261023.json.gz',
  'scripts/fixtures/inkwave-respawn1862-production-pair.json.gz',
  'scripts/lib/inkwave-projectile-current-pair.mjs',
  'scripts/lib/inkwave-respawn1862-production-pair.mjs',
  'scripts/tests/inkwave-respawn1862-production-pair.test.mjs',
  'scripts/verify-inkwave-respawn1862-production-pair.mjs',
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packed = fs.readFileSync(new URL('../fixtures/inkwave-respawn1862-production-pair.json.gz', import.meta.url));
assert.equal(hash(packed), '0870f0c0156e55056b4cbf3dd436beccfc72a9ffc310d0ee5b7a366c8483748a', 'frozen observed production fixture');
const manifest = JSON.parse(gunzipSync(packed));
assert.equal(manifest.sourceBase, RESPAWN_BASE);
assert.equal(manifest.sourceHead, RESPAWN_HEAD);
const baseline = manifest.baseline;
const delta = new Map(manifest.candidateDelta.map(row => [row.path, row]));
assert.deepEqual([...delta.keys()], [
  'patches/splatoon3/runtime/respawn-lifecycle.mjs',
  'patches/splatoon3/runtime/roller-detail-motion.mjs',
  'patches/splatoon3/runtime/roller.mjs',
  'patches/splatoon3/runtime/spawn-pose-motion.mjs',
  'patches/splatoon3/runtime/weapon-handoff-motion.mjs',
]);
assert.equal(baseline.length, 1456);
const candidate = baseline.map(row => delta.get(row.path) || row);
assert.equal(candidate.filter((row, at) => row.sha !== baseline[at].sha).length, 5);
const sorted = rows => [...rows].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
// These exact donor bodies supply enumeration only. PR1857/1860 routing is
// never invoked by this dedicated PR1862 admission.
for(const [relative,expected] of [
  ['./inkwave-projectile-current-pair.mjs','0949cc14d85cf5ab78fb187377cb3c6948606b3f'],
  ['../fixtures/inkwave-projectile-current-pair-20261023.json.gz','23d7e88913114ce013423b80ffd2a4ae58616f65']]) {
  const bytes=fs.readFileSync(new URL(relative,import.meta.url));
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),expected,'reviewed scanner/scope dependency');
}
const completeBaseline=sorted([...baseline,...manifest.buildClosure.additionalBaselineInputs]);
const completeCandidate=completeBaseline.map(row=>delta.get(row.path)||row);
assert.equal(completeBaseline.length,1459);
assert.equal(hash(JSON.stringify(completeBaseline)),manifest.buildClosure.baselineSHA256);
assert.equal(hash(JSON.stringify(completeCandidate)),manifest.buildClosure.candidateSHA256);
assert.equal(manifest.buildClosure.canonicalInputPaths.length,1421);
for(const relative of manifest.buildClosure.canonicalInputPaths)assert.ok(completeCandidate.some(row=>row.path===relative),'canonical build input covered: '+relative);
export function respawnBuildClosureInventory(side) {
  assert.ok(['baseline','candidate'].includes(side),'explicit build closure side');
  return structuredClone(side==='baseline'?completeBaseline:completeCandidate);
}
export function assertRespawnBuildClosureRows(rows,side,body=true) {
  const actual=sorted(rows),expected=side==='baseline'?completeBaseline:completeCandidate;
  assert.ok(['baseline','candidate'].includes(side),'explicit build closure side');
  assert.deepEqual(actual.map(row=>row.path),expected.map(row=>row.path),'complete actual build/copy closure: missing, extra or duplicate');
  for(let i=0;i<expected.length;i++)for(const key of body?['mode','sha','sha256']:['mode','sha'])
    assert.equal(actual[i][key],expected[i][key],expected[i].path+': reviewed build closure '+key);
}
export function assertRespawnNormalBuildProfile(env=process.env) {
  for(const name of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])
    assert.ok(!env[name],name+': external input is not covered by this source pair');
  assert.notEqual(env.INKWAVE_BUILD_UNMINIFIED,'1','normal build closure requires minification');
  assert.notEqual(env.INKWAVE_NO_THREE_SHAKE,'1','normal build closure requires the reviewed Three bundle');
}

export function respawnProductionInventory(side) {
  assert.ok(['baseline', 'candidate'].includes(side), 'explicit inventory side');
  return structuredClone(side === 'baseline' ? baseline : candidate);
}
export function assertRespawnProductionRows(rows, side, hashes = true) {
  const expected = respawnProductionInventory(side), actual = sorted(rows);
  assert.deepEqual(actual.map(row => row.path), expected.map(row => row.path), side + ': complete production inventory');
  for (let at = 0; at < expected.length; at++)
    for (const key of hashes ? ['mode', 'sha', 'sha256'] : ['mode', 'sha'])
      assert.equal(actual[at][key], expected[at][key], expected[at].path + ': pinned ' + key);
}
export function assertRespawnProductionContract(options, context) {
  assert.equal(options.mode, RESPAWN_PRODUCTION_MODE, 'explicit PR1862 production mode');
  assert.equal(options.sourceBase, RESPAWN_BASE, 'exact source base epoch');
  assert.equal(options.sourceHead, RESPAWN_HEAD, 'exact source head epoch');
  assert.equal(options.baseSha, RESPAWN_BASE, 'actual main3003 baseline required');
  assert.match(options.candidateSha ?? '', /^[0-9a-f]{40}$/, 'actual immutable candidate required');
  assert.notEqual(options.candidateSha, RESPAWN_BASE, 'reversed or identical actual pair rejected');
  assert.equal(context.eventName, 'pull_request', 'owned pull_request route only');
  assert.equal(context.repository, 'rhgrive3/actions', 'owned repository');
  assert.equal(context.number, 1862, 'owned PR1862');
  assert.equal(context.baseRef, 'main', 'owned main base ref');
  assert.equal(context.baseRepo, context.repository, 'owned base repository');
  assert.equal(context.baseSha, options.baseSha, 'actual event base SHA');
  assert.equal(context.headRef, 'fix/respawn-weapon-state-20261023', 'owned head ref');
  assert.equal(context.headRepo, context.repository, 'same repository head');
  assert.equal(context.headSha, options.candidateSha, 'actual event head SHA');
}
export function respawnPRContext(env = process.env) {
  assert.equal(env.GITHUB_EVENT_NAME, 'pull_request', 'owned pull_request route only');
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  assert.ok(pr && event.number === pr.number, 'complete matching PR event numbers');
  return {eventName: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY, number: pr.number,
    baseRef: pr.base?.ref, baseRepo: pr.base?.repo?.full_name, baseSha: pr.base?.sha,
    headRef: pr.head?.ref, headRepo: pr.head?.repo?.full_name, headSha: pr.head?.sha};
}
function git(root, args, encoding = 'utf8') {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return execFileSync('git', ['-C', root, ...args], {encoding, env: {...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1'}, timeout: 15000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
}
const VERIFIER_ROOT=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
let reviewedExecution;
function reviewedVerifierIdentity() {
  // Trust comes from independent review/readback of this execution snapshot.
  // A candidate-controlled replacement cannot authenticate its own approval.
  const commit=git(VERIFIER_ROOT,['rev-parse','--verify','HEAD^{commit}']).trim();
  readMain26a4GitTree(VERIFIER_ROOT,commit);
  assert.deepEqual(git(VERIFIER_ROOT,['show','-s','--format=%P',commit]).trim().split(' '),[RESPAWN_HEAD],'reviewed verifier is a direct QA successor of f253');
  const changed=git(VERIFIER_ROOT,['diff-tree','--no-commit-id','--name-only','--no-renames','-r','-z',commit]).split('\0').filter(Boolean).sort();
  assert.deepEqual(changed,RESPAWN_QA_PATHS,'reviewed verifier exact QA path set');
  const identity={commit,tree:git(VERIFIER_ROOT,['rev-parse',commit+'^{tree}']).trim(),commitBodySHA256:hash(git(VERIFIER_ROOT,['cat-file','commit',commit],null)),qaLeaves:[]};
  for(const relative of RESPAWN_QA_PATHS) {
    const entry=git(VERIFIER_ROOT,['ls-tree',commit,'--',relative]).trim();
    const match=/^(100644) blob ([0-9a-f]{40})\t/.exec(entry);assert.ok(match,'reviewed regular QA leaf '+relative);
    const bytes=git(VERIFIER_ROOT,['cat-file','blob',match[2]],null),file=path.join(VERIFIER_ROOT,relative),stat=fs.lstatSync(file);
    assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o111),'unchanged reviewed verifier file '+relative);
    assert.deepEqual(fs.readFileSync(file),bytes,'unchanged reviewed verifier execution body '+relative);
    identity.qaLeaves.push({path:relative,mode:match[1],sha:match[2],sha256:hash(bytes)});
  }
  if(reviewedExecution)assert.deepEqual(identity,reviewedExecution,'reviewed execution snapshot remains fixed during invocation');
  else reviewedExecution=identity;
  return identity;
}
export function assertRespawnCandidateHistory(root,commit) {
  assert.equal(git(root,['rev-parse','--verify','HEAD^{commit}']).trim(),commit,'actual candidate HEAD');
  const reviewed=reviewedVerifierIdentity();
  assert.equal(commit,reviewed.commit,'candidate must match unchanged reviewed verifier execution commit');
  assert.equal(git(root,['rev-parse',commit+'^{tree}']).trim(),reviewed.tree,'reviewed execution tree');
  assert.equal(hash(git(root,['cat-file','commit',commit],null)),reviewed.commitBodySHA256,'reviewed complete commit bytes');
  assert.equal(git(root,['rev-parse',RESPAWN_HEAD+'^{tree}']).trim(),manifest.sourceHeadTree,'frozen f253 source tree');
  assert.deepEqual(git(root,['show','-s','--format=%P',commit]).trim().split(' '),[RESPAWN_HEAD],'only the reviewed direct QA successor');
  for(const row of reviewed.qaLeaves) {
    assert.equal(git(root,['ls-tree',commit,'--',row.path]).trim(),row.mode+' blob '+row.sha+'\t'+row.path,row.path+': reviewed immutable QA blob');
    const file=path.join(root,row.path),stat=fs.lstatSync(file);
    assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o111),row.path+': regular actual QA body');
    assert.equal(hash(fs.readFileSync(file)),row.sha256,row.path+': unchanged reviewed QA body');
  }
}
export function verifyRespawnProductionPair(options,context) {
  assertRespawnProductionContract(options,context);assertRespawnNormalBuildProfile();
  const roots=[fs.realpathSync(options.baseline),fs.realpathSync(options.candidate)];
  assert.notEqual(...roots,'separate actual source worktrees');
  const checkouts=[];
  for(const [at,root] of roots.entries()) {
    const side=at?'candidate':'baseline',commit=at?options.candidateSha:options.baseSha;
    const before=readCurrentPairGitTree(root,commit);
    if(!at)assert.equal(before.tree,manifest.sourceBaseTree,'exact main3003 tree');
    const immutable=before.entries;
    for(const row of immutable)assert.equal(row.type,'blob','regular Git build input');
    assertRespawnBuildClosureRows(immutable,side,false);
    const actual=scanCurrentPairProduction(root);
    assertRespawnBuildClosureRows(actual,side);
    if(at)assertRespawnCandidateHistory(root,commit);
    assert.deepEqual(readCurrentPairGitTree(root,commit),before,'actual Git checkout remains stable');
    checkouts.push({commit,tree:before.tree,buildClosureLeaves:actual.length,buildClosureSHA256:hash(JSON.stringify(actual))});
  }
  const poseMaps=roots.map(root=>new Map(CHARACTER_POSE_PATHS.map(relative=>[relative,fs.readFileSync(path.join(root,relative),'utf8')])));
  const pose=planCharacterPoseBaseline(...poseMaps);
  assert.equal(pose.pairEvidence.sourceBase,RESPAWN_1862_POSE_PAIR.sourceBase);
  assert.equal(pose.pairEvidence.sourceHead,RESPAWN_1862_POSE_PAIR.sourceHead);
  assert.deepEqual(pose.changes,[],'no pose replay');assert.deepEqual([...pose.sources],[...poseMaps[0]],'preserve every baseline pose');
  const reviewed=reviewedVerifierIdentity();
  return {schema:2,mode:RESPAWN_PRODUCTION_MODE,sourceBase:RESPAWN_BASE,sourceHead:RESPAWN_HEAD,event:context,
    verifierExecution:reviewed,normalBuildProfile:manifest.buildClosure.normalProfile,sourceFixtureSHA256:hash(packed),historicalSubsetLeaves:1456,checkouts,changes:[...delta.keys()],writtenPaths:[],
    pose:{sourceBase:pose.pairEvidence.sourceBase,sourceHead:pose.pairEvidence.sourceHead,paths:pose.evidence.length,writtenPaths:[]},
    scope:'Read-only exact source/build-copy closure and candidate bound to the unchanged independently reviewed verifier execution snapshot. No replay or source writes.',
    limitation:'Independent review and exact-head readback establish trust in the invocation. A candidate-controlled replacement cannot authenticate its own approval or prevent future checker/workflow replacement. Not build, physics, visual, transport or retail acceptance.'};
}
export function runRespawnProductionAdmission(options, context, role, receipt) {
  assert.ok(['controls', 'prepare'].includes(role), 'explicit admission role');
  assertRespawnProductionContract(options, context);
  // Protect every tracked source, not just the production inventory, and all
  // Git metadata. Outputs may live only outside those input paths.
  const paths = new Set([...baseline.map(row => row.path), ...RESPAWN_QA_PATHS]);
  for (const root of [options.baseline, options.candidate])
    for (const relative of git(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean)) paths.add(relative);
  const protectReceipt = () => assertReceiptSeparate(receipt, [options.baseline, options.candidate], [...paths]);
  protectReceipt();
  const evidence = verifyRespawnProductionPair(options, context);
  if (role === 'controls') {
    let rejected = 0;
    for (const side of ['baseline', 'candidate']) {
      const rows = respawnBuildClosureInventory(side);
      for (let at = 0; at < rows.length; at++) {
        const changed = [...rows]; changed[at] = {...rows[at], sha256: '0'.repeat(64)};
        assert.throws(() => assertRespawnBuildClosureRows(changed, side)); rejected++;
      }
      for (const changed of [rows.slice(1), [...rows, rows[0]], [...rows, {...rows[0], path: 'inkwave-public/unreviewed.mjs'}]]) {
        assert.throws(() => assertRespawnBuildClosureRows(changed, side)); rejected++;
      }
    }
    evidence.controls = {kind: 'actual-build-closure-negative-controls', rejected};
  }
  const expected = {...evidence}; delete expected.controls;
  assert.deepEqual(verifyRespawnProductionPair(options, context), expected, 'actual source and Git identity preserved before receipt');
  protectReceipt();
  fs.mkdirSync(path.dirname(receipt), {recursive: true});
  fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  return evidence;
}
