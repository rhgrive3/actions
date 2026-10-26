// Reduced DOM tests with deliberately withheld RAF callbacks and real Node
// wall timers. These are NOT native browser CSS/render/gameplay execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {waitForShapeCaptureSettlement} from '../lib/reticle-next/shapes-capture-settlement.mjs';
import {waitForShapeCaptureSettlement as beforeWait} from './fixtures/shapes-capture-settlement-before.mjs';
const helperSource=fs.readFileSync(new URL('../lib/reticle-next/shapes-capture-settlement.mjs',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
const recorded=JSON.parse(fs.readFileSync(new URL('./fixtures/shapes-zero-raf-40257170815.json',import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
async function fixture(fn,{owner=recorded.heads[0].diagnostic.ownerBefore,geometry=recorded.heads[0].diagnostic.last.geometry,
 changeForMs=0,perpetual=false,activeUntilMs=0,mutateAfterMs=null,mutate=()=>{}}={}){
 const keys=['window','document','requestAnimationFrame','cancelAnimationFrame','getComputedStyle'],saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 let source=clone(owner),calls=0,requested=0,canceled=0,mutator;const started=performance.now(),rafHandle={};
 const vec=key=>({toArray:()=>[...source[key]]});
 const nodes=geometry.map(g=>({tagName:g.tag,getAttribute:()=>g.classes,isConnected:true,
  getBoundingClientRect:()=>({toJSON:()=>{calls++;const delta=Math.max(0,changeForMs-(performance.now()-started));return {...g.bounds,width:g.bounds.width+delta};}}),
  geometry:g}));
 const ret=nodes[0];ret.querySelectorAll=()=>nodes.slice(1);
 ret.getAnimations=()=>perpetual||performance.now()-started<activeUntilMs?[{pending:false,playState:'running',constructor:{name:'CSSTransition'},transitionProperty:'transform',currentTime:performance.now()-started,effect:{getKeyframes:()=>[{transform:'scale(1)'},{transform:'scale(1.42)'}]}}]:[];
 const G={get time(){return source.clock[0];},match:{get time(){return source.clock[1];},get stateT(){return source.clock[2];}},
  input:{get mouse(){return {left:source.input.fire};},get enabled(){return source.input.enabled;},get locked(){return source.input.locked;},get lastDevice(){return source.input.lastDevice;},get keys(){return new Set(source.input.keys);}},
  local:{get weaponId(){return source.weaponId;},get grounded(){return source.grounded;},pos:vec('position'),
   intent:{get fire(){return source.intent.fire;},get jump(){return source.intent.jump;},get squid(){return source.intent.squid;},move:{toArray:()=>source.intent.move}},
   weaponRunner:new Proxy({}, {get:(_,key)=>source.runner[key]??null})},
  camera:{position:vec('cameraPosition'),quaternion:vec('cameraQuaternion'),get fov(){return source.fov;},get aspect(){return source.aspect;}}};
 const g={get frozen(){return source.frozen;},s3Clock:{get ticks(){return source.clock[3];},get accumulator(){return source.clock[4];}},
  rig:{get yaw(){return source.yaw;},get pitch(){return source.pitch;}},hud:{ret},_frame(){throw Error('Forbidden source advancement');}};
 globalThis.window={__G:G,__inkwave:g,get __chargerRecipeObservation(){return {events:new Array(source.shotCount)};},get __reticleCadence(){return new Array(source.renderFrames);}};
 globalThis.document={visibilityState:'visible',hasFocus:()=>true,timeline:{currentTime:123}};
 globalThis.getComputedStyle=node=>node.geometry;
 // Exact regression stimulus: request is recorded, callback is never invoked.
 globalThis.requestAnimationFrame=()=>{requested++;return rafHandle;};
 globalThis.cancelAnimationFrame=handle=>{assert.equal(handle,rafHandle);canceled++;};
 if(mutateAfterMs!==null)mutator=setTimeout(()=>mutate(source,ret),mutateAfterMs);
 try{await fn({source,ret,calls:()=>calls,requested:()=>requested,canceled:()=>canceled});}
 finally{clearTimeout(mutator);for(const k of keys)if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}
}
test('archived exact old helper reproduces zero-RAF deadline failure at unchanged1500ms budget',async()=>{
 await fixture(async()=>assert.rejects(beforeWait(),error=>{
  assert.match(error.message,/settlement deadline exceeded/);
  const diagnostic=JSON.parse(error.message.slice(error.message.indexOf('{')));
  assert.equal(diagnostic.frames,0);assert.equal(diagnostic.stableFrames,0);assert.equal(diagnostic.deadlineMs,1500);
  assert.deepEqual(diagnostic.ownerBefore,diagnostic.ownerAfter);assert.deepEqual(diagnostic.last.activeGeometry,[]);
  return true;
 }));
});
for(const row of recorded.heads)test(`exact observed zero-RAF ${row.kind} failure now settles via measured wall samples without owner advance`,async()=>{
 assert.equal(row.diagnostic.frames,0);assert.deepEqual(row.diagnostic.ownerBefore,row.diagnostic.ownerAfter);
 await fixture(async({requested,canceled})=>{
  const r=await waitForShapeCaptureSettlement();assert.equal(r.raf.callbacks,0);assert.equal(r.raf.firstCallbackMs,null);
  assert.equal(requested(),1);assert.equal(canceled(),1);assert(r.wallPoll.samples>=3);assert(r.wallPoll.stableSamples>=3);
  assert(r.wallPoll.stableElapsedMs>=32);assert(r.elapsedMs<1500);assert.equal(r.deadlineMs,1500);
  assert.equal(r.ownerInvariant,true);assert.deepEqual(r.ownerBefore,r.ownerAfter);assert.deepEqual(r.geometry,row.diagnostic.last.geometry);
  assert.equal(r.wallPoll.observations.length,r.wallPoll.samples);assert(r.wallPoll.observations.every(o=>o.rafCallbacks===0));
 },{owner:row.diagnostic.ownerBefore,geometry:row.diagnostic.last.geometry});
});
test('changing geometry cannot pass on zero RAF until real wall-time observations converge',async()=>{
 await fixture(async()=>{
  const r=await waitForShapeCaptureSettlement();assert.equal(r.raf.callbacks,0);assert(r.elapsedMs>=77);
  assert.notDeepEqual(r.initial.geometry,r.geometry);assert(r.wallPoll.observations.filter(o=>o.geometryChanged).length>1);
  assert(r.wallPoll.stableElapsedMs>=32);assert.deepEqual(r.ownerBefore,r.ownerAfter);
 },{changeForMs:45});
});
test('identical geometry cannot pass while native geometric transition is active',async()=>{
 await fixture(async()=>{
  const r=await waitForShapeCaptureSettlement();assert(r.elapsedMs>=77);assert.equal(r.activeGeometry.length,0);
  assert(r.wallPoll.observations.some(o=>o.activeGeometryCount===1&&o.stableSamples===0));
 },{activeUntilMs:45});
});
test('perpetual geometry animation still fails at bounded deadline with distinct RAF/poll diagnostics',async()=>{
 await fixture(async()=>assert.rejects(waitForShapeCaptureSettlement({deadlineMs:75}),error=>{
  assert.match(error.message,/settlement deadline exceeded/);for(const key of ['"raf"','"callbacks":0','"wallPoll"','observations','ownerBefore','ownerAfter','initial','last','CSSTransition'])assert(error.message.includes(key));return true;
 }),{perpetual:true});
});
test('owned polling and pending RAF are canceled after success',async()=>{
 await fixture(async({calls,canceled})=>{
  await waitForShapeCaptureSettlement();const ended=calls();await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(calls(),ended);assert.equal(canceled(),1);
 });
});
for(const[name,mutate]of [
 ['native ticks',s=>s.clock[3]++],['source time',s=>s.clock[0]++],['source pose',s=>s.position[0]++],
 ['shots',s=>s.shotCount++],['cadence',s=>s.renderFrames++],['input fire',s=>s.input.fire=!s.input.fire],
 ['held keys',s=>s.input.keys.push('KeyD')],['actor fire intent',s=>s.intent.fire=!s.intent.fire],
 ['intent move',s=>s.intent.move[0]++],['camera',s=>s.fov++],['charge',s=>s.runner.charge=.5],
])test(`zero-RAF wall polling fails closed on ${name} advancement`,async()=>{
 await fixture(async()=>assert.rejects(waitForShapeCaptureSettlement(),/Native owner changed/),{mutateAfterMs:5,mutate});
});
test('source mutation during computed-style read fails before accepting the final sample',async()=>{
 await fixture(async({source,ret})=>{
  const original=ret.getBoundingClientRect;let reads=0;ret.getBoundingClientRect=()=>{if(++reads===3)source.clock[3]++;return original();};
  await assert.rejects(waitForShapeCaptureSettlement(),/Native owner changed/);
 });
});
test('requires connected frozen native HUD and meaningful polling bounds',async()=>{
 await fixture(async({source,ret})=>{
  for(const options of [{stableSamples:1},{deadlineMs:Infinity},{pollIntervalMs:0},{pollIntervalMs:1500}])await assert.rejects(waitForShapeCaptureSettlement(options),/Invalid/);
  source.frozen=false;await assert.rejects(waitForShapeCaptureSettlement(),/frozen connected/);source.frozen=true;
  ret.isConnected=false;await assert.rejects(waitForShapeCaptureSettlement(),/frozen connected/);
 });
});
test('unchanged integration keeps full screenshot geometry invariants and original deadlines',()=>{
 assert(runner.indexOf('await settleShapeCapture(page)')<runner.indexOf('const row=await readSnapshot(page)'));
 assert.match(runner,/assert\.deepEqual\(afterCapture\.next,row\.next,'screenshot must not change native recipe state'\)/);
 assert.match(runner,/recipeSha256:[^\n]*'shapes-capture-settlement\.mjs'/);
 assert.match(runner,/assertSurfaceInvariant\(row\.surfaceBefore,row\.surfaceAfter\)/);
 assert.equal((runner.match(/scale:'device',timeout:20000/g)||[]).length,2);
 assert.doesNotMatch(helperSource,/\._frame\(|debug\.step|\.finish\(|\.pause\(|\.currentTime\s*=|setProperty|animations:\s*['"]disabled/);
 assert.doesNotMatch(helperSource,/frames:|stableFrames:/,'wall samples never masquerade as native RAF frames');
});
