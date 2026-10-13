import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const actor=f.make();
 actor.weapon={...actor.weapon,special:'reefslider',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor.invuln=0;
 actor.aimDir.set(0,0,1);actor.aimYaw=0;actor._resolve=()=>{};
 f.G.actors=[actor];actor._startSpecial();
 return {f,actor,state:actor._s3AllSpecialState};
}
test('Reefslider: 38F startup with invulnerability beginning at frame 25',async()=>{
 const {actor,state}=await setup();
 for(let i=0;i<24;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'startup');
 assert.equal(actor.invuln,0,'no invulnerability before source 25F');
 actor._updateSpecial(1/60);
 assert.ok(actor.invuln>0,'source 25F admits invulnerability');
 for(let i=25;i<38;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'dash');
 assert.equal(actor.specialActive.phase,'dash');
});
test('Reefslider: 54F locked-heading dash accelerates at .031/frame to .405/frame',async()=>{
 const {actor,state}=await setup();
 for(let i=0;i<38;i++)actor._updateSpecial(1/60);
 actor.intent.move.set(1,0,0); // perpendicular input cannot steer an active slide
 for(let i=0;i<53;i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'brake');
 assert.ok(Math.abs(actor.pos.x)<1e-8,'source riding path never steers sideways');
 assert.ok(state.travel>19.2&&state.travel<19.6,`source-guided ~19.5 travel; got ${state.travel}`);
 assert.ok(Math.abs(state.reefSpeedRaw-.374)<1e-9,'brake subtracts the first .031 step');
});
test('Reefslider: early fire ignored, authorized 15F cancel brakes before the hit',async()=>{
 const {f,actor,state}=await setup();
 const events=[];f.on('all:special',e=>events.push(e));
 for(let i=0;i<38;i++)actor._updateSpecial(1/60);
 actor.intent.fire=true;actor._updateSpecial(1/60);
 assert.equal(state.phase,'dash','cannot cancel the first 15 movement frames');
 actor.intent.fire=false;actor._updateSpecial(1/60);
 for(let i=0;i<14;i++)actor._updateSpecial(1/60);
 actor.intent.fire=true;actor._updateSpecial(1/60);actor.intent.fire=false;
 assert.equal(state.phase,'brake');
 assert.equal(events.some(e=>e.action==='impact'),false);
 for(let i=0;i<38&&state.phase==='brake';i++)actor._updateSpecial(1/60);
 assert.equal(state.phase,'recovery');
 assert.equal(events.filter(e=>e.action==='impact').length,1);
 assert.ok(actor.invuln>0);
 for(let i=0;i<28&&actor.specialActive;i++)actor._updateSpecial(1/60);
 assert.equal(actor.specialActive,null);
});
