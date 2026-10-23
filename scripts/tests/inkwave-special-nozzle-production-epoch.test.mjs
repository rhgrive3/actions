import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {main26a4Inventory, assertMain26a4Rows, readMain26a4GitTree, scanMain26a4Production} from '../lib/inkwave-main26a4-production-epoch.mjs';
import {runtimeUIInventory, assertRuntimeUIRows} from '../lib/inkwave-runtime-ui-production-epoch.mjs';
import {SPECIAL_MODE, specialInventory, assertSpecialRows, assertSpecialContract} from '../lib/inkwave-special-production-epoch.mjs';
import {SPECIAL_NOZZLE_MODE, SPECIAL_NOZZLE_BASE_SHA, specialNozzleInventory, assertSpecialNozzleRows, assertSpecialNozzleContract, verifySpecialNozzleProductionPair, assertSpecialNozzleReceiptSeparate} from '../lib/inkwave-special-nozzle-production-epoch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = process.env.INKWAVE_SPECIAL_NOZZLE_CANDIDATE_ROOT || repo;
const base = runtimeUIInventory(), rows = specialNozzleInventory();
const byPath = new Map(base.map(row => [row.path,row]));
const added = 'patches/splatoon3/runtime/area-special-vfx-clock.mjs';
const changed = [added,'patches/splatoon3/runtime/special-motion.mjs','patches/splatoon3/runtime/special-presentation.mjs','patches/splatoon3/runtime/special-vfx.mjs'];
const contract = {mode:SPECIAL_NOZZLE_MODE,sourceBase:SPECIAL_NOZZLE_BASE_SHA,sourceHead:'a'.repeat(40),baseSha:SPECIAL_NOZZLE_BASE_SHA,candidateSha:'a'.repeat(40)};
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
const git = (root,args,options={}) => execFileSync('git',['-C',root,...args],{encoding:'utf8',env,stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024,...options}).trim();
let scratch, baseline, candidate, head, options;

// Materialize the complete production inventory from actual Git objects, not
// fabricated rows. Independent Git metadata keeps mutation controls private.
function checkout(root,commit,inventory) {
  fs.mkdirSync(root,{recursive:true});
  git(root,['init','--quiet']);
  const stores=[],pending=[git(source,['rev-parse','--path-format=absolute','--git-path','objects'])];
  while(pending.length) {
    const store=fs.realpathSync(pending.shift());if(stores.includes(store))continue;stores.push(store);
    const alternates=path.join(store,'info/alternates');
    if(fs.existsSync(alternates)) for(const line of fs.readFileSync(alternates,'utf8').split('\n').filter(Boolean)) pending.push(path.resolve(store,line));
  }
  fs.writeFileSync(path.join(root,'.git/objects/info/alternates'),stores.join('\n')+'\n');
  git(root,['update-ref','--no-deref','HEAD',commit]);
  git(root,['read-tree',commit]);
  for (const row of inventory) {
    const existing=path.join(source,row.path);
    let bytes=fs.existsSync(existing) ? fs.readFileSync(existing) : null;
    const blob=value => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
    // Sparse local source stores need not carry large unchanged media blobs in
    // Git. Their real materialized bytes are acceptable only at both exact pins.
    if (!bytes || blob(bytes)!==row.sha) bytes=execFileSync('git',['-C',source,'cat-file','blob',row.sha],{env,maxBuffer:4*1024*1024});
    assert.equal(blob(bytes),row.sha); assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    const file=path.join(root,row.path); fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{mode:row.mode==='100755'?0o755:0o644});
  }
}
before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(),'special-nozzle-epoch-'));
  baseline = path.join(scratch,'baseline'); candidate = path.join(scratch,'candidate');
  head = git(source,['rev-parse','HEAD']);
  checkout(baseline,SPECIAL_NOZZLE_BASE_SHA,base); checkout(candidate,head,rows);
  options = {...contract,baseline,candidate,candidateSha:head,sourceHead:head};
});
after(() => { if (scratch) fs.rmSync(scratch,{recursive:true,force:true}); });

