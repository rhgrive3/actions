import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;
}
function equip(f,id){
  const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};
  a.special=100;a._resolve=()=>{};a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
  a._startSpecial();return a;
}

test('Tenta target moves while rising, then each descending missile retains its landing point',async()=>{
  const f=await world();
  for(const hz of [30,60,120]){
    f.G.projectiles.clear();f.G.actors=[];
    const owner=equip(f,'tentaMissiles'),victim=f.make();victim.team=1;victim.pos.set(0,0,10);
    owner.intent.fire=true;owner._updateSpecial(1/60);
    const p=f.G.projectiles.list.find(p=>p.s3AllSpecial==='tentaMissiles');assert.ok(p);
    assert.equal(p.s3TentaTargetActor,victim);
    victim.pos.set(3,0,12);
    for(let i=0;i<hz/2;i++)f.G.projectiles.update(1/hz);
    assert.equal(p.s3TentaDescending,false);assert.equal(p.s3TentaTarget.x,3);assert.equal(p.s3TentaTarget.z,12);
    victim.pos.set(5,0,15);
    for(let i=0;i<hz/4+1;i++)f.G.projectiles.update(1/hz);
    assert.equal(p.s3TentaDescending,true);
    const landing=p.s3TentaTarget.clone();victim.pos.set(30,0,40);
    f.G.projectiles.update(1/hz);
    assert.deepEqual(p.s3TentaTarget.toArray(),landing.toArray(),`${hz}Hz descent cannot follow later dodges`);
  }
});

test('Tenta cannot reacquire a respawned target, and pooled main rounds clear target references',async()=>{
  const f=await world(),owner=equip(f,'tentaMissiles'),victim=f.make();victim.team=1;victim.pos.set(0,0,10);
  owner.intent.fire=true;owner._updateSpecial(1/60);
  const p=f.G.projectiles.list.find(p=>p.s3AllSpecial==='tentaMissiles'),landing=p.s3TentaTarget.clone();
  victim.netLife=(victim.netLife||0)+1;victim.pos.set(40,0,40);f.G.projectiles.update(1/60);
  assert.deepEqual(p.s3TentaTarget.toArray(),landing.toArray());
  f.G.projectiles.list.splice(f.G.projectiles.list.indexOf(p),1);f.G.projectiles.pool.push(p);
  const recycled=f.G.projectiles._new('shooter',owner);assert.equal(recycled,p);
  assert.equal(recycled.s3TentaTargetActor,undefined);assert.equal(recycled.s3TentaTargetLife,undefined);
});

test('Zipcaster rejects floor hooks below source length 3, accepts the boundary and close walls',async()=>{
  const f=await world();
  for(const [length,floor,allowed] of [[2.99,true,false],[3,true,true],[.5,false,true]]){
    const a=equip(f,'zipcaster'),s=a._s3AllSpecialState;
    f.G.physics.raycast=(origin,dir,_range,h)=>{
      h.hit=true;h.point.copy(origin).addScaledVector(dir,length);h.normal.set(0,floor?1:0,floor?0:-1);return h;
    };
    const before=s.inkFuel;a.intent.sub=true;a._updateSpecial(1/60);
    assert.equal(s.phase,allowed?'hookFlight':'ready',`length=${length}, floor=${floor}`);
    const hookDebit=before-s.inkFuel-s.inkDrainPerSecond/60;
    assert.ok(Math.abs(hookDebit-(allowed?s.hookInkCost:0))<1e-8,'only valid terrain grips spend hook ink');
  }
});
