import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Real loaded source rig and real procedural meshes. Geometry/holding checks
// are separate from Nintendo proportions and native launch-physics tests.
const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`
 export {createTrizooka,disposeSpecialModel,TRIZOOKA_PRESENTATION,trizookaPresentationMuzzle} from './patches/splatoon3/runtime/special-motion.mjs';
`});
const {THREE:T,G}=f;
const v=(...a)=>new T.Vector3(...a);
function gripHole(ch,side){return ch.bones['hand'+side].localToWorld(v(side==='R'?.0255:-.0255,-.0525,0));}

test('Trizooka has a recessed hollow bore, a long rear housing and solid distinct grip geometry',()=>{
 const g=f.createTrizooka('#ff7711',T),h=g.getObjectByName('zooka-housing');g.updateWorldMatrix(true,true);
 assert.equal(g.children.length,5,'retain the existing five model meshes');
 const bounds=new T.Box3().setFromObject(h),size=bounds.getSize(v());
 assert.ok(size.z>1.15&&bounds.min.z<-.53,'neck and rear drum extend behind the head');
 assert.ok(size.y>.75,'large capsules and lower trigger replace the short pipe silhouette');
 const pos=h.geometry.attributes.position,col=h.geometry.attributes.color,silver=new T.Color('#b7c5cc');
 const collarAngles=new Set();
 for(let n=0;n<pos.count;n++){
  const x=pos.getX(n),y=pos.getY(n)-.075,z=pos.getZ(n),radius=Math.hypot(x,y);
  if(Math.abs(z-.01)<1e-6&&Math.abs(radius-.174)<1e-5)collarAngles.add(Math.atan2(y,x).toFixed(4));
 }
 const rearHit=new T.Raycaster(v(.3,.075,-.43),v(-1,0,0)).intersectObject(h)[0];
 assert.ok(rearHit&&rearHit.point.x>.175,'rear silver fins lie outside the core instead of buried in it');
 const rearIndex=h.geometry.index.getX(rearHit.faceIndex*3);
 assert.ok(Math.abs(col.getX(rearIndex)-silver.r)<1e-5&&Math.abs(col.getY(rearIndex)-silver.g)<1e-5,'the exposed longitudinal fin is silver');
 assert.equal(collarAngles.size,6,'the yellow forward collar has six real outer corners');
 const ray=new T.Raycaster(v(0,.075,1),v(0,0,-1)),hit=ray.intersectObject(h)[0];
 assert.ok(hit,'the recessed rear of the bore is solid');
 assert.ok(hit.point.z<.46,'the front opening has no flat muzzle plug');
 const c=h.geometry.attributes.color,i=h.geometry.index.getX(hit.faceIndex*3);
 assert.ok(c.getX(i)<.05&&c.getY(i)<.05&&c.getZ(i)<.05,'the recessed bore is dark');
 for(const side of ['R','L']){
  const axis=g.userData.gripAxes[side];
  const gripHit=new T.Raycaster(axis.center.clone().add(v(0,0,.15)),v(0,0,-1)).intersectObject(h)[0];
  assert.ok(gripHit&&gripHit.point.distanceTo(axis.center)<.06,side+' socket is inside actual rendered handle geometry');
  const holeAxis=v(0,0,1).applyQuaternion(g.userData['handQ'+side]);
  assert.ok(Math.abs(holeAxis.dot(axis.direction))>1-1e-12,side+' hand wraps along the actual grip axis');
 }
 assert.ok(g.userData.gripAxes.L.direction.x<-.5,'front support is oblique rather than the rear vertical trigger');
 f.disposeSpecialModel(g);
});

test('loaded source rig carries the barrel beside the right face with two separate physical grips',async()=>{
 for(const hz of [30,60,120]){
  f.reset();const a=await f.make(),ch=a.character;
  for(let i=0;i<hz/2;i++)f.tick(a,1/hz);
  a.weapon={...a.weapon,special:'trizooka'};a.special=a.specialCost();a._startSpecial();
  for(let i=0;i<hz/2;i++)f.tick(a,1/hz);
  const g=ch.kid.getObjectByName('special:trizooka');
  assert.ok(g?.visible);ch.root.updateWorldMatrix(true,true);
  for(const side of ['R','L']){
   const target=g.localToWorld(g.userData['grip'+side].clone());
   assert.ok(gripHole(ch,side).distanceTo(target)<1e-5,'fingers stay on actual handle axis at '+hz+'Hz');
  }
  const head=ch.root.worldToLocal(ch.bones.head.getWorldPosition(v()));
  const bore=ch.root.worldToLocal(g.localToWorld(v(0,.075,0)));
  assert.ok(bore.x<head.x-.16,'the barrel is beside the right face instead of centered across it');
  const rear=g.localToWorld(g.userData.gripR.clone()),front=g.localToWorld(g.userData.gripL.clone());
  const clavicle=ch.bones.clavR.getWorldPosition(v());
  assert.ok(rear.y<clavicle.y-.04,'rear trigger fist is below the shoulder at the upper torso');
  assert.ok(front.y>rear.y+.12,'front support hand is higher than the lower trigger hand');
  assert.ok(front.clone().sub(rear).dot(a.aimDir)>.20,'left hand supports farther forward than the trigger hand');
  const nozzle=v();assert.equal(f.trizookaPresentationMuzzle(ch,nozzle),true);
  assert.ok(nozzle.distanceTo(g.localToWorld(g.userData.muzzle.clone()))<1e-9,'cosmetic pulses read the visible open nozzle');
  const before=g.position.clone(),q=g.quaternion.clone(),clock=a.s3Trizooka?.t;
  f.tick(a,0);ch.root.updateWorldMatrix(true,true);
  assert.ok(g.position.distanceTo(before)<1e-9,'paused reach fit cannot accumulate a rest-position shift');
  assert.ok(g.quaternion.angleTo(q)<1e-7,'paused pose keeps its aim');
  assert.equal(a.s3Trizooka?.t,clock,'presentation leaves native special clock unchanged');
 }
 f.reset();
});
