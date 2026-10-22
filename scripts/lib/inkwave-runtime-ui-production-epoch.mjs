import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {MAIN26A4_SHA, main26a4Inventory, assertMain26a4Rows, readMain26a4GitTree, scanMain26a4Production} from './inkwave-main26a4-production-epoch.mjs';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';
export const RUNTIME_UI_MODE = 'main26a4-reviewed-runtime-ui-production-pair';
// Exact published PR1838 and PR1839 production blobs. All other 1387 leaves stay pinned.
const delta = {
  "patches/local-quality/gyro.mjs": {
    "sha": "2d12ba23ae122e6f813d03ac8e62094ea95583f8",
    "sha256": "c488be1536f5c2b4d336311a8c0c58bef26c55568aef26622d08aa041e8ecfc4"
  },
  "inkwave-public/src/world/level.js": {
    "sha": "53c9ac84b017926afee4e15c6b2816d1146948b4",
    "sha256": "53e4e4cac8060bbf843f91db45f4aaa4b8d9cbbe5a3ba65f45d836f1b153b9c4"
  },
  "patches/local-quality/collision-hotpath-adapter.mjs": {
    "sha": "1cff1e7814e3510aefbcbb96352c8c54d395fbf0",
    "sha256": "232fa5758ac855238b9da225eae487131d9036e47ddc5ed6935b0c0bf4abe09d"
  },
  "patches/local-quality/static-menu-adapter.mjs": {
    "sha": "209e1b21d25d790e8b3725a8f2f0bed363547d53",
    "sha256": "c8bec2d3404d9574243388bb036ddbefa176dd1a5ccd5aa52936046a4ba3683e"
  }
};
const baselineLeaves = main26a4Inventory();
const leaves = baselineLeaves.map(row => ({...row,...delta[row.path]}));
assert.equal(Object.keys(delta).length,4);
assert.equal(leaves.filter((row,i)=>row.sha!==baselineLeaves[i].sha).length,4);
export function runtimeUIInventory() { return structuredClone(leaves); }
export function assertRuntimeUIRows(rows, hashes = true) {
  assert.ok(Array.isArray(rows),'inventory array required');
  const sorted=[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.deepEqual(sorted.map(row=>row.path),leaves.map(row=>row.path),'complete production inventory');
  for(let i=0;i<leaves.length;i++) {
    for(const key of hashes?['mode','sha','sha256']:['mode','sha'])
      assert.equal(sorted[i][key],leaves[i][key],leaves[i].path+': pinned '+key);
  }
}
export function assertRuntimeUIContract({mode,sourceBase,sourceHead,baseSha,candidateSha}) {
  assert.equal(mode,RUNTIME_UI_MODE,'explicit reviewed runtime/UI mode required');
  assert.equal(sourceBase,MAIN26A4_SHA,'exact source baseline epoch');
  assert.equal(baseSha,MAIN26A4_SHA,'actual baseline must be reviewed main26a4');
  assert.match(candidateSha??'',/^[0-9a-f]{40}$/,'actual candidate immutable SHA required');
  assert.notEqual(candidateSha,MAIN26A4_SHA,'four production changes require a new actual commit');
  assert.equal(sourceHead,candidateSha,'candidate source epoch must be its actual declared Git HEAD');
}
export function verifyRuntimeUIProductionPair(options) {
  assertRuntimeUIContract(options);
  const baseline = fs.realpathSync(options.baseline), candidate = fs.realpathSync(options.candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const result = [];
  for (const [root,commit] of [[baseline,options.baseSha],[candidate,options.candidateSha]]) {
    const before = readMain26a4GitTree(root,commit);
    (root === baseline ? assertMain26a4Rows : assertRuntimeUIRows)(before.entries,false);
    if (root === baseline) assert.equal(before.tree,'40cd5c2b6fe399b52b7b82c37ee546fc40f9abaf','reviewed baseline full Git tree');
    const rows = scanMain26a4Production(root);
    (root === baseline ? assertMain26a4Rows : assertRuntimeUIRows)(rows);
    const after = readMain26a4GitTree(root,commit);
    assert.deepEqual(after,before,'immutable checkout must remain stable during source verification');
    result.push({commit,tree:before.tree,productionLeaves:rows.length});
  }
  return {schema:1,mode:RUNTIME_UI_MODE,sourceBase:MAIN26A4_SHA,sourceHead:options.candidateSha,
    declaredBaseCommit:options.baseSha,declaredCandidateCommit:options.candidateSha,
    checkouts:result,canonicalInputs:1362,baselineInventoryHash:createHash('sha256').update(JSON.stringify(baselineLeaves)).digest('hex'),candidateInventoryHash:createHash('sha256').update(JSON.stringify(leaves)).digest('hex'),
    productionSupersetLeaves:1391,builderPinnedSeparately:true,changes:Object.keys(delta),writtenPaths:[],
    scope:'Read-only exact four-delta production source admission at declared actual Git HEADs. No replay or source writes.',
    limitation:'Not a build, runtime, RNG, visual, retail-equivalence or gameplay-improvement result. Final-head emitted and browser comparisons remain required.'};
}
export async function runRuntimeUIAdmissionCLI(values,role) {
  const options = {baseline:values.get('--baseline'),candidate:values.get('--candidate'),baseSha:values.get('--base-sha'),candidateSha:values.get('--candidate-sha'),mode:values.get('--expected-mode'),sourceBase:values.get('--expected-source-base'),sourceHead:values.get('--expected-source-head')};
  assertRuntimeUIContract(options);
  for (const [flag,root] of [['--base-git-root',options.baseline],['--candidate-git-root',options.candidate]])
    if (values.has(flag)) assert.equal(fs.realpathSync(values.get(flag)),fs.realpathSync(root),'runtime/UI source must be the actual declared worktree');
  const receipt = values.get('--receipt');
  if (receipt) assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
  const evidence = verifyRuntimeUIProductionPair(options);
  if (role === 'controls') {
    let rejected = 0;
    // These are validator controls over already verified real source metadata,
    // not fabricated Git checkouts or claims of a future aggregate pass.
    for (let i = 0; i < leaves.length; i++) {
      const changed = [...leaves];changed[i] = {...leaves[i],sha256:'0'.repeat(64)};
      assert.throws(() => assertRuntimeUIRows(changed));rejected++;
    }
    for (const changed of [leaves.slice(1),[...leaves,{...leaves[0],path:'inkwave-public/unreviewed-extra.js'}],[...leaves,leaves[0]]]) {assert.throws(() => assertRuntimeUIRows(changed));rejected++;}
    for (const changes of [{mode:'unknown-mode'},{sourceBase:'0'.repeat(40)},{sourceHead:'0'.repeat(40)},{baseSha:'0'.repeat(40)},{candidateSha:'main'}]) {assert.throws(() => assertRuntimeUIContract({...options,...changes}));rejected++;}
    evidence.controls={kind:'inventory-and-contract-negative-controls',rejected};
  }
  // Recheck every actual source and Git head after controls, before receipt.
  const expected = {...evidence}; delete expected.controls;
  assert.deepEqual(verifyRuntimeUIProductionPair(options), expected, 'actual pair unchanged after controls');
  if (receipt) {
    assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
    fs.mkdirSync(path.dirname(receipt),{recursive:true});
    fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify(evidence));
}
