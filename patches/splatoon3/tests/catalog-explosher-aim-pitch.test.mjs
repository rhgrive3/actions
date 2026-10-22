import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const RAD=Math.PI/180, HZ=60;
const near=(a,b,context)=>assert.ok(Math.abs(a-b)<1e-6,`${context}: got ${a}, expected ${b}`);
const record=name=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceActor===name);
  assert.ok(r,'pinned 11.3.0 source '+name);return r;
};

test('Explosher main round obeys -45° view pitch, not a stale horizontal/near-floor reticle target',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const G=f.G,system=G.projectiles,source=record('WeaponSlosherWashtub');
  G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  const unit=source.parameters.UnitGroupParam.Unit[0];
  assert.equal(unit.AddSpawnSpeedYRateByXZ,.1,'sourced Explosher lift is XZ-relative');
  assert.equal(unit.MoveParam.GoStraightToBrakeStateFrame,8,'Explosher starts with 8 straight frames');
  assert.equal(unit.SpawnSpeedGround,1.4105,'ground launch speed is pinned 11.3.0');

  function fire(pitch,reticle){
    system.clear();G.actors.length=0;G.physics.level=null;
    const actor=f.make(source.id);actor.form='kid';actor.ink=100;
    actor.grounded=true;actor.vel.set(0,0,0);
    actor.aimYaw=0;actor.aimPitch=pitch*RAD;
    actor.aimPoint.set(0,reticle==='stale-horizontal'?1.05:-.4,reticle==='stale-horizontal'?70:4);
    actor.intent.fire=true;
    let round=null;
    for(let frame=0;frame<50&&!round;frame++){
      f.tick(actor);
      round=system.list.find(p=>p.catalog?.r?.sourceActor==='WeaponSlosherWashtub');
    }
    actor.intent.fire=false;
    assert.ok(round,`Explosher must emit a round for ${pitch}°`);
    assert.equal(system.list.filter(p=>p.catalog?.r?.sourceActor==='WeaponSlosherWashtub').length,1,
      'exactly one sourced explosive main round, not a pellet fan');
    assert.equal(round.catalog.descriptor.unit,0);
    const speed=unit.SpawnSpeedGround*HZ,angle=pitch*RAD;
    near(round.vel.x,0,`${pitch}° lateral speed`);
    near(round.vel.z,speed*Math.cos(angle),`${pitch}° forward speed`);
    near(round.vel.y,speed*(Math.sin(angle)+unit.AddSpawnSpeedYRateByXZ*Math.cos(angle)),
      `${pitch}° vertical speed with horizontal-only sourced lift`);
    return {round,actor};
  }

  for(const pitch of [-85,-45,-20,0,40,85]){
    fire(pitch,'stale-horizontal');
    fire(pitch,'close-ground');
  }

  const {round}=fire(-45,'stale-horizontal');
  const y0=round.pos.y,z0=round.pos.z;
  assert.equal(system._step(round,1/60),false,'no impact in test-only empty world');
  near(round.pos.y-y0,round.vel.y/HZ,'first straight-tick downward displacement');
  near(round.pos.z-z0,round.vel.z/HZ,'first straight-tick forward displacement');
  assert.ok(round.pos.y<y0-.8,'Explosher should visibly drop on its first -45° straight tick');
  assert.ok(round.pos.z>z0+.95,'Explosher retains source initial forward momentum');
});

test('other catalog Sloshers reuse camera yaw/pitch and XZ lift, not reticle-muzzle convergence',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const G=f.G,system=G.projectiles;
  G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  for(const actorName of ['WeaponSlosherLauncher','WeaponSlosherDouble','WeaponSlosherBathtub']){
    system.clear();G.actors.length=0;G.physics.level=null;
    const source=record(actorName);
    const actor=f.make(source.id);
    actor.form='kid';actor.ink=100;actor.grounded=true;actor.vel.set(0,0,0);
    actor.aimYaw=0;actor.aimPitch=-45*RAD;
    // Deliberately stale world reticle: only the admitted camera direction
    // defines Slosher shot pitch, just as the native Slosher owner does.
    actor.aimPoint.set(0,1.05,70);
    actor.intent.fire=true;
    let round=null;
    for(let frame=0;frame<60&&!round;frame++){
      f.tick(actor);
      round=system.list.find(p=>p.catalog?.r?.sourceActor===actorName);
    }
    actor.intent.fire=false;
    assert.ok(round,actorName+' must emit a sourced round');
    const u=round.catalog.descriptor.packet,ang=-45*RAD,speed=u.SpawnSpeedGround*HZ;
    const initialYaw=u.BaseRotateYDegree||0;
    // For the first round of these weapons the source has no pitch offset,
    // so positive vertical lift is determined only by the XZ speed.
    assert.ok((u.SpawnRotateXDegree??u.SpawnRotateXDegreeBase??0)===0,actorName+' first source pitch offset');
    near(round.vel.y,speed*(Math.sin(ang)+(u.AddSpawnSpeedYRateByXZ||0)*Math.cos(ang)),
      actorName+' emitted source downward speed');
    near(Math.hypot(round.vel.x,round.vel.z),speed*Math.cos(ang),
      actorName+' initial forward XZ magnitude');
    assert.ok(Number.isFinite(initialYaw));
  }
});