function cli(script,receipt,overrides={},tail=[],childEnv=env) {
  const flags = {'--baseline':baseline,'--candidate':candidate,'--base-sha':SPECIAL_NOZZLE_BASE_SHA,'--candidate-sha':head,'--expected-mode':SPECIAL_NOZZLE_MODE,'--expected-source-base':SPECIAL_NOZZLE_BASE_SHA,'--expected-source-head':head,...overrides};
  if (receipt) flags['--receipt']=receipt;
  return spawnSync(process.execPath,[path.join(repo,'scripts',script),...Object.entries(flags).flatMap(([key,value]) => value == null ? [] : [key,value]),...tail],{encoding:'utf8',env:childEnv,maxBuffer:1024*1024});
}
function rejectUnchanged(action,pattern) {
  assert.throws(action,pattern);
  assert.equal(git(candidate,['rev-parse','HEAD']),head);
}
function withBadTree(relative,{mode,sha,remove=false},check) {
  const original = rows.find(row => row.path===relative);
  try {
    if (remove) git(candidate,['update-index','--force-remove','--',relative]);
    else git(candidate,['update-index','--cacheinfo',mode || original.mode,sha || original.sha,relative]);
    const tree = git(candidate,['write-tree','--missing-ok']);
    const mutant = git(candidate,['-c','user.name=Admission QA','-c','user.email=qa@example.invalid','commit-tree',tree,'-p',head],{input:'Closed epoch negative control\n'});
    git(candidate,['update-ref','--no-deref','HEAD',mutant]);
    check({...options,candidateSha:mutant,sourceHead:mutant});
  } finally {
    git(candidate,['update-ref','--no-deref','HEAD',head]); git(candidate,['read-tree',head]);
  }
}

