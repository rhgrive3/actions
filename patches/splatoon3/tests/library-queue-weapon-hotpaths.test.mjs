import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {INK_PROFILES,referenceReach,splashPlan,runtimeSplashPlan} from '../../../inkwave-public/src/game/inkFlight.js';
import {catalogSplashDropSpec} from '../runtime/catalog-splash-paint.mjs';
import {sampleSplatlingSpeed} from '../runtime/splatling.mjs';

const extraExports=`export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
export {insideDamageAt} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
export {bodyParams,cachedS3ShapeKind,s3ShapeKind} from './patches/splatoon3/runtime/s3-projectile-shapes.mjs';`;
const clamp=x=>Math.max(0,Math.min(1,x));
const lerp=(a,b,t)=>a+(b-a)*t;
function oldInside(b,d){
 const bands=[['Max','High'],['High','Low'],['Low','Min']];
 if(d<=b.DamageMaxDistance)return b.DamageMaxValue/10;
 for(const [a,c] of bands)if(d<=b['Damage'+c+'Distance'])return lerp(b['Damage'+a+'Value'],b['Damage'+c+'Value'],clamp((d-b['Damage'+a+'Distance'])/(b['Damage'+c+'Distance']-b['Damage'+a+'Distance'])))/10;
 return 0;
}

test('scalar Inside damage preserves ordered/nonmonotonic/nonfinite source arithmetic',async()=>{
 const f=await fixture({productionComposition:true,extraExports});let seed=0x12345678;
 const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2**32;};
 for(let i=0;i<10000;i++){
  const b={};for(const field of ['Max','High','Low','Min']){b['Damage'+field+'Distance']=rand()*30-3;b['Damage'+field+'Value']=rand()*2000;}
  if(i%13===0)b.DamageHighDistance=NaN;if(i%23===0)b.DamageLowValue=undefined;
  for(const d of [b.DamageMaxDistance,b.DamageHighDistance,b.DamageLowDistance,b.DamageMinDistance,rand()*40,NaN,Infinity])assert.ok(Object.is(f.insideDamageAt(b,d),oldInside(b,d)));
 }
});

test('catalogue neutralization retires delayed Slosher births and pooled scratch clears actor references',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const slosh=f.MAIN_WEAPON_CATALOG.records.find(r=>!r.legacy&&r.family==='slosher');
 const a=f.make(slosh.id);a.form='kid';a.intent.fire=true;f.tick(a);
 assert.ok(a.weaponRunner.catalogState.pending);
 a.weaponRunner.cancelPendingInput();a.intent.fire=false;
 assert.equal(a.weaponRunner.catalogState.pending,null);
 f.tick(a,120);assert.equal(f.G.projectiles.list.length,0);
 const row=f.MAIN_WEAPON_CATALOG.records.find(r=>!r.legacy&&r.family==='shooter');
 const b=f.make(row.id);b.form='kid';b.intent.fire=true;f.tick(b);
 const p=f.G.projectiles.list.find(p=>p.catalog),hit=p.catalog.hit,seen=p.catalog.seen;
 seen.add(a);f.G.projectiles.clear();
 assert.equal(seen.size,0);assert.equal(p.catalog,null);
 const c=f.make(row.id);c.form='kid';c.intent.fire=true;f.tick(c);
 const next=f.G.projectiles.list.find(p=>p.catalog);
 assert.equal(next,p);assert.equal(next.catalog.hit,hit);assert.equal(next.catalog.seen,seen);assert.equal(seen.size,0);
});

test('shape output scratch preserves all body fields without changing default independent results',async()=>{
 const f=await fixture({productionComposition:true,extraExports});
 const out={};
 for(const kind of ['shot','pellet','arrow'])for(const age of [0,.01,.1,1])for(const sp of [0,.1,20]){
  const p={pos:new f.THREE.Vector3(1,2,3),start:new f.THREE.Vector3(),age,vis:.15,size:.2,vel:new f.THREE.Vector3(0,0,sp)};
  const original=f.bodyParams(p,kind,sp);assert.equal(f.bodyParams(p,kind,sp,out),out);
  assert.deepEqual(out,{...original});assert.notEqual(original,f.bodyParams(p,kind,sp));
 }
});

