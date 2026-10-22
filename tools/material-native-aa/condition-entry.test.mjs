import test from 'node:test';import assert from 'node:assert/strict';
import {conditionMaterialEntry} from './condition-entry.mjs';
import {fixture} from './fixture.mjs';
test('first scheduled portrait drains at fixed ordinal1; global readiness is only checked at28',async()=>{
 const f=fixture();const r=await conditionMaterialEntry(f.options);assert.deepEqual(f.calls,Array.from({length:28},(_,i)=>i));assert.ok(f.settledCalls.every(n=>n===28));assert.equal(r.callbackPhases[0].ordinal,1);assert.equal(r.callbackPhases[0].before.rig.blend.active,true);assert.equal(r.callbackPhases[0].after.rig.blend.active,true);assert.equal(r.callbackPhases[1].ordinal,28);assert.equal(r.after.rig.blend.active,false);assert.equal(r.performanceAccepted,false);assert.equal(r.sequence,'first-frame-existing-portrait-then-27');assert.equal(r.callbackWaitMs,48);assert.equal(r.polls,3);
 assert.equal(r.callbackPhases[0].before.rngState,100);assert.equal(r.callbackPhases[0].after.rngState,101);assert.equal(r.callbackPhases[0].after.rendererFrame-r.callbackPhases[0].before.rendererFrame,2);
});
test('successful two-phase waits share one20s budget, not20s each',async()=>{
 const f=fixture({readyAfter:1,firstCost:8000,finalCost:6000,lateLobby:true});const r=await conditionMaterialEntry(f.options);assert.equal(r.callbackWaitMs,14000);assert.equal(r.polls,2);assert.equal(f.calls.length,28);
});
test('combined24s is rejected although each phase individually needs only12s',async()=>{
 const f=fixture({readyAfter:1,firstCost:12000,finalCost:12000,lateLobby:true});await assert.rejects(conditionMaterialEntry(f.options),/readiness deadline/);assert.equal(f.calls.length,28);
});
test('late first-phase readiness does not pass after20s',async()=>{
 const f=fixture({readyAfter:1,firstCost:20001});await assert.rejects(conditionMaterialEntry(f.options),/readiness deadline/);assert.equal(f.calls.length,1);
});
test('never-completing readback stops at frame1 and adds no hidden frames',async()=>{
 const f=fixture({readyAfter:Infinity,firstCost:1000});await assert.rejects(conditionMaterialEntry(f.options),/readiness deadline/);assert.equal(f.calls.length,1);
});
test('queued but unscheduled work fails without calling its service method',async()=>{
 const f=fixture();const frame=f.options.frame;f.options.frame=i=>{frame(i);f.p.hasJob=false;f.p.hasTask=false;f.p.queued=1;};await assert.rejects(conditionMaterialEntry(f.options),/queued work/);assert.equal(f.calls.length,1);
});
test('already completed portrait has no extra polls or forced work',async()=>{
 const f=fixture();const frame=f.options.frame;f.options.frame=i=>{frame(i);f.p.hasJob=false;f.p.hasTask=false;};const r=await conditionMaterialEntry(f.options);assert.equal(r.polls,0);assert.equal(f.calls.length,28);
});
for(const [label,change,pattern] of [
 ['clock',({setTime})=>setTime(9),/simulation advanced/],
 ['actor owner',({G})=>G.local={},/owner/],
 ['character owner',({G})=>G.local.character={},/owner/],
 ['freeze',({g})=>g.frozen=false,/owner/],
 ['rig owner',({g})=>g.rig={},/owner/],
 ['portrait pool disposed',({g})=>g.showcase._portraitCharacter=null,/owner/],
 ['portrait pool replaced',({g})=>g.showcase._portraitCharacter={},/owner/],
 ['showcase owner',({g})=>g.showcase={},/owner/],
 ['renderer owner',({G})=>G.renderer={},/owner/],
 ['camera',({state})=>state.camera.position[0]=9,/pose/],
 ['blend',({state})=>state.rig.blend.t=9,/pose/],
 ['input',({state})=>state.input.keys=['KeyW'],/pose/],
])test('reject early wait '+label+' mutation',async()=>{const f=fixture({change});await assert.rejects(conditionMaterialEntry(f.options),pattern);assert.equal(f.calls.length,1);});
for(const [label,mutate] of [
 ['missing flag',p=>delete p.hasJob],['negative flight',p=>p.inFlight=-1],['fractional queue',p=>p.queued=.5],['warmup not done',p=>p.warmState='busy'],
])test('reject incomplete portrait evidence: '+label,async()=>{const f=fixture();const frame=f.options.frame;f.options.frame=i=>{frame(i);mutate(f.p);};await assert.rejects(conditionMaterialEntry(f.options),/evidence invalid/);});
test('reject orphan continuation owner',async()=>{const f=fixture();const frame=f.options.frame;f.options.frame=i=>{frame(i);f.p.hasJob=false;};await assert.rejects(conditionMaterialEntry(f.options),/no active owner/);});
test('unexpected native entry fails before any frame',async()=>{const f=fixture();f.state.rig.previousMode='path';await assert.rejects(conditionMaterialEntry(f.options),/Unexpected/);assert.equal(f.calls.length,0);});
test('remaining27 frames must really finish the blend',async()=>{const f=fixture();const frame=f.options.frame;f.options.frame=i=>{frame(i);f.state.rig.blend.active=true;};await assert.rejects(conditionMaterialEntry(f.options),/did not settle blend/);assert.equal(f.calls.length,28);});
test('nonfinite and backwards callback clocks fail',async()=>{for(const bad of [NaN,-1]){const f=fixture();let n=0;f.options.now=()=>n++?bad:0;await assert.rejects(conditionMaterialEntry(f.options),/deadline/);}});

test('missing retained portrait owner rejects before any native frame',async()=>{const f=fixture();delete f.g.showcase._portraitCharacter;await assert.rejects(conditionMaterialEntry(f.options),/portrait owner missing/);assert.equal(f.calls.length,0);});

for(const [label,mutate] of [
 ['cancel callback',j=>j.cbs.splice(0,1)],
 ['replace callback',j=>j.cbs[0]=()=>{}],
 ['replace callback array',j=>j.cbs=j.cbs.slice()],
 ['change request owner',j=>j.req={}],
 ['change key',j=>j.key='changed'],
 ['change cache epoch',j=>j._portraitCacheEpoch++],
])test('retained scheduled job rejects '+label,async()=>{let job;const f=fixture({change:()=>mutate(job)});const frame=f.options.frame;f.options.frame=i=>{frame(i);if(i===0)job=f.g.showcase._portraitJob;};await assert.rejects(conditionMaterialEntry(f.options),/lifetime changed/);assert.equal(f.calls.length,1);});

for(const label of ['scheduled-portrait-after-first-frame','final-entry-after-28-frames'])
 for(const kind of ['camera','clock','owner'])test('reject '+kind+' microtask across '+label+' await',async()=>{
  const f=fixture(),checkpoint=f.options.checkpoint;let changedTime=false;const clocks=f.options.clocks;
  f.options.clocks=()=>changedTime?{time:900}:clocks();
  f.options.checkpoint=(name,data)=>{checkpoint(name,data);if(name==='callback-phase-ready'&&data.label===label)queueMicrotask(()=>{if(kind==='camera')f.state.camera.position[0]=900;else if(kind==='clock')changedTime=true;else f.g.showcase._portraitCharacter={};});};
  await assert.rejects(conditionMaterialEntry(f.options),/across callback await|owner/);
 });
