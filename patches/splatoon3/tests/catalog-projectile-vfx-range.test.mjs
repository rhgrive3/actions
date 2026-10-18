import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogVisualSpec, catalogVisualRadius, updateCatalogVisual,
  catalogReboundSeparation, catalogBubbleCanBounce, catalogBubbleRadiusScale } from '../runtime/projectile-presentation.mjs';
import { INK_LOOK, fidelityInkLook, fidelityInkTail } from '../runtime/weapons-fidelity.mjs';
import { fixture } from './source-fixture.mjs';

const record = name => {
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceActor===name);
  assert.ok(r,'missing pinned 11.3.0 record '+name);
  return r;
};
const visualFor=(r,unit,unitOrder,index=0)=>catalogVisualSpec(r,{b:unit,unit:unitOrder,c:unit.CollisionParam||r.parameters.CollisionParam},index);

test('Tri-Slosher uses its three sourced visual sheets rather than 0.1 generic heads',()=>{
  const r=record('WeaponSlosherDiffusion'),units=r.parameters.UnitGroupParam.Unit;
  assert.equal(units.length,4);
  const center=visualFor(r,units[0],0,0),side=visualFor(r,units[2],2,0);
  assert.equal(center.style,'sheet');assert.equal(center.draw.InitRadius,1.4);
  assert.equal(catalogVisualRadius(center,0),1.4);
  assert.equal(catalogVisualRadius(side,0),1);
  assert.equal(catalogVisualRadius(visualFor(r,units[0],0,1),0),0,'sourced later fragments have zero draw radius');
  assert.equal(fidelityInkLook({type:'shot',catalogVisual:center}),INK_LOOK.slosh,'not a Shooter rod');
  const p={catalogVisual:center,age:5/60,vel:{length:()=>70}};
  updateCatalogVisual(p);
  assert.ok(p.tail0>1 && p.vis===1.4);
  assert.ok(fidelityInkTail({...p,type:'shot'},1,p.vis*INK_LOOK.slosh[4],INK_LOOK.slosh)>1);
});

test('Bloblobber bubbles grow over five frames and shrink 25% each rebound',()=>{
  const r=record('WeaponSlosherBathtub'),unit=r.parameters.UnitGroupParam.Unit[0];
  const v=visualFor(r,unit,0,0);
  assert.equal(v.style,'bubble');
  assert.equal(catalogVisualRadius(v,0),.16);
  assert.equal(catalogVisualRadius(v,5/60),.8);
  const p={type:'shot',age:5/60,vel:{length:()=>30},catalog:{bounces:1},catalogVisual:v};
  updateCatalogVisual(p);
  assert.ok(Math.abs(p.vis-.6)<1e-9);
  assert.equal(fidelityInkLook(p),INK_LOOK.bubble);
  assert.equal(fidelityInkTail(p,3,p.vis,INK_LOOK.bubble),1);
  assert.equal(catalogBubbleRadiusScale(2),.5625);
  assert.equal(catalogBubbleCanBounce(0,1),true);
  assert.equal(catalogBubbleCanBounce(1,1),true);
  assert.equal(catalogBubbleCanBounce(2,1),false,'third floor hit ends the bubble');
  assert.equal(catalogBubbleCanBounce(28,0),true,'no arbitrary wall rebound cap');
  assert.ok(catalogReboundSeparation(unit.CollisionParam.EndRadiusForField*.75)>.56);
});

