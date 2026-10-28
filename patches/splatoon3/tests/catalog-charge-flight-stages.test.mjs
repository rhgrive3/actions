import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';

const chargers=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='charger'&&!r.legacy);
const bows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer');
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';"});
  return f;
}
function release(f,id,frames,height=8){
  const a=f.make(id);a.form='kid';a.isLocal=true;a.grounded=true;
  a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height+1.05,180);
  for(let i=0;i<frames;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
  a.weaponRunner.update(1/60,{fire:false});return a;
}

test('every catalogue Charger, including scope/Bamboo/Pencil kits, draws falling ink before it paints at 30/60/120Hz',async()=>{
  const f=await world();
  for(const row of chargers){
    let baseline=null;
    for(const hz of [30,60,120]){
      const {paint}=makePaintWorld(f),stamps=[];f.setRandom(()=>.37);
      const splat=paint.splat;paint.splat=function(at,r,team,o){stamps.push({at:at.clone(),t:f.G.time,o});return splat.call(this,at,r,team,o);};
      const a=release(f,row.id,row.parameters.WeaponParam.ChargeFrameFullCharge??60);
      let queued=false,drawn=false,firstDrop=null;
      for(let i=0;i<hz*3;i++){
        f.G.time+=1/hz;f.G.projectiles.update(1/hz);paint.advanceSimulation(1/hz);
        if(f.G.projectiles.chargerDrops.length){
          queued=true;const d=f.G.projectiles.chargerDrops[0];
          firstDrop||={y:d.pos.y,age:d.age};
          assert.ok(d.pos.y<=d.start.y&&d.pos.y>d.target.y,'bead is still airborne');
          const matrices=f.G.projectiles.blobs.instanceMatrix.array;
          for(let j=0;j<f.G.projectiles.blobs.count;j++)if(Math.abs(matrices[j*16+13]-d.pos.y)<1e-4)drawn=true;
        }
      }
      assert.ok(queued,row.id+' real falling queue exists');
      assert.ok(drawn,row.id+' native draw buffer contains actual bead position');
      assert.ok(firstDrop.y>0);
      assert.ok(stamps.length>0,row.id+' landing paints');
      assert.ok(stamps.every(s=>s.t>.5),row.id+' high shot cannot paint instantly');
      assert.ok(stamps.every(s=>s.o.claimOwner===a&&s.o.kind==='source-splash'));
      assert.equal(f.G.projectiles.chargerDrops.length,0,'landed records retire');
      const grid=Array.from(paint.grid);
      if(baseline)assert.deepEqual(grid,baseline,row.id+' frame-independent final turf');else baseline=grid;
    }
  }
});

test('replicated Charger heads never create a second falling-paint claim and clear retires live leases',async()=>{
  const f=await world();makePaintWorld(f);
  const a=release(f,'s3-charger-long',92);
  for(const p of f.G.projectiles.list)p.ghost=true;
  f.G.projectiles.update(.2);assert.equal(f.G.projectiles.chargerDrops.length,0);
  f.G.projectiles.clear();f.G.actors.length=0;
  release(f,'s3-charger-light',20);f.G.projectiles.update(1/60);
  assert.ok(f.G.projectiles.chargerDrops.length>0);
  const drops=f.G.projectiles.chargerDrops.slice();f.G.projectiles.clear();
  assert.equal(f.G.projectiles.chargerDrops.length,0);
  assert.ok(drops.every(d=>d.owner===null));assert.equal(a.stats.turf,0);
});

