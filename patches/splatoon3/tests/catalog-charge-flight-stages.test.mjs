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

test('every Stringer kit exposes two source-timed charge rings, dings once per boundary and resets on release/cancel',async()=>{
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
      assert.equal(cues.length,stage,id+' one cue per reached ring');
    }
    r.update(1/60,{fire:false});assert.equal(r.chargeStage,0);assert.equal(r.chargeStageProgress,0);
    f.G.projectiles.clear();r.cooldown=0;r.update(1/60,{fire:true});r.reset();
    assert.equal(r.chargeStage,0);assert.equal(r.chargeStageProgress,0);
  }
});
