// S3mix Tacticooler: either team's shots and humanoids collide; squid, Dualies
// slides and Killer Wail pass. Bombs bounce rather than sticking/exploding.
// Retail body dimensions are not public. This collider is explicitly an
// INKWAVE calibration from the existing model's bounds, not GuideRadius (the
// unrelated source throw-guide radius). Its underside starts at the glass
// body, leaving the visible pedestal gap open to shots.
import {createTacticooler,disposeSpecialModel} from './special-motion.mjs';
import {kitSweepSphereBlocks} from './trizooka-collision.mjs';
import {selectTrizookaCollision} from './kit-trizooka.mjs';
import {fidelityWorldCollisionRadius} from './weapons-fidelity.mjs';

let api,modelBounds;
const INSTALLED=Symbol.for('inkwave.s3.cooler-collision.v1'),EPS=1e-8;
export const COOLER_COLLISION_CALIBRATION=Object.freeze({
  status:'INKWAVE model AABB calibration; glass lower edge preserves underside gap, retail body dimensions unverified',
  actorResolution:'native movement contact, horizontal side constraint; no support surface on top',
  bombResponse:'existing native rebound .35 normal restitution and .6 retention; retail rebound coefficient unverified',
});
function bounds(){
  if(modelBounds)return modelBounds;
  const {THREE}=api,model=createTacticooler(0xffffff,THREE);
  const box=new THREE.Box3().setFromObject(model),glass=new THREE.Box3().setFromObject(model.getObjectByName('cooler-glass'));
  box.min.y=glass.min.y;
  modelBounds={min:box.min.clone(),max:box.max.clone()};disposeSpecialModel(model);return modelBounds;
}
function live(stand){return !stand.s3Retired&&stand.expires>api.G.time&&stand.pos?.isVector3;}
function updateBlock(stand,index){
  const {THREE,G}=api,b=bounds();
  // Copy the existing Tower attachment; never integrate a second trajectory.
  const offset=stand.towerLocal,tower=G.match?.rankedWorld?.towerBlock;
  if(offset&&tower?.center?.isVector3&&tower.axes?.length===3){
    stand.pos.copy(tower.center);for(let i=0;i<3;i++)stand.pos.addScaledVector(tower.axes[i],offset[i]);
    stand.mesh?.position.copy(stand.pos);
  }
  const block=stand.s3CoolerCollision ||= {id:index,solid:true,center:new THREE.Vector3(),half:new THREE.Vector3(),
    axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[],stand};
  block.id=index;block.center.copy(b.min).add(b.max).multiplyScalar(.5).add(stand.pos);
  block.half.copy(b.max).sub(b.min).multiplyScalar(.5);return block;
}
function levelFor(system){
  const level=system._s3CoolerCollisionLevel ||= {blocks:[],faces:[],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;for(let i=0;i<this.blocks.length;i++)out.push(i);return out;}};
  level.blocks.length=0;
  for(const stand of system._s3SupportCoolers||[])if(live(stand))level.blocks.push(updateBlock(stand,level.blocks.length));
  return level;
}
// Public pure first-contact contract for every native/custom thrown sub owner.
// Radius is the caller's own physical sphere, never its paint/burst radius.
export function coolerSegmentContact(system,start,end,radius=0){
  if(!api||!system||!start?.isVector3||!end?.isVector3)return null;
  const level=levelFor(system);if(!level.blocks.length)return null;
  const out=new api.Hit();kitSweepSphereBlocks(level,start,end,Math.max(0,radius),out);
  if(!out.hit)return null;
  return {distance:out.dist,point:out.point.clone(),normal:out.normal.clone(),stand:level.blocks[out.block].stand,kind:'tacticooler'};
}
function projectileRadius(p){
  if(p.wid==='trizooka')return selectTrizookaCollision(p).worldRadius;
  if(p.type==='bomb')return p.size??.2;
  return fidelityWorldCollisionRadius(p);
}
function projectileCandidate(system,p,start,end){
  // Custom thrown subs have their own world-contact/rebound owner, which uses
  // coolerSegmentContact directly. Do not consume them as generic defenses.
  if(!p?.type||p.type==='sub'||p.s3TrizookaBirthPending||p.wid==='killerWail')return null;
  const c=coolerSegmentContact(system,start,end,projectileRadius(p));if(!c)return null;
  let spent=false;
  c.onHit=()=>{
    if(spent||!live(c.stand))return;spent=true;
    // Native blast behavior still owns splash/paint. Stand contact itself has
    // no HP and credits no turf. Ghost blasts remain intrinsic visual copies.
    if(p.type==='blast'){
      const old=p.s3TerrainBurst;p.s3TerrainBurst=true;
      try{system._blastBurst(p,c.point,null);}finally{p.s3TerrainBurst=old;}
    }else api.G.fx?.burst?.(c.point,c.normal,p.owner?.color||0xffffff,{count:5,speed:2,size:.05});
  };
  return c;
}
function passActor(a,isSquid){
  const r=a.weaponRunner;
  return isSquid||a.form==='squid'||!!r?.dodge||!!r?.s3DualiesGlide||a.specialActive?.id==='crabTank';
}
function actorContact(a,isSquid){
  if(passActor(a,isSquid)||a.remote||!a.alive||!api.G.projectiles)return null;
  const r=api.PLAYER.s3HumanoidTerrainRadiusRaw*api.PLAYER.s3TerrainDistanceScale||api.PLAYER.radius;
  const height=api.PLAYER.height,lift=api.PLAYER.stepUp,from=a._s3CoolerMovementStart||a.pos;
  const {THREE}=api,level=levelFor(api.G.projectiles);if(!level.blocks.length)return null;
  const flat={blocks:[],faces:[],queryBlocks:level.queryBlocks};
  for(const block of level.blocks){
    const min=block.center.y-block.half.y,max=block.center.y+block.half.y;
    if(a.pos.y+height<min||a.pos.y+lift>max)continue;
    // Project only the horizontal capsule; the stand never becomes a roof.
    flat.blocks.push({...block,id:flat.blocks.length,center:new THREE.Vector3(block.center.x,0,block.center.z),
      half:new THREE.Vector3(block.half.x,1e4,block.half.z)});
  }
  if(!flat.blocks.length)return null;
  const out=new api.Hit(),start=new THREE.Vector3(from.x,0,from.z),end=new THREE.Vector3(a.pos.x,0,a.pos.z);
  kitSweepSphereBlocks(flat,start,end,r,out);if(!out.hit)return null;
  const block=flat.blocks[out.block],normal=out.normal;
  if(out.dist>EPS){a.pos.x=out.point.x+normal.x*(r+EPS);a.pos.z=out.point.z+normal.z*(r+EPS);}
  else {
    const dx=a.pos.x-block.center.x,dz=a.pos.z-block.center.z,h=block.half;
    const qx=Math.max(-h.x,Math.min(h.x,dx)),qz=Math.max(-h.z,Math.min(h.z,dz));
    const nx=dx-qx,nz=dz-qz,d=Math.hypot(nx,nz);
    if(d>EPS){if(d>=r)return null;normal.set(nx/d,0,nz/d);a.pos.addScaledVector(normal,r-d+EPS);}
    else if(h.x-Math.abs(dx)<h.z-Math.abs(dz)){
      normal.set(dx>=0?1:-1,0,0);a.pos.x=block.center.x+normal.x*(h.x+r+EPS);
    }else{normal.set(0,0,dz>=0?1:-1);a.pos.z=block.center.z+normal.z*(h.z+r+EPS);}
  }
  return normal;
}
export function installCoolerCollision(context){
  api=context;
  const {Projectiles,Actor}=api;if(Object.hasOwn(Projectiles.prototype,INSTALLED))return;
  Object.defineProperty(Projectiles.prototype,INSTALLED,{value:true});
  const barrier=Projectiles.prototype.kitBarrierCandidate;
  Projectiles.prototype.coolerBombCandidate=function(b,start,end){
    const c=coolerSegmentContact(this,start,end,.2);
    if(c)c.onHit=()=>{};
    return c;
  };
  Projectiles.prototype.kitBarrierCandidate=function(p,start=p?.prev,end=p?.pos){
    const prior=barrier?.call(this,p,start,end),c=projectileCandidate(this,p,start,end);
    return c&&(!prior||c.distance<prior.distance)?c:prior;
  };
  const move=Actor.prototype._integrateMovementStep,resolve=Actor.prototype._resolve;
  if(move)Actor.prototype._integrateMovementStep=function(dt,isSquid,...args){
    this._s3CoolerMovementOrigin ||= new api.THREE.Vector3();
    this._s3CoolerMovementStart=this._s3CoolerMovementOrigin.copy(this.pos);
    try{return move.call(this,dt,isSquid,...args);}finally{this._s3CoolerMovementStart=null;}
  };
  Actor.prototype._resolve=function(isSquid,...args){
    const n=actorContact(this,isSquid),result=resolve.call(this,isSquid,...args);
    if(n){const into=this.vel.x*n.x+this.vel.z*n.z;if(into<0){this.vel.x-=n.x*into;this.vel.z-=n.z*into;}
      if(!this.contacts.wall){this.contacts.wall=true;this.contacts.wallNormal.copy(n);this.contacts.wallBlock=-1;}}
    return result;
  };
}
