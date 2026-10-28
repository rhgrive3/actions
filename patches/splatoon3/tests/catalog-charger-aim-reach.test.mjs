import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';

const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='charger');
const ids=rows.flatMap(r=>[r.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===r.id).map(k=>k.id)]);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);

// Production composition and real projectile interpreter, not rendered pixels or retail measurement.
test('all 18 Charger kits: live and kept HUD reach and maximum laser use the selected shot owner',async()=>{
  assert.equal(ids.length,18);
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {G,THREE}=f,P=G.projectiles;
  G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,1.3,0);G.camera.lookAt(10,1.3,0);G.camera.updateMatrixWorld(true);
  for(const id of ids){
    G.actors.length=0;P.clear();
    const a=f.make(id);a.isLocal=true;a.alive=true;a.form='kid';a.kidT=1;a.ink=100;
    const row=a.weapon.catalogRecord, m=row?.parameters.MoveParam, t=row?.parameters.WeaponParam;
    const frames=t?.ChargeFrameFullCharge??60, min=t?.ChargeFrameMinCharge??8;
    for(const frame of [min,Math.floor((min+frames)/2),frames]){
      a.weaponRunner.reset();a.weaponRunner.cooldown=0;a.ink=100;
      // The selected owner's released projectile is the oracle, not duplicated Splat parameters.
      a.intent.fire=true;
      for(let i=0;i<frame+1;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
      a.intent.fire=false;
      for(let i=0;i<4;i++){G.time+=1/60;a.weaponRunner.update(1/60,{fire:false});}
      const projectile=row && !row.legacy ? P.list.find(p=>p.catalog?.r?.id===row.id) : P._fidelityChargerFlights?.at(-1);
      assert.ok(projectile,`${id} ${frame}F release`);
      const actualCharge=projectile.catalog?.descriptor.charge??projectile.charge;
      const shotRange=projectile.catalog?.descriptor.range??projectile.range;
      near(P.chargerReach(actualCharge,a.weapon),shotRange,`${id} ${frame}F shot/preview`);
      P.clear();
      a.weaponRunner.charge=actualCharge;a.weaponRunner.charging=true;
      const full=P.chargerReach(1,a.weapon);
      const point=Math.max(2,shotRange+.5-1e-5);
      G.physics.raycast=(_s,_d,_range,h)=>{h.hit=true;h.dist=Math.sqrt(point*point-1.3*1.3);return h;};
      let controller=new f.PlayerController(a,null,null);controller.computeAim();
      assert.equal(controller.inRange,true,`${id} ${frame}F inside`);
      const outside=shotRange+.5+1e-5;
      G.physics.raycast=(_s,_d,_range,h)=>{h.hit=true;h.dist=Math.sqrt(outside*outside-1.3*1.3);return h;};
      controller.computeAim();assert.equal(controller.inRange,false,`${id} ${frame}F outside`);
      assert.equal(controller.chargerReachVisible,true,`${id} charge endpoints visible`);
      near(controller.chargerCurrentReach.distanceTo(G.camera.position),shotRange,`${id} current endpoint`);
      near(controller.chargerFullReach.distanceTo(G.camera.position),full,`${id} full endpoint`);
      // Synthetic stored state exercises the UI branch for each kit; it does not
      // assert that scoped kits can acquire a keep state in actual play.
      a.weaponRunner.s3Stored={charge:1,remaining:1,resurfaced:true,laserDelay:0};
      const between=(shotRange+full)/2;
      if(full>shotRange+.1){
        G.physics.raycast=(_s,_d,_range,h)=>{h.hit=true;h.dist=Math.sqrt(between*between-1.3*1.3);return h;};
        controller.computeAim();assert.equal(controller.inRange,true,`${id} stored full reach`);
      }
      a.weaponRunner.s3Stored=null;
    }
    // Laser ray is only shortened by obstruction and otherwise reaches full selected distance.
    a.weaponRunner.charging=true;a.weaponRunner.charge=.5;
    G.physics.raycast=(_s,_d,_range,h)=>{h.hit=false;return h;};
    for(const charge of [0,.5,1]) {
      a.weaponRunner.charge=charge;P._updateBeams(0);
      near(P.sights.get(a).scale.z,P.chargerReach(1,a.weapon),`${id} full laser at ${charge}`);
    }
    G.physics.raycast=(_s,_d,_range,h)=>{h.hit=true;h.dist=5;h.point.set(0,1,5);h.normal.set(0,0,-1);return h;};
    P._updateBeams(0);near(P.sights.get(a).scale.z,5,`${id} obstructed laser`);
    if(row&&!row.legacy)assert.equal(P.chargerReach(1,a.weapon),m.DistanceFullCharge);
  }
});

test('negative control: Splat-only owner disagrees for scoped and Bamboo previews',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),P=f.G.projectiles;
  for(const id of ['s3-charger-longscope','s3-charger-light']){
    const a=f.make(id);
    assert.notEqual(P.chargerReach(1),P.chargerReach(1,a.weapon),id);
  }
});
