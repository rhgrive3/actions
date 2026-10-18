import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {ALTERNATE_WEAPON_KITS} from '../runtime/alternate-weapon-kits-data.mjs';

const DT=1/60;
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer');
const close=(actual,expected,message='')=>assert.ok(Math.abs(actual-expected)<1e-7,`${message}: ${actual} != ${expected}`);
const clean=value=>JSON.parse(JSON.stringify(value));
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return f;
}
function release(f,r,frames){
  const a=f.make(r.id);a.form='kid';a.grounded=true;
  for(let i=0;i<frames;i++)a.weaponRunner.update(DT,{fire:true,firePressed:i===0});
  a.weaponRunner.update(DT,{fire:false});
  return a;
}

test('all three Stringer gameplay records match the retained pinned 1130 primary rows',()=>{
  assert.equal(MAIN_WEAPON_CATALOG.sourceCommit,'7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  for(const r of rows){
    const bytes=fs.readFileSync(new URL(`fixtures/source-1130/weapon/${r.sourceActor}.game__GameParameterTable.json`,import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),r.sourceSha256);
    const source=JSON.parse(bytes).GameParameters;
    for(const group of ['ChargeParam','ChargeKeepParam','ShotParam'])
      assert.deepEqual(clean(r.parameters.spl__WeaponStringerParam[group]),source.spl__WeaponStringerParam[group]);
    for(const group of ['DamageParam','CollisionParam','MoveParam'])
      assert.deepEqual(clean(r.parameters.spl__BulletStringerParam[group]),source.spl__BulletStringerParam[group]);
    const blast={...source.spl__BulletStringerParam.DetonationParam.BlastParam};delete blast.KnockBackParam;
    assert.deepEqual(clean(r.parameters.spl__BulletStringerParam.DetonationParam.BlastParam),blast);
  }
});

test('Stringer min/mid/full releases use each explicit recovery stage and charge-dependent damage/speed',async()=>{
  const f=await world();
  for(const r of rows){
    const charge=r.parameters.spl__WeaponStringerParam.ChargeParam;
    const bullet=r.parameters.spl__BulletStringerParam;
    for(const id of [r.id,...ALTERNATE_WEAPON_KITS.filter(kit=>kit.baseId===r.id).map(kit=>kit.id)])
    for(const [name,stem] of [['Min','Min'],['Mid','Mid'],['Full','Max']]){
      f.G.projectiles.clear();f.G.actors.length=0;
      const a=release(f,{...r,id},charge[`ChargeFrame${name}Charge`]);
      const rounds=f.G.projectiles.list.filter(p=>p.owner===a);
      assert.equal(rounds.length,r.parameters.spl__WeaponStringerParam.ShotParam.ArrowNum??3,r.id+' '+name);
      close(a.weaponRunner.cooldown*60,charge[`FreezeFrame${name}Charge`],id+' '+name+' recovery');
      close(rounds[0].damage,bullet.DamageParam[`DirectHitDamage${stem}`]/10,r.id+' '+name+' damage');
      close(rounds[0].vel.length(),bullet.MoveParam[`SpawnSpeed${stem}`]*60,r.id+' '+name+' speed');
      close(100-a.ink,charge[`InkConsume${name}Charge`]*100,r.id+' '+name+' ink');
    }
  }
});