test('actual Bloblobber projectile rebounding preserves swept travel, sourced paint taper and ghost safety',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const r=record('WeaponSlosherBathtub'),a=f.make(r.id);
  a.form='kid';a.ink=100;a.intent.fire=true;f.tick(a,50);a.intent.fire=false;
  const p=f.G.projectiles.list.find(x=>x.catalog?.r?.sourceActor==='WeaponSlosherBathtub'&&x.catalog.descriptor.unit===0);
  assert.ok(p,'actual main-weapon firing creates the first Bloblobber bubble');
  p.pos.set(0,5,0);p.prev.copy(p.pos);p.start.copy(p.pos);
  p.vel.set(0,-12,0);p.age=0;p.catalog.travel=0;p.catalog.carry=0;p.catalog.phase=0;
  let normalY=1;
  f.G.physics.level=null;
  f.G.physics.segment=(from,to,hit)=>{
    hit.hit=true;hit.dist=from.distanceTo(to)*.5;
    hit.point.copy(from).lerp(to,.5);hit.normal.set(normalY?0:1,normalY,0);
    hit.face=-1;return hit;
  };
  const paints=[];f.G.paint.splat=(_point,radius)=>{paints.push(radius);return 0;};
  const speed=p.vel.length();
  assert.equal(f.G.projectiles._step(p,1/60),false,'first floor bounce continues');
  assert.equal(p.catalog.groundBounces,1);
  assert.ok(Math.abs(p.catalog.travel-speed/120)<1e-8,'unused half of collided sweep is not charged to reach');
  assert.equal(f.G.projectiles._step(p,1/60),false,'second floor bounce continues');
  assert.equal(p.catalog.groundBounces,2);
  assert.deepEqual(paints.map(x=>Math.round(x*1000000)/1000000),[1.65,1.4025],
    'existing paint owner applies the sourced 0.85 subsequent-bounce footprint');
  normalY=0;p.ghost=true;
  const wallSpeed=p.vel.length();
  assert.equal(f.G.projectiles._step(p,1/60),false,'wall bounce remains valid after two floors');
  assert.equal(p.catalog.groundBounces,2,'walls do not consume floor bounce allowance');
  assert.equal(p.catalog.bounces,3);
  assert.ok(Math.abs(p.vel.length()-wallSpeed*.8)<1e-7,'wall contact multiplies flight speed by 0.8');
  assert.equal(paints.length,2,'ghost rebound never owns a turf splat');
  normalY=1;
  assert.equal(f.G.projectiles._step(p,1/60),true,'third floor hit terminates');
  assert.equal(paints.length,2,'ghost terminal contact never adds paint');
});

test('long-range Shooter keeps a compact, non-collision-sized visual rod',()=>{
  for(const name of ['WeaponShooterLong','WeaponShooterExpert']){
    const r=record(name),v=catalogVisualSpec(r,{b:r.parameters,c:r.parameters.CollisionParam});
    assert.equal(v.style,'rod');
    assert.ok(v.baseRadius>=.045&&v.baseRadius<=.08);
    assert.ok(v.baseRadius<r.parameters.CollisionParam.EndRadiusForPlayer);
    assert.equal(fidelityInkLook({type:'shot',catalogVisual:v}),INK_LOOK.shot);
  }
});

test('all pinned Charger full-charge ranges are retained by the actual catalog flight',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(const name of ['WeaponChargerLong','WeaponChargerNormalScope','WeaponChargerQuick']){
    const r=record(name),raw=r.parameters.MoveParam;
    assert.ok(raw.DistanceFullCharge>raw.DistanceMinCharge);
    f.G.projectiles.clear();f.G.actors.length=0;
    const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;
    const fullFrames=Number.isFinite(r.parameters.WeaponParam.ChargeFrameFullCharge)
      ?r.parameters.WeaponParam.ChargeFrameFullCharge:60; // sparse scoped Charger inherits runtime's 60F model
    f.tick(a,fullFrames+1);
    a.intent.fire=false;
    let p=null;
    for(let i=0;i<65&&!p;i++){
      f.tick(a,1);
      p=f.G.projectiles.list.find(x=>x.wid===r.id);
    }
    assert.ok(p,name+' emitted a real charged round');
    assert.equal(p.catalog.range,raw.DistanceFullCharge,name+' exact full range');
    assert.equal(p.catalog.descriptor.range,raw.DistanceFullCharge,name+' descriptor');
    assert.ok(Math.abs(p.life*p.catalog.descriptor.speed-raw.DistanceFullCharge)<1e-6,name+' flight lifetime');
    // Trace the same main-owned fixed-tick flight in empty space, without
    // involving turf rasterization or the HUD's range indicator.
    const savedLevel=f.G.physics.level;
    f.G.physics.level=null;
    p.ghost=true; // motion only: prevent existing Charger floor-paint writes in empty-world test
    p.pos.set(0,20,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,p.catalog.descriptor.speed);
    p.age=0;p.catalog.travel=0;p.catalog.carry=0;
    let done=false;
    for(let i=0;i<100&&!done;i++)done=f.G.projectiles._step(p,1/60);
    assert.equal(done,true,name+' projectile terminates');
    assert.ok(Math.abs(p.catalog.travel-raw.DistanceFullCharge)<1e-6,name+' exact end-stop');
    assert.ok(Math.abs(p.pos.z-raw.DistanceFullCharge)<1e-6,name+' position stays at sourced limit');
    f.G.physics.level=savedLevel;
  }
});

