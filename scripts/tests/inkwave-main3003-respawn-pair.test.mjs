import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {RESPAWN3003_BASE as B,RESPAWN3003_HEAD as H,RESPAWN3003_FIXTURE_SHA256,RESPAWN3003_QA_PATHS,
  respawn3003Fixture,respawn3003Epoch,assertRespawn3003Environment,assertRespawn3003Head,assertRespawn3003Inputs,assertRespawn3003Artifacts} from '../lib/inkwave-main3003-respawn-pair.mjs';
import {MAIN3003_HEAD as FIRING_HEAD,main3003Fixture} from '../lib/inkwave-main3003-firing-pair.mjs';
import {currentPairFixture,selectCurrentPair,assertCurrentPairRows,currentPairNegativeControls,verifyCurrentPairCaptureBuild} from '../lib/inkwave-projectile-current-pair.mjs';
const f=respawn3003Fixture(),old=currentPairFixture(),hash=x=>createHash('sha256').update(x).digest('hex');
const event=()=>({number:1860,pull_request:{number:1860,base:{ref:'main',sha:B,repo:{full_name:f.repository}},head:{ref:f.branch,sha:H,repo:{full_name:f.repository}}}});
const select=e=>selectCurrentPair(e,'pull_request',f.repository);

test('PR1860 pins its own complete source/build pair and exact five existing respawn deltas',()=>{
  assert.equal(RESPAWN3003_FIXTURE_SHA256,'584ba3535410e67d2abee64928507c68023735d106373141aeeba1fc5e9e22d8');
  assert.deepEqual(Object.keys(f.epochs),[B,H]);assert.deepEqual(f.epochs[B],main3003Fixture().epochs[B]);
  assert.equal(hash(fs.readFileSync(new URL('../fixtures/inkwave-projectile-current-pair-20261023.json.gz',import.meta.url))),'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9');
  assert.deepEqual(Object.values(old.epochs).map(e=>e.leaves.length),[1458,1458,1461,1460]);
  assert.equal(hash(fs.readFileSync(new URL('../fixtures/inkwave-main3003-firing-pair.json.gz',import.meta.url))),'80824cf99125fdf58a98394e2913764cf18ae1f40bb81f11f83647ab87367f51');
  for(const [epoch,counts]of [[B,[1459,1421,2110]],[H,[1461,1423,2112]]]){
    const e=f.epochs[epoch];assert.deepEqual([e.leaves.length,Object.keys(e.build.files).length,Object.keys(e.build.artifacts).length],counts);
    assertCurrentPairRows(e.leaves,epoch);assertRespawn3003Inputs(e.leaves,epoch);
    for(const name of ['inkwave-audio-manifest.mjs','inkwave-volume-packaging.mjs','inkwave-account-bundle.mjs']){
      const p='scripts/lib/'+name;assert.equal(e.leaves.find(r=>r.path===p).sha256,e.build.files['build-script/lib/'+name]);
    }
    assert.equal(hash(JSON.stringify(e.build.files)),e.build.inputHash);assert.equal(hash(JSON.stringify(e.build.artifacts)),e.build.contentHash);
  }
  assert.equal(f.unchangedPaths.length,1456);
  const before=new Map(f.epochs[B].leaves.map(r=>[r.path,r])),after=new Map(f.epochs[H].leaves.map(r=>[r.path,r]));
  for(const p of f.unchangedPaths)assert.deepEqual(before.get(p),after.get(p),p);
  assert.deepEqual(f.deltas,old.routes.find(r=>r.pr===1860).deltas['7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51']);
  assert.deepEqual(f.deltas.map(r=>r.path),['inkwave-public/src/net/transport.js','patches/splatoon3/runtime/spawn-exclusion.mjs','patches/splatoon3/spawn-exclusion-adapter.mjs','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-build-only-modules.mjs']);
  assert.throws(()=>{respawn3003Epoch(H).leaves[0].sha256='0'.repeat(64);},TypeError);
});

test('owned PR/ref/base/head selection preserves the separate reviewed Firing route',()=>{
  const selected=select(event());assert.equal(selected.sourceHead,H);assert.equal(selected.mode,'oct23-main3003-respawn-source-build-pair');assert(selected.exactRespawn3003);
  for(const mutate of [e=>e.number=1857,e=>e.pull_request.number=1857,e=>e.pull_request.base.sha=H,
    e=>e.pull_request.head.sha=FIRING_HEAD,e=>e.pull_request.head.sha='1d58f3efe923cdd7e470be0e40975c528b3b6ae1',
    e=>e.pull_request.head.sha='0'.repeat(40),e=>e.pull_request.base.sha='a'.repeat(40),e=>e.pull_request.head.sha=B,
    e=>e.pull_request.head.ref+='-other',e=>e.pull_request.base.ref='other',e=>e.pull_request.head.repo.full_name='fork/actions',
    e=>e.pull_request.base.repo.full_name='fork/actions']){const e=event();mutate(e);assert.throws(()=>select(e));}
  assert.throws(()=>selectCurrentPair(event(),'workflow_dispatch',f.repository));assert.throws(()=>selectCurrentPair(event(),'pull_request','fork/actions'));
  const firing=main3003Fixture(),e=event();e.number=e.pull_request.number=1857;e.pull_request.head.ref=firing.branch;e.pull_request.head.sha=FIRING_HEAD;
  assert.equal(select(e).sourceHead,FIRING_HEAD);assert.equal(select(e).mode,'oct23-main3003-firing-source-build-pair');assert(!select(e).exactRespawn3003);
  for(const row of old.routes)for(const base of row.bases){const e=event();e.number=e.pull_request.number=row.pr;e.pull_request.base.sha=base;e.pull_request.head.ref=row.branch;e.pull_request.head.sha=row.sourceHead;assert.equal(select(e).sourceHead,row.sourceHead);}
});

