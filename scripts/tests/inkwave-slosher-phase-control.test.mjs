import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture,emitMainShot} from '../../patches/splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../../patches/splatoon3/tests/paint-authority-fixture.mjs';
import {PHASE_INSERT,insertPhase,phaseRoute,verifyPhaseBuilds} from '../lib/inkwave-slosher-phase-control.mjs';
import {installSlosherPhaseObserver} from '../lib/inkwave-slosher-phase-observer.mjs';
import {verifyPhaseTrace} from '../lib/inkwave-slosher-phase-verification.mjs';
import {restoreBeforeSlosherPhaseWorkflow} from '../lib/inkwave-slosher-phase-workflow.mjs';
import {createHash} from 'node:crypto';

const root=new URL('../../',import.meta.url),source=fs.readFileSync(new URL('patches/splatoon3/runtime/main-weapon-catalog.mjs',root),'utf8');
test('native Explosher observer is installed in its contact scenario before fire, never the generic visual loop',()=>{
 const text=fs.readFileSync(new URL('scripts/check-inkwave-projectile-visuals.mjs',root),'utf8');
 const verify=code=>{
  const install="if(scenario.name==='floor-washtub')await page.evaluate(installSlosherPhaseObserver);";
  assert.equal(code.split(install).length,2,'one installation');
  const start=code.indexOf('async function runContactScenarios(page)'),body=code.slice(start,code.indexOf('\nfunction summary(',start));
  assert.ok(body.indexOf(install)>body.indexOf('const { setup, lifecycleReset } = setupResult;'));
  assert.ok(body.indexOf(install)<body.indexOf('const birthResult = await page.evaluate('),'observe actual native controller birth');
 };
 verify(text);
 const install="    if(scenario.name==='floor-washtub')await page.evaluate(installSlosherPhaseObserver);\n";
 const removed=text.replace(install,'');
 assert.throws(()=>verify(removed.replace('async function runVisuals(page) {','async function runVisuals(page) {\n'+install)),'original wrong-loop negative control');
 assert.throws(()=>verify(removed),'missing observer is never an accepted comparison');
});
test('the control applies exactly the accepted eight lines, rejecting duplicates and changed anchors',()=>{
 const old=source.replace(PHASE_INSERT,'');assert.equal(insertPhase(old),source);
 assert.throws(()=>insertPhase(source));assert.throws(()=>insertPhase(old.replace('splashTravel=0','splashTravel=1')));
});
test('only the named aggregate source pair may generate a labeled control',()=>{
 const event={number:1895,pull_request:{number:1895,base:{ref:'main',repo:{full_name:'rhgrive3/actions'}},head:{ref:'integrate/inkwave-bug-batch-20261026-charge-owner',repo:{full_name:'rhgrive3/actions'}}}};
 assert.ok(phaseRoute(event,'rhgrive3/actions','pull_request'));
 for(const change of [e=>e.number++,e=>e.pull_request.head.ref='other',e=>e.pull_request.head.repo.full_name='other/actions',e=>e.pull_request.base.ref='other']){const e=structuredClone(event);change(e);assert.equal(phaseRoute(e,'rhgrive3/actions','pull_request'),false);}
 assert.equal(phaseRoute(event,'rhgrive3/actions','workflow_dispatch'),false);
});
test('build binding rejects any second source change and equal control identities',()=>{
 const key='patch/runtime/main-weapon-catalog.mjs',p='patches/splatoon3/runtime/main-weapon-catalog.mjs';
 const receipt={originalInventory:[{path:p,sha256:'old'}],controlInventory:[{path:p,sha256:'new'}]},original={files:{[key]:'old',other:'same'},contentHash:'a'},control={files:{[key]:'new',other:'same'},contentHash:'b'};
 assert.equal(verifyPhaseBuilds(receipt,original,control).inputs,2);
 assert.throws(()=>verifyPhaseBuilds(receipt,original,{...control,files:{...control.files,other:'changed'}}));
 assert.throws(()=>verifyPhaseBuilds(receipt,original,{...control,contentHash:'a'}));
});
test('exact additive workflow is registered without changing the comparator or historical seal',()=>{
 const workflow=fs.readFileSync(new URL('.github/workflows/inkwave-projectile-visuals.yml',root),'utf8');
 const before=restoreBeforeSlosherPhaseWorkflow(workflow);
 assert.equal(createHash('sha256').update(before).digest('hex'),'6402a428fbc726542c8566537f449bccb7b591bcfb46f0f8b7c234f50ef1ed9d');
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('scripts/compare-inkwave-projectile-captures.py',root))).digest('hex'),'98cbde37607cdfde958991f4b218d04d0fae17e1c956ff67a17e55ec943e1cd7');
 for(const [from,to] of [["fromJSON('[{\"side\":\"phase-control\"}]')","fromJSON('[]')"],['1895','1896'],
  ['72277deadd4e2f36df9bb1fecc56badcd15cfdd0','f41a35346caff97b5eed55a953c7893b344acf09'],
  [' --require-complete',''],['--derived .ci-phase-reference','--derived .'],['--target .ci-scratch/projectile-visuals/after','--target .ci-scratch/projectile-visuals/before'],
  ['--original-build .built-site/phase-original/inkwave-build.json','--original-build .built-site/phase-control/inkwave-build.json']]){
  const changed=workflow.replace(from,to);assert.notEqual(changed,workflow,from);assert.throws(()=>restoreBeforeSlosherPhaseWorkflow(changed));
 }
});