test('sourced falling shooter droplets reuse simulated positions without paint side-effects',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const P=f.G.projectiles,color=new f.THREE.Color(1,.3,.7);
  const drop={owner:{color,remote:false},pos:new f.THREE.Vector3(1,2,3),
    vel:new f.THREE.Vector3(.4,-6,2),seed:.23,frames:4,radius:1.8};
  P._s3SplashDrops=[drop];
  let paints=0;f.G.paint.splat=()=>{paints++;return 1;};
  const start=[drop.pos.x,drop.pos.y,drop.pos.z,drop.vel.y];
  P._draw();
  assert.equal(P.blobs.count,1,'source-simulated falling ink must appear');
  const matrix=new f.THREE.Matrix4(),pos=new f.THREE.Vector3(),rot=new f.THREE.Quaternion(),scale=new f.THREE.Vector3();
  P.blobs.getMatrixAt(0,matrix);matrix.decompose(pos,rot,scale);
  assert.ok(pos.distanceTo(drop.pos)<1e-6,'display uses real falling-ink position');
  assert.ok(scale.x>.04&&scale.x<=.071,'render radius independent from floor paint radius');
  // S3 falling drops are rounded beads: low spike amplitude, near-round section.
  assert.ok(Math.abs(P.blobInkLook.array[0]-.12)<1e-6);
  assert.ok(Math.abs(P.blobInkLook.array[2]-.9)<1e-6);
  P._s3SplashDrops=[{...drop,drawRadius:.2}];P._draw();P.blobs.getMatrixAt(0,matrix);matrix.decompose(pos,rot,scale);
  assert.ok(Math.abs(scale.x-.2)<1e-6,'Slosher splash draws its sourced DrawRadius');
  assert.equal(paints,0,'render does not score/paint');
  assert.deepEqual([drop.pos.x,drop.pos.y,drop.pos.z,drop.vel.y],start,'render is read-only');
  P._s3SplashDrops=Array.from({length:100},(_,i)=>({...drop,pos:new f.THREE.Vector3(1+i*.001,2,3)}));
  P._draw();assert.equal(P.blobs.count,48,'bounded VFX instance budget');
  assert.equal(paints,0);
});

