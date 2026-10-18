import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';

const STEP=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function setup(id='s3-maneuver-stepper') {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const a=f.make(id);a.form='kid';a.intent.fire=true;a.intent.move.set(1,0,0);
  return {...f,a,r:a.weaponRunner};
}
function tick(f,fire=true) {f.G.time+=STEP;f.r.update(STEP,{fire});}

test('Tetra moving rounds retain 7.4 degree / 6F / .26 radius until the physical roll ends',async()=>{
  const f=await setup();assert.equal(f.r.tryDodge(f.a.intent.move),true);
  assert.equal(f.r.catalogState.turret,0,'post-roll mode is not active at moving admission');
  const fired=[];
  for(let frame=1;frame<=30;frame++){
    const before=f.G.projectiles.list.length;tick(f);
    if(f.G.projectiles.list.length>before){
      const p=f.G.projectiles.list.at(-1);
      fired.push({frame,key:p.catalog.descriptor.key,spread:f.r.spread,radius:p.catalog.descriptor.c.InitRadiusForPlayer,cooldown:f.r.cooldown});
    }
  }
  const moving=fired.filter(p=>p.frame<12),planted=fired.filter(p=>p.frame>=12);
  assert.ok(moving.length>0,'Tetra retains fire during movement');
  for(const p of moving){assert.equal(p.key,'normal');near(p.spread,7.4);near(p.radius,.26);near(p.cooldown,6/60);}
  assert.ok(planted.length>=2);
  for(const p of planted){assert.equal(p.key,'turret');near(p.spread,2.7);near(p.radius,.31);near(p.cooldown,5/60);}
  near(f.r.catalogState.turret,(45-(30-12))/60,'full recovery starts at the physical roll end');
});

test('every added Dualies base and alternate kit starts in moving mode, never planted mode',async()=>{
  const shared=await setup();
  const bases=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='dualies'&&!r.legacy);
  for(const base of bases)for(const id of [base.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===base.id).map(k=>k.id)]){
    shared.G.projectiles.clear();shared.G.actors.length=0;
    const a=shared.make(id);a.form='kid';a.intent.fire=true;a.intent.move.set(1,0,0);
    const f={...shared,a,r:a.weaponRunner};assert.equal(f.a.weapon.catalogRecord.id,base.id,id);
    assert.equal(f.r.tryDodge(f.a.intent.move),true,id);
    assert.equal(f.r.catalogState.turret,0,id+' no post-roll cone during motion');
    const duration=f.r.catalogState.roll.dur;
    for(let i=0;i<Math.round(duration*60)-1;i++)tick(f,false);
    assert.ok(f.r.catalogState.roll,id+' motion remains active until its last frame');
    assert.equal(f.r.catalogState.turret,0,id+' recovery clock does not run early');
    tick(f,false);assert.equal(f.r.catalogState.roll,null,id);
    near(f.r.catalogState.turret,base.parameters.SideStepParam.UnrelaxFrameMove/60);
  }
});

test('sourced slide recovery blocks squid, preserves stationary planted fire and releases on movement',async()=>{
  const f=await setup('s3-maneuver-long');assert.ok(f.r.tryDodge(f.a.intent.move));
  f.a.intent.move.set(0,0,0);
  for(let i=0;i<16;i++)tick(f,false);
  f.a.intent.fire=false;f.a.intent.squid=true;
  assert.equal(f.r.busy(),true,'40F NoSquid gate survives a squid request');
  f.a.intent.squid=false;f.a.intent.fire=true;
  for(let i=0;i<80;i++)tick(f);
  assert.ok(f.G.projectiles.list.length>0);
  assert.equal(f.G.projectiles.list.at(-1).catalog.descriptor.key,'turret','stationary firing stays planted after movement unlock');
  near(f.r.spread,2.3);assert.ok(f.r.cooldown<=4/60+1e-9);
  f.a.intent.move.set(1,0,0);tick(f);
  for(let i=0;i<8;i++)tick(f);
  assert.equal(f.G.projectiles.list.at(-1).catalog.descriptor.key,'normal','movement exits planted mode');
  near(f.r.spread,2.5);
});

test('Dapple and Squelcher slide ink recovery uses the SideStep 50F / 60F source',async()=>{
  const f=await setup('s3-maneuver-short');
  for(const [id,frames] of [['s3-maneuver-short',50],['s3-maneuver-dual',60]]){
    const a=id===f.a.weaponId?f.a:f.make(id);a.form='kid';a.intent.fire=true;
    assert.ok(a.weaponRunner.tryDodge(new f.THREE.Vector3(1,0,0)));
    near(a.s3.recoverStopRemaining,frames/60);
  }
});

test('Tetra four-roll chain resets after complete recovery; a rejected fifth never spends ink or changes the stroke',async()=>{
  const f=await setup();
  for(let roll=1;roll<=4;roll++){
    assert.ok(f.r.tryDodge(f.a.intent.move));
    for(let i=0;i<12;i++)tick(f,false);
    assert.equal(f.r.catalogState.rolls,roll);
  }
  const ink=f.a.ink,stroke=f.r.catalogState.slideRunner;
  assert.equal(f.r.tryDodge(f.a.intent.move),false);near(f.a.ink,ink);assert.equal(f.r.catalogState.slideRunner,stroke);
  for(let i=0;i<45;i++)tick(f,false);
  assert.equal(f.r.catalogState.rolls,0);assert.ok(f.r.tryDodge(f.a.intent.move));
});
