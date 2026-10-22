import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';

export const MAIN26A4_MODE = 'main26a4-byte-identical-production-epoch';
export const MAIN26A4_SHA = '26a4db4123d23162a3dbf8a12150b1b5bc6ccf64';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const packed = fs.readFileSync(new URL('../fixtures/inkwave-main26a4-production-epoch.json.gz', import.meta.url));
assert.equal(sha256(packed), 'a24db4a8ea3ee3da710df533b26cefe3f981f19238f57aa5139972b7ccc220d4', 'reviewed main26a4 fixture');
const manifest = JSON.parse(gunzipSync(packed));
assert.equal(manifest.sourceCommit, MAIN26A4_SHA);
assert.equal(manifest.productionLeaves.length, 1391);
assert.equal(manifest.canonicalInputs.length, 1362);
const leaves = manifest.productionLeaves;
const roots = Object.freeze(['inkwave-public', 'patches/splatoon3', 'patches/touch-layout', 'patches/reliability', 'patches/local-quality', 'patches/network-replication', 'patches/practice-range', 'patches/native-stages', 'patches/loading-cache']);
const scripts = leaves.filter(row => row.path.startsWith('scripts/')).map(row => row.path);
const included = relative => scripts.includes(relative) || (roots.some(root => relative.startsWith(root + '/')) && !relative.split('/').includes('tests') && !relative.endsWith('.md'));
export function main26a4Inventory() { return structuredClone(leaves); }
export function assertMain26a4Rows(rows, hashes = true) {
  assert.ok(Array.isArray(rows), 'inventory array required');
  const sorted = [...rows].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.deepEqual(sorted.map(row => row.path), leaves.map(row => row.path), 'complete production inventory: missing, extra or duplicate path');
  for (let i = 0; i < leaves.length; i++) {
    const actual = sorted[i], expected = leaves[i];
    assert.equal(actual.mode, expected.mode, expected.path + ': file mode');
    assert.equal(actual.sha, expected.sha, expected.path + ': immutable Git blob');
    if (hashes) assert.equal(actual.sha256, expected.sha256, expected.path + ': source SHA256');
  }
}
const safeGitEnv = () => {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return {...env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_NO_REPLACE_OBJECTS:'1'};
};
const git = (root,args) => execFileSync('git',['-C',root,...args],{encoding:'utf8',env:safeGitEnv(),timeout:15000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
export function readMain26a4GitTree(root, expectedSha) {
  assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/, 'declared immutable commit required');
  const real = fs.realpathSync(root);
  assert.equal(fs.realpathSync(git(real,['rev-parse','--show-toplevel']).trim()), real, 'root must be its actual Git worktree');
  assert.equal(git(real,['rev-parse','--verify','HEAD^{commit}']).trim(), expectedSha, 'declared commit must match actual HEAD');
  const raw = git(real,['ls-tree','-r','-z','--full-tree',expectedSha]);
  const entries = raw.split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) (blob|tree|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
    assert.ok(match, 'valid immutable tree entry');
    return {mode:match[1],type:match[2],sha:match[3],path:match[4]};
  }).filter(row => included(row.path));
  for (const row of entries) assert.equal(row.type,'blob','no production gitlink or directory leaf');
  return {head:expectedSha,tree:git(real,['rev-parse',expectedSha+'^{tree}']).trim(),entries};
}
export function scanMain26a4Production(root) {
  const rows = [];
  const visit = relative => {
    const file = path.join(root,relative), stat = fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), relative + ': no source symlinks');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (name === 'tests') continue;
        visit(relative + '/' + name);
      }
    } else if (included(relative)) {
      assert.ok(stat.isFile(), relative + ': regular source file required');
      const bytes = fs.readFileSync(file);
      rows.push({path:relative,mode:stat.mode & 0o111 ? '100755':'100644',sha:blob(bytes),sha256:sha256(bytes)});
    }
  };
  for (const relative of [...roots,...scripts]) visit(relative);
  return rows;
}
export function assertMain26a4Contract({mode,sourceBase,sourceHead,baseSha,candidateSha}) {
  assert.equal(mode,MAIN26A4_MODE,'explicit reviewed main26a4 mode required');
  assert.equal(sourceBase,MAIN26A4_SHA,'exact source baseline epoch');
  assert.equal(sourceHead,MAIN26A4_SHA,'exact source candidate epoch');
  assert.equal(baseSha,MAIN26A4_SHA,'actual baseline must be reviewed main26a4');
  assert.match(candidateSha ?? '',/^[0-9a-f]{40}$/,'actual candidate immutable SHA required');
}
export function verifyMain26a4ProductionPair(options) {
  assertMain26a4Contract(options);
  const baseline = fs.realpathSync(options.baseline), candidate = fs.realpathSync(options.candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const result = [];
  for (const [root,commit] of [[baseline,options.baseSha],[candidate,options.candidateSha]]) {
    const before = readMain26a4GitTree(root,commit);
    assertMain26a4Rows(before.entries,false);
    if (root === baseline) assert.equal(before.tree,manifest.sourceTree,'reviewed baseline full Git tree');
    const rows = scanMain26a4Production(root);
    assertMain26a4Rows(rows);
    const after = readMain26a4GitTree(root,commit);
    assert.deepEqual(after,before,'immutable checkout must remain stable during source verification');
    result.push({commit,tree:before.tree,productionLeaves:rows.length});
  }
  return {schema:1,mode:MAIN26A4_MODE,sourceBase:MAIN26A4_SHA,sourceHead:MAIN26A4_SHA,
    declaredBaseCommit:options.baseSha,declaredCandidateCommit:options.candidateSha,
    checkouts:result,canonicalInputs:1362,canonicalInputHash:manifest.canonicalInputHash,
    productionSupersetLeaves:1391,builderPinnedSeparately:true,changes:[],writtenPaths:[],
    scope:'Read-only production source identity at declared actual Git HEADs. No replay or source writes.',
    limitation:'Not a build, runtime, RNG, visual, retail-equivalence or gameplay-improvement result. Final-head emitted and browser comparisons remain required.'};
}
export async function runMain26a4AdmissionCLI(values,role) {
  const options = {baseline:values.get('--baseline'),candidate:values.get('--candidate'),baseSha:values.get('--base-sha'),candidateSha:values.get('--candidate-sha'),mode:values.get('--expected-mode'),sourceBase:values.get('--expected-source-base'),sourceHead:values.get('--expected-source-head')};
  assertMain26a4Contract(options);
  for (const [flag,root] of [['--base-git-root',options.baseline],['--candidate-git-root',options.candidate]])
    if (values.has(flag)) assert.equal(fs.realpathSync(values.get(flag)),fs.realpathSync(root),'main26a4 source must be the actual declared worktree');
  const receipt = values.get('--receipt');
  if (receipt) assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
  const evidence = verifyMain26a4ProductionPair(options);
  if (role === 'controls') {
    let rejected = 0;
    // These are validator controls over already verified real source metadata,
    // not fabricated Git checkouts or claims of a future aggregate pass.
    for (let i = 0; i < leaves.length; i++) {
      const changed = [...leaves];changed[i] = {...leaves[i],sha256:'0'.repeat(64)};
      assert.throws(() => assertMain26a4Rows(changed));rejected++;
    }
    for (const changed of [leaves.slice(1),[...leaves,{...leaves[0],path:'inkwave-public/unreviewed-extra.js'}],[...leaves,leaves[0]]]) {assert.throws(() => assertMain26a4Rows(changed));rejected++;}
    for (const changes of [{mode:'unknown-mode'},{sourceBase:'0'.repeat(40)},{sourceHead:'0'.repeat(40)},{baseSha:'0'.repeat(40)},{candidateSha:'main'}]) {assert.throws(() => assertMain26a4Contract({...options,...changes}));rejected++;}
    evidence.controls={kind:'inventory-and-contract-negative-controls',rejected};
  }
  // Recheck every actual source and Git head after controls, before receipt.
  const expected = {...evidence}; delete expected.controls;
  assert.deepEqual(verifyMain26a4ProductionPair(options), expected, 'actual pair unchanged after controls');
  if (receipt) {
    assertReceiptSeparate(receipt,[options.baseline,options.candidate],leaves.map(row => row.path));
    fs.mkdirSync(path.dirname(receipt),{recursive:true});
    fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify(evidence));
}