test('Bloblobber physical launch remains level against a short ground reticle and rebounds for its whole arc', async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const r=record('WeaponSlosherBathtub'),system=f.G.projectiles;
  const box={
    solid:true,grate:false,id:0,center:new f.THREE.Vector3(0,-.5,0),
    half:new f.THREE.Vector3(1000,.5,1000),
    axes:[new f.THREE.Vector3(1,0,0),new f.THREE.Vector3(0,1,0),new f.THREE.Vector3(0,0,1)],
    faces:[-1,-1,-1,-1,-1,-1],
  };
  // Run the real rounded-box sphere sweep, not a hardcoded tick-0 fake hit.
  const flat={
    blocks:[box],faces:[],
    queryBlocks:(_x0,_z0,_x1,_z1,out)=>{out.length=0;out.push(0);return out;},
  };
  function fire(pitch,nearbyGroundReticle,birthHeight=0) {
    system.clear();f.G.actors.length=0;f.G.physics.level=null;
    const a=f.make(r.id);a.form='kid';a.ink=100;a.aimYaw=0;a.aimPitch=pitch;
    a.pos.set(0,birthHeight,0);a.character.root.position.copy(a.pos);
    if(nearbyGroundReticle)a.aimPoint.set(0,-.4,4);
    else a.aimPoint.set(0,1.05+70*Math.sin(pitch),70*Math.cos(pitch));
    a.intent.fire=true;
    for(let i=0;i<24&&!system.list.some(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub');i++)f.tick(a);
    a.intent.fire=false;
    const globs=system.list.filter(p=>p.catalog?.r?.sourceActor==='WeaponSlosherBathtub');
    assert.equal(globs.length,4,'one source volley emits one big and three delayed small bubbles');
    const first=globs.find(p=>p.catalog.descriptor.unit===0);
    assert.ok(first,'unit zero owns the large bubble');
    assert.equal(first.life,480/60,'source-based bounces use a finite non-retail void guard');
    const source=r.parameters.UnitGroupParam.Unit[0],speed=source.SpawnSpeedGround*60;
    assert.ok(Math.abs(first.vel.x)<1e-8,'zero yaw has no lateral drift');
    assert.ok(Math.abs(first.vel.z-speed*Math.cos(pitch))<1e-7,'pitch follows the stick, not near-floor reticle convergence');
    assert.ok(Math.abs(first.vel.y-speed*(Math.sin(pitch)+.2*Math.cos(pitch)))<1e-7,
      'the source XZ-dependent Y boost follows horizontal launch speed');
    return first;
  }
  function simulate(p,requireAfterDefaultLife=false) {
    f.G.physics.level=flat;
    let sawBounce=false,survived72=false,ended=0,distance=0;const contacts=[];
    for(let frame=1;frame<=481;frame++){
      const before=p.catalog.groundBounces;
      const dead=system._step(p,1/60);
      if(p.catalog.groundBounces>before)contacts.push({frame,distance:p.pos.z});
      if(p.catalog.groundBounces>0)sawBounce=true;
      if(frame===74){assert.equal(dead,false,'bubble must not vanish at old 1.2s limit');survived72=true;}
      if(dead){ended=frame;distance=p.pos.z;break;}
    }
    assert.ok(sawBounce,'real ground geometry must cause a bounce');
    assert.equal(p.catalog.groundBounces,2,'third floor contact ends the bubble after two rebounds');
    assert.ok(ended>0&&ended<480,'ordinary floor shots end on terrain, not on the cleanup timer');
    if(requireAfterDefaultLife)assert.ok(survived72,'high arcs must survive the previous generic cutoff');
    return {frames:ended,reach:distance,contacts};
  }
  const flatShot=simulate(fire(0,true));
  assert.ok(flatShot.reach>19, 'level shot must not plunge into the near-floor crosshair and truncate range');
  const elevatedShot=simulate(fire(Math.PI/3,false),true);
  assert.ok(elevatedShot.frames>72,'60-degree trajectory reaches the third floor after 1.2s');
  assert.ok(elevatedShot.reach>14,'high-arc bubble survives to a distant contact');
  // These are physical trajectory endpoints, not the community wiki's
  // player-hurtbox effective range (5.3 lines without a lob/5.4 with one).
  const angles=[5,20,40,75,90];
  const traces=angles.map(deg=>({deg,...simulate(fire(deg*Math.PI/180,false))}));
  assert.ok(traces.find(x=>x.deg===20).reach>flatShot.reach,
    'slightly raised shots reach farther when the ground is level');
  assert.ok(traces.find(x=>x.deg===90).reach<1e-4,
    'straight-up input must remain vertical instead of drifting toward the reticle');
  assert.ok(traces.every(x=>x.contacts.length===2),'every pitch has precisely two floor rebounds');
  const cliffShot=simulate(fire(Math.PI/2,false,20),true);
  assert.ok(cliffShot.frames>240,'high-ground near-vertical fire must not vanish at old 240F cutoff');
  assert.ok(cliffShot.frames<480,'high-ground projectile still ends at the sourced third floor contact');
});
