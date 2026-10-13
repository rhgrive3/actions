import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA = "export { tentaMissileCount } from './patches/splatoon3/runtime/all-specials.mjs';";
test('1 through 5 lock-ons create exactly 10/10/12/16/20 missiles at four-frame launch intervals',async()=>{
 for(const [n,expected] of [[1,10],[2,10],[3,12],[4,16],[5,20]]){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const owner=f.make();owner.weapon={...owner.weapon,special:'tentaMissiles',specialCost:100};owner.special=100;owner._resolve=()=>{};
  const targets=Array.from({length:n},(_,i)=>{const v=f.make();v.team=1;v.pos.set((i-(n-1)/2)*.3,0,8+i*.2);return v;});
  f.G.actors=[owner,...targets];
  let frame=0;const launches=[];const realPush=f.G.projectiles._push;
  f.G.projectiles._push=function(p){if(p.s3AllSpecial==='tentaMissiles')launches.push(frame);return realPush.call(this,p);};
  owner._startSpecial();owner.intent.fire=true;frame=1;owner._updateSpecial(1/60);owner.intent.fire=false;
  assert.equal(launches.length,1,`one rocket first frame with ${n} lock-ons`);
  for(let i=0;i<expected*4;i++){frame++;owner._updateSpecial(1/60);}
  assert.equal(launches.length,expected,`${n} targets ${expected} missiles`);
  for(let k=1;k<launches.length;k++) assert.equal(launches[k]-launches[k-1],4,`every missile 4F apart (${n} targets)`);
  assert.equal(owner.specialActive,null,`volley ends after final missile (${n} targets)`);
 }
});

test('no lock-on cannot invent fake targets, and 10s empty timer exits without firing',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=f.make();a.weapon={...a.weapon,special:'tentaMissiles',specialCost:100};a.special=100;a._resolve=()=>{};
 f.G.actors=[a];a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);a.intent.fire=false;
 assert.equal(f.G.projectiles.list.length,0);
 assert.equal(a.specialActive?.id,'tentaMissiles');
 for(let i=1;i<600;i++)a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);
 assert.equal(f.G.projectiles.list.length,0);
});