test('only 55c0 or one direct exactly scoped QA successor is allowed; this is not future checker self-authentication',()=>{
  assertRespawn3003Head(H,()=>assert.fail('source label needs no parent lookup'));
  const next='a'.repeat(40),good=args=>args[0]==='show'?H+'\n':RESPAWN3003_QA_PATHS.join('\n')+'\n';assertRespawn3003Head(next,good);
  for(const parents of ['',B,H+' '+B,FIRING_HEAD])assert.throws(()=>assertRespawn3003Head(next,args=>args[0]==='show'?parents:good(args)));
  for(const paths of [RESPAWN3003_QA_PATHS.slice(1),[...RESPAWN3003_QA_PATHS,'inkwave-public/future.js'],[...RESPAWN3003_QA_PATHS,'patches/splatoon3/runtime/spawn-exclusion.mjs']])
    assert.throws(()=>assertRespawn3003Head(next,args=>args[0]==='show'?H:paths.join('\n')));
});

test('all source leaves, helper drift and copied public/nested extras reject without historical replay',()=>{
  assert.equal(currentPairNegativeControls(select(event())).rejected,1459+1461+6);
  for(const epoch of [B,H]){
    const rows=f.epochs[epoch].leaves;
    for(const name of ['inkwave-audio-manifest.mjs','inkwave-volume-packaging.mjs','inkwave-account-bundle.mjs'])for(const mutation of ['byte','missing','mode']){
      const p='scripts/lib/'+name,bad=structuredClone(rows),at=bad.findIndex(r=>r.path===p);assert(at>=0);
      if(mutation==='missing')bad.splice(at,1);else bad[at][mutation==='mode'?'mode':'sha256']=mutation==='mode'?'100755':'0'.repeat(64);
      assert.throws(()=>assertCurrentPairRows(bad,epoch));
    }
    for(const p of ['inkwave-public/tests/extra.mjs','inkwave-public/nested/tests/extra.mjs','inkwave-public/nested/extra.md','patches/splatoon3/runtime/tests/extra.mjs','patches/native-stages/source-inventories/tests/extra.json','patches/loading-cache/runtime/tests/extra.md'])
      assert.throws(()=>assertCurrentPairRows([...rows,{...rows[0],path:p}],epoch));
    const bad=structuredClone(rows);bad.find(r=>r.path==='scripts/lib/inkwave-audio-manifest.mjs').sha256='0'.repeat(64);assert.throws(()=>assertRespawn3003Inputs(bad,epoch));
  }
  assert.throws(()=>assertCurrentPairRows(f.epochs[B].leaves,H));assert.throws(()=>assertCurrentPairRows(main3003Fixture().epochs[FIRING_HEAD].leaves,H));
});

test('external account/native/compiler and diagnostic modes remain outside this exact canonical pair',()=>{
  assertRespawn3003Environment({});
  for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])assert.throws(()=>assertRespawn3003Environment({[key]:'/unreviewed/external'}),new RegExp(key));
  for(const key of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])assert.throws(()=>assertRespawn3003Environment({[key]:'1'}),new RegExp(key));
});

test('respawn artifacts reject unknown labels, manifest drift and linked roots without reading outside',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn3003-artifact-'));
  try{
    fs.writeFileSync(path.join(tmp,'inkwave-build.json'),'{}');assert.throws(()=>assertRespawn3003Artifacts(tmp,H),/exact source-labeled build manifest/);
    assert.throws(()=>assertRespawn3003Artifacts(tmp,FIRING_HEAD),/exact source\/build label/);
    fs.symlinkSync(tmp,tmp+'-link');let reads=0;const read=fs.readFileSync;fs.readFileSync=(...a)=>{reads++;return read(...a);};
    try{assert.throws(()=>assertRespawn3003Artifacts(tmp+'-link',H),/symlinks rejected/);}finally{fs.readFileSync=read;fs.unlinkSync(tmp+'-link');}assert.equal(reads,0);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('required capture closure precedes writes and comparison flags remain enabled for the new owned route',()=>{
  const checker=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.ok(checker.indexOf('const exactBuildClosure=') < checker.indexOf('fs.mkdirSync(evidence,'));
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
  for(const s of ['--mode baseline','--mode candidate','--require-complete','inkwave-main3003-respawn-pair.test.mjs'])assert(workflow.includes(s));
  assert.match(workflow,/permissions:\n  contents: read\n/);assert.equal(verifyCurrentPairCaptureBuild({eventName:'workflow_dispatch'}),null);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn3003-output-'));
  try{
    const file=path.join(tmp,'event.json');fs.writeFileSync(file,JSON.stringify(event()));
    const args={root:tmp,site:path.join(tmp,'site'),eventFile:file,eventName:'pull_request',repository:f.repository};
    assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'after'}),/explicit capture side label/);
    for(const field of ['evidence','profile'])assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'candidate',[field]:args.site}),/overlap an input/);
    assert(!fs.existsSync(args.site),'rejected alias creates no output');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
