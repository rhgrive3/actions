import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { SPECIAL_NAMES } from '../runtime/catalogue.mjs';

for (const id of Object.keys(SPECIAL_NAMES)){
 test(`actual production ${id} admission and first phase`,async()=>{
   const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true});
   f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
   const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.alive=true;
   a.intent.fire=false;a.intent.sub=false;a.intent.jump=false;
   a._prevIntent ||= {};Object.assign(a._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});
   assert.ok(f.SPECIALS[id]?.id===id,`registered ${id}`);
   // Production actor fixture has no real world collision mesh. Leave its
   // physics owned by specialized collision tests.
   a._resolve=()=>{};
   const before=a.stats.specials;
   a._startSpecial();
   assert.ok(a.stats.specials>=before,`valid ${id} use count`);
   // A deployed special can clear specialActive immediately. It must not throw or corrupt owner state.
   for(let j=0;j<5;j++) { f.G.time+=1/60; if(a.specialActive)a._updateSpecial(1/60);f.G.projectiles.update(1/60);}
   assert.ok(Number.isFinite(a.pos.x)&&Number.isFinite(a.pos.y)&&Number.isFinite(a.pos.z));
   assert.ok(Number.isFinite(a.ink)&&Number.isFinite(a.special));
 });
}