// Small independent 3D muzzle beads for Shooter, Splatling and Dualies.
// Existing muzzle flashes and the Splatling's compact projectile body stay intact.
// Fixed reusable CPU records + existing glossy blob mesh; no physics, paint,
// callbacks on landing, shared RNG, new geometry/material, or network payload.
export const SHOOTER_MUZZLE_COSMETICS=Object.freeze({bursts:32,drops:3,life:.14,radius:.043});
// Do not infer projectile identity from the currently held weapon: sub/special
// shots, delayed volleys and reused records must never borrow main-weapon FX.
export function muzzleDropletFamily(p){
 if(!p||p.s3SpecialWeapon||p.type!=='shot')return null;
 const family=p.catalog?.r?.family??p.s3Weapon?.kind??p.wid;
 return family==='shooter'||family==='splatling'||family==='dualies'?family:null;
}
// Retained to preserve the Shooter-only contract used by existing tests/callers.
export function isOrdinaryShooter(p){return muzzleDropletFamily(p)==='shooter';}
export class ShooterMuzzleDroplets{
 constructor(THREE){
  this.next=0;this.count=0;this.drawn=0;this.emitted=0;
  this.pool=Array.from({length:SHOOTER_MUZZLE_COSMETICS.bursts},()=>({owner:null,wid:null,t:0,seed:0,phaseMask:0,phases:new Float64Array(3),phaseCos:new Float64Array(3),phaseSin:new Float64Array(3),pos:new THREE.Vector3(),dir:new THREE.Vector3(),right:new THREE.Vector3(),up:new THREE.Vector3()}));
  this.origin=new THREE.Vector3();
 }
 clear(){for(const b of this.pool)b.owner=null;this.next=this.count=this.drawn=this.emitted=0;}
 observe(p,time,system,camera){
  const family=muzzleDropletFamily(p);
  if(!family||p.delay>0||p._iwShooterMuzzleSeen||!p.owner?.color||!(p.age>=0&&p.age<4/60)||!p.start)return;
  p._iwShooterMuzzleSeen=true;
  if(camera&&camera.distanceToSquared(p.start)>900)return;
  const b=this.pool[this.next];this.next=(this.next+1)%this.pool.length;
  b.owner=p.owner;b.wid=p.owner.weapon?.id;b.family=family;
  b.t=time-p.age;b.seed=p.seed||0;b.phaseMask=0;b.pos.copy(p.start);
  // Dualies must retain the fired hand's actual physical nozzle. Calling the
  // single getMuzzle() socket here would pull BOTH hands onto the right pistol.
  // Catalogue raw sockets may have a same-tick presentation-only pose delta;
  // applying that delta to this cosmetic never changes the projectile itself.
  if(family==='dualies'){
   const pose=p.catalog&&p._s3PoseBirthOffset;
   if(pose&&pose.seed===p.seed&&Number.isFinite(pose.x+pose.y+pose.z)){
    b.pos.x+=pose.x;b.pos.y+=pose.y;b.pos.z+=pose.z;
   }
  }else if(p.owner.character?.getMuzzle){
   p.owner.character.getMuzzle(this.origin);
   if(Number.isFinite(this.origin.x+this.origin.y+this.origin.z)&&
      this.origin.distanceToSquared(p.start)<4)b.pos.copy(this.origin);
  }
  b.dir.copy(p.vel);if(b.dir.lengthSq()<1e-8)b.dir.set(0,0,1);else b.dir.normalize();
  if(Math.abs(b.dir.y)<.95)b.right.set(-b.dir.z,0,b.dir.x).normalize();else b.right.set(1,0,0);
  b.up.crossVectors(b.dir,b.right);this.emitted+=SHOOTER_MUZZLE_COSMETICS.drops;
 }
 append(time,mesh,shape,look,petals,n,cap,m,q,s,pos,dir,axis,camera=null){
  this.count=this.drawn=0;
  for(const b of this.pool){
   if(!b.owner)continue;
   const age=time-b.t;
   if(age>=SHOOTER_MUZZLE_COSMETICS.life||age<0||b.owner.alive===false||b.owner.weapon?.id!==b.wid||camera&&camera.distanceToSquared(b.pos)>900){b.owner=null;continue;}
   this.count++;
   for(let i=0;i<SHOOTER_MUZZLE_COSMETICS.drops&&n<cap;i++){
    if(!(b.phaseMask&(1<<i))){
     const phase=b.seed*6.2832+i*2.39996;
     b.phases[i]=phase;b.phaseCos[i]=Math.cos(phase);b.phaseSin[i]=Math.sin(phase);b.phaseMask|=1<<i;
    }
    const phase=b.phases[i],lateral=.38+i*.09,speed=5.5+i*.9;
    dir.copy(b.dir).multiplyScalar(speed).addScaledVector(b.right,b.phaseCos[i]*lateral*5).addScaledVector(b.up,b.phaseSin[i]*lateral*5);
    pos.copy(b.pos).addScaledVector(b.dir,.12).addScaledVector(dir,age).addScaledVector(b.up,-3*age*age);
    dir.addScaledVector(b.up,-6*age).normalize();q.setFromUnitVectors(axis,dir);
    const r=SHOOTER_MUZZLE_COSMETICS.radius*(1-i*.12)*(1-age/SHOOTER_MUZZLE_COSMETICS.life*.55);
    s.setScalar(r);m.compose(pos,q,s);mesh.setMatrixAt(n,m);mesh.setColorAt(n,b.owner.color);
    const o=n*4;shape[o]=1.35;shape[o+1]=.02;shape[o+2]=phase;shape[o+3]=0;
    look[o]=.01;look[o+1]=4;look[o+2]=1;look[o+3]=phase;petals[n*2]=petals[n*2+1]=0;n++;this.drawn++;
   }
  }
  return n;
 }
}