test('every Stringer kit exposes two source-timed charge stages, dings once per boundary and resets on release/cancel',async()=>{
  const f=await world(),cues=[];
  f.G.audio={ctx:{},prepareWeapon(){},playWeapon(){},duck(){},
    play(name,o){if(name==='charger_full')cues.push(o);},
    loopWeapon(){return {playing:true,set(){},stop(){}};}};
  f.installWeaponAudioRuntime(f.installedRuntime);
  for(const row of bows)for(const id of [row.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===row.id).map(k=>k.id)]){
    const p=row.parameters.spl__WeaponStringerParam.ChargeParam;
    const a=f.make(id);a.form='kid';a.isLocal=true;const r=a.weaponRunner;cues.length=0;
    close(a.weapon.firstChargeTime,p.ChargeFrameMidCharge/60,id+' first clock');
    for(let frame=1;frame<=p.ChargeFrameFullCharge+3;frame++){
      r.update(1/60,{fire:true,firePressed:frame===1});
      const stage=frame<p.ChargeFrameMidCharge?0:frame<p.ChargeFrameFullCharge?1:2;
      assert.equal(r.chargeStage,stage,id+' at frame '+frame);
      close(r.charge,Math.min(1,frame/p.ChargeFrameFullCharge),id+' unchanged full clock');
      assert.equal(cues.length,stage,id+' one cue per reached stage');
    }
    r.update(1/60,{fire:false});assert.equal(r.chargeStage,0);assert.equal(r.chargeStageProgress,0);
    f.G.projectiles.clear();r.cooldown=0;r.update(1/60,{fire:true});r.reset();
    assert.equal(r.chargeStage,0);assert.equal(r.chargeStageProgress,0);
  }
});

async function keepAudioWorld(){
  const f=await world(),cues=[];
  f.G.audio={ctx:{},prepareWeapon(){},prewarmChargerChargeRise(){},duck(){},play(){},
    playWeapon(id,event){cues.push({id,event});},
    playChargerChargeRise(o){cues.push({id:o.weaponId,event:'rise'});return {playing:true,stop(){this.playing=false;}};},
    loopWeapon(){return {playing:true,set(){},stop(){}};}};
  f.installWeaponAudioRuntime(f.installedRuntime);
  const actor=id=>{
    const a=f.make(id);a.isLocal=true;
    // make() suppresses frame finishing. Restore the actual event owner after
    // Actor.update without injecting forms, charge or a saved-charge record.
    a._finishFrame=function(){this._events({form:this.form==='squid'?'swim':'kid'});};
    return a;
  };
  return {...f,cues,actor};
}
const kitIds=base=>[base,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===base).map(k=>k.id)];

test('catalogue Charger audio restores actual full keeps without a second rise or ready cue',async()=>{
  const f=await keepAudioWorld();
  for(const id of ['s3-charger-quick','s3-charger-long','s3-charger-keeper'].flatMap(kitIds)){
    f.cues.length=0;
    const a=f.actor(id),r=a.weaponRunner;a.intent.fire=true;f.tick(a,140);
    // Audio identity follows the shared main source, while the kit stays equipped.
    const events=()=>f.cues.map(c=>c.event);
    assert.deepEqual(events(),['rise','ready'],id+' fresh full charge');
    for(let cycle=1;cycle<=2;cycle++){
      a.intent.squid=true;f.tick(a,3);
      assert.equal(a.form,'squid');assert.ok(r.catalogState.stored?.frames>0,id+' real catalogue keep');
      assert.equal(r.s3Stored,null,id+' no fabricated native store');
      const ink=a.ink;
      a.intent.squid=false;f.tick(a,8);
      assert.equal(a.form,'kid');assert.equal(r.catalogState.stored,null);assert.equal(r.charge,1);
      assert.ok(a.ink>=ink-1e-8,id+' restored reservation is not paid again');
      assert.deepEqual(events(),['rise','ready',...Array(cycle).fill('charge')],id+' one retained-charge cue per restore');
      f.emit('actor:form',{actor:a,form:'kid'});f.tick(a,3);
      assert.deepEqual(events(),['rise','ready',...Array(cycle).fill('charge')],id+' duplicate form/held input stays silent');
    }
    const before=f.G.projectiles.list.length;a.intent.fire=false;f.tick(a,3);
    assert.equal(f.G.projectiles.list.length-before,1,id+' one real release projectile');
    assert.equal(f.cues.filter(c=>c.event.startsWith('fire')).length,1);
    assert.equal(f.cues.filter(c=>c.event==='release').length,0,'a real shot has no cancel cue');
    a.setWeapon('shooter');f.emit('actor:form',{actor:a,form:'kid'});
    assert.equal(f.cues.filter(c=>c.event==='charge').length,2,id+' weapon switch cannot replay keep');
    f.G.projectiles.clear();
  }
});

