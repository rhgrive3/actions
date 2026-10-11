import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { batchFixture } from './batch03-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const DT=1/60, near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
async function charger(air=false) {
  const f=await fixture({productionComposition:true}), a=f.make('charger'), r=a.weaponRunner;
  a.grounded=!air; a.intent.fire=true; a.isLocal=true; a.ink=100; r.s3ChargerRepeat=true;
  const pitch=[],dings=[];
  f.G.audio={loop:()=>({set:p=>pitch.push(p.pitch),stop(){}}),play:id=>dings.push(id)};
  const step=(dt=DT)=>{f.G.time+=dt;r._charger(dt,{fire:true},a.weapon);};
  return {...f,a,r,pitch,dings,step};
}
test('#961 linear charge drives native charge, loop pitch, paid ink and full ding together',async()=>{
  const f=await charger();
  for(let frame=1;frame<=60;frame++){
    f.step();near(f.r.chargeT,frame/60);near(f.r.charge,frame/60);
    near(f.pitch.at(-1),1+frame/60*1.5);
    assert.equal(f.dings.filter(s=>s==='charger_full').length,frame===60?1:0);
    if(frame===8)near(100-f.a.ink,2.25);
  }
  near(100-f.a.ink,18);f.step();assert.equal(f.dings.filter(s=>s==='charger_full').length,1);
});
test('#971 airborne minimum is 8F and full is 164F; crossing step and landing retain progress',async()=>{
  const f=await charger(true);
  for(let frame=1;frame<=164;frame++){
    f.step();const elapsed=frame<=8?frame:(8+(frame-8)/3);
    near(f.r.chargeT,elapsed/60);
    if(frame===8)near(100-f.a.ink,2.25);
    assert.equal(f.r.charge===1,frame===164);
  }
  const split=await charger(true);for(let i=0;i<7;i++)split.step();split.step(2/60);near(split.r.chargeT,(8+1/3)/60);
  split.a.grounded=true;split.step();near(split.r.chargeT,(9+1/3)/60);
  const dry=await charger(true);dry.a.ink=1;dry.step();near(dry.r.chargeT,1/180);assert.ok(dry.r.charge<1/60,'low ink still slows the first phase');
});
test('#961/#971 fixed-clock cadence gives identical charge, ink and release state',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await charger(true),clock=new FixedClock(),rows=[];
    for(let n=0;n<hz*3;n++)clock.advance(1/hz,()=>{f.step();rows.push([f.r.charge,f.r.chargeT,f.a.ink]);});
    traces.push(rows);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('#1045 native Splatling rounds retain independent ±1.6-degree pitch endpoints and source bias through jump recovery',async()=>{
  const f=await batchFixture(),a=f.make('splatling');a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);a.aimPitch=0;a.aimYaw=0;
  const raw=f.profile.weaponsFidelityCompletion.weapons.splatling.WeaponParam;
  near(raw.PitchDegSwerve,1.6);near(raw.PitchDegBias,.4);
  const exponent=Math.log(raw.PitchDegBias)/Math.log(.5);
  for(const grounded of [false,true])for(const age of [null,0,25,40,70]){
    a.grounded=grounded;a.s3SplatlingJumpAgeFrames=age;
    for(const u of [0,.25,.5,.75,1-1e-12]){
      // Draw 1 is velocity variation; draws 2/3 are independent horizontal
      // and vertical signed-angle samples; draw 4 is the projectile seed.
      const draws=[.5,.75,u,.5];let calls=0;
      f.setRandom(()=>{calls++;return draws.shift()??.5;});
      f.G.projectiles.fireSplatling(a,a.weapon,7);
      const p=f.G.projectiles.list.at(-1),v=2*u-1;
      const pitch=Math.atan2(p.vel.y,Math.hypot(p.vel.x,p.vel.z))*180/Math.PI;
      const expected=raw.PitchDegSwerve*Math.sign(v)*Math.pow(Math.abs(v),exponent);
      near(pitch,expected,1e-5);
      assert.equal(calls,4,'two scatter samples plus velocity and shot seed');
      f.G.projectiles.clear();
    }
  }
});
test('#1065 downward straight flight is excluded, then descent starts at the sourced threshold',async()=>{
  for(const pitch of [-Math.PI/3,-Math.PI/6,0,Math.PI/6]){
    const f=await batchFixture(),a=f.make('slosher');a.pos.y=30;a.character.root.position.copy(a.pos);a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));
    f.G.projectiles.fireSlosh(a,a.weapon);const p=f.G.projectiles.list[0],d=p.fidelitySloshUnit.DamageParam;
    f.advanceFidelityProjectile(p,DT);f.advanceFidelityProjectile(p,DT);
    const boundary=p.pos.y, down=p.vel.y<0;
    if(down){if(pitch<-1)assert.ok(p.start.y-boundary>1.5);near(f.fidelityDamage(p,p.pos),70);}
    f.advanceFidelityProjectile(p,DT);
    const point=p.pos.clone();point.y=down?boundary-1:p.start.y-1;
    const expected=down?70-20/(7.625-1.5):70;
    near(f.fidelityDamage(p,point),expected);
    if(down){point.y=boundary-6.125;near(f.fidelityDamage(p,point),50);}
  }
});
test('#1065 fixed-clock descent and pooled glob reuse keep independent falloff anchors',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await batchFixture(),a=f.make('slosher');a.pos.y=100;a.character.root.position.copy(a.pos);a.aimDir.set(0,-.8,.6);
    f.G.projectiles.fireSlosh(a,a.weapon);const p=f.G.projectiles.list[0],clock=new FixedClock(),rows=[];
    for(let i=0;i<hz/2;i++)clock.advance(1/hz,dt=>{f.advanceFidelityProjectile(p,dt);rows.push([p.pos.y,f.fidelityDamage(p,p.pos)]);});traces.push(rows);
    f.G.projectiles.clear();a.aimDir.set(0,.8,.6);f.G.projectiles.fireSlosh(a,a.weapon);const next=f.G.projectiles.list[0];f.advanceFidelityProjectile(next,DT);assert.equal(next.fidelitySloshDownward,false);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('#202 real main-projectile and finite Charger sweeps use independent form radii without terrain changes',async()=>{
  const f=await batchFixture(),a=f.make('charger'),victim=f.make();victim.team=1;victim.invuln=0;victim.pos.set(0,0,0);f.G.actors=[victim];
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  near(f.PLAYER.s3SwimHurtRadius/f.PLAYER.s3HumanoidHurtRadius,.675/.35);near(f.PLAYER.radius,.38);near(f.PLAYER.squidHeight,.55);
  for(const form of ['kid','squid']){
    victim.form=form;const radius=form==='kid'?.35:.675;
    for(const delta of [-.0001,.0001]){
      const y=.675,z=radius+delta;
      const p={prev:new f.THREE.Vector3(-2,y,z),pos:new f.THREE.Vector3(2,y,z),owner:a,team:0,wid:'shooter',size:0,age:.1};
      assert.equal(f.fidelityProjectileTargets(f.G.projectiles,p).length,delta<0?1:0);
      const raw=f.profile.weaponsFidelityCompletion.weapons.charger.CollisionParam,bullet=Math.max(raw.InitRadiusForPlayer,raw.EndRadiusForPlayer),hits=[];
      f.G.projectiles._muzzle=(_a,out)=>out.set(-2,y,radius+bullet+delta);f.G.projectiles._aimFrom=(_a,_m,out)=>out.set(1,0,0);f.G.projectiles.applyHit=(_a,e)=>hits.push(e);
      f.G.projectiles.fireCharger(a,a.weapon,1);for(let n=0;n<10;n++)f.G.projectiles.update(DT);assert.equal(hits.length,delta<0?1:0);f.G.projectiles.clear();
    }
  }
});
