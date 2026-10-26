import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {captureMatrix,NEXT_BASELINE_SHA,NEXT_SUITES,EXCLUDED_NEXT_SUITES,BASELINE_SHA,expectedNextStates,assertMatchedProjection} from '../check-inkwave-reticle-visual-review.mjs';
import {SHAPE_CASES,SHAPE_PHASES,assertShapeSample} from '../lib/reticle-next/shapes-recipe.mjs';
import {DUALIES_PHASES} from '../lib/reticle-next/dualies-recipe.mjs';
import {BAMBOO_PHASES,PENCIL_PHASES} from '../lib/reticle-next/charger-recipe.mjs';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const runner=read('../check-inkwave-reticle-visual-review.mjs');
const workflow=read('../../.github/workflows/inkwave-reticle-next-visual-review.yml');
test('four narrow next suites are explicit native60Hz-physics desktop with exact planned state counts; mobile excluded',()=>{
 assert.equal(NEXT_BASELINE_SHA,'e0072a749df0ec8c2d368e383bdf337baa7b44ad');
 assert.equal(BASELINE_SHA,'7f863ea2d65671abd1453fdae1b61de00f1d10e2');
 assert.deepEqual(NEXT_SUITES,['next-shapes','next-dualies','next-bamboo','next-pencil']);
 const matrices=NEXT_SUITES.map(suite=>captureMatrix(['--suite='+suite,'--viewport=desktop']));
 assert.deepEqual(matrices.map(m=>m.screenshotStateCount),[SHAPE_CASES.length*SHAPE_PHASES.length,DUALIES_PHASES.length,BAMBOO_PHASES.length,PENCIL_PHASES.length]);
 assert.deepEqual(matrices.map(m=>m.screenshotStateCount),[8,9,6,10]);
 assert.deepEqual(matrices.map(m=>m.renderHz),[30,60,30,30]);
 assert(matrices.every(m=>m.viewports.length===1&&m.viewports[0].deviceScaleFactor===1));
 assert.match(EXCLUDED_NEXT_SUITES['next-mobile-layout'],/Not implemented/);
 for(const suite of NEXT_SUITES){assert.throws(()=>captureMatrix(['--suite='+suite]));assert.throws(()=>captureMatrix(['--suite='+suite,'--viewport=desktop','--render-hz='+(suite==='next-dualies'?30:60)]));}
 assert.throws(()=>captureMatrix(['--suite=next-mobile-layout','--viewport=mobile']));
});
test('shape evidence fails closed on missing art, wrong ring, invented airborne/accepted fire',()=>{
 const art={display:'inline',bounds:{width:80,height:80}};
 for(const before of [true,false])for(const scenario of SHAPE_CASES)for(const phase of SHAPE_PHASES){
  const row={weaponId:scenario.id,hudWeapon:scenario.id,kind:scenario.kind,chargerShape:null,grounded:phase!=='air-fire',shots:[{weaponId:scenario.id,grounded:phase!=='air-fire'}],
   [scenario.name]:before?[]:[art],ticks:[{display:'none'}],rings:[{tag:'circle',display:before?'inline':'none',r:'23'},{tag:'circle',display:'inline',r:before?'9':'13'}]};
  assertShapeSample(row,scenario,phase,{before});
  if(phase==='air-fire')assert.throws(()=>assertShapeSample({...row,grounded:true},scenario,phase,{before}));
  if(phase.endsWith('fire'))assert.throws(()=>assertShapeSample({...row,shots:[]},scenario,phase,{before}));
  if(!before)assert.throws(()=>assertShapeSample({...row,[scenario.name]:[]},scenario,phase,{before}));
 }
});
test('production capture keeps exact source and recipe identity, original PNGs, after-capture state checks and owned cleanup',()=>{
 for(const fragment of ['recipeSha256','probeSha256','contentHash','imageSha256','imagePixels','surfaceBefore','surfaceAfter','assertNextSnapshot(afterCapture','afterCapture.next,row.next','row.recipe=recipeMeta'])assert(runner.includes(fragment),fragment);
 assert.match(runner,/page\.mouse\.click/);assert.match(runner,/waitForFunction\(\(\)=>window\.__G\.input\.locked/);
 assert.doesNotMatch(runner,/\.setContent\(|debug\.step\(|pkill|killall/);
});
test('next workflow is isolated, source-pinned, all four siblings independent and no mobile/retail/full gate claim',()=>{
 assert.match(workflow,/paths: \['diagnostics\/inkwave-reticle-next-visuals\.trigger\.json'\]/);
 assert.match(workflow,/suite: \[next-shapes, next-dualies, next-bamboo, next-pencil\]/);
 assert.match(workflow,/BASELINE_SHA: e0072a749df0ec8c2d368e383bdf337baa7b44ad/);
 assert.match(workflow,/ref: e0072a749df0ec8c2d368e383bdf337baa7b44ad/);
 assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);assert.match(workflow,/fail-fast: false/);
 assert.equal((workflow.match(/timeout --signal=TERM --kill-after=15s 700s node/g)||[]).length,2);
 assert.match(workflow,/steps\.baseline-cleanup\.outcome == 'success'/);
 assert.match(workflow,/retailParity:'unverified',fullAcceptance:false/);
 assert.match(workflow,/No mobile acceptance, full CI, retail parity or independent image review is certified/);
 assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|schedule:|continue-on-error/);
});

test('named next states include real scoped control and same-camera pair rejects projection drift',()=>{
 const states=NEXT_SUITES.flatMap(expectedNextStates);assert.equal(states.length,33);
 assert.equal(new Set(states.map(s=>[s.weaponId,s.phase].join('|'))).size,33);
 assert(expectedNextStates('next-pencil').some(s=>s.weaponId==='s3-charger-normalscope'&&s.phase==='scope-full'));
 const s={viewport:{width:1280,height:720},dpr:1,canvas:{width:960,height:540,pixelRatio:.75},position:[0,1,0],camera:[0,2,3],fov:55,aspect:16/9,yaw:0,pitch:-.12};
 assertMatchedProjection(s,{...s});assert.throws(()=>assertMatchedProjection(s,{...s,fov:54}));assert.throws(()=>assertMatchedProjection(s,{...s,camera:[0,2,3.1]}));
});
