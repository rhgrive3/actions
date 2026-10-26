// Reduced orchestration/DOM contracts with withheld RAF. Not native browser or
// game evidence. Actual failed owner/geometry snapshots seed this unit model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {admitShapeCapturePresentation,inspectShapePresentation,remainingFiniteCssMs,waitNaturalCssDuration} from '../lib/reticle-next/shapes-presentation-admission.mjs';
import {waitForShapeCaptureSettlement} from '../lib/reticle-next/shapes-capture-settlement.mjs';
const records=JSON.parse(fs.readFileSync(new URL('./fixtures/shapes-frozen-transition-40262273265.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../lib/reticle-next/shapes-presentation-admission.mjs',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const surface=()=>({state:{tick:1},canvas:{width:1280,height:720},viewport:{width:1280,height:720}});
async function fixture(fn,{record=records.heads[0],neverPresent=false,mutation=null,redrawMutation=null,perpetual=false,active=true}={}){
 const saved=Object.fromEntries(['window','document','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 const owner=clone(record.diagnostic.ownerBefore),geometry=clone(record.diagnostic.last.geometry);
 const clock=owner.clock;const vec=key=>({toArray:()=>clone(owner[key])});
 const G={get time(){return clock[0];},match:{get time(){return clock[1];},get stateT(){return clock[2];}},
  input:{get mouse(){return {left:owner.input.fire};},get enabled(){return owner.input.enabled;},get locked(){return owner.input.locked;},get lastDevice(){return owner.input.lastDevice;},get keys(){return new Set(owner.input.keys);}},
  local:{get weaponId(){return owner.weaponId;},get grounded(){return owner.grounded;},pos:vec('position'),intent:{get fire(){return owner.intent.fire;},get jump(){return owner.intent.jump;},get squid(){return owner.intent.squid;},move:{toArray:()=>clone(owner.intent.move)}},weaponRunner:new Proxy({}, {get:(_,key)=>owner.runner[key]??null})},
  camera:{position:vec('cameraPosition'),quaternion:vec('cameraQuaternion'),get fov(){return owner.fov;},get aspect(){return owner.aspect;}}};
 let presentedAt=null,presentations=0,redraws=0;const duration=100; // Actual production/proposal `transform .1s linear`; orchestration remains a unit model.
 const elapsed=()=>presentedAt===null?0:Math.max(0,performance.now()-presentedAt);
 let running=active;
 const nodes=geometry.map(g=>({tagName:g.tag,getAttribute:()=>g.classes,isConnected:true,geometry:g,getBoundingClientRect:()=>({toJSON:()=>clone(g.bounds)})}));
 const ret=nodes[0];ret.querySelectorAll=()=>nodes.slice(1);
 const animation={constructor:{name:'CSSTransition'},playState:'running',get pending(){return presentedAt===null;},transitionProperty:'transform',get currentTime(){return presentedAt===null?0:Math.min(duration,elapsed());},effect:{getKeyframes:()=>[{transform:'scale(1.4836)'},{transform:'scale(1.4188)'}],getComputedTiming:()=>({endTime:perpetual?Infinity:duration,duration,delay:0,iterations:perpetual?Infinity:1})}};
 ret.getAnimations=()=>running?[animation]:[];
 globalThis.window={__G:G,__inkwave:{frozen:true,s3Clock:{get ticks(){return clock[3];},get accumulator(){return clock[4];}},rig:{get yaw(){return owner.yaw;},get pitch(){return owner.pitch;}},hud:{ret},_frame(){throw Error('No game frame');}},get __chargerRecipeObservation(){return {events:new Array(owner.shotCount)};},get __reticleCadence(){return new Array(owner.renderFrames);}};
 globalThis.document={timeline:{get currentTime(){return elapsed();}},visibilityState:'visible',hasFocus:()=>true};
 globalThis.getComputedStyle=n=>n.geometry;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const updates=[],screenshots=[];
 function inspectSurface({redraw}={}){if(redraw){redraws++;if(redrawMutation)redrawMutation(owner);}return surface();}
 const page={evaluate:async(fn,arg)=>fn===inspectSurface?inspectSurface(arg):fn(arg),screenshot:async options=>{
  screenshots.push(options);presentations++;
  if(!neverPresent){if(presentedAt===null)presentedAt=performance.now();else if(elapsed()>=duration){running=false;for(const g of geometry)g.bounds.width+=.25;}}
  if(mutation)mutation(owner,presentations);
  return Buffer.from('unaccepted-presentation-'+presentations);
 }};
 const options={inspectSurface,assertSurfaceInvariant:(before,after)=>assert.deepEqual(after,before),onUpdate:r=>updates.push(clone(r))};
 try{await fn({page,options,owner,updates,screenshots,presentations:()=>presentations,redraws:()=>redraws});}
 finally{for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
}
for(const record of records.heads)test(`recorded ${record.head} time-zero transition: passive wait fails; native-presentation orchestration admits before strict snapshots`,async()=>{
 await fixture(async({page,options,presentations,redraws,screenshots})=>{
  await assert.rejects(waitForShapeCaptureSettlement({deadlineMs:50}),/settlement deadline/);
  const result=await admitShapeCapturePresentation(page,options);
  assert.equal(presentations(),2);assert.equal(redraws(),2);assert.equal(result.presentation.status,'admitted');
  assert.equal(result.settlement.raf.callbacks,0);assert.equal(result.settlement.activeGeometry.length,0);
  assert(result.settlement.wallPoll.stableElapsedMs>=32);assert.equal(result.presentation.ownerInvariant,true);
  assert(result.presentation.operations.some(o=>o.operation==='natural-css-duration-wait'&&o.elapsedMs>=o.requestedMs));
  for(const w of result.presentation.warmups){assert.equal(w.acceptedScreenshot,false);assert.match(w.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(w.before.owner,w.after.owner);}
  assert.deepEqual(screenshots,[1,2].map(()=>({scale:'device',animations:'allow',timeout:20000})));
  assert.equal(result.presentation.warmups[0].sha256,crypto.createHash('sha256').update('unaccepted-presentation-1').digest('hex'));
 },{record});
});
test('already stable geometry takes no warmups but still passes original strict gate',async()=>{
 await fixture(async({page,options,presentations})=>{
  const result=await admitShapeCapturePresentation(page,options);assert.equal(presentations(),0);assert.equal(result.presentation.warmups.length,0);assert.equal(result.settlement.ownerInvariant,true);
 },{active:false});
});
test('three unsuccessful ordinary presentations remain rejected by strict1500ms gate',async()=>{
 await fixture(async({page,options,presentations,updates})=>{
  await assert.rejects(admitShapeCapturePresentation(page,options),/settlement deadline/);
  assert.equal(presentations(),3);const final=updates.at(-1);assert.equal(final.status,'failed');assert.equal(final.warmups.length,3);assert(final.warmups.every(w=>w.acceptedScreenshot===false));
 },{neverPresent:true});
});
test('perpetual native geometry refuses before any warmup instead of disabling animation',async()=>{
 await fixture(async({page,options,presentations})=>{
  await assert.rejects(admitShapeCapturePresentation(page,options),/finite native CSS timing/);assert.equal(presentations(),0);
 },{perpetual:true});
});
for(const[name,mutation]of [['native ticks',o=>o.clock[3]++],['shots',o=>o.shotCount++],['source pose',o=>o.position[0]++],['held input',o=>o.input.fire=!o.input.fire],['intent',o=>o.intent.fire=!o.intent.fire]])test(`ordinary screenshot cannot admit after ${name} advancement`,async()=>{
 await fixture(async({page,options,updates,presentations})=>{
  await assert.rejects(admitShapeCapturePresentation(page,options),/must not advance native owners/);assert.equal(presentations(),1);assert.equal(updates.at(-1).warmups.length,1);assert.match(updates.at(-1).warmups[0].sha256,/^[a-f0-9]{64}$/);
 },{mutation});
});
test('render-only redraw cannot admit an owner mutation before screenshots',async()=>{
 await fixture(async({page,options,presentations})=>{
  await assert.rejects(admitShapeCapturePresentation(page,options),/must not advance native owners/);assert.equal(presentations(),0);
 },{redrawMutation:o=>o.clock[3]++});
});
test('natural CSS duration wait cannot admit an owner mutation',async()=>{
 await fixture(async({page,options,presentations})=>{
  await assert.rejects(admitShapeCapturePresentation(page,options),/must not advance native owners/);assert.equal(presentations(),1);
 },{mutation:(o,n)=>{if(n===1)setTimeout(()=>o.shotCount++,1);}});
});
test('natural CSS wait measures real elapsed time and rejects nonfinite or excessive requests',async()=>{
 const r=await waitNaturalCssDuration(5);assert(r.elapsedMs>=r.requestedMs);assert(r.timerCallbacks>=1);
 for(const n of [-1,Infinity,501])await assert.rejects(waitNaturalCssDuration(n),/bounded native CSS duration/);
});
test('finite CSS remaining duration is observed, bounded and never inferred from screenshot count',()=>{
 const sample=timing=>({activeGeometry:[{currentTime:20,timing}]});
 assert.equal(remainingFiniteCssMs(sample({endTime:100,duration:100,delay:0,iterations:1})),80);
 assert.throws(()=>remainingFiniteCssMs(sample({endTime:Infinity,duration:100,delay:0,iterations:Infinity})),/finite/);
 assert.throws(()=>remainingFiniteCssMs(sample({endTime:600,duration:600,delay:0,iterations:1})),/bounded/);
});
test('integration runs native presentation before authoritative snapshot and keeps complete capture assertions',()=>{
 assert(runner.indexOf('await admitShapeCapturePresentation(page')<runner.indexOf('const row=await readSnapshot(page)'));
 assert.match(runner,/recipeSha256:[^\n]*'shapes-presentation-admission\.mjs'/);
 assert.match(runner,/assert\.deepEqual\(afterCapture\.next,row\.next,'screenshot must not change native recipe state'\)/);
 assert.match(runner,/assertSurfaceInvariant\(row\.surfaceBefore,row\.surfaceAfter\)/);
 assert.equal((runner.match(/scale:'device',timeout:20000/g)||[]).length,2);
 assert.doesNotMatch(source,/\._frame\(|debug\.step|\.finish\(|\.pause\(|\.currentTime\s*=|setProperty|animations:\s*['"]disabled/);
});