async function observe({old=false,unequalFloor=false}={}){
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>.5,
   adaptRuntime:(rel,code)=>rel==='patches/splatoon3/runtime/main-weapon-catalog.mjs'&&old?code.replace(PHASE_INSERT,''):code});
 f.context.document={hidden:false};let {paint,level,V}=makePaintWorld(f);const a=f.make('s3-slosher-washtub');
 if(unequalFloor){
  // An untouched second projected floor has a different cell area and slope.
  // Use the same real PaintSystem layout/scorer; no rendered-frame claim.
  level.faces.push({...level.faces[0],origin:V(1000,0,1000),su:1.1,sv:1.3,n:V(0,.8,.6),v:V(0,-.6,.8)});
  paint=new paint.constructor(null,level,{atlasSize:4096,maxDensity:30,cell:.3});f.G.paint=paint;
 }
 a.form='kid';a.pos.set(0,0,0);a.character.root.position.copy(a.pos);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,60);f.G.local=a;
 f.context.window={__G:f.G};vm.runInContext('('+installSlosherPhaseObserver.toString()+')()',f.context);
 const observer=f.context.window.__iwSlosherPhaseObserver;emitMainShot(f,a);let impact=false;
 for(let frame=0;frame<90;frame++){
  observer.frame(frame);f.G.time+=1/60;f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);paint.flush(1/60);
  if(frame===15)observer.snapshot('F15');
  if(!f.G.projectiles.list.length&&!impact){observer.snapshot('impact');impact=true;}
 }
 // makePaintWorld uses CpuPaint._initGPU: there is no native GPU lease to dispose.
 const trace=JSON.parse(JSON.stringify(observer.finish()));assert.ok(impact);return trace;
}
test('serialized observer verifies real production cells, credit and release phase; old fallback fails',async()=>{
 if(process.env.INKWAVE_BUILT_SITE){
  const trace=await observe(),old=process.env.INKWAVE_PHASE_EXPECT_OLD==='1';verifyPhaseTrace(trace,{oldFallback:old});
  if(old)assert.throws(()=>verifyPhaseTrace(trace),/source first rate/);
  console.log('emitted production CPU owned-cell proof',JSON.stringify({oldFallback:old,first:trace.birth.initialDistance,cells:trace.cells.length,snapshots:trace.snapshots}));
  if(process.env.INKWAVE_PHASE_TEST_RECEIPT)fs.writeFileSync(process.env.INKWAVE_PHASE_TEST_RECEIPT,JSON.stringify({scope:'actual emitted production CPU Physics/Paint/Actor, GPU stub; not native52',oldFallback:old,trace},null,2)+'\n');
  return;
 }
 const trace=await observe();assert.deepEqual(trace.failures,[]);const result=verifyPhaseTrace(trace);
 assert.equal(result.first,(.5+(.55-.5)*.5)*3.1);assert.ok(result.observedCellChanges>0);assert.ok(result.creditedCalls>0);
 const old=await observe({old:true});verifyPhaseTrace(old,{oldFallback:true});assert.throws(()=>verifyPhaseTrace(old),/source first rate/);
 console.log('production CPU phase / owned-cell proof',JSON.stringify({old:{first:old.birth.initialDistance,cells:old.cells.length,snapshots:old.snapshots},corrected:{first:trace.birth.initialDistance,cells:trace.cells.length,snapshots:trace.snapshots}}));
 if(process.env.INKWAVE_PHASE_TEST_RECEIPT)fs.writeFileSync(process.env.INKWAVE_PHASE_TEST_RECEIPT,JSON.stringify({scope:'controlled production CPU Physics/Paint/Actor, GPU stub; not native 52 screenshots',old,corrected:trace},null,2)+'\n');
 assert.notDeepEqual(trace.cells,old.cells,'phase really changes the physical owned cells');
 const edited=structuredClone(trace);edited.credits.find(c=>c.area>0).cellArea+=1;assert.throws(()=>verifyPhaseTrace(edited));
 const sp=structuredClone(trace);sp.credits.find(c=>c.area>0).after.special+=1;assert.throws(()=>verifyPhaseTrace(sp));
 const dropped=structuredClone(trace);dropped.failures.push('unobserved paint cell');assert.throws(()=>verifyPhaseTrace(dropped));
});
test('coverage accounting uses projected floor area, not counts, on unequal cells and slopes',async()=>{
 const trace=await observe({unequalFloor:true});verifyPhaseTrace(trace);
 assert.ok(trace.coverageFaces.some(f=>f.normalY===.8));
 assert.ok(trace.snapshots.some(s=>s.coverage[0]!==s.counts[0]/s.turfTotal),'old unweighted observer is a real negative control');
});
test('buried body writes are diagnosed without granting turf/SP; unexplained eligible writes still fail',async()=>{
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true});f.context.document={hidden:false};
 const {paint,V}=makePaintWorld(f,{occluded:true}),a=f.make('s3-slosher-washtub');f.G.local=a;f.context.window={__G:f.G};
 vm.runInContext('('+installSlosherPhaseObserver.toString()+')()',f.context);const observer=f.context.window.__iwSlosherPhaseObserver;
 a.addTurf(paint.splat(V(0,0,5),2,0,{seed:.5,claimOwner:a,instant:true}));
 const trace=JSON.parse(JSON.stringify(observer.finish()));assert.deepEqual(trace.failures,[]);assert.ok(trace.nonScoringChanges.length>0);
 assert.ok(trace.nonScoringChanges.every(c=>c.dead&&c.turf&&!c.pointEligible));assert.equal(a.stats.turf,0);assert.equal(a.special,0);
 const clean=makePaintWorld(f);f.context.window={__G:f.G};vm.runInContext('('+installSlosherPhaseObserver.toString()+')()',f.context);
 const before=clean.paint.grid.findIndex((_,i)=>!clean.paint.dead[i]);clean.paint.grid[before]=1;
 const bad=f.context.window.__iwSlosherPhaseObserver.finish();assert.ok(bad.failures.some(s=>s.startsWith('unobserved paint cell')),'eligible ownership remains a hard failure');
});