test('catalogue Goo partial keep still reaches ready once; expired keeps start a fresh phrase',async()=>{
  const f=await keepAudioWorld();
  for(const id of kitIds('s3-charger-keeper')){
    f.cues.length=0;
    const a=f.actor(id),r=a.weaponRunner;a.intent.fire=true;f.tick(a,12);
    assert.ok(r.charge>0&&r.charge<1);a.intent.squid=true;f.tick(a,3);
    assert.ok(r.catalogState.stored?.frames>0);assert.equal(r.s3Stored,null);
    a.intent.squid=false;f.tick(a,8);
    assert.ok(r.charge>0&&r.charge<1);
    assert.deepEqual(f.cues.map(c=>c.event),['rise','charge'],id+' partial restore is not a new rise');
    f.tick(a,80);
    assert.deepEqual(f.cues.map(c=>c.event),['rise','charge','ready'],id+' genuine new full boundary stays audible');
    a.intent.squid=true;f.tick(a,305);assert.equal(r.catalogState.stored,null);
    a.intent.squid=false;f.tick(a,8);
    assert.deepEqual(f.cues.map(c=>c.event),['rise','charge','ready','rise'],id+' expired keep is fresh charge, not a restore');
    a.setWeapon('shooter');f.G.projectiles.clear();
  }
});

test('both Pencil kits emit five release-owned full-shot cues and finite drawn flight before depletion starts a new charge',async()=>{
  const f=await keepAudioWorld();
  for(const id of kitIds('s3-charger-pencil')){
    const {paint}=makePaintWorld(f);f.cues.length=0;
    const a=f.actor(id),r=a.weaponRunner,p=a.weapon.catalogRecord.parameters;
    a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,9.05,100);
    const shots=[],stamps=[];let current=null;
    const unsub=f.on('weapon:fire',e=>{if(e.actor===a){
      const head=f.G.projectiles.list.at(-1);
      current={index:shots.length+1,head,charge:e.charge,speed:head.vel.length(),damage:head.damage,
        range:head.catalog.descriptor.range,start:head.pos.clone(),moved:false,drawnHead:false,drops:false,drawnDrop:false};
      shots.push(current);
    }});
    const splat=paint.splat;paint.splat=function(at,radius,team,o){stamps.push({time:f.G.time,owner:o?.claimOwner});return splat.call(this,at,radius,team,o);};
    const drawn=pos=>{
      const mesh=f.G.projectiles.blobs,m=mesh.instanceMatrix.array;
      for(let j=0;j<mesh.count;j++)if(Math.hypot(m[j*16+12]-pos.x,m[j*16+13]-pos.y,m[j*16+14]-pos.z)<1e-4)return true;
      return false;
    };
    const step=(n=1)=>{for(let i=0;i<n;i++){
      f.tick(a);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
      if(current){
        if(f.G.projectiles.list.includes(current.head)){
          current.moved ||= current.head.pos.distanceTo(current.start)>0;
          current.drawnHead ||= drawn(current.head.pos);
        }
        for(const drop of f.G.projectiles.chargerDrops){current.drops=true;current.drawnDrop ||= drawn(drop.pos);}
      }
    }};
    a.intent.fire=true;step(p.WeaponParam.ChargeFrameFullCharge);
    assert.deepEqual(f.cues.map(c=>c.event),['rise','ready'],id+' one full charge phrase/ready');
    const paidInk=a.ink;close(paidInk,100-p.WeaponParam.InkConsumeFullCharge*100,id+' unchanged full payment');
    const trace=[];
    for(let shot=1;shot<=p.WeaponDivideChargerParam.FullChargeDivideNum;shot++){
      if(shot>1){
        a.intent.fire=true;step(3);
        assert.equal(shots.length,shot-1,id+' holding trigger must not fire stored shot');
      }
      a.intent.fire=false;const time=f.G.time,stampsBefore=stamps.length;step();
      assert.equal(shots.length,shot,id+' exactly one shot on release');
      assert.equal(r.catalogState.rounds,5-shot,id+' reservoir decremented once');
      assert.equal(f.cues.filter(c=>c.event==='fire_full').length,shot,id+' one full-shot cue per actual birth');
      assert.equal(stamps.length,stampsBefore,id+' high release cannot immediately paint');
      step(120);
      assert.equal(current.charge,1);close(current.speed,p.MoveParam.SpawnSpeedFullCharge*60,id+' source speed');
      close(current.range,p.MoveParam.DistanceFullCharge,id+' source range');close(current.damage,p.DamageParam.ValueFullCharge/10,id+' source damage');
      assert.ok(current.moved&&current.drawnHead,id+' head moves and enters native draw buffer');
      assert.ok(current.drops&&current.drawnDrop,id+' each shot has drawn airborne paint');
      assert.ok(stamps.length>stampsBefore&&stamps.slice(stampsBefore).every(s=>s.time>time+.5&&s.owner===a),id+' turf only after falling paint lands');
      assert.equal(f.G.projectiles.chargerDrops.length,0);assert.equal(f.G.projectiles.list.length,0);
      assert.ok(a.ink>=paidInk-1e-8,id+' no second payment for retained shots');
      trace.push({shot,reserve:r.catalogState.rounds,charge:current.charge,speed:current.speed,damage:current.damage,range:current.range,
        moved:current.moved,drawnHead:current.drawnHead,drawnDrop:current.drawnDrop,landingStamps:stamps.length-stampsBefore});
    }
    assert.equal(f.cues.filter(c=>c.event==='rise').length,1);assert.equal(f.cues.filter(c=>c.event==='ready').length,1);
    assert.equal(f.cues.filter(c=>c.event==='release').length,0,'shots do not add cancellation cues');
    a.intent.fire=true;step();assert.equal(shots.length,5,'depleted reservoir has no free sixth shot');
    assert.ok(r.charging&&r.charge>0&&r.charge<1,'depletion starts an actual new charge');
    assert.equal(f.cues.filter(c=>c.event==='rise').length,2,'fresh pack starts a new phrase');
    console.log('PENCIL_CYCLE',JSON.stringify({id,trace,freshCharge:r.charge,fullShotCues:5}));
    unsub();a.setWeapon('shooter');f.G.projectiles.clear();
  }
});

