import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { advanceSplashDrops } from '../runtime/blaster-flight-paint.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='blaster'&&!r.legacy);
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function shot(row,{air=false,contact=false,ghost=false,direct=false,observers=false}={}) {
  f.G.projectiles.clear();f.G.actors.length=0;
  f.G.physics={los:()=>true};
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(_a,_b,_l,h)=>{h.hit=false;return h;};
  const a=f.make(row.id);a.form='kid';a.grounded=!air;a.pos.y=20;a.aimDir.set(0,0,1);a.aimPoint.set(0,21.05,200);
  a.weaponRunner.update(1/60,{fire:true,firePressed:true});
  for(let i=0;i<25&&!f.G.projectiles.list.length;i++)a.weaponRunner.update(1/60,{fire:true});
  const p=f.G.projectiles.list[0];assert.ok(p,row.id+' emits');
  p.ghost=ghost;p.catalog.dropCount=p.catalog.descriptor.splashCount;
  p.life=p.age+1/60;
  if(contact)f.G.physics.segment=(from,to,h)=>{
    h.hit=true;h.dist=from.distanceTo(to)/2;h.point.lerpVectors(from,to,.5);h.normal.set(0,0,-1);h.face=1;h.block=0;return h;
  };
  const hits=[];f.G.projectiles.applyHit=(_a,b,damage)=>hits.push({b,damage});
  if(direct){
    const target=f.make('shooter');target.team=1;target.pos.copy(p.pos).addScaledVector(p.vel,.5/60);target.pos.y-=.7;
  }
  const spectators=[];
  if(observers)for(const x of [.7,2.1]){const b=f.make('shooter');b.team=1;b.pos.copy(p.pos);b.pos.x+=x;b.pos.y-=.7;spectators.push(b);}
  const marks=[];f.G.paint.splat=(at,radius,team,options)=>{marks.push({at:at.clone(),radius,team,options});return 3;};
  assert.equal(f.G.projectiles._step(p,1/60),true);
  return {p,a,marks,hits,spectators,drops:f.G.projectiles._s3SplashDrops||[]};
}
for(const row of rows)for(const air of row.sourceActor==='WeaponBlasterPrecision'?[false,true]:[false]){
  const burst=air?row.parameters.BlasterBurstJumpParam:row.parameters.BlasterBurstParam;
  test(row.id+(air?' airborne':'')+' timed burst paints at the burst and creates a separate falling drop',()=>{
    const {p,a,marks,drops}=shot(row,{air});
    const sphere=marks.find(m=>m.options.face===-1);
    assert.ok(sphere,'airburst paints a sphere even with no floor within a short probe');
    assert.equal(sphere.radius,burst.SplashPaintRadius??2);
    assert.equal(sphere.options.claimOwner,a);assert.ok(sphere.at.distanceTo(p.pos)<1e-9);
    assert.equal(drops.length,1);assert.equal(drops[0].radius,burst.SplashDropPaintRadius??3.2);
    assert.equal(drops[0].spec.gravity,row.parameters.MoveParam.FreeGravity*3600);
  });
  test(row.id+(air?' airborne':'')+' terrain contact uses collision paint sizes and keeps the drop outside the wall',()=>{
    const {p,marks,drops}=shot(row,{air,contact:true});
    const sphere=marks.find(m=>m.options.face===-1);
    assert.ok(sphere,'wall contact paints nearby surfaces');
    assert.equal(sphere.radius,burst.SplashPaintShotColHitRadius??1.4);
    assert.equal(drops.length,1);assert.equal(drops[0].radius,burst.SplashDropPaintShotColHitRadius);
    assert.ok(drops[0].pos.z<p.pos.z,'drop begins on the incoming side of the wall');
  });
}
test('replicated catalogue Blaster bursts create neither paint nor falling owner drops',()=>{
 for(const row of rows)for(const contact of [false,true]){
  const {marks,drops}=shot(row,{contact,ghost:true});assert.equal(marks.length,0);assert.equal(drops.length,0);
 }
});

test('direct player hits keep direct damage once and choose collision paint sizes',()=>{
 for(const row of rows){
  const {p,a,marks,hits,drops}=shot(row,{direct:true});
  assert.equal(hits.length,1);assert.equal(hits[0].damage,row.parameters.DamageParam.ValueMax/10);
  assert.equal(marks.length,1);assert.equal(marks[0].radius,row.parameters.BlasterBurstParam.SplashPaintShotColHitRadius??1.4);
  assert.equal(marks[0].options.claimOwner,a);assert.equal(drops.length,1);
  assert.equal(drops[0].radius,row.parameters.BlasterBurstParam.SplashDropPaintShotColHitRadius);
 }
});
test('high airburst drops fall onto real collision geometry with identical 30/60/120 Hz landings',()=>{
 for(const row of rows){
  let reference;
  for(const hz of [30,60,120]){
   const {marks,drops}=shot(row);
   const level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],
    spawnBarrier:0,single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
   f.G.level=level;f.G.physics=new f.Physics(level);
   const before=marks.length;
   for(let i=0;i<hz*3&&drops.length;i++)advanceSplashDrops(f.G.projectiles,1/hz,f.G);
   assert.equal(drops.length,0,'drop eventually retires');
   const landed=marks.slice(before);assert.equal(landed.length,1);
   assert.ok(Math.abs(landed[0].at.y)<.11);assert.equal(landed[0].radius,row.parameters.BlasterBurstParam.SplashDropPaintRadius??3.2);
   const signature=[...landed[0].at.toArray(),landed[0].radius].map(v=>+v.toFixed(9));
   if(reference)assert.deepEqual(signature,reference,row.id+' cadence-independent landing');else reference=signature;
  }
 }
});

test('terrain/direct Blaster player bursts use the source compressed radius and half damage; timed bursts stay full',()=>{
 for(const row of rows)for(const air of row.sourceActor==='WeaponBlasterPrecision'?[false,true]:[false])for(const mode of ['timed','terrain','direct']){
  const {p,hits,spectators}=shot(row,{air,contact:mode==='terrain',direct:mode==='direct',observers:true});
  const bands=p.catalog.descriptor.b.BlastParam.DistanceDamage;
  const scale=mode==='timed'?1:p.catalog.descriptor.b.BlasterBurstParam.ShotCollisionHitRadiusRate;
  for(const b of spectators){
   const centre=b.pos.clone();centre.y+=.7;
   const d=centre.distanceTo(p.pos)/scale;
   let expected=0;
   if(d<=bands[0].Distance)expected=bands[0].Damage/10;
   else if(d<=bands[1].Distance)expected=(bands[0].Damage+(bands[1].Damage-bands[0].Damage)*(d-bands[0].Distance)/(bands[1].Distance-bands[0].Distance))/10;
   if(mode!=='timed')expected=Math.floor((expected*.5+1e-9)*10)/10;
   const received=hits.filter(h=>h.b===b);assert.equal(received.length,expected>0?1:0,row.id+' '+mode+' boundary');
   if(expected>0)assert.ok(Math.abs(received[0].damage-expected)<1e-8,row.id+' '+mode+' sourced damage '+received[0].damage+' vs '+expected+' distance '+d);
  }
 }
});
