// Reduced harness/DOM contract tests only. Not actual browser CSS/GPU evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waitForShapeCaptureSettlement} from '../lib/reticle-next/shapes-capture-settlement.mjs';
const helperSource=fs.readFileSync(new URL('../lib/reticle-next/shapes-capture-settlement.mjs',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
async function fixture(fn,{settleAt=7,perpetual=false,mutateAt=null,mutate=()=>{}}={}){
  const keys=['window','requestAnimationFrame','cancelAnimationFrame','getComputedStyle'],saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  let frame=0,forbiddenFrames=0;const vec=v=>({toArray:()=>[...v]});
  const geometry=()=>frame<settleAt?80+(settleAt-frame)*.25:80;
  const node={isConnected:true,tagName:'svg',getAttribute:()=> 'iw-reticle-blaster-diagonal-proposal',
    getBoundingClientRect:()=>({toJSON:()=>({x:640-geometry()/2,y:360-geometry()/2,width:geometry(),height:geometry()})}),querySelectorAll:()=>[],
    getAnimations:()=>perpetual||frame<settleAt?[{pending:frame<2,playState:'running',effect:{getKeyframes:()=>[{transform:'scale(1)'},{transform:'scale(1.42)'}]},constructor:{name:'CSSTransition'},transitionProperty:'transform',currentTime:frame}]:[]};
  const G={time:1,input:{mouse:{left:true},enabled:true,locked:true,lastDevice:'kbm',keys:new Set(['Space'])},match:{time:2,stateT:3},local:{weaponId:'blaster',grounded:true,intent:{fire:true,jump:false,squid:false,move:vec([0,0,0])},pos:vec([1,.04,2]),weaponRunner:{charge:0,cooldown:0}},
    camera:{position:vec([1,2,3]),quaternion:vec([0,0,0,1]),fov:55,aspect:16/9}};
  const g={frozen:true,s3Clock:{ticks:262,accumulator:0},rig:{yaw:0,pitch:-.12},hud:{ret:node},_frame(){forbiddenFrames++;throw Error('Forbidden Game._frame');}};
  globalThis.window={__G:G,__inkwave:g,__chargerRecipeObservation:{events:[{}]},__reticleCadence:[{}]};
  globalThis.getComputedStyle=()=>({transform:'matrix('+geometry()/80+', 0, 0, '+geometry()/80+', 0, 0)',translate:'none',rotate:'none',scale:'none',display:'block'});
  globalThis.requestAnimationFrame=callback=>setImmediate(()=>{frame++;if(frame===mutateAt)mutate({G,g,node});callback(performance.now());});
  globalThis.cancelAnimationFrame=clearImmediate;
  try{await fn({node,G,g,frames:()=>frame,forbiddenFrames:()=>forbiddenFrames});}
  finally{for(const k of keys)if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}
}
test('changing computed bounds reproduces invariant failure, natural RAF convergence passes unchanged geometry and owners',async()=>{
 await fixture(async({node,forbiddenFrames})=>{
   const initial=node.getBoundingClientRect().toJSON();
   const result=await waitForShapeCaptureSettlement();
   assert.notDeepEqual(result.geometry[0].bounds,initial,'unsettled capture would drift');
   assert.equal(result.frames,10);assert.equal(result.stableFrames,3);assert(result.elapsedMs>=0);
   assert.equal(result.ownerInvariant,true);assert.deepEqual(result.ownerAfter,result.ownerBefore);
   assert.equal(result.ownerAfter.clock[3],262);assert.equal(result.ownerAfter.shotCount,1);
   assert.equal(forbiddenFrames(),0);
   const before=node.getBoundingClientRect().toJSON();await new Promise(requestAnimationFrame);assert.deepEqual(node.getBoundingClientRect().toJSON(),before);
 });
});
test('unchanging geometry cannot pass while a geometric transition remains pending/running',async()=>{
 await fixture(async({node})=>{
  node.getBoundingClientRect=()=>({toJSON:()=>({width:80,height:80})});
  globalThis.getComputedStyle=()=>({transform:'none',translate:'none',rotate:'none',scale:'none',display:'block'});
  const result=await waitForShapeCaptureSettlement();assert.equal(result.frames,9);assert.equal(result.activeGeometry.length,0);
 },{settleAt:7});
});
test('bounded deadline preserves last computed surface and active transition diagnostic',async()=>{
 await fixture(async()=>{
  await assert.rejects(waitForShapeCaptureSettlement({deadlineMs:15}),error=>{
   assert.match(error.message,/settlement deadline exceeded/);for(const key of ['ownerBefore','ownerAfter','activeGeometry','CSSTransition','bounds','elapsedMs'])assert(error.message.includes(key));return true;
  });
 },{perpetual:true});
});
for(const [name,mutate]of [
 ['ticks',({g})=>g.s3Clock.ticks++],['source pose',({G})=>G.local.pos.toArray=()=>[9,.04,2]],
 ['shots',()=>window.__chargerRecipeObservation.events.push({})],['game cadence',()=>window.__reticleCadence.push({})],
 ['source time',({G})=>G.time++],['input fire',({G})=>G.input.mouse.left=false],
 ['actor intent',({G})=>G.local.intent.fire=false],['held keys',({G})=>G.input.keys.clear()],
 ['intent move',({G})=>G.local.intent.move.toArray=()=>[1,0,0]],['camera',({G})=>G.camera.fov++],['charge',({G})=>G.local.weaponRunner.charge=.5],
])test(`fails closed on ${name} advancement during browser-only wait`,async()=>{
 await fixture(async()=>assert.rejects(waitForShapeCaptureSettlement(),/Native owner changed/),{mutateAt:2,mutate});
});
test('requires native frozen HUD and meaningful bounded settings',async()=>{
 await fixture(async({g,node})=>{
  await assert.rejects(waitForShapeCaptureSettlement({stableFrames:1}),/Invalid/);
  await assert.rejects(waitForShapeCaptureSettlement({deadlineMs:Infinity}),/Invalid/);
  g.frozen=false;await assert.rejects(waitForShapeCaptureSettlement(),/frozen connected/);g.frozen=true;
  node.isConnected=false;await assert.rejects(waitForShapeCaptureSettlement(),/frozen connected/);
 });
});
test('integration settles before first authoritative snapshot without weakening any screenshot assertion',()=>{
 assert(runner.indexOf('await settleShapeCapture(page)')<runner.indexOf('const row=await readSnapshot(page)'));
 assert.match(runner,/assert\.deepEqual\(afterCapture\.next,row\.next,'screenshot must not change native recipe state'\)/);
 assert.match(runner,/recipeSha256:[^\n]*'shapes-capture-settlement\.mjs'/);
 assert.match(runner,/assertSurfaceInvariant\(row\.surfaceBefore,row\.surfaceAfter\)/);
 assert.equal((runner.match(/scale:'device',timeout:20000/g)||[]).length,2);
 assert.doesNotMatch(helperSource,/\._frame\(|debug\.step|\.finish\(|\.pause\(|\.currentTime\s*=|setProperty|animations:\s*['"]disabled/);
});