test('Stringer explosion damage and LOS use DamageOffsetY, including sub/special objects and boss',async()=>{
  const f=await world();
  for(const r of rows.filter(r=>r.sourceActor!=='WeaponStringerShort')){
    f.G.projectiles.clear();f.G.actors.length=0;
    const a=release(f,r,r.parameters.spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge);
    const p=f.G.projectiles.list[0],victim=f.make();victim.team=1;
    p.pos.set(0,1,10);p.catalog.stuck=true;p.catalog.fuse=DT;
    const radius=r.parameters.spl__BulletStringerParam.DetonationParam.BlastParam.DistanceDamage[0].Distance;
    victim.pos.set(0,1+.6+radius-.01-.7,10);
    const hits=[],origins=[],objects=[],paintRows=[];
    f.G.paint.splat=(at,_radius,_team,opts)=>{paintRows.push({at:at.clone(),footprint:opts.footprint});return 0;};
    f.G.physics.los=(from)=>{origins.push(from.clone());return from.y>1.5;};
    f.G.projectiles.applyHit=(owner,target,damage)=>hits.push({owner,target,damage});
    f.G.projectiles.s3DamageSubObjects=(_area,at)=>objects.push(['sub',at.clone()]);
    f.G.projectiles.s3DamageSpecialObjects=(_area,at)=>objects.push(['special',at.clone()]);
    f.G.boss={splash:(_owner,at)=>objects.push(['boss',at.clone()])};
    assert.equal(f.G.projectiles._step(p,DT),true);
    assert.equal(hits.length,1,r.id+' elevated target is within offset damage sphere');
    assert.equal(hits[0].target,victim);
    close(hits[0].damage,r.parameters.spl__BulletStringerParam.DetonationParam.BlastParam.DistanceDamage[0].Damage/10);
    close(origins[0].y,1.6,r.id+' LOS starts at damage centre');
    assert.equal(objects.length,3);
    for(const [kind,at] of objects){close(at.x,0);close(at.y,1.6,r.id+' '+kind);close(at.z,10);}
    close(p.pos.y,1,'damage offset must not relocate the lodged arrow');
    assert.ok(paintRows.length>0,r.id+' owner blast still paints');
    for(const stamp of paintRows){close(stamp.at.y,1.6,r.id+' independent paint centre');assert.equal(stamp.footprint,'ink-blast','latest main blast contour survives damage-offset integration');}
    f.G.boss=null;
  }
});

test('LACT arrows never inherit explosive bolt capability; Tri/Wellstring lodge from first ring',async()=>{
  const f=await world();
  for(const r of rows)for(const stage of ['Min','Mid','Full']){
    f.G.projectiles.clear();f.G.actors.length=0;
    const frames=r.parameters.spl__WeaponStringerParam.ChargeParam[`ChargeFrame${stage}Charge`];
    release(f,r,frames);const p=f.G.projectiles.list[0];f.G.actors.length=0;
    f.G.physics.segment=(from,to,h)=>{
      h.hit=true;h.dist=from.distanceTo(to)*.5;h.point.copy(from).lerp(to,.5);h.normal.set(0,0,-1);h.face=-1;return h;
    };
    const explosive=r.sourceActor!=='WeaponStringerShort'&&stage!=='Min';
    assert.equal(f.G.projectiles._step(p,DT),!explosive,r.id+' '+stage+' contact retirement');
    assert.equal(p.catalog.stuck,explosive,r.id+' '+stage+' explosive capability');
    if(explosive){
      for(let i=0;i<44;i++)assert.equal(f.G.projectiles._step(p,DT),false,'45F source fuse');
      assert.equal(f.G.projectiles._step(p,DT),true,'one blast at source fuse boundary');
    }
  }
});

test('Stringer offset blast keeps wall/step occlusion and independent arrow overlaps',async()=>{
  const f=await world(),r=rows.find(r=>r.sourceActor==='WeaponStringerExplosion');
  const a=release(f,r,80),shots=f.G.projectiles.list.slice(),victim=f.make();victim.team=1;victim.pos.set(0,.9,10);
  const hits=[];f.G.projectiles.applyHit=(_a,target,damage)=>hits.push([target,damage]);
  f.G.projectiles.s3DamageSubObjects=()=>{};f.G.projectiles.s3DamageSpecialObjects=()=>{};
  for(let i=0;i<shots.length;i++){
    const p=shots[i];p.pos.set(0,1,10);p.catalog.stuck=true;p.catalog.fuse=DT;
    f.G.physics.los=()=>i!==1; // One arrow is behind a wall; four have clear LOS.
    f.G.projectiles._step(p,DT);
  }
  assert.equal(hits.length,4,'a wall blocks its arrow without suppressing other blast instances');
  assert.equal(hits.reduce((n,h)=>n+h[1],0),120);
});

test('all Stringers and derived kits cap actual full-charge jump admission at the explicit source impulse',async()=>{
  const f=await world();
  for(const r of rows){
    const kits=[r.id,...ALTERNATE_WEAPON_KITS.filter(kit=>kit.baseId===r.id).map(kit=>kit.id)];
    for(const id of kits){
      const a=f.make(id);a.form='kid';a.intent.fire=true;
      f.tick(a,r.parameters.spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge);
      close(a.weaponRunner.charge,1,id+' fully funded before takeoff');
      a.intent.jump=true;f.tick(a);
      assert.equal(a.grounded,false,id+' actual jump admitted');
      close(a.vel.y,r.parameters.spl__WeaponStringerParam.ChargeParam.JumpHeightFullCharge*60,id+' source jump cap');
      assert.ok(a.character.events.some(event=>event[0]==='jump'),id+' character receives jump');
      const ordinary=f.make(id);ordinary.form='kid';ordinary.intent.jump=true;f.tick(ordinary);
      assert.ok(ordinary.vel.y>a.vel.y,id+' uncharged takeoff retains normal impulse');
    }
    const air=f.make(r.id);air.form='kid';air.grounded=false;air.intent.fire=true;
    const charge=r.parameters.spl__WeaponStringerParam.ChargeParam;
    f.tick(air,charge.ChargeFrameFullCharge*(charge.AirChargeRateByInkEmpty===3?1:3));
    close(air.weaponRunner.charge,1,r.id+' air-charge fixed-step boundary');
    air.grounded=true;air.ground.hit=true;air.intent.jump=true;f.tick(air);
    close(air.vel.y,charge.JumpHeightFullCharge*60,r.id+' airborne rounding cannot bypass full-charge cap');
  }
});

