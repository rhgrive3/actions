import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readMain26a4GitTree, scanMain26a4Production} from './inkwave-main26a4-production-epoch.mjs';
import {runtimeUIInventory, assertRuntimeUIRows} from './inkwave-runtime-ui-production-epoch.mjs';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';
export const SPECIAL_MODE = 'frozen354-reviewed-special-production-pair';
// The reviewed special source set is an explicit closed three-leaf delta over
// frozen PR1844. It does not broaden or replace the prior runtime/UI epoch.
export const SPECIAL_BASE_SHA = '354536b365ae54bac71c9ce2970a5c5f322c1304';
const delta = {
  "patches/splatoon3/runtime/area-special-vfx-clock.mjs": {
    "sha": "ab89853da521ba320d2973da32eed25bad824ff2",
    "sha256": "33a7665957f01ab4daa3e1b3b2871c8511432b11a315fa7bd6e2d77f4ba829df"
  },
  "patches/splatoon3/runtime/special-presentation.mjs": {
    "sha": "7d3e3b6dcef8d77425d14baa21cf4b98d3203e24",
    "sha256": "d9eb917d06cc81eebb330c71bab230b01cad54688033010a67916d70efe60ecc"
  },
  "patches/splatoon3/runtime/special-vfx.mjs": {
    "sha": "9d36e0ba9af2b0ffa9b36ae3c95ed17ac7cd9250",
    "sha256": "81b50f2b3ee54e324d6f1f626e6d7966fe4567e5ecc947eb5a3b11c7dc808256"
  }
};
const baselineLeaves = runtimeUIInventory();
const areaClockPath = 'patches/splatoon3/runtime/area-special-vfx-clock.mjs';
assert.equal(baselineLeaves.length,1392);
assert.ok(!baselineLeaves.some(row => row.path === areaClockPath),'area clock is the sole new production leaf');
assert.equal(Object.keys(delta).length,3);
assert.equal(Object.keys(delta).filter(relative => relative !== areaClockPath && baselineLeaves.some(row => row.path === relative)).length,2);
const leaves = [...baselineLeaves.map(row => ({...row,...delta[row.path]})),
  {path:areaClockPath,mode:'100644',...delta[areaClockPath]}]
  .sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
