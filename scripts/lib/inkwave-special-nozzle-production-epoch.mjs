import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readMain26a4GitTree, scanMain26a4Production} from './inkwave-main26a4-production-epoch.mjs';
import {runtimeUIInventory, assertRuntimeUIRows} from './inkwave-runtime-ui-production-epoch.mjs';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';
export const SPECIAL_NOZZLE_MODE = 'frozen354-reviewed-special-nozzle-pair';
// The reviewed special source set is an explicit closed four-leaf delta over
// frozen PR1844. It does not broaden or replace the prior runtime/UI epoch.
export const SPECIAL_NOZZLE_BASE_SHA = '354536b365ae54bac71c9ce2970a5c5f322c1304';
const delta = {
  "patches/splatoon3/runtime/special-motion.mjs": {
    "sha": "2b6d61dada1628f2ae2843ee2969d7d951dd44be",
    "sha256": "51b67beb0698823d39000612a583181b4eae4e408270c2bce1e20a958b5932ed"
  },
  "patches/splatoon3/runtime/area-special-vfx-clock.mjs": {
    "sha": "ab89853da521ba320d2973da32eed25bad824ff2",
    "sha256": "33a7665957f01ab4daa3e1b3b2871c8511432b11a315fa7bd6e2d77f4ba829df"
  },
  "patches/splatoon3/runtime/special-presentation.mjs": {
    "sha": "9a7c3f965c104d0228f9008243053acb23b1a3bc",
    "sha256": "55d3623ee631bc644bb29f804b983a7b36ee187f8d948270af364cf9ba45d804"
  },
  "patches/splatoon3/runtime/special-vfx.mjs": {
    "sha": "06c57ab1fb03d3a9d807a3902bf400204389bf33",
    "sha256": "4e53d02d12cc4a34ba096d9d9ce42730d38296bc1ba84e1dac83a0fe8e5b5fb8"
  }
};
const baselineLeaves = runtimeUIInventory();
const areaClockPath = 'patches/splatoon3/runtime/area-special-vfx-clock.mjs';
assert.equal(baselineLeaves.length,1392);
assert.ok(!baselineLeaves.some(row => row.path === areaClockPath),'area clock is the sole new production leaf');
assert.equal(Object.keys(delta).length,4);
assert.equal(Object.keys(delta).filter(relative => relative !== areaClockPath && baselineLeaves.some(row => row.path === relative)).length,3);
const leaves = [...baselineLeaves.map(row => ({...row,...delta[row.path]})),
  {path:areaClockPath,mode:'100644',...delta[areaClockPath]}]
  .sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
