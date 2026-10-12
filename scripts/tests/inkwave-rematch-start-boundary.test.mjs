import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs',import.meta.url),'utf8');
const callback=source.match(/await until\((\(\) => \{ const m = window\.__G\.match;[^\n]+?\}), null, 300000, 'battle playing[^']*'/)?.[1];
assert.ok(callback,'actual lifecycle battle-start predicate');
async function rig(){
 const f=await fixture("export { Match } from './inkwave-public/src/game/match.js';");
 const m=new f.Match({duration:180,mode:'turf'});
 Object.assign(m,{state:'intro',stateT:4.2,actors:[],local:{alive:true},controller:{enabled:false,menuBlocked:false,update(){}}});f.G.match=m;
 const ready=vm.runInNewContext(callback,{window:{__G:f.G}});
 const tick=()=>{m.updateController(1/60);m.update(1/60);};
 return {m,ready,tick};
}
test('the old phase-only poll accepts the native intro transition before controller admission',async()=>{
 const h=await rig();h.tick();assert.equal(h.m.state,'playing');assert.equal(h.m.time,180);assert.equal(h.m.controller.enabled,false);
 assert.equal(h.m.state==='playing',true);assert.equal(h.ready(),false);
 h.tick();assert.equal(h.ready(),true);assert.equal(h.m.controller.enabled,true);assert.ok(h.m.time<180);
});
test('wall-clock polling cannot stand in for a completed native simulation tick',async()=>{
 const h=await rig();h.tick();for(let i=0;i<120;i++)assert.equal(h.ready(),false);
 h.tick();assert.equal(h.ready(),true);
});
test('the new readiness poll does not mask broken controller admission or a different phase',async()=>{
 const h=await rig();h.tick();h.tick();h.m.controller.enabled=false;assert.equal(h.ready(),true);
 assert.match(source,/play\.controller\?\.enabled && !play\.controller\.blocked && play\.controller\.local && play\.rigFollowsLocal/);
 assert.equal(h.m.controller.enabled,false,'unchanged later owner assertion still rejects this state');
 h.m.state='results';assert.equal(h.ready(),false);h.m.state='playing';h.m.attract=true;assert.equal(h.ready(),false);
});

// Execute the current atomic snapshot poll instead of a retired separate
// focus-ring evaluate predicate. Its final snapshot remains the assertion input.
const alignmentSource=source.slice(source.indexOf('const waitForFocusFrame ='),source.indexOf('const check ='));
assert.ok(alignmentSource.startsWith('const waitForFocusFrame ='),'actual lifecycle bounded frame and atomic alignment polls');
function ringRig(snapshots,{stalledFrames=false}={}){
 let clock=0, reads=0, frames=0, waits=0, cleared=0, maxWait=0;
 const read=vm.runInNewContext(alignmentSource+'\nalignedFocusSnapshot;',{
  operationTrace:{run:(_name,action)=>action()},
  snap:async()=>snapshots[Math.min(reads++,snapshots.length-1)],
  page:{evaluate:async action=>stalledFrames?new Promise(()=>{}):action()},
  requestAnimationFrame:callback=>{frames++;clock+=16;callback(clock);return frames;},
  setTimeout:(callback,ms)=>{waits++;maxWait=Math.max(maxWait,ms);if(stalledFrames){clock+=ms;callback();}return waits;},
  clearTimeout:()=>{cleared++;},
  Date:{now:()=>clock}
 });
 return {read,counts:()=>({reads,frames,waits,cleared,maxWait})};
}
test('rematch samples the native cursor after a browser frame and waits through its opacity entrance',async()=>{
 const entering={ringOn:true,ringVisible:false,ringOnFocus:true,focusConnected:true};
 const visible={ringOn:true,ringVisible:true,ringOnFocus:true,focusConnected:true};
 const {read,counts}=ringRig([entering,visible]);
 assert.equal(await read('touch'),visible);
 assert.deepEqual(counts(),{reads:2,frames:2,waits:2,cleared:2,maxWait:1000});
 assert.match(source,/ringStyle\.visibility === 'visible' && ringStyle\.display !== 'none' && \+ringStyle\.opacity > 0\.6/);
 assert.match(source,/if \(C\?\.on && f\?\.isConnected\)/);
});
test('the frame poll keeps every visible and aligned ring condition strict through timeout',async()=>{
 for(const key of ['ringOn','ringVisible','ringOnFocus']){
  const snapshot={ringOn:true,ringVisible:true,ringOnFocus:true,focusConnected:true};
  snapshot[key]=false;
  const {read}=ringRig([snapshot]);
  const observed=await read('touch');
  assert.equal(observed[key],false,'an unmet gate is preserved for the assertion: '+key);
 }
});
test('a suspended browser frame falls back within one second and preserves the 30 second strict gate',async()=>{
 const invisible={ringOn:true,ringVisible:false,ringOnFocus:true,focusConnected:true};
 const {read,counts}=ringRig([invisible],{stalledFrames:true});
 const observed=await read('touch');
 assert.equal(observed.ringVisible,false,'a missing browser frame cannot satisfy visible-ring acceptance');
 assert.deepEqual(counts(),{reads:30,frames:0,waits:30,cleared:30,maxWait:1000});
});
test('touch return and keyboard handoff retain the same strict atomic ring acceptance',()=>{
 assert.match(source,/alignedFocusSnapshot\('touch-owned menu'\)/);
 assert.match(source,/alignedFocusSnapshot\('keyboard handoff'\)/);
 assert.match(source,/menu\.focusConnected === true && menu\.ringOn && menu\.ringVisible && menu\.ringOnFocus === true/);
});
