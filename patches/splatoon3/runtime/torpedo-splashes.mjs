import {registerLimitedDrop,retireLimitedDrop} from '../../network-replication/torpedo-contact-commit.mjs';
import {isNativeDeviceProbe} from '../../network-replication/native-device-probe.mjs';
// S3 11.3.0 WeaponBombTorpedo BlastParamChase.SplashAroundParam supplies
// Num8, Pitch65deg and Velocity0.42..0.48 DU/frame. Each detached drop explodes
// on terrain, not together with the parent. Their separate gravity is a
// gameplay calibration, not an extracted retail default; exact azimuth and
// Splatoon 3 flight timing remain unverified. Fizzy's explicit per-stage
// SplashAroundParam uses the same bounded detached pool (legacy property name)
// for harmless ordinary owner paint; it never receives a causal core grant.
import { coolerSegmentContact } from './support-cooler-collision.mjs';
const MAX_DROPS=768;
const IDLE_POOL_MS=2000;
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function disposePool(projectiles,pool){
  if(projectiles._s3TorpedoVisuals?.get(pool.scene)!==pool)return;
  if(pool.idleTimer!=null)clearTimeout(pool.idleTimer);pool.idleTimer=null;
  pool.canvas?.removeEventListener?.('webglcontextlost',pool.onContextLost);
  pool.mesh.removeFromParent();pool.mesh.dispose();pool.mesh.geometry.dispose();pool.mesh.material.dispose();
  projectiles._s3TorpedoVisuals.delete(pool.scene);
}
function remove(projectiles,drop,hint=-1){
  retireLimitedDrop(drop);
  const list=projectiles._s3TorpedoSplashes||[],i=hint>=0&&list[hint]===drop?hint:list.indexOf(drop);
  if(i>=0)list.splice(i,1);
  const pool=drop.visual;
  if(pool){drop.visual=null;pool.dirty=true;if(--pool.users===0){
    pool.mesh.count=0;pool.mesh.visible=false;
    pool.idleTimer=setTimeout(()=>{pool.idleTimer=null;if(pool.users===0)disposePool(projectiles,pool);},IDLE_POOL_MS);
    pool.idleTimer.unref?.();
  }}

}
// Opaque droplets share one draw per spawn scene. Simulation records and
// receiver contact identities remain fresh and are never pooled.
function visualPool(api,projectiles,scene=api.G.scene){
  if(!scene?.add)return null;
  const pools=projectiles._s3TorpedoVisuals ||= new Map();
  for(const existing of pools.values())if(existing.scene!==scene&&existing.users===0)disposePool(projectiles,existing);
  let pool=pools.get(scene);
  if(!pool){const T=api.THREE,mesh=new T.InstancedMesh(new T.SphereGeometry(.1,6,4),new T.MeshBasicMaterial({color:0xffffff}),MAX_DROPS);
    mesh.name='s3-torpedo-fizzy-detached-splashes';mesh.count=0;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    pool={scene,mesh,matrix:new T.Matrix4(),color:new T.Color(),users:0,dirty:true,idleTimer:null,canvas:api.G.renderer?.domElement,matrixRange:{start:0,count:0},colorRange:{start:0,count:0}};
    pool.onContextLost=()=>{if(pool.users===0)disposePool(projectiles,pool);};
    pool.canvas?.addEventListener?.('webglcontextlost',pool.onContextLost);
    pools.set(scene,pool);scene.add(mesh);}
  if(pool.idleTimer!=null){clearTimeout(pool.idleTimer);pool.idleTimer=null;}
  return pool;
}
function syncVisuals(projectiles){
  const pools=projectiles._s3TorpedoVisuals;if(!pools)return;
  for(const pool of pools.values()){
    if(!pool.users){pool.mesh.count=0;pool.mesh.visible=false;continue;}
    let count=0;
    for(const d of projectiles._s3TorpedoSplashes||[])if(d.visual===pool){pool.matrix.makeTranslation(d.pos.x,d.pos.y,d.pos.z);pool.mesh.setMatrixAt(count,pool.matrix);if(pool.dirty)pool.mesh.setColorAt(count,d.visualColor);count++;}
    pool.mesh.count=count;pool.mesh.visible=count>0;
    if(count){
      // Preserve the unchanged capacity, upload only rewritten live matrices.
      const matrix=pool.mesh.instanceMatrix;
      pool.matrixRange.count=count*matrix.itemSize;
      matrix.updateRanges.length=0;matrix.updateRanges.push(pool.matrixRange);
      matrix.needsUpdate=true;
      if(pool.dirty){
        const color=pool.mesh.instanceColor;
        pool.colorRange.count=count*color.itemSize;
        color.updateRanges.length=0;color.updateRanges.push(pool.colorRange);
        color.needsUpdate=true;
      }
    }
    pool.dirty=false;
  }
}
function requestVisualSync(projectiles){
  if(projectiles._s3TorpedoVisualDepth){projectiles._s3TorpedoVisualPending=true;return;}
  syncVisuals(projectiles);
}
export function beginTorpedoVisualBatch(projectiles){projectiles._s3TorpedoVisualDepth=(projectiles._s3TorpedoVisualDepth||0)+1;}
export function endTorpedoVisualBatch(projectiles){
  projectiles._s3TorpedoVisualDepth=Math.max(0,(projectiles._s3TorpedoVisualDepth||0)-1);
  if(!projectiles._s3TorpedoVisualDepth&&projectiles._s3TorpedoVisualPending){projectiles._s3TorpedoVisualPending=false;syncVisuals(projectiles);}
}
export function spawnTorpedoSplashes(api,projectiles,source,position,kind='chase'){
  const spec=kind==='find'?source.spec.findSplashAround:source.spec.splashAround;
  if(!spec||!source.chasedTarget)return;
  spawnSplashes(api,projectiles,source,position,spec,kind);
}
export function spawnFizzySplashes(api,projectiles,source,position,stage){
  const spec=source.spec.bursts?.[stage]?.splashAround;if(!spec)return;
  spawnSplashes(api,projectiles,source,position,spec,'fizzy',stage);
}
function spawnSplashes(api,projectiles,source,position,spec,kind,stage=0){
  const drops=projectiles._s3TorpedoSplashes ||= [],rng=random(source.seed^(kind==='find'?0xf1ad6571:kind==='fizzy'?0x3f125167^Math.imul(stage+1,0x85ebca6b):0x82a2b175)),offset=rng()*Math.PI*2;
  let burstColor=null,burstTint,burstPool,cachedPool=null;
  for(let i=0;i<spec.count;i++){
    while(drops.length>=MAX_DROPS)remove(projectiles,drops[0]);
    const angle=offset+i*Math.PI*2/spec.count;
    const pitch=(spec.pitchDegrees??(spec.pitchMinDegrees+(spec.pitchMaxDegrees-spec.pitchMinDegrees)*rng()))*Math.PI/180;
    const speed=spec.velocityMin+(spec.velocityMax-spec.velocityMin)*rng();
    const pos=position.clone();pos.y+=spec.offsetY||0;
    const vel=new api.THREE.Vector3(Math.cos(angle)*Math.cos(pitch)*speed,
      Math.sin(pitch)*speed,Math.sin(angle)*Math.cos(pitch)*speed);
    const drop={owner:source.owner,team:source.team,sourceLife:source.sourceLife,source,ghost:source.ghost,
      gravity:kind==='chase'?(source.spec.splashGravity??source.spec.gravity):source.spec.gravity,
      index:i,kind,stage,paintRadius:spec.paintRadius,pos,prev:pos.clone(),vel,seed:(source.seed^Math.imul(i+1+stage*spec.count,0x9e3779b1))>>>0,
      subId:kind==='fizzy'?'fizzy-splash':'torpedo-splash',type:'sub',damage:kind==='find'||kind==='fizzy'?0:source.spec.splashDamage,size:.1,age:0};
    const scene=api.G.scene;
    const pool=cachedPool&&cachedPool.scene===scene&&cachedPool.users>0&&cachedPool.idleTimer==null&&projectiles._s3TorpedoVisuals?.get(scene)===cachedPool
      ?cachedPool:visualPool(api,projectiles,scene);
    cachedPool=pool;
    if(pool){
      const tint=source.owner.color||api.G.teamColors?.[source.team]||0xffffff;
      const share=typeof tint==='number'||typeof tint==='string';
      if(!share || !burstColor || !Object.is(tint,burstTint) || pool!==burstPool){
        burstColor=pool.color.clone().set(tint);burstTint=tint;burstPool=pool;
      }
      drop.visual=pool;drop.visualColor=burstColor;pool.users++;pool.dirty=true;
    }

    drops.push(drop);registerLimitedDrop(projectiles,drop);
  }
  requestVisualSync(projectiles);
}
export function stepTorpedoSplashes(api,projectiles,dt,burst){
  const list=projectiles._s3TorpedoSplashes;
  if(!list?.length)return;
  for(let i=list.length-1;i>=0;i--){
    const d=list[i];d.age+=dt;d.prev.copy(d.pos);d.vel.y-=(d.gravity??d.source.spec.gravity)*dt;d.pos.addScaledVector(d.vel,dt);
    const world=api.G.physics?.segment?.(d.prev,d.pos,projectiles._s3TorpedoSplashHit ||= new api.Hit());
    // Physics owns reusable Hit vectors. Capture primitives before later
    // collision/defense callbacks can reenter and overwrite that scratch.
    let contact=!!world?.hit, px,py,pz,nx,ny,nz,distance;
    if(contact){px=world.point.x;py=world.point.y;pz=world.point.z;nx=world.normal.x;ny=world.normal.y;nz=world.normal.z;distance=world.dist;}
    const stand=coolerSegmentContact(projectiles,d.prev,d.pos,d.size);
    if(stand&&(!contact||stand.distance<distance)){
      contact=true;px=stand.point.x;py=stand.point.y;pz=stand.point.z;
      nx=stand.normal.x;ny=stand.normal.y;nz=stand.normal.z;distance=stand.distance;
    }
    const defense=projectiles.kitDefenseCandidate?.(d);
    if(defense&&defense.distance<=(contact?distance:Infinity)){
      // The shared defense lane owns absorption/object damage. A replica may
      // stop visually but cannot author another damage proposal.
      if(!d.ghost&&!d.owner.remote||isNativeDeviceProbe(d.source))defense.onHit?.();remove(projectiles,d,i);continue;
    }
    if(contact){
      const at=new api.THREE.Vector3(px,py,pz);
      at.x+=nx*.035;at.y+=ny*.035;at.z+=nz*.035;
      burst(d,at);remove(projectiles,d,i);continue;
    }
    // Resource cleanup below the playable world is not an airborne detonation.
    if(!Number.isFinite(d.pos.x+d.pos.y+d.pos.z)||d.pos.y< -100){remove(projectiles,d,i);continue;}

  }
  requestVisualSync(projectiles);
}
export function clearTorpedoSplashes(projectiles){
  const list=projectiles._s3TorpedoSplashes;
  // Full teardown has no collision/burst callback. Retire the same identities
  // in the same order, then empty the original roster before resource events.
  // Live-step removal retains its immediate splice/membership contract.
  for(const drop of list||[]){
    retireLimitedDrop(drop);
    const pool=drop.visual;
    if(pool){drop.visual=null;pool.dirty=true;if(--pool.users===0){pool.mesh.count=0;pool.mesh.visible=false;}}
  }
  if(list)list.length=0;
  projectiles._s3TorpedoSplashes=[];
  for(const pool of projectiles._s3TorpedoVisuals?.values()||[])disposePool(projectiles,pool);
  projectiles._s3TorpedoVisualPending=false;
}
