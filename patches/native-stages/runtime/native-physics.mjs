import * as THREE from 'three';
import { Physics, Hit, GroundHit } from '../../../src/game/physics.js';
import { PLAYER } from '../../../src/config.js';
const min = new THREE.Vector3(), max = new THREE.Vector3();
const SOURCE_CONTACT_EPSILON=1e-4;
/** Preserve the live controller's ground, lifted-body, step and camera APIs. */
export class NativePhysics extends Physics {
 constructor(level){
  super(level);this.world=level.triangleWorld;this.actorBody=PLAYER;
  this.dynamic=new Physics({blocks:level.blocks,faces:level.faces,
   queryBlocks:(...a)=>level.queryDynamicBlocks(...a)});
  this.dynamicHit=new Hit();
  // This result is copied into the caller-owned Hit before the next raycast.
  this._nativeRayHit={point:new THREE.Vector3(),normal:new THREE.Vector3()};
  this._nativeRayOptions={ignoreGrates:false};
 }
 raycast(origin,dir,maxDist,out=new Hit(),skipGrates=false){
  out.hit=false;out.dist=maxDist;out.block=out.face=-1;
  if(!(maxDist>0)||!Number.isFinite(maxDist))return out;
  this._nativeRayOptions.ignoreGrates=skipGrates;
  const h=this.world.ray(origin,dir,maxDist,this._nativeRayOptions,this._nativeRayHit);
  if(h){
   out.hit=true;out.dist=h.distance;out.point.copy(h.point);out.normal.copy(h.normal);
   out.block=this.level.blockForTriangle(h.triangle);out.face=this.level.data.triangleFace[h.triangle];out.triangle=h.triangle;
   if(out.face>=0){const f=this.level.faces[out.face],p=this.world._p.copy(h.point).sub(f.origin);out.u=p.dot(f.u);out.v=p.dot(f.v);}else out.u=out.v=0;
  }
  const d=this.dynamic.raycast(origin,dir,maxDist,this.dynamicHit,skipGrates);
  if(d.hit&&(!out.hit||d.dist<out.dist)){
   out.hit=true;out.dist=d.dist;out.point.copy(d.point);out.normal.copy(d.normal);out.block=d.block;out.face=d.face;out.u=d.u;out.v=d.v;out.triangle=-1;
  }
  return out;
 }
 _nativeContacts(pos,radius,lift,height,c,horizontal,skipGrates,iterations){
  const w=this.world,s0=w._s0,s1=w._s1,dir=w._d;
  for(let pass=0;pass<iterations;pass++){
   s0.set(pos.x,pos.y+lift+radius,pos.z);s1.set(pos.x,pos.y+Math.max(lift+radius,height-radius),pos.z);
   min.copy(s0).min(s1).addScalar(-radius-.002);max.copy(s0).max(s1).addScalar(radius+.002);let moved=false;
   // BVH builders partition equal-centre triangles differently. Collision
   // corrections are sequential, so broad-phase traversal must not choose the
   // controller result. Preserve canonical source triangle order in both the
   // worker conversion and the prepared conversion.
   const candidates=this._contactCandidates||(this._contactCandidates=[]);candidates.length=0;
   w.queryBox(min,max,id=>candidates.push(id));candidates.sort((a,b)=>a-b);
   for(const id of candidates){
    if(skipGrates&&(w.flags[id]&4))continue;
    const t=w.triangle(id),dist=w._capsuleDistance(s0,s1,t);if(dist>=radius-SOURCE_CONTACT_EPSILON)continue;
    dir.subVectors(w._bests,w._bestp);
    if(dist<1e-8){dir.fromArray(w.normals,id*3);w._center.copy(s0).add(s1).multiplyScalar(.5).sub(t.a);if(dir.dot(w._center)<0)dir.negate();}else dir.multiplyScalar(1/dist);
    const depth=radius-dist+SOURCE_CONTACT_EPSILON,hl=Math.hypot(dir.x,dir.z),block=this.level.blockForTriangle(id);
    if(horizontal&&hl>.3&&dir.y>-.6){
     const push=Math.min(.45,depth/hl);dir.set(dir.x/hl,0,dir.z/hl);
     s0.addScaledVector(dir,push);s1.addScaledVector(dir,push);pos.addScaledVector(dir,push);
     c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;
    }else{
     s0.addScaledVector(dir,depth);s1.addScaledVector(dir,depth);pos.addScaledVector(dir,depth);
     if(dir.y>.6){c.ground=true;c.groundNormal.copy(dir);c.groundBlock=block;}
     else if(dir.y<-.6){c.ceiling=true;c.ceilingBlock=block;}
     else if(Math.abs(dir.y)<.6){c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;}
    }
    moved=true;
   }
   if(!moved)break;
  }
  return c;
 }
 collideBody(pos,radius,lift,height,c,horizontal=false,skipGrates=false,iterations=3){
  this.dynamic.collideBody(pos,radius,lift,height,c,horizontal,skipGrates,iterations);
  return this._nativeContacts(pos,radius,lift,height,c,horizontal,skipGrates,iterations);
 }
 collideCapsule(pos,radius,height,c,iterations=3,squid=false){
  this.dynamic.collideCapsule(pos,radius,height,c,iterations,squid);
  return this._nativeContacts(pos,radius,0,height,c,false,squid,iterations);
 }
 bodyFits(pos,radius,lift,height,skipGrates=false,margin=.01){
  if(!this.dynamic.bodyFits(pos,radius,lift,height,skipGrates,margin))return false;
  return this._sourceBodyFits(pos,radius,lift,height,skipGrates,margin);
 }
 _sourceBodyFits(pos,radius,lift,height,skipGrates,margin){
  const w=this.world,s0=w._s0.set(pos.x,pos.y+lift+radius,pos.z),s1=w._s1.set(pos.x,pos.y+Math.max(lift+radius,height-radius),pos.z);
  min.copy(s0).min(s1).addScalar(-radius);max.copy(s0).max(s1).addScalar(radius);let fits=true;
  w.queryBox(min,max,id=>{if(!fits||(skipGrates&&(w.flags[id]&4)))return;if(w._capsuleDistance(s0,s1,w.triangle(id))<radius-margin){fits=false;return false;}},true);
  return fits;
 }
 /** A raised source foot snap follows the body solve. Reconcile only a new
  * source contact using that same installed solver and footprint probe. The
  * public fit tolerance, geometry, body dimensions and dynamic owners stay
  * unchanged. Collision corrections are not assumed to follow a straight
  * chord between the submitted and committed poses. */
 reconcileSourceFootBody(pos,radius,lift,height,c,ground,foot,up,down,skipGrates=false){
  if(ground.block<0||ground.block>=this.level.staticBlockCount||this._sourceBodyFits(pos,radius,lift,height,skipGrates,SOURCE_CONTACT_EPSILON))return true;
  const fresh=this._sourceFootContacts||(this._sourceFootContacts={wall:false,ground:false,ceiling:false,wallNormal:new THREE.Vector3(),groundNormal:new THREE.Vector3(),wallBlock:-1,groundBlock:-1,ceilingBlock:-1});
  fresh.wall=fresh.ground=fresh.ceiling=false;fresh.wallBlock=fresh.groundBlock=fresh.ceilingBlock=-1;
  fresh.wallNormal.set(0,0,0);fresh.groundNormal.set(0,1,0);
  this.collideBody(pos,radius,lift,height,fresh,true,skipGrates);
  if(fresh.wall){c.wall=true;c.wallNormal.copy(fresh.wallNormal);c.wallBlock=fresh.wallBlock;}
  if(fresh.ground){c.ground=true;c.groundNormal.copy(fresh.groundNormal);c.groundBlock=fresh.groundBlock;}
  if(fresh.ceiling){c.ceiling=true;c.ceilingBlock=fresh.ceilingBlock;}
  const support=this._sourceFootGround||(this._sourceFootGround=new GroundHit()),raised=this._sourceFootPosition||(this._sourceFootPosition=new THREE.Vector3());
  this.groundProbe(pos.x,pos.y,pos.z,up,down,foot,support,skipGrates);
  ground.hit=support.hit;ground.y=support.y;ground.normal.copy(support.normal);
  for(const key of ['block','face','u','v','center','grate'])ground[key]=support[key];
  if(!support.hit)return false;
  raised.copy(pos).setY(support.y);
  if(!this.dynamic.bodyFits(raised,radius,lift,height,skipGrates)||!this._sourceBodyFits(raised,radius,lift,height,skipGrates,SOURCE_CONTACT_EPSILON))return false;
  pos.y=support.y;
  return true;
 }
}