assert.equal(leaves.length,1393);
assert.equal(baselineLeaves.filter(row => delta[row.path] && row.sha !== delta[row.path].sha).length,2);
export function specialInventory() { return structuredClone(leaves); }
export function assertSpecialRows(rows, hashes = true) {
  assert.ok(Array.isArray(rows),'inventory array required');
  const sorted=[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.deepEqual(sorted.map(row=>row.path),leaves.map(row=>row.path),'complete production inventory');
  for(let i=0;i<leaves.length;i++) {
    for(const key of hashes?['mode','sha','sha256']:['mode','sha'])
      assert.equal(sorted[i][key],leaves[i][key],leaves[i].path+': pinned '+key);
  }
}
export function assertSpecialContract({mode,sourceBase,sourceHead,baseSha,candidateSha}) {
  assert.equal(mode,SPECIAL_MODE,'explicit reviewed special mode required');
  assert.equal(sourceBase,SPECIAL_BASE_SHA,'exact source baseline epoch');
  assert.equal(baseSha,SPECIAL_BASE_SHA,'actual baseline must be reviewed frozen354');
  assert.match(candidateSha??'',/^[0-9a-f]{40}$/,'actual candidate immutable SHA required');
  assert.notEqual(candidateSha,SPECIAL_BASE_SHA,'three production deltas require a new actual commit');
  assert.equal(sourceHead,candidateSha,'candidate source epoch must be its actual declared Git HEAD');
}
export function verifySpecialProductionPair(options) {
  assertSpecialContract(options);
  const baseline = fs.realpathSync(options.baseline), candidate = fs.realpathSync(options.candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const result = [];
  for (const [root,commit] of [[baseline,options.baseSha],[candidate,options.candidateSha]]) {
    const before = readMain26a4GitTree(root,commit);
    (root === baseline ? assertRuntimeUIRows : assertSpecialRows)(before.entries,false);
    if (root === baseline) assert.equal(before.tree,'70cce7a41e58da286f5faf9706180923cd3cab76','reviewed baseline full Git tree');
    const rows = scanMain26a4Production(root);
    (root === baseline ? assertRuntimeUIRows : assertSpecialRows)(rows);
    const after = readMain26a4GitTree(root,commit);
    assert.deepEqual(after,before,'immutable checkout must remain stable during source verification');
    result.push({commit,tree:before.tree,productionLeaves:rows.length});
  }
  return {schema:1,mode:SPECIAL_MODE,sourceBase:SPECIAL_BASE_SHA,sourceHead:options.candidateSha,
    declaredBaseCommit:options.baseSha,declaredCandidateCommit:options.candidateSha,
    checkouts:result,baselineInventoryHash:createHash('sha256').update(JSON.stringify(baselineLeaves)).digest('hex'),candidateInventoryHash:createHash('sha256').update(JSON.stringify(leaves)).digest('hex'),
    productionSupersetLeaves:1393,builderPinnedSeparately:true,changes:Object.keys(delta),writtenPaths:[],
    scope:'Read-only exact three-delta production source admission at declared actual Git HEADs. No replay or source writes.',
    limitation:'Not a build, runtime, RNG, visual, retail-equivalence or gameplay-improvement result. Final-head emitted and browser comparisons remain required.'};
}
export async function runSpecialAdmissionCLI(values,role) {
  const options = {baseline:values.get('--baseline'),candidate:values.get('--candidate'),baseSha:values.get('--base-sha'),candidateSha:values.get('--candidate-sha'),mode:values.get('--expected-mode'),sourceBase:values.get('--expected-source-base'),sourceHead:values.get('--expected-source-head')};
  assertSpecialContract(options);
  for (const [flag,root] of [['--base-git-root',options.baseline],['--candidate-git-root',options.candidate]])
    if (values.has(flag)) assert.equal(fs.realpathSync(values.get(flag)),fs.realpathSync(root),'special source must be the actual declared worktree');
  const receipt = values.get('--receipt');
  if (receipt) assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
  const evidence = verifySpecialProductionPair(options);
  if (role === 'controls') {
    let rejected = 0;
    // These are validator controls over already verified real source metadata,
    // not fabricated Git checkouts or claims of a future aggregate pass.
    for (let i = 0; i < leaves.length; i++) {
      const changed = [...leaves];changed[i] = {...leaves[i],sha256:'0'.repeat(64)};
      assert.throws(() => assertSpecialRows(changed));rejected++;
    }
    for (const changed of [leaves.slice(1),[...leaves,{...leaves[0],path:'inkwave-public/unreviewed-extra.js'}],[...leaves,leaves[0]]]) {assert.throws(() => assertSpecialRows(changed));rejected++;}
    // Each partially reverted reviewed delta, including a missing area clock,
    // must reject rather than admitting a mixed old/new production epoch.
    for (const relative of Object.keys(delta)) {
      const original = baselineLeaves.find(row => row.path === relative);
      const changed = original ? leaves.map(row => row.path === relative ? original : row) : leaves.filter(row => row.path !== relative);
      assert.throws(() => assertSpecialRows(changed));rejected++;
    }
    for (const changes of [{mode:'unknown-mode'},{sourceBase:'0'.repeat(40)},{sourceHead:'0'.repeat(40)},{baseSha:'0'.repeat(40)},{candidateSha:'main'}]) {assert.throws(() => assertSpecialContract({...options,...changes}));rejected++;}
    evidence.controls={kind:'inventory-and-contract-negative-controls',rejected};
  }
  // Recheck every actual source and Git head after controls, before receipt.
  const expected = {...evidence}; delete expected.controls;
  assert.deepEqual(verifySpecialProductionPair(options), expected, 'actual pair unchanged after controls');
  if (receipt) {
    assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
    fs.mkdirSync(path.dirname(receipt),{recursive:true});
    fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify(evidence));
}
