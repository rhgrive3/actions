import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {saberSlashShape,saberSlashContact} from '../runtime/saber-melee.mjs';
const out={set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}};
const origin={x:0,y:0,z:0};
for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy'])test(id+' slash shape preserves explicit offsets, finite cylinder and 0.1-unit boundary',()=>{
  const r=MAIN_WEAPON_CATALOG.records.find(r=>r.id===id);
  const h=saberSlashShape(r,'saber-horizontal'),v=saberSlashShape(r,'saber-vertical');
  assert.equal(h.offset,r.parameters.spl__WeaponSaberParam.SwingParam.ShotSlashOffset_L);
  assert.equal(v.offset,r.parameters.spl__WeaponSaberParam.SwingParam.ShotSlashOffset_Vertical);
  assert.equal(v.radiusInferred,id==='s3-saber-lite');
  // Horizontal rectangular corners use Euclidean capsule distance, not an
  // independently inflated X/Z rectangle. Sample just across the boundary.
  const hx=h.center.X+h.half.X,hz=h.center.Z+h.half.Z;
  for(let x=0;x<=.6+1e-8;x+=.1)for(let z=0;z<=.6+1e-8;z+=.1){
    const hit=saberSlashContact(h,origin,0,{x:hx+x,y:-.5,z:hz+z},.5,1,out);
    assert.equal(hit,x*x+z*z<=.25+1e-9,`${id}: ${x},${z}`);
  }
  // The cylinder's flat axial cap cannot grow by CylinderRadius.
  const axial=v.axis===0?'x':'y';
  const beyond={x:v.a.X,y:v.a.Y-.1,z:v.a.Z};beyond[axial]=v.axis===0?Math.max(v.a.X,v.b.X)+.2:Math.max(v.a.Y,v.b.Y)+.2-.1;
  assert.equal(saberSlashContact(v,origin,0,beyond,.1,.2,out),false);
});
async function setup(id='s3-saber-normal'){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const a=f.make(id);a.form='kid';a.aimDir.set(0,0,1);a.pos.set(0,0,0);
  const hits=[];f.G.projectiles.applyHit=(_a,b,d)=>hits.push({b,d});
  return {f,a,hits};
}
function tick(a,fire,n=1){for(let i=0;i<n;i++)a.weaponRunner.update(1/60,{fire,firePressed:fire&&i===0});}
function enemy(f,x=20,y=0,z=1){const b=f.make('shooter');b.team=1;b.pos.set(x,y,z);return b;}
for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy'])test(id+' melee lasts four fixed frames and deduplicates each target independently',async()=>{
  const {f,a,hits}=await setup(id),swing=a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam;
  const first=enemy(f),late=enemy(f),expired=enemy(f);
  tick(a,true);tick(a,false);const delay=swing.WeakSwingShotSlashFrame;
  tick(a,false,delay-1);assert.equal(hits.length,0);
  first.pos.x=0;tick(a,false);assert.equal(hits.filter(h=>h.b===first).length,1);
  tick(a,false,2);late.pos.x=0;tick(a,false);
  assert.equal(hits.filter(h=>h.b===first).length,1);
  assert.equal(hits.filter(h=>h.b===late).length,1,'fourth active frame still contacts newly entering victim');
  expired.pos.x=0;tick(a,false);assert.equal(hits.filter(h=>h.b===expired).length,0,'fifth frame is expired');
  assert.equal(hits[0].d,a.weapon.catalogRecord.parameters.BulletSaberSlashHorizontalParam.DamageParam.DamageValue/10);
});

test('slash uses source vertical placement and contact-height LOS instead of feet-to-feet LOS',async()=>{
  const {f,a,hits}=await setup(),b=enemy(f,0,2.4,1.2);
  const rays=[];f.G.physics.los=(from,to)=>{rays.push([from.clone(),to.clone()]);return from.y>.5&&to.y>1;};
  tick(a,true,20);tick(a,false,4);
  assert.equal(hits.filter(h=>h.b===b).length,1);assert.ok(rays.some(r=>r[0].y===1.2));
});

test('squid, sub, special and death interrupt a live slash without delayed damage',async()=>{
  for(const kind of ['squid','sub','special','death']){
    const {f,a,hits}=await setup(),b=enemy(f);tick(a,true);tick(a,false,7);
    if(kind==='squid')a.form='squid';if(kind==='special')a.specialActive={id:'x'};if(kind==='death')a.alive=false;
    a.weaponRunner.update(1/60,{fire:false,sub:kind==='sub'});b.pos.x=0;tick(a,false,8);
    assert.equal(hits.length,0,kind);
  }
});

