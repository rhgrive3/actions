import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function harness(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
 const actor=f.make();
 actor.weapon={...actor.weapon,special:'tripleInkstrike',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor._resolve=()=>{};
 f.G.actors=[actor];
 const events=[];f.on('all:special',e=>{if(e.id==='tripleInkstrike')events.push(e);});
 actor._startSpecial();
 return {f,actor,events};
}
test('S3 Triple Inkstrike begins first throw after 20F activation and 14F startup',async()=>{
 const {f,actor,events}=await harness();
 actor.intent.fire=true;
 for(let i=0;i<33;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='marker').length,0);
 actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='marker').length,1);
 assert.equal(actor._s3AllSpecialState.shots,1);
 assert.equal(f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='marker').length,1);
});
test('Triple Inkstrike respects source 33F between marker throws and restricts squid transformation',async()=>{
 const {actor,events}=await harness();actor.intent.fire=true;
 for(let i=0;i<34;i++)actor._updateSpecial(1/60);
 actor.intent.fire=false;actor.intent.squid=true;actor._updateSpecial(1/60);
 assert.equal(actor.form,'kid','Tornado launcher stays in kid form');
 actor.intent.fire=true;
 for(let i=35;i<66;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='marker').length,1);
 actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='marker').length,2);
 actor.intent.fire=false;actor._updateSpecial(1/60);
 actor.intent.fire=true;
 for(let i=68;i<100;i++)actor._updateSpecial(1/60);
 assert.equal(events.filter(e=>e.action==='marker').length,3);
 assert.equal(actor.specialActive,null);
});
test('S3 Triple Inkstrike descends for 82F and lasts exactly 51F with eleven 5F damage ticks',async()=>{
 const {f,actor}=await harness();actor.intent.fire=true;
 for(let i=0;i<34;i++)actor._updateSpecial(1/60);
 actor.intent.fire=false;
 const obj=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='marker');
 assert.ok(obj);assert.ok(Math.abs(obj.flight-82/60)<1e-10);
 const victim=f.make();victim.team=1;victim.pos.copy(obj.target);victim.alive=true;
 f.G.actors=[actor,victim];
 const hit=[];f.G.projectiles.applyHit=(owner,target,damage,kind)=>{if(target===victim&&kind==='tripleInkstrike')hit.push(damage);return false;};
 for(let i=0;i<81;i++)f.G.projectiles.update(1/60);
 assert.equal(obj.kind,'marker');
 f.G.projectiles.update(1/60);
 assert.equal(obj.kind,'strike');
 assert.equal(hit.length,1,'first 37.5 hit at 82F');
 for(let i=0;i<51;i++)f.G.projectiles.update(1/60);
 assert.deepEqual(hit,Array(11).fill(37.5),'only eleven hits over the 51F damage window');
 assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(obj),false,'no lingering tornado after 51F');
});
