import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

test('Crab Tank roll collides over the 11.3.0 player radius 1.45, not the smaller 1.15 field radius', async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const owner=f.make(), inside=f.make(), outside=f.make();
 owner.weapon={...owner.weapon,special:'crabTank',specialCost:100};owner.special=100;
 owner._resolve=()=>{};
 inside.team=1;outside.team=1;
 f.G.actors=[owner,inside,outside];
 owner._startSpecial();
 inside.pos.copy(owner.pos);inside.pos.x+=1.3;
 outside.pos.copy(owner.pos);outside.pos.x+=1.55;
 const hits=[],nativeHit=f.G.projectiles.applyHit;
 f.G.projectiles.applyHit=function(...args){hits.push(args);return nativeHit.apply(this,args);};
 owner.intent.squid=true;
 for(let i=0;i<19;i++){f.G.time+=1/60;owner._updateSpecial(1/60);}
 assert.ok(hits.some(([a,v,d,cause])=>a===owner&&v===inside&&d===40&&cause==='crabTank'),
  'player at 1.3 units must collide inside radius 1.45');
 assert.equal(hits.filter(([a,v,d,cause])=>a===owner&&v===outside&&cause==='crabTank').length,0,
  'player at 1.55 units is outside radius 1.45');
});