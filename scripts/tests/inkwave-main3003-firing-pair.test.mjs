import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {MAIN3003_BASE as B,MAIN3003_HEAD as H,MAIN3003_QA_PATHS,main3003Fixture,main3003Epoch,assertMain3003Environment,assertMain3003Head,assertMain3003Inputs,assertMain3003Artifacts} from '../lib/inkwave-main3003-firing-pair.mjs';
import {currentPairFixture,selectCurrentPair,assertCurrentPairRows,currentPairNegativeControls,verifyCurrentPairCaptureBuild} from '../lib/inkwave-projectile-current-pair.mjs';
const f=main3003Fixture(),old=currentPairFixture(),hash=x=>createHash('sha256').update(x).digest('hex');
const event=()=>({number:1857,pull_request:{number:1857,base:{ref:'main',sha:B,repo:{full_name:'rhgrive3/actions'}},head:{ref:f.branch,sha:H,repo:{full_name:'rhgrive3/actions'}}}});
const select=e=>selectCurrentPair(e,'pull_request','rhgrive3/actions');

test('main3003 pair closes both real source/input/artifact inventories and leaves every historical epoch intact',()=>{
  assert.deepEqual(Object.keys(f.epochs),[B,H]);
  assert.deepEqual(Object.values(old.epochs).map(e=>e.leaves.length),[1458,1458,1461,1460]);
  assert.equal(hash(fs.readFileSync(new URL('../fixtures/inkwave-projectile-current-pair-20261023.json.gz',import.meta.url))),'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9');
  for(const [epoch,counts]of [[B,[1459,1421,2110]],[H,[1462,1424,2116]]]){
    const e=f.epochs[epoch];assert.deepEqual([e.leaves.length,Object.keys(e.build.files).length,Object.keys(e.build.artifacts).length],counts);
    assertCurrentPairRows(e.leaves,epoch);assertMain3003Inputs(e.leaves,epoch);
    for(const name of ['inkwave-audio-manifest.mjs','inkwave-volume-packaging.mjs','inkwave-account-bundle.mjs']){
      const p='scripts/lib/'+name;assert.ok(f.scripts.includes(p));
      assert.equal(e.leaves.find(r=>r.path===p).sha256,e.build.files['build-script/lib/'+name],p);
    }
    assert.equal(hash(JSON.stringify(e.build.files)),e.build.inputHash);assert.equal(hash(JSON.stringify(e.build.artifacts)),e.build.contentHash);
    assert.match(e.build.manifestSha256,/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(e.build.artifacts,'inkwave-build.json'));
  }
  const before=new Map(f.epochs[B].leaves.map(r=>[r.path,r])),after=new Map(f.epochs[H].leaves.map(r=>[r.path,r]));
  assert.equal(f.unchangedPaths.length,1458);for(const p of f.unchangedPaths)assert.deepEqual(before.get(p),after.get(p),p);
  assert.deepEqual(f.deltas,old.routes[0].deltas['7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51']);
  const prior=new Map(old.epochs[old.routes[0].sourceHead].leaves.map(r=>[r.path,r]));
  for(const p of f.deltas.map(r=>r.path))assert.deepEqual(after.get(p),prior.get(p),'approved firing leaf '+p);
  assert.throws(()=>{main3003Epoch(H).leaves[0].sha256='0'.repeat(64);},TypeError,'export cannot mutate a pin');
});

test('only canonical build inputs are enrolled; external account/native/compiler bodies and diagnostic modes fail',()=>{
  assertMain3003Environment({});assertMain3003Environment({INKWAVE_BUILD_UNMINIFIED:'0',INKWAVE_NO_THREE_SHAKE:'0'});
  for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])
    assert.throws(()=>assertMain3003Environment({[key]:'/owned/test-only-external-input'}),new RegExp(key));
  for(const key of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])
    assert.throws(()=>assertMain3003Environment({[key]:'1'}),new RegExp(key));
});

test('only owned PR1857 selects the new exact base/head labels; future, reversal and partial selectors fail',()=>{
  assert.equal(select(event()).sourceHead,H);assert.equal(select(event()).baseSha,B);
  assert.equal(select(event()).fixtureSha256,'80824cf99125fdf58a98394e2913764cf18ae1f40bb81f11f83647ab87367f51');
  for(const mutate of [e=>e.number=1860,e=>e.pull_request.number=1860,e=>e.pull_request.base.sha=H,
    e=>{e.number=e.pull_request.number=1860;e.pull_request.head.ref=old.routes[1].branch;},
    e=>e.pull_request.base.sha='a'.repeat(40),e=>e.pull_request.head.sha=B,e=>e.pull_request.head.sha='',
    e=>e.pull_request.head.ref+='-other',e=>e.pull_request.base.ref='other',e=>e.pull_request.head.repo.full_name='fork/actions']){
    const e=event();mutate(e);assert.throws(()=>select(e));
  }
  for(const r of old.routes)for(const base of r.bases){const e=event();e.number=e.pull_request.number=r.pr;e.pull_request.head.ref=r.branch;e.pull_request.head.sha=r.sourceHead;e.pull_request.base.sha=base;assert.equal(select(e).sourceHead,r.sourceHead);}
});

