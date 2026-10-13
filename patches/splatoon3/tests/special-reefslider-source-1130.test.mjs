import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA = "export {reefsliderRawSpeed} from './patches/splatoon3/runtime/all-specials.mjs';";
async function setUp(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const actor=f.make();actor.weapon={...actor.weapon,special:'reefslider',specialCost:100};
 actor.special=100;actor._resolve=()=>{};actor.alive=true;actor.grounded=true;
 f.G.actors=[actor];const events=[];f.on('all:special',e=>{if(e.id==='reefslider')events.push(e);});
 actor._startSpecial();
 return {f,actor,state:actor._s3AllSpecialState,events};
}
test('11.3.0 Reefslider 0.031/F acceleration and brake never exceeds source 0.405/F',async()=>{
 const {f}=await setUp();
 let speed=0,travel=0;
 for(let i=0;i<54;i++){
   speed=f.reefsliderRawSpeed(speed);
   travel+=speed;
 }
 assert.equal(speed,.405);
 assert.ok(travel>19.3&&travel<19.6,`54F travelled ${travel}`);
 for(let i=0;i<38;i++)speed=f.reefsliderRawSpeed(speed,true);
 assert.equal(speed,0);
 assert.equal(f.reefsliderRawSpeed(NaN),0);
 assert.equal(f.reefsliderRawSpeed(.2,false,-1),0);
});
test('11.3.0 Reefslider dash refuses early cancel, brakes for 38F then recovers for 28F',async()=>{
 const {actor,state,events}=await setUp();
 for(let i=0;i<38;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'dash');
 actor.intent.fire=true;
 for(let i=0;i<14;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'dash');
 actor.intent.fire=false;actor._updateSpecial(1/60);
 actor.intent.fire=true;actor._updateSpecial(1/60);
 assert.equal(state.phase,'brake');
 assert.equal(events.filter(e=>e.action==='impact').length,0);
 actor.intent.fire=false;
 for(let i=0;i<37;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'brake');
 actor._updateSpecial(1/60);
 assert.equal(state.phase,'recovery');
 assert.equal(events.filter(e=>e.action==='impact').length,1);
 for(let i=0;i<27;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'recovery');
 actor._updateSpecial(1/60);
 assert.equal(actor.specialActive,null);
});
test('Reefslider runs straight and source 54F timeout starts the 38F preburst',async()=>{
 const {actor,state,events}=await setUp();
 actor.aimDir.set(0,0,1);
 for(let i=0;i<38;i++)actor._updateSpecial(1/60);
 actor.intent.move.set(1,0,0);
 for(let i=0;i<54;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'brake');
 assert.ok(Math.abs(actor.pos.x)<1e-5,'sideways input cannot rotate the slide');
 assert.ok(state.travel>19.3&&state.travel<19.6,`unexpected travel ${state.travel}`);
 assert.equal(events.filter(e=>e.action==='impact').length,0);
 const dashTravel=state.travel;
 for(let i=0;i<38;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'recovery');
 assert.equal(state.travel,dashTravel,'braking movement cannot inflate the source 54F dash distance');
});

test('Reefslider direct contact uses the .8 radius at forward 1.0/up .8, not 1.2 around the feet',async()=>{
 const {f,actor,state}=await setUp();
 actor.aimDir.set(0,0,1);
 state.direction.set(0,0,1);
 const inside=f.make(),outside=f.make(),upper=f.make();
 for(const victim of [inside,outside,upper]){victim.team=1;victim.alive=true;}
 inside.pos.set(.7,0,1.02);
 outside.pos.set(1.05,0,1.02);
 upper.pos.set(0,4,1.02);
 f.G.actors=[actor,inside,outside,upper];
 const hits=[],original=f.G.projectiles.applyHit;
 f.G.projectiles.applyHit=(a,b,damage,id)=>{hits.push({a,b,damage,id});return false;};
 try{
  for(let i=0;i<38;i++)actor._updateSpecial(1/60);
  assert.equal(state.phase,'dash');
  actor._updateSpecial(1/60);
  assert.equal(hits.filter(h=>h.b===inside&&h.id==='reefslider').length,1,
    'within the source radius of the forward collision detector');
  assert.equal(hits.some(h=>h.b===outside&&h.id==='reefslider'),false,
    '1.05-unit lateral separation is beyond the .8-unit source radius');
  assert.equal(hits.some(h=>h.b===upper&&h.id==='reefslider'),false,
    'a player on an upper storey cannot be hit through the floor');
 }finally{f.G.projectiles.applyHit=original;}
});
