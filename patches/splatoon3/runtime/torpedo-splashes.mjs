// S3 11.3.0 WeaponBombTorpedo BlastParamChase.SplashAroundParam supplies
// Num8, Pitch65deg and Velocity0.42..0.48 DU/frame. Each detached drop explodes
// on terrain, not together with the parent. Gravity is the existing custom
// projectile calibration (24 world units/s²); its omitted retail default and
// the exact azimuth distribution remain unverified. Fizzy's explicit per-stage
// SplashAroundParam uses the same bounded detached pool (legacy property name)
// for harmless ordinary owner paint; it never receives a causal core grant.
import { coolerSegmentContact } from './support-cooler-collision.mjs';
const MAX_DROPS=768;
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function remove(projectiles,drop){
  const list=projectiles._s3TorpedoSplashes||[],i=list.indexOf(drop);
  if(i>=0)list.splice(i,1);
  if(drop.mesh){drop.mesh.parent?.remove(drop.mesh);drop.mesh.geometry.dispose();drop.mesh.material.dispose();drop.mesh=null;}
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
  for(let i=0;i<spec.count;i++){
    while(drops.length>=MAX_DROPS)remove(projectiles,drops[0]);
    const angle=offset+i*Math.PI*2/spec.count;
    const pitch=(spec.pitchDegrees??(spec.pitchMinDegrees+(spec.pitchMaxDegrees-spec.pitchMinDegrees)*rng()))*Math.PI/180;
    const speed=spec.velocityMin+(spec.velocityMax-spec.velocityMin)*rng();
    const pos=position.clone();pos.y+=spec.offsetY||0;
    const vel=new api.THREE.Vector3(Math.cos(angle)*Math.cos(pitch)*speed,
      Math.sin(pitch)*speed,Math.sin(angle)*Math.cos(pitch)*speed);
    const drop={owner:source.owner,team:source.team,sourceLife:source.sourceLife,source,ghost:source.ghost,
      index:i,kind,stage,paintRadius:spec.paintRadius,pos,prev:pos.clone(),vel,seed:(source.seed^Math.imul(i+1+stage*spec.count,0x9e3779b1))>>>0,
      subId:kind==='fizzy'?'fizzy-splash':'torpedo-splash',type:'sub',damage:kind==='find'||kind==='fizzy'?0:source.spec.splashDamage,size:.1,age:0};
    if(api.G.scene?.add){
      drop.mesh=new api.THREE.Mesh(new api.THREE.SphereGeometry(.1,6,4),
        new api.THREE.MeshBasicMaterial({color:source.owner.color||api.G.teamColors?.[source.team]||0xffffff}));
      drop.mesh.position.copy(pos);api.G.scene.add(drop.mesh);
    }
    drops.push(drop);
  }
}
export function stepTorpedoSplashes(api,projectiles,dt,burst){
  const list=projectiles._s3TorpedoSplashes||[];
  for(let i=list.length-1;i>=0;i--){
    const d=list[i];d.age+=dt;d.prev.copy(d.pos);d.vel.y-=d.source.spec.gravity*dt;d.pos.addScaledVector(d.vel,dt);
    const world=api.G.physics?.segment?.(d.prev,d.pos,projectiles._s3TorpedoSplashHit ||= new api.Hit());
    let contact=world?.hit?{point:world.point.clone(),normal:world.normal.clone(),distance:world.dist}:null;
    const stand=coolerSegmentContact(projectiles,d.prev,d.pos,d.size);
    if(stand&&(!contact||stand.distance<contact.distance))contact={point:stand.point.clone(),normal:stand.normal.clone(),distance:stand.distance};
    const defense=projectiles.kitDefenseCandidate?.(d);
    if(defense&&defense.distance<=(contact?.distance??Infinity)){
      // The shared defense lane owns absorption/object damage. A replica may
      // stop visually but cannot author another damage proposal.
      if(!d.ghost&&!d.owner.remote)defense.onHit?.();remove(projectiles,d);continue;
    }
    if(contact){
      const at=contact.point.addScaledVector(contact.normal,.035);
      burst(d,at);remove(projectiles,d);continue;
    }
    // Resource cleanup below the playable world is not an airborne detonation.
    if(!Number.isFinite(d.pos.x+d.pos.y+d.pos.z)||d.pos.y< -100){remove(projectiles,d);continue;}
    d.mesh?.position.copy(d.pos);
  }
}
export function clearTorpedoSplashes(projectiles){
  for(const drop of [...projectiles._s3TorpedoSplashes||[]])remove(projectiles,drop);
  projectiles._s3TorpedoSplashes=[];
}