test('speed jitter retains exact source distribution and recurring plans retain full-sequence arithmetic',()=>{
 for(const bias of [.2,.5,.75,0,1,NaN])for(const rate of [.12,0,-1,NaN])for(let i=0;i<100;i++){
  const uniform=i/99,base=126,signed=clamp(uniform)*2-1,median=Number.isFinite(bias)&&bias>0&&bias<1?bias:.5;
  const original=!Number.isFinite(rate)||rate<=0?base:Math.max(0,base*(1+Math.sign(signed)*rate*Math.pow(Math.abs(signed),Math.log(median)/Math.log(.5))));
  assert.ok(Object.is(sampleSplatlingSpeed(base,rate,bias,uniform),original));
 }
 for(const profile of Object.values(INK_PROFILES))for(const seq of [0,1,7,8,1000,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER])assert.deepEqual(runtimeSplashPlan(profile,seq),splashPlan(profile,seq));
 for(const p of [INK_PROFILES.shooter,INK_PROFILES.dualies])assert.equal(referenceReach(p,0),referenceReach(p,10));
 const mutable=structuredClone(INK_PROFILES.shooter),before=referenceReach(mutable,0);mutable.motion.speed*=.5;assert.notEqual(referenceReach(mutable,0),before);
});

test('cached catalogue splash specs invalidate after relevant in-place data edits',()=>{
 const source={MoveParam:{FreeGravity:.016},SplashSpawnParam:{},SplashPaintParam:{}};
 const a=catalogSplashDropSpec(source);assert.ok(a);assert.equal(catalogSplashDropSpec(source),a);
 source.MoveParam.FreeGravity=.02;const b=catalogSplashDropSpec(source);assert.notEqual(b,a);assert.equal(b.gravity,.02*3600);
 source.SplashPaintParam.DepthScaleMax=2;const c=catalogSplashDropSpec(source);assert.notEqual(c,b);assert.equal(c.depthScaleMax,2);
});


test('capsule search matches the production rounded-distance search including adjacent-root ties',async()=>{
 assert.equal(Math.sqrt(1),Math.sqrt(1+Number.EPSILON),'adjacent squared values can share one rounded root');
 const f=await fixture({productionComposition:true});const V=f.THREE.Vector3;
 function original(a,b,base,radius,height){
  const point=new V(),dist=t=>f.Physics.pointCapsuleDist(point.copy(a).lerp(b,t),base,radius,height);
  let best=Infinity,bt=0;for(let i=0;i<=6;i++){const t=i/6,d=dist(t);if(d<best){best=d;bt=t;}}
  let lo=Math.max(0,bt-1/6),hi=Math.min(1,bt+1/6);
  for(let k=0;k<8;k++){const m1=lo+(hi-lo)/3,m2=hi-(hi-lo)/3;if(dist(m1)<dist(m2))hi=m2;else lo=m1;}
  const t=(lo+hi)/2;return {t,dist:dist(t)};
 }
 let seed=0xabcdef01;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2**32;};
 for(let i=0;i<20000;i++){
  const a=new V(rand()*40-20,rand()*8-4,rand()*40-20),b=i%13===0?a.clone():new V(rand()*40-20,rand()*8-4,rand()*40-20),base=new V(rand()*10,rand()*4,rand()*10),radius=rand(),height=rand()*4;
  const before=original(a,b,base,radius,height),after=f.Physics.segmentCapsuleDist(a,b,base,radius,height,{});
  assert.ok(Object.is(before.t,after.t));assert.ok(Object.is(before.dist,after.dist));
 }
});


test('render classification cache tracks every original input across pooled/late metadata changes',async()=>{
 const f=await fixture({productionComposition:true,extraExports});
 const p={wid:'shooter',type:'shot',s3SpecialWeapon:null,catalog:null};
 const check=()=>{assert.equal(f.cachedS3ShapeKind(p),f.s3ShapeKind(p));assert.equal(f.cachedS3ShapeKind(p),f.s3ShapeKind(p));};
 for(const type of ['shot','drop','blast'])for(const special of [null,true,false])for(const row of f.MAIN_WEAPON_CATALOG.records){
  p.type=type;p.s3SpecialWeapon=special;p.wid=row.id;p.catalog=null;check();
  for(const key of ['normal','pellet','arrow','saber-horizontal','saber-vertical']){p.catalog={r:row,descriptor:{key}};check();}
 }
 p.type='shot';p.s3SpecialWeapon=null;p.wid='shooter';p.catalog={r:{family:'shooter'},descriptor:{key:'normal'}};check();
 p.catalog.r.family='brella';p.catalog.descriptor.key='pellet';check();p.catalog=null;check();
});
