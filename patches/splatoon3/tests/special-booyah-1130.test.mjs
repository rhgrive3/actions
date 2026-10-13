import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function harness(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const actor=f.make();
 actor.weapon={...actor.weapon,special:'booyahBomb',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor._resolve=()=>{};
 f.G.actors=[actor];actor._startSpecial();
 return {f,actor,state:actor._s3AllSpecialState};
}
test('Nice Ball: no armor or charge until the source 30F startup completes',async()=>{
 const {actor,state}=await harness();
 assert.equal(state.armorHP,470);
 const hp=actor.hp;actor.damage(10,null,'shooter');assert.equal(actor.hp,hp-10);
 for(let i=0;i<29;i++)actor._updateSpecial(1/60);
 assert.equal(state.charge,0);assert.equal(actor.specialActive?.armor,false);
 actor._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-.002)<1e-10);
 assert.equal(actor.specialActive.armor,true);
 const shield=state.armorHP,remaining=actor.hp;
 actor.damage(10,null,'shooter');
 assert.equal(state.armorHP,shield-10);
 assert.equal(actor.hp,remaining,'armor absorbs the hit after 30F');
});
test('Nice Ball: only Booyah input charges; 10F rising-edge limiter cannot be bypassed',async()=>{
 const {actor,state}=await harness();
 for(let i=0;i<30;i++)actor._updateSpecial(1/60);
 const before=state.charge;
 actor.intent.booyah=true;actor._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-before-.079)<1e-10);
 actor.intent.booyah=false;actor._updateSpecial(1/60);
 const shortly=state.charge;
 actor.intent.booyah=true;actor._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-shortly-.002)<1e-10,'a second Booyah within 10F adds only auto-charge');
 actor.intent.booyah=false;
 for(let i=0;i<9;i++)actor._updateSpecial(1/60);
 const later=state.charge;
 actor.intent.booyah=true;actor._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-later-.079)<1e-10);
});
test('Nice Ball: premature throw is blocked; full charge persists until explicit ZR throw',async()=>{
 const {actor,state}=await harness();
 actor.intent.sub=true;actor._updateSpecial(1/60);
 assert.ok(actor.specialActive);
 actor.intent.sub=false;
 for(let i=1;i<30;i++)actor._updateSpecial(1/60);
 state.charge=1;
 for(let i=0;i<180;i++)actor._updateSpecial(1/60);
 assert.ok(actor.specialActive,'full charge does not automatically launch');
 actor.intent.fire=true;actor._updateSpecial(1/60);
 assert.equal(actor.specialActive,null);
});
test('Nice Ball: no input triggers the source automatic throw exactly at 600F',async()=>{
 const {f,actor,state}=await harness();
 for(let i=0;i<599;i++)actor._updateSpecial(1/60);
 assert.ok(actor.specialActive);
 assert.equal(state.charge,1);
 actor._updateSpecial(1/60);
 assert.equal(actor.specialActive,null);
 assert.ok(f.G.projectiles.list.some(p=>p.s3AllSpecial==='booyahBomb'));
});