test('new epoch rejects every drifted leaf, missing/extra/duplicate/mode and mixed source tuples',()=>{
  assert.equal(currentPairNegativeControls(select(event())).rejected,1459+1462+6);
  for(const epoch of [B,H]){
    const rows=f.epochs[epoch].leaves;
    for(const key of ['sha','mode']){const bad=structuredClone(rows);bad[0][key]='bad';assert.throws(()=>assertCurrentPairRows(bad,epoch,false));}
    const inputs=structuredClone(rows),target=inputs.find(r=>r.path==='inkwave-public/src/game/weapons.js');target.sha256='0'.repeat(64);assert.throws(()=>assertMain3003Inputs(inputs,epoch));
  }
  assert.throws(()=>assertCurrentPairRows(f.epochs[B].leaves,H));
  assert.throws(()=>assertCurrentPairRows(f.epochs[H].leaves,B));
});

test('only fc4 or one direct QA successor with exactly the reviewed seven paths may declare the new head',()=>{
  assertMain3003Head(H,()=>assert.fail('fc4 has no QA-parent query'));
  const next='a'.repeat(40),good=args=>args[0]==='show'?H+'\n':MAIN3003_QA_PATHS.join('\n')+'\n';assertMain3003Head(next,good);
  for(const query of [args=>args[0]==='show'?'b'.repeat(40):good(args),args=>args[0]==='show'?good(args):MAIN3003_QA_PATHS.slice(1).join('\n'),args=>args[0]==='show'?good(args):[...MAIN3003_QA_PATHS,'inkwave-public/future.js'].join('\n')])assert.throws(()=>assertMain3003Head(next,query));
});

test('missing shallow parent metadata and synthetic merge heads cannot masquerade as a capture head',()=>{
  // General test jobs may themselves use a shallow synthetic merge. Only the
  // capture verifier declares a head; do not impose that role on this runner.
  for(const parents of ['',B+' '+H]){
    assert.throws(()=>assertMain3003Head('a'.repeat(40),args=>{
      assert.equal(args[0],'show','reject before a diff against unavailable history');return parents;
    }),/one reviewed QA-only successor/);
  }
});

test('artifact checking rejects wrong manifests and linked roots before reading outside bytes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'main3003-artifact-'));
  try{
    fs.writeFileSync(path.join(root,'inkwave-build.json'),'{}');assert.throws(()=>assertMain3003Artifacts(root,H),/exact source-labeled build manifest/);
    const link=root+'-link';fs.symlinkSync(root,link);let reads=0;const read=fs.readFileSync;
    fs.readFileSync=(...a)=>{reads++;return read(...a);};try{assert.throws(()=>assertMain3003Artifacts(link,H),/symlinks rejected/);}finally{fs.readFileSync=read;fs.unlinkSync(link);}
    assert.equal(reads,0);assert.throws(()=>assertMain3003Artifacts(root,'f'.repeat(40)),/exact source\/build label/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('existing required captures enforce build closure before generic file reads without permission or comparison changes',()=>{
  const checker=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.ok(checker.indexOf('const exactBuildClosure=')<checker.indexOf('const manifest = JSON.parse'));
  assert.match(checker,/main3003-build-closure.json/);
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
  assert.match(workflow,/permissions:\n  contents: read\n/);assert.match(workflow,/inkwave-main3003-firing-pair.test.mjs/);
  assert.match(workflow,/ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}\n          fetch-depth: 2/);
  assert.match(workflow,/--mode baseline/);assert.match(workflow,/--mode candidate/);assert.match(workflow,/--require-complete/);
  assert.equal(verifyCurrentPairCaptureBuild({eventName:'workflow_dispatch'}),null);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'main3003-labels-'));
  try{
    const file=path.join(root,'event.json');fs.writeFileSync(file,JSON.stringify(event()));
    const args={eventFile:file,eventName:'pull_request',repository:'rhgrive3/actions',root,site:path.join(root,'site')};
    assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'after'}),/explicit capture side label/);
    assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'candidate',evidence:args.site}),/outputs must be separate/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