test('slash device route tests actual source volume and delivers the attack row once',async()=>{
 const {f,a}=await setup(),device={pos:new f.THREE.Vector3(0,.9,1),collisionRadius:.1},miss={pos:new f.THREE.Vector3(20,.9,1)};
 const amounts=[],causes=[];
 f.G.projectiles.s3DamageSubObjects=(_attack,_at,_bound,damage,cause,options)=>{for(const object of [device,miss]){const point=object.pos.clone();amounts.push(options.shapeContact(object,point)?damage(1,object,point):0);}causes.push(cause);};
 tick(a,true);tick(a,false,12);
 assert.equal(amounts.filter(v=>v===20).length,1);assert.equal(amounts.filter(v=>v>0).length,1);
 assert.ok(causes.every(v=>v==='Saber_Slash'));
});

test('source left/right slash offsets are selected at admission and yaw rotates the receiving shape',async()=>{
 const {f,a,hits}=await setup(),r=a.weapon.catalogRecord;
 const swing={...r.parameters.spl__WeaponSaberParam.SwingParam,
  ShotSlashOffset_L:{X:-3,Y:.9,Z:.3},ShotSlashOffset_R:{X:3,Y:.9,Z:.3}};
 a.weapon={...a.weapon,catalogRecord:{...r,parameters:{...r.parameters,spl__WeaponSaberParam:{...r.parameters.spl__WeaponSaberParam,SwingParam:swing}}}};
 a.aimDir.set(1,0,0);
 const left=enemy(f,1,0,3),right=enemy(f,1,0,-3);
 tick(a,true);tick(a,false,40);assert.equal(hits.filter(h=>h.b===left).length,1);assert.equal(hits.filter(h=>h.b===right).length,0);
 tick(a,true);tick(a,false,40);assert.equal(hits.filter(h=>h.b===right).length,1);
});

test('real deployed Splash Wall, Wave Breaker and Super Chump damage routes use their collider surfaces and one-hit ledger',async()=>{
 const {f,a}=await setup(),owner=enemy(f,50),system=f.G.projectiles;
 const wall={subId:'splashWall',owner,team:1,phase:'deployed',pos:new f.THREE.Vector3(2.7,0,1),yaw:0,
  spec:f.SUB.splashWall,hp:1150};
 assert.equal(wall.spec.wallWidth,4.2);assert.equal(wall.spec.wallHeight,2.8);
 const wave={id:'waveBreaker',kind:'wave',owner,team:1,pos:new f.THREE.Vector3(2.15,.9,1),hp:480};
 const chump={id:'superChump',kind:'decoy',owner,team:1,pos:new f.THREE.Vector3(-1.95,.9,1),hp:600};
 system._s3SubObjects=[wall];system._s3AllSpecialObjects=[wave,chump];
 tick(a,true);tick(a,false,7);
 assert.ok(wall.hp<1150,'wall edge touches slash even though wall centre is outside broad query');
 assert.ok(wave.hp<480,'wave radius .72 touches slash at side');assert.ok(chump.hp<600,'decoy radius .48 touches slash at side');
 const after=[wall.hp,wave.hp,chump.hp];tick(a,false,5);assert.deepEqual([wall.hp,wave.hp,chump.hp],after);
});

test('all three vertical source compound boundaries are sampled every 0.1 unit against analytic primitive membership',()=>{
 for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatana')){
  const shape=saberSlashShape(r,'saber-vertical'),h=shape.half,c=shape.center,a=shape.a,b=shape.b;
  let count=0;
  for(let ix=-30;ix<=30;ix++)for(let iy=-20;iy<=20;iy++)for(let iz=-15;iz<=40;iz++){
   const x=ix/10,y=iy/10,z=iz/10;
   const box=Math.abs(x-c.X)<=h.X+1e-9&&Math.abs(y-c.Y)<=h.Y+1e-9&&Math.abs(z-c.Z)<=h.Z+1e-9;
   const cylinder=shape.axis===0?x>=Math.min(a.X,b.X)-1e-9&&x<=Math.max(a.X,b.X)+1e-9&&(y-a.Y)**2+(z-a.Z)**2<=shape.radius**2+1e-9:
    y>=Math.min(a.Y,b.Y)-1e-9&&y<=Math.max(a.Y,b.Y)+1e-9&&(x-a.X)**2+(z-a.Z)**2<=shape.radius**2+1e-9;
   assert.equal(saberSlashContact(shape,origin,0,{x,y,z},0,0,out),box||cylinder,`${r.id}: ${x},${y},${z}`);count++;
  }
  assert.equal(count,140056);
 }
});

test('a Wiper with exactly its exported3% weak-swing cost can tap despite the higher3.5% minimum-charge reservation',async()=>{
 const {f,a}=await setup('s3-saber-lite');a.ink=3;
 tick(a,true);tick(a,false,12);
 assert.equal(f.G.projectiles.list.filter(p=>p.catalog?.descriptor.key==='saber-horizontal').length,1);
 assert.equal(a.ink,0);
});