test('Pencil release edge respects the existing cooldown and never repeats a loaded shot while idle',async()=>{
  const f=await keepAudioWorld();
  for(const id of kitIds('s3-charger-pencil')){
    f.cues.length=0;
    const a=f.actor(id),r=a.weaponRunner;a.intent.fire=true;f.tick(a,72);a.intent.fire=false;f.tick(a);
    const shots=()=>f.cues.filter(c=>c.event==='fire_full').length;
    assert.equal(shots(),1);assert.equal(r.catalogState.rounds,4);
    const ink=a.ink;
    a.intent.fire=true;f.tick(a);a.intent.fire=false;f.tick(a);
    assert.equal(shots(),1,'release inside existing cooldown does not admit another round');
    assert.equal(r.catalogState.rounds,4);
    f.tick(a,20);assert.equal(shots(),1,'idle after denied release adds no new input buffer');
    a.intent.fire=true;f.tick(a,3);
    assert.equal(shots(),1,id+' aiming held round remains silent after cooldown');
    a.intent.fire=false;f.tick(a);
    assert.equal(shots(),2,id+' next eligible physical release admits one round');
    assert.equal(r.catalogState.rounds,3);assert.ok(a.ink>=ink-1e-8,'retained round is not paid twice');
    f.tick(a,20);assert.equal(shots(),2,'repeated released input cannot emit another round');
    assert.equal(f.cues.filter(c=>c.event==='rise').length,1);
    assert.equal(f.cues.filter(c=>c.event==='ready').length,1);
    console.log('PENCIL_RELEASE_BOUNDARY',JSON.stringify({id,admittedFullShots:shots(),remaining:r.catalogState.rounds,duplicateReleaseShots:0}));
    a.setWeapon('shooter');f.G.projectiles.clear();
  }
});
