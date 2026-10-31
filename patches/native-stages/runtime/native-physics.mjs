import * as THREE from 'three';
import { Physics, Hit, GroundHit, WALKABLE } from '../../../src/game/physics.js';
import { PLAYER } from '../../../src/config.js';
const min = new THREE.Vector3(), max = new THREE.Vector3(), _sortAsc = (a, b) => a - b;
const SOURCE_CONTACT_EPSILON=1e-4;
const FOOT_RING=Array.from({length:8},(_,i)=>[Math.cos(i/8*Math.PI*2),Math.sin(i/8*Math.PI*2)]);
const DOWN=new THREE.Vector3(0,-1,0);
const FOOT_SUPPORT_KEYS=Object.freeze(['block','face','u','v','center','grate']);
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
  const movingLimit=out.hit&&out.dist>0&&Number.isFinite(out.dist)?(maxDist<out.dist?maxDist:out.dist):maxDist;
  const d=this.level.blocks.length>this.level.staticBlockCount||this.dynamic.raycast!==Physics.prototype.raycast?this.dynamic.raycast(origin,dir,movingLimit,this.dynamicHit,skipGrates):null;
  if(d?.hit&&(!out.hit||d.dist<out.dist)){
   out.hit=true;out.dist=d.dist;out.point.copy(d.point);out.normal.copy(d.normal);out.block=d.block;out.face=d.face;out.u=d.u;out.v=d.v;out.triangle=-1;
  }
  return out;
 }
 // LOS asks only whether an occluder exists. The inherited helper passes
 // anyHit to raycast(), but the native nearest-hit adapter cannot honor that
 // output contract. Query the source BVH and moving OBBs in Boolean mode.
 los(a,b){
  if(this.raycast!==CANONICAL_NATIVE_RAYCAST||this.dynamic.raycast!==Physics.prototype.raycast||!this.world.hasCanonicalRay?.())return super.los(a,b);
  const dir=this._nativeLosDir||(this._nativeLosDir=new THREE.Vector3());dir.copy(b).sub(a);
  const length=dir.length();if(length<1e-4)return true;
  const far=length-.05;if(!(far>0)||!Number.isFinite(far))return true;
  dir.multiplyScalar(1/length);
  const options=this._nativeLosOptions||(this._nativeLosOptions={ignoreGrates:true,anyHit:true});
  if(this.world.ray(a,dir,far,options))return false;
  if(this.level.blocks.length===this.level.staticBlockCount)return true;
  return !this.dynamic.raycast(a,dir,far,this._nativeLosHit||(this._nativeLosHit=new Hit()),true,null,true).hit;
 }
 // Ground support uses parallel rays with independent exact hit records.
 // The source BVH can visit their common nodes once. Custom raycast owners
 // retain the inherited sequential contract, including callbacks/side effects.
 groundProbe(x,y,z,up,down,foot,out,skipGrates=false,stepMin=.12){
  const far=up+down;
  if(this.raycast!==CANONICAL_NATIVE_RAYCAST||this.dynamic.raycast!==Physics.prototype.raycast||!this.world.rayDownBatch||!this.world.hasCanonicalRay?.()||!(far>0)||!Number.isFinite(far))
   return super.groundProbe(x,y,z,up,down,foot,out,skipGrates,stepMin);
  const state=this._groundBatch||(this._groundBatch={origins:Array.from({length:9},()=>new THREE.Vector3()),hits:Array.from({length:9},()=>new Hit()),options:{ignoreGrates:false}});
  const {origins,hits,options}=state;options.ignoreGrates=skipGrates;
  origins[0].set(x,y+up,z);
  for(let i=0;i<8;i++)origins[i+1].set(x+FOOT_RING[i][0]*foot,y+up,z+FOOT_RING[i][1]*foot);
  this.world.rayDownBatch(origins,far,options,hits);
  out.hit=false;out.center=false;let have=false,by=-Infinity;
  const moving=this.level.blocks.length>this.level.staticBlockCount;
  for(let i=0;i<9;i++){
   const h=hits[i];h.dist=h.hit?h.distance:far;h.block=h.face=-1;
   if(h.hit){
    h.block=this.level.blockForTriangle(h.triangle);h.face=this.level.data.triangleFace[h.triangle];
    if(h.face>=0){const f=this.level.faces[h.face],p=this.world._p.copy(h.point).sub(f.origin);h.u=p.dot(f.u);h.v=p.dot(f.v);}else h.u=h.v=0;
   }
   if(moving){
    const limit=h.hit&&h.dist>0&&Number.isFinite(h.dist)?Math.min(far,h.dist):far;
    const d=this.dynamic.raycast(origins[i],DOWN,limit,this.dynamicHit,skipGrates);
    if(d.hit&&(!h.hit||d.dist<h.dist)){
     h.hit=true;h.dist=d.dist;h.point.copy(d.point);h.normal.copy(d.normal);h.block=d.block;h.face=d.face;h.u=d.u;h.v=d.v;h.triangle=-1;
    }
   }
   if(!h.hit||(i===0?!(h.normal.y>=WALKABLE):h.normal.y<WALKABLE))continue;
   if(i===0){have=true;by=h.point.y+stepMin;this._fillGround(out,h,true);}
   else if(h.point.y>by){have=true;by=h.point.y;this._fillGround(out,h,false);}
  }
  out.hit=have;return out;
 }
 _emptyDynamicContacts(c){
  c.ground=false;c.wall=false;c.ceiling=false;
  c.groundNormal.set(0,1,0);c.wallNormal.set(0,0,0);c.groundBlock=c.wallBlock=c.ceilingBlock=-1;
 }
 _nativeContacts(pos,radius,lift,height,c,horizontal,skipGrates,iterations){
  const w=this.world,s0=w._s0,s1=w._s1,dir=w._d,pad=radius+.002;
  for(let pass=0;pass<iterations;pass++){
   const sy0=pos.y+lift+radius,sy1=pos.y+Math.max(lift+radius,height-radius);
   s0.set(pos.x,sy0,pos.z);s1.set(pos.x,sy1,pos.z);
   let x0=pos.x-pad,y0=sy0-pad,z0=pos.z-pad,x1=pos.x+pad,y1=sy1+pad,z1=pos.z+pad,moved=false;
   min.set(x0,y0,z0);max.set(x1,y1,z1);
   // BVH builders partition equal-centre triangles differently. Collision
   // corrections are sequential, so broad-phase traversal must not choose the
   // controller result. Preserve canonical source triangle order in both the
   // worker conversion and the prepared conversion.
   const candidates=this._contactCandidates||(this._contactCandidates=[]);candidates.length=0;
   const pushCandidate=this._pushCandidate||(this._pushCandidate=id=>this._contactCandidates.push(id));
   w.queryBox(min,max,pushCandidate);if(candidates.length>1)candidates.sort(_sortAsc);
   for(const id of candidates){
    if(skipGrates&&(w.flags[id]&4))continue;
    // Earlier contacts move s0/s1: use the latest pushed capsule bounds.
    if(w.triangleOverlapsBounds?.(id,x0,y0,z0,x1,y1,z1)===false)continue;
    const t=w.triangle(id),dist=w._capsuleDistance(s0,s1,t);if(dist>=radius-SOURCE_CONTACT_EPSILON)continue;
    dir.subVectors(w._bests,w._bestp);
    if(dist<1e-8){dir.fromArray(w.normals,id*3);w._center.copy(s0).add(s1).multiplyScalar(.5).sub(t.a);if(dir.dot(w._center)<0)dir.negate();}else dir.multiplyScalar(1/dist);
    const depth=radius-dist+SOURCE_CONTACT_EPSILON,hl=horizontal?Math.hypot(dir.x,dir.z):0,block=this.level.blockForTriangle(id);
    if(horizontal&&hl>.3&&dir.y>-.6){
     const push=depth/hl<.45?depth/hl:.45;dir.set(dir.x/hl,0,dir.z/hl);
     s0.addScaledVector(dir,push);s1.addScaledVector(dir,push);pos.addScaledVector(dir,push);
     c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;
    }else{
     s0.addScaledVector(dir,depth);s1.addScaledVector(dir,depth);pos.addScaledVector(dir,depth);
     if(dir.y>.6){c.ground=true;c.groundNormal.copy(dir);c.groundBlock=block;}
     else if(dir.y<-.6){c.ceiling=true;c.ceilingBlock=block;}
     else if(dir.y>-.6&&dir.y<.6){c.wall=true;c.wallNormal.copy(dir);c.wallBlock=block;}
    }
    x0=(s0.x<s1.x?s0.x:s1.x)-pad;y0=(s0.y<s1.y?s0.y:s1.y)-pad;z0=(s0.z<s1.z?s0.z:s1.z)-pad;
    x1=(s0.x>s1.x?s0.x:s1.x)+pad;y1=(s0.y>s1.y?s0.y:s1.y)+pad;z1=(s0.z>s1.z?s0.z:s1.z)+pad;
    moved=true;
   }
   if(!moved)break;
  }
  return c;
 }
 collideBody(pos,radius,lift,height,c,horizontal=false,skipGrates=false,iterations=3){
  if(this.level.blocks.length>this.level.staticBlockCount||this.dynamic.collideBody!==Physics.prototype.collideBody)this.dynamic.collideBody(pos,radius,lift,height,c,horizontal,skipGrates,iterations);
  else this._emptyDynamicContacts(c);
  return this._nativeContacts(pos,radius,lift,height,c,horizontal,skipGrates,iterations);
 }
 collideCapsule(pos,radius,height,c,iterations=3,squid=false){
  if(this.level.blocks.length>this.level.staticBlockCount||this.dynamic.collideCapsule!==Physics.prototype.collideCapsule)this.dynamic.collideCapsule(pos,radius,height,c,iterations,squid);
  else this._emptyDynamicContacts(c);
  return this._nativeContacts(pos,radius,0,height,c,false,squid,iterations);
 }
 bodyFits(pos,radius,lift,height,skipGrates=false,margin=.01){
  if((this.level.blocks.length>this.level.staticBlockCount||this.dynamic.bodyFits!==Physics.prototype.bodyFits)&&!this.dynamic.bodyFits(pos,radius,lift,height,skipGrates,margin))return false;
  return this._sourceBodyFits(pos,radius,lift,height,skipGrates,margin);
 }
 _sourceBodyFits(pos,radius,lift,height,skipGrates,margin){
  const sy0=pos.y+lift+radius,sy1=pos.y+Math.max(lift+radius,height-radius);
  const w=this.world,s0=w._s0.set(pos.x,sy0,pos.z),s1=w._s1.set(pos.x,sy1,pos.z);
  min.set(pos.x-radius,sy0-radius,pos.z-radius);max.set(pos.x+radius,sy1+radius,pos.z+radius);let fits=true;
  // A fit query never moves its capsule. Keep the exact precheck bounds once,
  // but leave empty/grate-only queries free of the extra bounds calculation.
  let boundsReady=false,x0,y0,z0,x1,y1,z1;
  w.queryBox(min,max,id=>{
   if(!fits||(skipGrates&&(w.flags[id]&4)))return;
   if(!boundsReady){
    const pad=margin<0?radius-margin:radius;
    x0=(s0.x<s1.x?s0.x:s1.x)-pad;y0=(s0.y<s1.y?s0.y:s1.y)-pad;z0=(s0.z<s1.z?s0.z:s1.z)-pad;
    x1=(s0.x>s1.x?s0.x:s1.x)+pad;y1=(s0.y>s1.y?s0.y:s1.y)+pad;z1=(s0.z>s1.z?s0.z:s1.z)+pad;boundsReady=true;
   }
   if(w.triangleOverlapsBounds?.(id,x0,y0,z0,x1,y1,z1)===false)return;
   if(w._capsuleDistance(s0,s1,w.triangle(id))<radius-margin){fits=false;return false;}
  },true);
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
  for(const key of FOOT_SUPPORT_KEYS)ground[key]=support[key];
  if(!support.hit)return false;
  raised.copy(pos).setY(support.y);
  if(!this.dynamic.bodyFits(raised,radius,lift,height,skipGrates)||!this._sourceBodyFits(raised,radius,lift,height,skipGrates,SOURCE_CONTACT_EPSILON))return false;
  pos.y=support.y;
  return true;
 }
}

const CANONICAL_NATIVE_RAYCAST=NativePhysics.prototype.raycast;
