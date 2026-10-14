import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 const actor=f.make();actor.weapon={...actor.weapon,special:'ultraStamp',specialCost:100};
 actor.special=100;actor.remote=false;actor.alive=true;actor._resolve=()=>{};actor.grounded=true;
 f.G.actors=[actor];const events=[];
 f.on('all:special',event=>{if(event.id==='ultraStamp')events.push(event);});
 actor._startSpecial();
 return {f,actor,events};
}
test('Ultra Stamp continuously swings only at 47F, 67F, 80F, then every 13F',async()=>{
 const {actor,events}=await setup(),frames=[];
 actor.intent.fire=true;
 for(let frame=1;frame<=93;frame++){
   const prior=events.filter(e=>e.action==='swing').length;
   actor._updateSpecial(1/60);
   if(events.filter(e=>e.action==='swing').length>prior)frames.push(frame);
 }
 assert.deepEqual(frames,[47,67,80,93]);
});
test('Ultra Stamp releases ZR without generating extra hits and re-press requires first-swing windup',async()=>{
 const {actor,events}=await setup();
 actor.intent.fire=true;for(let i=0;i<47;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='swing').length,1);
 actor.intent.fire=false;actor._updateSpecial(1/60);
 actor.intent.fire=true;
 for(let i=0;i<30;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='swing').length,1);
 actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='swing').length,2);
});
test('Ultra Stamp throwing has 42F source windup after releasing R',async()=>{
 const {f,actor,events}=await setup();
 actor.intent.sub=true;actor._updateSpecial(1/60);
 actor.intent.sub=false;actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='throw').length,0);
 for(let i=0;i<41;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='throw').length,0);
 actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='throw').length,1);
 assert.ok(f.G.projectiles.list.some(p=>p.s3AllSpecial==='ultraStamp'));
 assert.equal(actor.specialActive,null);
});