test('closed four-leaf epoch has exact hashes and keeps the three historical inventories distinct',() => {
  assert.equal(base.length,1392); assert.equal(rows.length,1393);
  assertSpecialNozzleRows(rows); assertRuntimeUIRows(base); assertMain26a4Rows(main26a4Inventory()); assertSpecialRows(specialInventory());
  assert.deepEqual(rows.filter(row => row.sha!==byPath.get(row.path)?.sha).map(row => row.path),changed);
  assert.deepEqual(rows.filter(row => !byPath.has(row.path)).map(row => row.path),[added]);
  assert.equal(rows.filter(row => row.sha===byPath.get(row.path)?.sha).length,1389);
  for (const old of [base,main26a4Inventory(),specialInventory()]) assert.throws(() => assertSpecialNozzleRows(old));
  for (const validator of [assertMain26a4Rows,assertRuntimeUIRows,assertSpecialRows]) assert.throws(() => validator(rows));
  const oldContract = {...contract,mode:SPECIAL_MODE}; assertSpecialContract(oldContract);
  assert.throws(() => assertSpecialNozzleContract(oldContract)); assert.throws(() => assertSpecialContract(contract));
  const copy=specialNozzleInventory(); copy[0].sha='bad'; assertSpecialNozzleRows(specialNozzleInventory());
});
test('every partial old/new combination and original e9 epoch rejects',() => {
  for (let mask=0;mask<15;mask++) {
    const partial = rows.flatMap(row => {
      const i=changed.indexOf(row.path);
      return i<0 || (mask & (1<<i)) ? [row] : byPath.has(row.path) ? [byPath.get(row.path)] : [];
    });
    assert.throws(() => assertSpecialNozzleRows(partial),'partial epoch '+mask);
  }
  const old = new Map(specialInventory().map(row => [row.path,row]));
  for (const relative of changed.filter(value => value!==added)) assert.throws(() => assertSpecialNozzleRows(rows.map(row => row.path===relative ? old.get(relative) : row)));
});
test('all 1393 leaves reject independent mode, Git blob and SHA256 drift without hash wildcards',() => {
  for (let i=0;i<rows.length;i++) for (const key of ['mode','sha','sha256']) {
    const bad=[...rows]; bad[i]={...bad[i],[key]:'bad'};
    assert.throws(() => assertSpecialNozzleRows(bad));
    if (key!=='sha256') assert.throws(() => assertSpecialNozzleRows(bad,false));
  }
  for (const bad of [rows.slice(1),[...rows,rows[0]],[...rows,{...rows[0],path:'inkwave-public/unreviewed-nozzle.js'}]]) assert.throws(() => assertSpecialNozzleRows(bad));
});
test('declarations require exact frozen354 and the actual immutable candidate HEAD',() => {
  assertSpecialNozzleContract(contract);
  for (const bad of [{mode:'unknown'},{mode:SPECIAL_MODE},{sourceBase:'0'.repeat(40)},{baseSha:'0'.repeat(40)},{sourceHead:'b'.repeat(40)},{candidateSha:'main'},{candidateSha:SPECIAL_NOZZLE_BASE_SHA,sourceHead:SPECIAL_NOZZLE_BASE_SHA}]) assert.throws(() => assertSpecialNozzleContract({...contract,...bad}));
  rejectUnchanged(() => verifySpecialNozzleProductionPair({...options,candidateSha:'b'.repeat(40),sourceHead:'b'.repeat(40)}),/actual HEAD/);
  rejectUnchanged(() => verifySpecialNozzleProductionPair({...options,baseline:candidate}),/separate actual worktrees/);
  rejectUnchanged(() => verifySpecialNozzleProductionPair({...options,candidate:path.join(candidate,'patches')}),/actual Git worktree/);
});
test('actual final-HEAD Git inventory and all materialized source bytes admit read-only',() => {
  const evidence=verifySpecialNozzleProductionPair(options);
  assert.equal(evidence.sourceHead,head); assert.equal(evidence.productionSupersetLeaves,1393);
  assert.deepEqual(evidence.changes,changed); assert.deepEqual(evidence.writtenPaths,[]);
  assert.deepEqual(evidence.checkouts.map(value => value.productionLeaves),[1392,1393]);
  assert.equal(evidence.checkouts[1].tree,git(source,['rev-parse','HEAD^{tree}']));
  assert.match(evidence.scope,/source admission/); assert.match(evidence.limitation,/Not a build/);
});
for (const relative of changed) test('actual changed leaf rejects dirty, missing, symlink, mode and committed drift: '+relative,() => {
  const file=path.join(candidate,relative), bytes=fs.readFileSync(file), mode=fs.statSync(file).mode;
  try {
    fs.appendFileSync(file,'\n// mutation control\n'); rejectUnchanged(() => verifySpecialNozzleProductionPair(options),/pinned sha/);
    fs.unlinkSync(file); rejectUnchanged(() => verifySpecialNozzleProductionPair(options),/complete production inventory/);
    fs.symlinkSync(path.join(source,relative),file); rejectUnchanged(() => verifySpecialNozzleProductionPair(options),/no source symlinks/);
    fs.unlinkSync(file); fs.writeFileSync(file,bytes); fs.chmodSync(file,0o755); rejectUnchanged(() => verifySpecialNozzleProductionPair(options),/pinned mode/);
    fs.chmodSync(file,mode);
    // Even reviewed worktree bytes cannot conceal an unreviewed committed blob.
    const badSha=git(candidate,['hash-object','-w','--stdin'],{input:'unreviewed nozzle source\n'});
    withBadTree(relative,{sha:badSha},bad => assert.throws(() => verifySpecialNozzleProductionPair(bad),/pinned sha/));
    withBadTree(relative,{mode:'100755'},bad => assert.throws(() => verifySpecialNozzleProductionPair(bad),/pinned mode/));
    withBadTree(relative,{mode:'120000'},bad => assert.throws(() => verifySpecialNozzleProductionPair(bad),/pinned mode/));
    withBadTree(relative,{mode:'160000',sha:head},bad => assert.throws(() => verifySpecialNozzleProductionPair(bad),/no production gitlink/));
    const original=byPath.get(relative);
    withBadTree(relative,original ? {sha:original.sha} : {remove:true},bad => assert.throws(() => verifySpecialNozzleProductionPair(bad),/pinned sha|complete production inventory/));
  } finally { fs.rmSync(file,{force:true}); fs.writeFileSync(file,bytes); fs.chmodSync(file,mode); }
  verifySpecialNozzleProductionPair(options);
});
test('unchanged source drift, baseline dirt and extra actual/untracked/committed production sources reject',() => {
  const relative=rows.find(row => !changed.includes(row.path)).path;
  for (const root of [candidate,baseline]) {
    const file=path.join(root,relative),bytes=fs.readFileSync(file);
    try { fs.appendFileSync(file,'\ndrift\n'); assert.throws(() => verifySpecialNozzleProductionPair(options),/sha|source SHA256|immutable Git blob/); }
    finally { fs.writeFileSync(file,bytes); }
  }
  const extra='patches/splatoon3/runtime/unreviewed-nozzle.mjs',file=path.join(candidate,extra);
  try {
    fs.writeFileSync(file,'unreviewed source\n'); rejectUnchanged(() => verifySpecialNozzleProductionPair(options),/complete production inventory/);
    git(candidate,['add','--',extra]); const mutant=git(candidate,['-c','user.name=Admission QA','-c','user.email=qa@example.invalid','commit-tree',git(candidate,['write-tree','--missing-ok']),'-p',head],{input:'Extra production leaf control\n'});
    git(candidate,['update-ref','--no-deref','HEAD',mutant]); assert.throws(() => verifySpecialNozzleProductionPair({...options,candidateSha:mutant,sourceHead:mutant}),/complete production inventory/);
  } finally { git(candidate,['update-ref','--no-deref','HEAD',head]);git(candidate,['read-tree',head]);fs.rmSync(file,{force:true}); }
  verifySpecialNozzleProductionPair(options);
});
test('actual Git metadata must stay bound despite overridden environment or unrelated git-root declarations',() => {
  const envHead=process.env.GIT_DIR; process.env.GIT_DIR=path.join(baseline,'.git');
  try { assert.equal(readMain26a4GitTree(candidate,head).head,head); } finally { if(envHead===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=envHead; }
  const r=cli('prepare-inkwave-projectile-baseline.mjs',path.join(scratch,'wrong-root.json'),{},['--candidate-git-root',baseline]);
  assert.notEqual(r.status,0);assert.match(r.stderr,/actual declared worktree/);assert.ok(!fs.existsSync(path.join(scratch,'wrong-root.json')));
});
test('receipts reject source aliases, hardlinks, symlinked directories, metadata and new production paths without modifying them',() => {
  const leaf=path.join(candidate,changed[0]),bytes=fs.readFileSync(leaf);
  const hard=path.join(scratch,'hard-receipt'),link=path.join(scratch,'source-receipt'),dir=path.join(scratch,'source-dir');
  fs.linkSync(leaf,hard);fs.symlinkSync(leaf,link);fs.symlinkSync(path.join(candidate,'patches/splatoon3/runtime'),dir);
  for (const receipt of [leaf,hard,link,path.join(dir,'brand-new-receipt.json'),path.join(candidate,'.git/HEAD'),path.join(candidate,'.git/new-receipt'),path.join(baseline,added),path.join(candidate,'patches/splatoon3/runtime/new-receipt.json')]) assert.throws(() => assertSpecialNozzleReceiptSeparate(receipt,[baseline,candidate]));
  assert.deepEqual(fs.readFileSync(leaf),bytes);assert.equal(git(candidate,['rev-parse','HEAD']),head);
  fs.unlinkSync(hard);fs.unlinkSync(link);fs.unlinkSync(dir);
  assertSpecialNozzleReceiptSeparate(path.join(scratch,'valid-receipt.json'),[baseline,candidate]);
});
test('both CLI dispatchers admit the actual final HEAD, preserve sources, and reject declaration/duplicate/receipt failures',() => {
  for (const script of ['prepare-inkwave-projectile-baseline.mjs','check-inkwave-current-pair-controls.mjs']) {
    const receipt=path.join(scratch,script+'.json');const positive=cli(script,receipt);
    assert.equal(positive.status,0,positive.stderr);const evidence=JSON.parse(fs.readFileSync(receipt));
    assert.equal(evidence.mode,SPECIAL_NOZZLE_MODE);assert.equal(evidence.sourceHead,head);assert.deepEqual(evidence.writtenPaths,[]);
    if(script.startsWith('check-')) assert.equal(evidence.controls.rejected,1405);
    const saved=fs.readFileSync(receipt);const collision=cli(script,receipt);assert.notEqual(collision.status,0);assert.deepEqual(fs.readFileSync(receipt),saved);
    for (const override of [{'--expected-source-head':SPECIAL_NOZZLE_BASE_SHA},{'--candidate-sha':'b'.repeat(40),'--expected-source-head':'b'.repeat(40)},{'--base-sha':head},{'--expected-source-base':head},{'--candidate':baseline}]) {
      const rejected=path.join(scratch,'rejected-'+script+'.json'),r=cli(script,rejected,override);assert.notEqual(r.status,0);assert.ok(!fs.existsSync(rejected));
    }
    const duplicate=cli(script,path.join(scratch,'duplicate.json'),{},['--candidate-sha',head]);assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/duplicate/);
    const alias=cli(script,path.join(candidate,'.git/HEAD'));assert.notEqual(alias.status,0);assert.equal(git(candidate,['rev-parse','HEAD']),head);
  }
  verifySpecialNozzleProductionPair(options);
});

