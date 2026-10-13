import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EXTRA = [
  "export {crabAttackTargetVelocity,krakenDashSweptContact,ALL_SPECIALS} from './patches/splatoon3/runtime/all-specials.mjs';",
  "export {SPECIAL_NAMES} from './patches/splatoon3/runtime/catalogue.mjs';",
].join('\n');

async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  f.G.physics.los=()=>true;
  return f;
}
function equip(actor,id){
  actor.weapon={...actor.weapon,special:id,specialCost:100};
  actor.special=100;actor.remote=false;actor.alive=true;
  actor._resolve=()=>{};
  actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;
  actor._prevIntent||={};
  Object.assign(actor._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});
}
function tickWorld(f,n){for(let i=0;i<n;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}

test('all 19 S3 multiplayer specials remain registered on the real production Actor',async()=>{
  const f=await world();
  const ids=Object.keys(f.SPECIAL_NAMES);
  assert.equal(ids.length,19);
  for(const id of ids)assert.equal(f.SPECIALS[id]?.id,id,id+' is installed');
  assert.equal(Object.keys(f.ALL_SPECIALS).length,13,'13 catalogued and 6 native families');
});

test('S3 11.3.0 Chariot attack mode has .075F lateral and .015F forward source velocities',async()=>{
  const f=await world(),target=f.crabAttackTargetVelocity;
  const right=target({x:1,z:0},0),forward=target({x:0,z:1},0);
  assert.equal(right.x,4.5);assert.equal(right.z,0);
  assert.equal(forward.x,0);assert.equal(forward.z,.9);
  const rotated=target({x:0,z:1},Math.PI/2);
  assert.ok(Math.abs(rotated.x)<1e-10);
  assert.ok(Math.abs(rotated.z-4.5)<1e-10);
  const invalid=target({x:Infinity,z:1},0);
  assert.equal(invalid.x,0);assert.equal(invalid.z,0);
});

test('S3 11.3.0 Kraken dash sweeps the whole player collision capsule of radius 1.5',async()=>{
  const f=await world(),admit=f.krakenDashSweptContact;
  const a={x:0,z:0},b={x:0,z:.35};
  assert.equal(admit(a,b,{x:1.49,z:0}),true,'start endpoint');
  assert.equal(admit(a,b,{x:1.49,z:.35}),true,'end endpoint');
  assert.equal(admit(a,b,{x:1.51,z:.35}),false,'outside');
  assert.equal(admit(a,a,{x:0,z:0}),true,'degenerate segment');
  assert.equal(admit(a,b,{x:Infinity,z:0}),false,'non-finite target');
});

test('S3 Triple Inkstrike R-release creates the native 82-frame descending marker',async()=>{
  const f=await world(),a=f.make();equip(a,'tripleInkstrike');f.G.actors=[a];
  a._startSpecial();
  a.intent.sub=true;a._updateSpecial(1/60);
  a.intent.sub=false;a._updateSpecial(1/60);
  for(let i=0;i<16&&!(f.G.projectiles._s3AllSpecialObjects||[]).some(o=>o.kind==='marker');i++)a._updateSpecial(1/60);
  const marker=f.G.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='marker');
  assert.ok(marker,'R release must queue a marker, not ZR fire');
  assert.ok(Math.abs(marker.flight-82/60)<1e-9);
  tickWorld(f,81);
  assert.equal(marker.kind,'marker','no early damage before 82F');
  tickWorld(f,1);
  assert.equal(marker.kind,'strike','damage starts at 82F');
  assert.ok(Math.abs(marker.dur-51/60)<1e-9,'51F strike duration');
});

test('Triple Inkstrike strike removes itself at 51F after the sourced 82F landing',async()=>{
  const f=await world(),owner=f.make();equip(owner,'tripleInkstrike');f.G.actors=[owner];
  owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);
  owner.intent.sub=false;owner._updateSpecial(1/60);
  for(let i=0;i<16&&!(f.G.projectiles._s3AllSpecialObjects||[]).some(o=>o.kind==='marker');i++)owner._updateSpecial(1/60);
  const marker=f.G.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='marker');
  assert.ok(marker);
  tickWorld(f,82);
  assert.equal(marker.kind,'strike');
  tickWorld(f,50);
  assert.ok(f.G.projectiles._s3AllSpecialObjects.includes(marker),'still present after 50F');
  tickWorld(f,1);
  assert.ok(!f.G.projectiles._s3AllSpecialObjects.includes(marker),'finished after 51F');
});
