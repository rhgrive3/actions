import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { readySpecialEvidence, useSpecialEvidence } from './special-control-evidence.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';

function tickWorld(f, frames) {
 for(let i=0;i<frames;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
}

// The source's WaveParam.MaxFrame belongs to each ring, not the generator.
for(const [ap,maxFrames] of [[0,160],[57,216]]) {
 test(`Wave Breaker AP${ap} ring expires after ${maxFrames}F while other rings survive`,async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const owner=f.make();owner.s3.loadout=emptyLoadout();
  if(ap===57)for(const slot of owner.s3.loadout){slot.main='specialPower';slot.subs.fill('specialPower');}
  owner.s3RefreshGear();
  owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};
  owner.special=100;owner.alive=true;owner._resolve=()=>{};
  owner.intent.fire=false;owner.intent.sub=false;
  owner._prevIntent ||= {};Object.assign(owner._prevIntent,{fire:false,sub:false,jump:false,squid:false});
  f.G.actors=[owner];
  readySpecialEvidence(owner);useSpecialEvidence(f,owner);
  const objects=()=>f.G.projectiles._s3AllSpecialObjects||[];
  const generator=objects().find(o=>o.kind==='wave');
  assert.ok(generator,'real special deployment is required');
  assert.equal(generator.phase,'active','consumer starts after actual terrain contact');
  assert.equal(generator.maxWaveFrame,maxFrames/60);
  tickWorld(f,90);
  const first=objects().find(o=>o.kind==='waveFront'&&o.index===0);
  assert.ok(first,'first pulse must begin at 90F');
  assert.equal(first.dur,maxFrames/60);
  tickWorld(f,maxFrames-1);
  assert.ok(objects().includes(first),`ring should still live at ${maxFrames-1}F`);
  tickWorld(f,1);
  assert.equal(objects().includes(first),false,'expired front must leave the world list');
  assert.equal(first.dead,true,'expiry also retires its mesh and hit ledger');
  assert.ok(objects().some(o=>o.kind==='waveFront'&&!o.dead),
    'later independently emitted rings must remain active');
 });
}
