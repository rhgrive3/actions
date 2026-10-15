import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertExactMapDelta,controls,verifyHiddenCounts,assertCandidateSnapshot,verifyControl} from '../lib/inkwave-crowd-integration.mjs';
test('single-change controls bind exact reviewed paths',()=>{
 assert.deepEqual(Object.keys(controls.rig).sort(),['patches/local-quality/adapter.mjs','patches/local-quality/retarget-branch-update-adapter.mjs','scripts/lib/inkwave-build-only-modules.mjs']);
 assert.deepEqual(Object.keys(controls.hidden).sort(),['patches/splatoon3/adapter.mjs','patches/splatoon3/runtime/weapon-models/kit.mjs']);
});
test('exact delta guard rejects missing, extra and absent changes',()=>{
 assert.deepEqual(assertExactMapDelta({a:'1',b:'2'},{a:'1',b:'3'},['b'],'delta'),['b']);
 assert.deepEqual(assertExactMapDelta({a:'1'},{a:'1',b:'2'},['b'],'delta'),['b']);
 for(const [before,after,expected] of [[{a:1},{a:1},['a']],[{a:1},{a:2,b:3},['a']],[{a:1,b:2},{a:1},[]]]) assert.throws(()=>assertExactMapDelta(before,after,expected,'reject'));
});
test('combined browser gate retains original strict comparators and exact source SHA',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/inkwave-crowd-integration.yml',import.meta.url),'utf8');
 for(const s of ['github.event.pull_request.head.sha || github.sha','compare-inkwave-crowd-rig.mjs','compare-inkwave-empty-weapon-draws.py','diagnose-inkwave-native-ray-live-equivalence.mjs','verify-inkwave-crowd-integration-png.py','contents: read','fail-fast: false']) assert(w.includes(s),s);
 assert(!w.includes('continue-on-error'));
});

test('fixed hidden draw accounting rejects understated or unrelated deltas',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-integration-counts-'));
 try {
  const tiers={'full-game':[361,289],'weapons-game':[217,145],'full-far':[217,217],'weapons-far':[105,105]};
  const results={};
  for(const variant of ['A','B','B2','A2']) {
   const after=variant.startsWith('B'); const r={fixture:{actors:8},tiers:{}};
   for(const [tier,counts] of Object.entries(tiers)){const near=tier.endsWith('game'),zero=near?(after?20:56):0; r.tiers[tier]={preparation:{zero,nonzero:counts[after?1:0]-zero,triangles:1000-(near&&after?36:0)}};}
   results[variant]=r;fs.mkdirSync(path.join(root,variant));fs.writeFileSync(path.join(root,variant,'result.json'),JSON.stringify(r));
  }
  assert.equal(verifyHiddenCounts(root).accepted,true);
  for(const variant of ['B','B2']) {results[variant].tiers['full-game'].preparation.nonzero++;fs.writeFileSync(path.join(root,variant,'result.json'),JSON.stringify(results[variant]));}
  assert.throws(()=>verifyHiddenCounts(root));
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('candidate snapshot fails closed on altered product, unexpected source, working edits or ancestry',()=>{
 const sha='a'.repeat(40),expected={main:'b'.repeat(40),parents:['c','d','e','f'].map(x=>x.repeat(40)),selected:{'product.mjs':{sha:'blob-product'}},liveEvidenceFiles:{'observer.mjs':'blob-observer'},supportFiles:['observer.mjs','gate.mjs']};
 const valid={head:sha,parents:[expected.main,...expected.parents],workingChanges:'',blobs:{'product.mjs':'blob-product','observer.mjs':'blob-observer'},changes:['gate.mjs','observer.mjs','product.mjs']};
 assertCandidateSnapshot(valid,sha,expected);
 for(const mutate of [s=>s.blobs['product.mjs']='wrong',s=>s.blobs['observer.mjs']='wrong',s=>s.changes.push('unexpected.mjs'),s=>s.changes.pop(),s=>s.workingChanges='product.mjs',s=>s.parents.reverse(),s=>s.head='0'.repeat(40)]) {const changed=structuredClone(valid);mutate(changed);assert.throws(()=>assertCandidateSnapshot(changed,sha,expected));}
});
test('control verifier rejects extra and missing edited paths in an actual Git checkout',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-integration-control-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try {
  git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.invalid');
  const files=[...Object.keys(controls.rig),'unrelated.mjs'];
  for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'original\n');}
  git('add','.');git('commit','-qm','test fixture');
  assert.throws(()=>verifyControl(root,'rig'),/control-only changed paths/);
  for(const file of files)fs.writeFileSync(path.join(root,file),'changed\n');
  assert.throws(()=>verifyControl(root,'rig'),/control-only changed paths/);
  git('restore','unrelated.mjs');git('restore',Object.keys(controls.rig)[0]);
  assert.throws(()=>verifyControl(root,'rig'),/control-only changed paths/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('budget-only successor preserves the prior candidate as the exact sixth parent',()=>{
 const sha='a'.repeat(40),expected={main:'b'.repeat(40),parents:['c','d','e','f'].map(x=>x.repeat(40)),previousIntegrationHead:'1'.repeat(40),selected:{'product.mjs':{sha:'product'},'.github/workflows/validate-inkwave-update.yml':{sha:'old-budget'}},liveEvidenceFiles:{},supportFiles:[],ciBudgetChange:{file:'.github/workflows/validate-inkwave-update.yml',candidateBlob:'new-budget'}};
 const valid={head:sha,parents:[expected.main,...expected.parents,expected.previousIntegrationHead],workingChanges:'',blobs:{'product.mjs':'product','.github/workflows/validate-inkwave-update.yml':'new-budget'},changes:['.github/workflows/validate-inkwave-update.yml','product.mjs']};
 assertCandidateSnapshot(valid,sha,expected);
 for(const mutate of [s=>s.parents.pop(),s=>s.parents.push('2'.repeat(40)),s=>s.blobs['product.mjs']='wrong',s=>s.blobs['.github/workflows/validate-inkwave-update.yml']='old-budget']) {const changed=structuredClone(valid);mutate(changed);assert.throws(()=>assertCandidateSnapshot(changed,sha,expected));}
});
