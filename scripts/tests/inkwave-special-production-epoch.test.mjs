import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {originalSpecialEpochSource} from './fixtures/inkwave-special-original-sources.mjs';
import {main26a4Inventory,assertMain26a4Rows,readMain26a4GitTree,scanMain26a4Production} from '../lib/inkwave-main26a4-production-epoch.mjs';
import {runtimeUIInventory,assertRuntimeUIRows} from '../lib/inkwave-runtime-ui-production-epoch.mjs';
import {SPECIAL_MODE,SPECIAL_BASE_SHA,specialInventory,assertSpecialRows,assertSpecialContract} from '../lib/inkwave-special-production-epoch.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const rows=specialInventory(),base=runtimeUIInventory(),byPath=new Map(base.map(row=>[row.path,row]));
const added='patches/splatoon3/runtime/area-special-vfx-clock.mjs';
const changed=[added,'patches/splatoon3/runtime/special-presentation.mjs','patches/splatoon3/runtime/special-vfx.mjs'];
const contract={mode:SPECIAL_MODE,sourceBase:SPECIAL_BASE_SHA,sourceHead:'a'.repeat(40),baseSha:SPECIAL_BASE_SHA,candidateSha:'a'.repeat(40)};
test('closed three-leaf special epoch preserves all 1390 other leaves and historical validators',()=>{
 assert.equal(base.length,1392);assert.equal(rows.length,1393);
 assertSpecialRows(rows);assertRuntimeUIRows(base);assertMain26a4Rows(main26a4Inventory());
 assert.deepEqual(rows.filter(row=>row.sha!==byPath.get(row.path)?.sha).map(row=>row.path),changed);
 assert.deepEqual(rows.filter(row=>!byPath.has(row.path)).map(row=>row.path),[added]);
 assert.equal(rows.filter(row=>row.sha===byPath.get(row.path)?.sha).length,1390);
 assert.throws(()=>assertRuntimeUIRows(rows));assert.throws(()=>assertSpecialRows(base));assert.throws(()=>assertMain26a4Rows(rows));
 const copy=specialInventory();copy[0].sha='bad';assertSpecialRows(specialInventory());
});
test('every partial old/new combination rejects, including helper-only and one changed module',()=>{
 for(let mask=0;mask<7;mask++){
  const mixed=rows.flatMap(row=>{const i=changed.indexOf(row.path);return i<0||(mask&(1<<i))?[row]:byPath.has(row.path)?[byPath.get(row.path)]:[];});
  assert.throws(()=>assertSpecialRows(mixed),'partial special mask '+mask);
 }
});
test('all leaves independently reject SHA256 drift and Git mode/blob changes',()=>{
 for(let i=0;i<rows.length;i++)for(const key of ['mode','sha','sha256']){
  const bad=[...rows];bad[i]={...bad[i],[key]:'bad'};assert.throws(()=>assertSpecialRows(bad));
  if(key!=='sha256')assert.throws(()=>assertSpecialRows(bad,false));
 }
 for(const bad of [rows.slice(1),[...rows,rows[0]],[...rows,{...rows[0],path:'inkwave-public/unknown.js'}],rows.map(row=>row.path===added?{...row,path:added+'.other'}:row)])assert.throws(()=>assertSpecialRows(bad));
});
test('source epoch binds actual declared SHA and explicit mode without admitting baseline or labels',()=>{
 assertSpecialContract(contract);
 for(const change of [{mode:'unknown'},{mode:'main26a4-reviewed-runtime-ui-production-pair'},{baseSha:'0'.repeat(40)},{sourceBase:'0'.repeat(40)},{sourceHead:'b'.repeat(40)},{candidateSha:'main'},{candidateSha:SPECIAL_BASE_SHA,sourceHead:SPECIAL_BASE_SHA}])assert.throws(()=>assertSpecialContract({...contract,...change}));
});
for(const relative of changed)test('real Git plus source scanner detects dirty, missing, symlink and extra '+relative,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'special-epoch-source-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 const file=path.join(root,relative),pin=rows.find(row=>row.path===relative);
 const project=()=>scanMain26a4Production(root).find(row=>row.path===relative);
 try{
  for(const dir of ['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  for(const row of base.filter(row=>row.path.startsWith('scripts/'))){const f=path.join(root,row.path);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'focused scanner fixture, not a full production tree');}
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,originalSpecialEpochSource(relative) ?? fs.readFileSync(path.join(repo,relative)));
  git('init','--quiet');git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','--quiet','-m','focused special fixture');
  const head=git('rev-parse','HEAD');assert.equal(readMain26a4GitTree(root,head).entries.find(row=>row.path===relative).sha,pin.sha);assert.deepEqual(project(),pin);
  fs.appendFileSync(file,'\n// dirty\n');assert.equal(readMain26a4GitTree(root,head).head,head);assert.throws(()=>assertSpecialRows(rows.map(row=>row.path===relative?project():row)));
  fs.unlinkSync(file);assert.equal(project(),undefined);assert.throws(()=>assertSpecialRows(rows.filter(row=>row.path!==relative)));
  fs.symlinkSync(path.join(repo,relative),file);assert.throws(()=>project(),/no source symlinks/);fs.unlinkSync(file);
  const unknown='patches/splatoon3/runtime/unknown-special.mjs';fs.writeFileSync(path.join(root,unknown),'unknown');const extra=scanMain26a4Production(root).find(row=>row.path===unknown);assert.ok(extra);assert.throws(()=>assertSpecialRows([...rows,extra]));
  assert.throws(()=>readMain26a4GitTree(root,SPECIAL_BASE_SHA),/actual HEAD/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('both actual CLI dispatchers reject an incorrectly bound special SHA before historical logic',()=>{
 for(const script of ['prepare-inkwave-projectile-baseline.mjs','check-inkwave-current-pair-controls.mjs']){
  const r=spawnSync(process.execPath,[path.join(repo,'scripts',script),'--baseline',repo,'--candidate',repo,'--receipt','/unused-special-receipt','--base-sha',SPECIAL_BASE_SHA,'--candidate-sha',contract.candidateSha,'--expected-mode',SPECIAL_MODE,'--expected-source-base',SPECIAL_BASE_SHA,'--expected-source-head',SPECIAL_BASE_SHA],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/candidate source epoch must be its actual declared Git HEAD/);
 }
});

test('original mode rejects current four-leaf runtime presentation and VFX bytes without changing its pins',()=>{
 for(const relative of changed.filter(value=>value!==added)){
  const bytes=fs.readFileSync(path.join(repo,relative)),pin=rows.find(row=>row.path===relative);
  const actual={...pin,sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha256:createHash('sha256').update(bytes).digest('hex')};
  assert.notEqual(actual.sha,pin.sha,'current runtime must not become the historical positive fixture');
  assert.throws(()=>assertSpecialRows(rows.map(row=>row.path===relative?actual:row)));
  const historical=originalSpecialEpochSource(relative);assert.ok(historical);historical[0]^=1;
  assert.notDeepEqual(historical,originalSpecialEpochSource(relative),'fixture callers cannot mutate saved historical bytes');
 }
});