test('LACT mid recovery gates the next admitted volley; fractional in-between recovery is explicit reconstruction',async()=>{
  const f=await world(),r=rows.find(r=>r.sourceActor==='WeaponStringerShort');
  for(const [frames,recovery] of [[12,15],[9,11.5]]){
    f.G.projectiles.clear();f.G.actors.length=0;
    const a=release(f,r,frames),first=f.G.projectiles.list.length;
    for(let i=1;i<Math.ceil(recovery);i++){
      a.weaponRunner.update(DT,{fire:true,firePressed:i===1});
      close(a.weaponRunner.catalogState.chargeF,0,'no charge during source recovery');
      assert.equal(f.G.projectiles.list.length,first,'no early second volley');
    }
    a.weaponRunner.update(DT,{fire:true});close(a.weaponRunner.catalogState.chargeF,1,'first eligible recharge frame');
    for(let i=1;i<6;i++)a.weaponRunner.update(DT,{fire:true});
    a.weaponRunner.update(DT,{fire:false});
    assert.equal(f.G.projectiles.list.length,first+3,'subsequent six-frame funded tap emits one volley');
  }
});

test('replicated explosive arrows preserve lodging and fuse presentation without any damage or paint authority',async()=>{
  const f=await world();
  for(const r of rows){
    f.G.projectiles.clear();f.G.actors.length=0;
    const a=release(f,r,r.parameters.spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge),p=f.G.projectiles.list[0];
    a.nid=1;let packet;
    f.NetMatch.prototype.recProj.call({_rec:row=>{packet=[0,...row,0,1];return packet;},cfg:{id:'stringer-source'}},p);
    const remote=f.make(r.id);remote.remote=true;
    f.G.projectiles.ghostProjectile(remote,packet);const ghost=f.G.projectiles.list.at(-1);
    assert.ok(ghost.ghost&&ghost.catalog,'actual recorder/ghost reconstitution');
    assert.ok(ghost.vel.distanceTo(p.vel)<.02,'source launch vector survives quantization');
    f.G.actors.length=0;let paint=0,damage=0,explosions=0;
    f.G.paint.splat=()=>{paint++;return 0;};f.G.projectiles.applyHit=()=>{damage++;};
    f.G.projectiles.s3DamageSubObjects=()=>{damage++;};f.G.projectiles.s3DamageSpecialObjects=()=>{damage++;};
    f.G.fx={explosion:()=>{explosions++;}};
    f.G.physics.segment=(from,to,h)=>{h.hit=true;h.dist=from.distanceTo(to)*.5;h.point.copy(from).lerp(to,.5);h.normal.set(0,0,-1);h.face=-1;return h;};
    ghost._netSteps=70;ghost._netMaxSteps=74;
    const explosive=r.sourceActor!=='WeaponStringerShort';
    assert.equal(f.G.projectiles._step(ghost,DT),!explosive,r.id+' remote impact');
    if(explosive){
      assert.equal(ghost.catalog.stuck,true,'remote bolt remains lodged');
      assert.ok(ghost._netMaxSteps>=117,'bounded late lodging extends the cosmetic fuse lifetime');
      for(let i=0;i<44;i++)assert.equal(f.G.projectiles._step(ghost,DT),false);
      assert.equal(explosions,0,'no early remote explosion');
      assert.equal(f.G.projectiles._step(ghost,DT),true);assert.equal(explosions,1,'one source-timed remote burst');
    }else assert.equal(explosions,0,'LACT remote bolt has no explosive capability');
    assert.equal(paint,0,'only owner splat packets can paint');assert.equal(damage,0,'visual bolt has no hit authority');
  }
});