// Snapshot actual metadata bytes, including linked-worktree bookkeeping. No
// rejected receipt may leave any new file or alter an existing metadata file.
function metadataSnapshot(directory) {
  const result=[];
  function visit(relative) {
    const file=path.join(directory,relative),stat=fs.lstatSync(file);
    if(stat.isDirectory())for(const name of fs.readdirSync(file).sort())visit(path.join(relative,name));
    else result.push([relative,stat.isSymbolicLink()?fs.readlinkSync(file):createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
  }
  visit('');return result;
}
function checkExternalGitReceipts(root,metadataDirectories,label) {
  const foreign=[
    {GIT_DIR:path.join(baseline,'.git')},
    {GIT_WORK_TREE:baseline},
    {GIT_DIR:path.join(baseline,'.git'),GIT_WORK_TREE:baseline},
  ];
  const snapshots=metadataDirectories.map(metadataSnapshot);
  const alias=path.join(scratch,label+'-metadata-alias');fs.symlinkSync(metadataDirectories[0],alias);
  let serial=0;
  try {
    for(const script of ['prepare-inkwave-projectile-baseline.mjs','check-inkwave-current-pair-controls.mjs']) {
      for(const pollution of foreign)for(const directory of [...metadataDirectories,alias]) {
        const receipt=path.join(directory,'unreviewed-'+label+'-'+serial+++'.json');
        const r=cli(script,receipt,{'--candidate':root},[],{...env,...pollution});
        assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,/receipt must not overwrite actual Git metadata/);
        assert.ok(!fs.existsSync(receipt),'rejected metadata receipt must not be created');
        metadataDirectories.forEach((directory,index)=>assert.deepEqual(metadataSnapshot(directory),snapshots[index]));
      }
      // Legitimate separate/linked worktrees remain admitted in clean and
      // polluted environments when the receipt is safely outside metadata.
      for(const pollution of [{},foreign[2]]) {
        const receipt=path.join(scratch,'valid-'+label+'-'+serial+++'.json');
        const r=cli(script,receipt,{'--candidate':root},[],{...env,...pollution});
        assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(fs.readFileSync(receipt)).sourceHead,head);
        metadataDirectories.forEach((directory,index)=>assert.deepEqual(metadataSnapshot(directory),snapshots[index]));
      }
    }
  } finally {fs.unlinkSync(alias);}
}
test('actual separate gitdir rejects metadata receipts under foreign GIT_DIR and GIT_WORK_TREE without writes',()=>{
  const metadata=path.join(scratch,'separate-actual-git-metadata'),pointer=path.join(candidate,'.git');
  fs.renameSync(pointer,metadata);fs.writeFileSync(pointer,'gitdir: '+metadata+'\n');
  try {
    assert.equal(readMain26a4GitTree(candidate,head).head,head);
    checkExternalGitReceipts(candidate,[metadata],'separate');
  } finally {fs.unlinkSync(pointer);fs.renameSync(metadata,pointer);}
  verifySpecialNozzleProductionPair(options);
});
test('actual linked worktree rejects both private and common metadata receipts under foreign Git environment without writes',()=>{
  const linked=path.join(scratch,'linked-candidate');
  git(candidate,['worktree','add','--quiet','--detach','--no-checkout',linked,head]);
  try {
    for(const row of rows){const file=path.join(linked,row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(candidate,row.path),file);fs.chmodSync(file,row.mode==='100755'?0o755:0o644);}
    const directories=git(linked,['rev-parse','--path-format=absolute','--git-dir','--git-common-dir']).split('\n');
    assert.equal(new Set(directories).size,2,'real linked metadata must have distinct private/common dirs');
    assert.equal(readMain26a4GitTree(linked,head).head,head);
    checkExternalGitReceipts(linked,directories,'linked');
  } finally {git(candidate,['worktree','remove','--force',linked]);}
  verifySpecialNozzleProductionPair(options);
});