assert.equal(leaves.length,1393);
assert.equal(baselineLeaves.filter(row => delta[row.path] && row.sha !== delta[row.path].sha).length,3);
export function specialNozzleInventory() { return structuredClone(leaves); }
export function assertSpecialNozzleRows(rows, hashes = true) {
  assert.ok(Array.isArray(rows),'inventory array required');
  const sorted=[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.deepEqual(sorted.map(row=>row.path),leaves.map(row=>row.path),'complete production inventory');
  for(let i=0;i<leaves.length;i++) {
    for(const key of hashes?['mode','sha','sha256']:['mode','sha'])
      assert.equal(sorted[i][key],leaves[i][key],leaves[i].path+': pinned '+key);
  }
}
export function assertSpecialNozzleContract({mode,sourceBase,sourceHead,baseSha,candidateSha}) {
  assert.equal(mode,SPECIAL_NOZZLE_MODE,'explicit reviewed special-nozzle mode required');
  assert.equal(sourceBase,SPECIAL_NOZZLE_BASE_SHA,'exact source baseline epoch');
  assert.equal(baseSha,SPECIAL_NOZZLE_BASE_SHA,'actual baseline must be reviewed frozen354');
  assert.match(candidateSha??'',/^[0-9a-f]{40}$/,'actual candidate immutable SHA required');
  assert.notEqual(candidateSha,SPECIAL_NOZZLE_BASE_SHA,'four production deltas require a new actual commit');
  assert.equal(sourceHead,candidateSha,'candidate source epoch must be its actual declared Git HEAD');
}
export function verifySpecialNozzleProductionPair(options) {
  assertSpecialNozzleContract(options);
  const baseline = fs.realpathSync(options.baseline), candidate = fs.realpathSync(options.candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const result = [];
  for (const [root,commit] of [[baseline,options.baseSha],[candidate,options.candidateSha]]) {
    const before = readMain26a4GitTree(root,commit);
    (root === baseline ? assertRuntimeUIRows : assertSpecialNozzleRows)(before.entries,false);
    if (root === baseline) assert.equal(before.tree,'70cce7a41e58da286f5faf9706180923cd3cab76','reviewed baseline full Git tree');
    const rows = scanMain26a4Production(root);
    (root === baseline ? assertRuntimeUIRows : assertSpecialNozzleRows)(rows);
    const after = readMain26a4GitTree(root,commit);
    assert.deepEqual(after,before,'immutable checkout must remain stable during source verification');
    result.push({commit,tree:before.tree,productionLeaves:rows.length});
  }
  return {schema:1,mode:SPECIAL_NOZZLE_MODE,sourceBase:SPECIAL_NOZZLE_BASE_SHA,sourceHead:options.candidateSha,
    declaredBaseCommit:options.baseSha,declaredCandidateCommit:options.candidateSha,
    checkouts:result,baselineInventoryHash:createHash('sha256').update(JSON.stringify(baselineLeaves)).digest('hex'),candidateInventoryHash:createHash('sha256').update(JSON.stringify(leaves)).digest('hex'),
    productionSupersetLeaves:1393,builderPinnedSeparately:true,changes:Object.keys(delta).sort(),writtenPaths:[],
    scope:'Read-only exact four-delta production source admission at declared actual Git HEADs. No replay or source writes.',
    limitation:'Not a build, runtime, RNG, visual, retail-equivalence or gameplay-improvement result. Final-head emitted and browser comparisons remain required.'};
}
// A receipt must not add a new production source after successful verification.
// Resolve missing descendants through their nearest existing ancestor as well.
function prospectivePath(file) {
  let at = path.resolve(file), tail = [];
  while (!fs.existsSync(at)) {
    // A dangling symlink is an existing but invalid output ancestor.
    try { fs.lstatSync(at); throw Error('unresolvable receipt path: ' + at); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(at);
    assert.notEqual(parent,at,'resolvable receipt ancestor required');
    tail.unshift(path.basename(at)); at = parent;
  }
  return path.join(fs.realpathSync(at),...tail);
}
const sourceRoots = ['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache'];
export function assertSpecialNozzleReceiptSeparate(receipt,roots) {
  const output = prospectivePath(receipt);
  // Resolve the same actual Git metadata as source verification. Inherited
  // GIT_DIR/GIT_WORK_TREE (and every other GIT_* override) must not redirect
  // discovery away from a separate gitdir or a linked worktree's common dir.
  // The shared historical receipt guard remains unchanged and still checks
  // source/inode aliases below; this independent check closes the new mode.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
  for (const root of new Set(roots)) {
    const raw = execFileSync('git',['-C',fs.realpathSync(root),'rev-parse','--path-format=absolute','--git-dir','--git-common-dir'],
      {encoding:'utf8',env,timeout:10000,maxBuffer:64*1024,stdio:['ignore','pipe','pipe']});
    const directories = raw.trim().split('\n');
    assert.equal(directories.length,2,'actual Git metadata discovery must return git-dir and common-dir');
    for (const directory of directories) {
      const actual = fs.realpathSync(directory);
      assert.ok(output !== actual && !output.startsWith(actual + path.sep),'receipt must not overwrite actual Git metadata used by nozzle source declarations');
    }
  }
  assertReceiptSeparate(receipt,roots,leaves.map(row => row.path));
  for (const root of roots) for (const relative of sourceRoots) {
    const directory = fs.realpathSync(path.join(root,relative));
    assert.ok(output !== directory && !output.startsWith(directory + path.sep),'receipt must remain outside production source roots');
  }
}
export async function runSpecialNozzleAdmissionCLI(values,role) {
  assert.ok(['prepare','controls'].includes(role),'known special-nozzle admission role required');
  const options = {baseline:values.get('--baseline'),candidate:values.get('--candidate'),baseSha:values.get('--base-sha'),candidateSha:values.get('--candidate-sha'),mode:values.get('--expected-mode'),sourceBase:values.get('--expected-source-base'),sourceHead:values.get('--expected-source-head')};
  assertSpecialNozzleContract(options);
  for (const [flag,root] of [['--base-git-root',options.baseline],['--candidate-git-root',options.candidate]])
    if (values.has(flag)) assert.equal(fs.realpathSync(values.get(flag)),fs.realpathSync(root),'special-nozzle source must be the actual declared worktree');
  const receipt = values.get('--receipt');
  if (receipt) assertSpecialNozzleReceiptSeparate(receipt,[options.baseline,options.candidate]);
  const evidence = verifySpecialNozzleProductionPair(options);
  if (role === 'controls') {
    let rejected = 0;
    // These are validator controls over already verified real source metadata,
    // not fabricated Git checkouts or claims of a future aggregate pass.
    for (let i = 0; i < leaves.length; i++) {
      const changed = [...leaves];changed[i] = {...leaves[i],sha256:'0'.repeat(64)};
      assert.throws(() => assertSpecialNozzleRows(changed));rejected++;
    }
    for (const changed of [leaves.slice(1),[...leaves,{...leaves[0],path:'inkwave-public/unreviewed-extra.js'}],[...leaves,leaves[0]]]) {assert.throws(() => assertSpecialNozzleRows(changed));rejected++;}
    // Each partially reverted reviewed delta, including a missing area clock,
    // must reject rather than admitting a mixed old/new production epoch.
    for (const relative of Object.keys(delta)) {
      const original = baselineLeaves.find(row => row.path === relative);
      const changed = original ? leaves.map(row => row.path === relative ? original : row) : leaves.filter(row => row.path !== relative);
      assert.throws(() => assertSpecialNozzleRows(changed));rejected++;
    }
    for (const changes of [{mode:'unknown-mode'},{sourceBase:'0'.repeat(40)},{sourceHead:'0'.repeat(40)},{baseSha:'0'.repeat(40)},{candidateSha:'main'}]) {assert.throws(() => assertSpecialNozzleContract({...options,...changes}));rejected++;}
    evidence.controls={kind:'inventory-and-contract-negative-controls',rejected};
  }
  // Recheck every actual source and Git head after controls, before receipt.
  const expected = {...evidence}; delete expected.controls;
  assert.deepEqual(verifySpecialNozzleProductionPair(options), expected, 'actual pair unchanged after controls');
  if (receipt) {
    assertSpecialNozzleReceiptSeparate(receipt,[options.baseline,options.candidate]);
    fs.mkdirSync(path.dirname(receipt),{recursive:true});
    fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify(evidence));
}
