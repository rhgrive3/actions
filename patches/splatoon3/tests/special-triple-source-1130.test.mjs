import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function harness(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const actor=f.make();
 actor.weapon={...actor.weapon,special:'tripleInkstrike',specialCost:100};
 actor.special=100;actor.remote=false;actor.alive=true;actor._resolve=()=>{actor.grounded=true;};
 f.G.actors=[actor];
 const events=[];f.on('all:special',e=>{if(e.id==='tripleInkstrike'&&e.action==='marker')events.push(e);});
 actor._startSpecial();
 const tick=()=>{f.G.time+=1/60;if(actor.specialActive)actor._updateSpecial(1/60);};
 const release=()=>{actor.intent.sub=true;tick();actor.intent.sub=false;tick();};
 return {f,actor,events,tick,release};
}
test('Triple Inkstrike keeps sub-release command and source 20F +14F first throw',async()=>{
 const {f,actor,events,tick,release}=await harness();
 release();
 for(let i=3;i<34;i++)tick();
 assert.equal(events.length,0,'no premature marker before the 34th activation frame');
 tick();
 assert.equal(events.length,1);
 const marker=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='marker');
 assert.ok(marker);
 assert.equal(Math.round(marker.flight*60),82);
 assert.equal(actor.form,'kid');
});
test('Triple Inkstrike three sub-release throws are separated by 33F (34/67/100)',async()=>{
 const {actor,events,tick,release}=await harness();
 release();
 for(let i=3;i<=34;i++)tick();
 assert.equal(events.length,1);
 release(); // 35 and 36
 for(let i=37;i<=66;i++)tick();
 assert.equal(events.length,1);
 tick(); // 67
 assert.equal(events.length,2);
 release(); // 68 and 69
 for(let i=70;i<=99;i++)tick();
 assert.equal(events.length,2);
 tick(); // 100
 assert.equal(events.length,3);
 assert.equal(actor.specialActive,null,'third throw ends the weapon usage');
});
test('Triple Inkstrike begins at 82F after marker and applies 11 damage pulses over 51F',async()=>{
 const {f,actor,events,tick,release}=await harness();
 release();
 for(let i=3;i<=34;i++)tick();
 assert.equal(events.length,1);
 const marker=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='marker');
 assert.ok(marker);
 const victim=f.make();victim.team=1;victim.pos.copy(marker.target);victim.alive=true;
 f.G.actors=[actor,victim];
 const hits=[],old=f.G.projectiles.applyHit;
 f.G.projectiles.applyHit=(owner,other,damage,kind)=>{if(kind==='tripleInkstrike'&&other===victim)hits.push(damage);return false;};
 try{
   for(let i=0;i<81;i++)f.G.projectiles.update(1/60);
   assert.equal(marker.kind,'marker','no early tornado');
   assert.equal(hits.length,0);
   f.G.projectiles.update(1/60);
   assert.equal(marker.kind,'strike');
   assert.equal(hits.length,1,'first hit at frame 82');
   for(let i=0;i<50;i++)f.G.projectiles.update(1/60);
   assert.equal(hits.length,11,'5-frame damage cadence includes 0,5,...50');
   f.G.projectiles.update(1/60);
   assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(marker),false,'no lingering tornado after 51F');
 }finally{f.G.projectiles.applyHit=old;}
});
