import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';
import {fixture} from './source-fixture.mjs';

// Proposals are evaluated against full current modules, not copied algorithms.
// These tests prevent trading publicly mutable inputs for unproven caches.
test('removing the duplicate guide profile read changes live accessor invalidation',async()=>{
 const before=await actualModule('patches/splatoon3/runtime/dualies-guide-cache.mjs');
 const after=await actualModule('patches/splatoon3/runtime/dualies-guide-cache.mjs',{transform:s=>s.replace('value(s,weapon.inkFlightProfile);value(s,weapon.chargeTime);','value(s,weapon.chargeTime);')});
 const run=m=>{let calls=0,reads=0,frame=0;const A={},B={},C={},weapon={get inkFlightProfile(){calls++;reads++;return reads===2?(frame?C:B):A;}};
  const actor={weapon,character:{}},system={},game={physics:{level:{collisionRevision:0}}},probe={};
  const s=m.api.shooterGuideCache(system,actor,weapon,game,probe);s.ready=true;reads=0;frame=1;
  const second=m.api.shooterGuideCache(system,actor,weapon,game,probe);return {dirty:second.dirty,calls};};
 assert.deepEqual(run(before),{dirty:true,calls:4});assert.deepEqual(run(after),{dirty:false,calls:2});
});

test('Slosher scalar normal proposal changes a supported array iterator exception before admission',async()=>{
 const before=await actualModule('patches/network-replication/slosher-paint-admission.mjs');
 const after=await actualModule('patches/network-replication/slosher-paint-admission.mjs',{transform:s=>s.replace('Math.hypot(...normal)','Math.hypot(normal[0],normal[1],normal[2])')});
 const run=m=>{const normal=[0,1,0];normal[Symbol.iterator]=function(){throw Error('custom iterator');};
  const meta=['inkwave-slosher-impact-v1','match',1,0,1,1,[0,0,0],[0,0,0],normal,[0,0,1]];
  const event=[];event[15]=meta;event[7]=.5;event[2]=100;event[8]=0;
  return m.api.slosherImpactMatches({projectileId:1,start:{x:0,y:0,z:0},seed:.5},event);};
 assert.throws(()=>run(before),/custom iterator/);assert.equal(run(after),false);
});

test('earliest drop deadline cannot skip a public drop whose birth changes without roster changes',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const r=f.G.projectiles.inkFlight,owner=f.make(),head=f.G.projectiles._new();
 Object.assign(head,{owner,team:0,ghost:true});head.pos.set(0,100,0);head.vel.set(0,0,60);
 assert.equal(r.configure(head,'shooter',1,.5),true);
 r.spawnDrop(head,head.pos,0,0);r.time=0;r.world=(_a,_b,_radius,out)=>{out.hit=false;return out;};r.updateDrops();
 const deadline=r.drops[0].birth+(r.drops[0].frame+1)/60;
 r.drops[0].birth=-1/60;assert.ok(r.time+1e-9<deadline,'a cached deadline would return here');
 r.updateDrops();assert.equal(r.drops[0].frame,1,'the actual public birth change is observed this call');r.clear();
});

test('hoisted capsule bounds reject a legitimate moving actor because production uses actor-relative endpoints',async()=>{
 const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');
 const run=async cached=>{
  const adapt=(rel,raw)=>{let s=adaptBuildSource(rel,raw);if(!cached)return s;
   if(rel==='src/game/inkFlightRuntime.js'){
    s=s.replace('      for (const actor of G.actors) {','      const queueBounds=[Math.min(p.prev.x,p.pos.x),Math.max(p.prev.x,p.pos.x),Math.min(p.prev.y,p.pos.y),Math.max(p.prev.y,p.pos.y),Math.min(p.prev.z,p.pos.z),Math.max(p.prev.z,p.pos.z)];\n      for (const actor of G.actors) {');
    s=s.replaceAll('bodyRadius, bodyHeight, p.inkPlayerRadius);','bodyRadius, bodyHeight, p.inkPlayerRadius, queueBounds);');
   }
   if(rel==='src/game/inkCollision.js'){
    const start=s.indexOf('export function capsuleEntry('),end=s.indexOf('\nexport ',start+1);let part=s.slice(start,end<0?undefined:end);
    part=part.replace('height, bulletRadius) {','height, bulletRadius, queueBounds) {');
    for(const [i,expression]of ['Math.min(from.x, to.x)','Math.max(from.x, to.x)','Math.min(from.y, to.y)','Math.max(from.y, to.y)','Math.min(from.z, to.z)','Math.max(from.z, to.z)'].entries())part=part.replace(expression,`(queueBounds ? queueBounds[${i}] : ${expression})`);
    s=s.slice(0,start)+part+(end<0?'':s.slice(end));
   }
   return s;
  };
  const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adapt,extraExports:"export {beginActorMotionTick} from './patches/splatoon3/runtime/actor-motion.mjs';"});const ps=f.G.projectiles,r=ps.inkFlight,owner=f.make(),p=ps._new();
  Object.assign(p,{owner,team:0,ghost:false,wid:'shooter',type:'shot'});p.pos.set(0,.8,0);p.prev.copy(p.pos);p.vel.set(0,0,60);assert.equal(r.configure(p,'shooter',1,.5),true);
  r.world=(_a,_b,_rad,out)=>{out.hit=false;return out;};ps.kitDefenseCandidate=()=>null;let hits=0;ps.applyHit=()=>{hits++;};
  const target={alive:true,team:1,form:'kid',pos:{x:2,y:0,z:.5}};f.G.actors=[target];f.beginActorMotionTick(f.G.actors);target.pos.x=-2;
  r.stepHead(p,1/60);return hits;
 };
 assert.equal(await run(false),1);assert.equal(await run(true),0);
});
