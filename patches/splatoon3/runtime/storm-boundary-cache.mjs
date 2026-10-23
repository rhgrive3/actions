// Per-projectile-system geometry cache. Materials/uniforms remain cloud-owned.
import { stormBoundarySceneState } from './storm-boundary-occlusion.mjs';
export const STORM_BOUNDARY_CACHE_LIMITS=Object.freeze({entries:12,idleTicks:120,buildsPerRender:1,anchorDistance:.75});
const caches=new WeakMap(), L=STORM_BOUNDARY_CACHE_LIMITS;
const empty=m=>m.empty||(m.empty=new m.THREE.BufferGeometry());
function detach(mesh) {
  const m=mesh.userData.cacheManager,e=mesh.userData.cacheEntry;
  if(m)m.pending.delete(mesh);
  if(e){e.users.delete(mesh);if(!e.users.size)e.idleSince=m.epoch;}
  mesh.userData.cacheEntry=null;mesh.userData.cacheManager=null;mesh.visible=false;
  if(m)mesh.geometry=empty(m);
  // Standalone unframed callers retain the original immediate-release contract.
  if(e&&!e.users.size&&!m.framed)retire(m,e,false);
}
function retire(m,e,invalid) {
  if(!e.valid)return;
  e.valid=false;m.entries.delete(e);
  for(const mesh of [...e.users])detach(mesh);
  e.geometry.dispose();m.stats.disposals++;
  if(invalid)m.stats.invalidations++;else m.stats.evictions++;
}
function resetLevel(m,level) {
  if(m.level===level)return;
  for(const e of [...m.entries])retire(m,e,true);
  for(const request of [...m.pending.values()])detach(request.mesh);
  m.pending.clear();m.level=level;
}
function manager(G,scene,THREE,scope) {
  let m=caches.get(scope);
  if(!m){m={G,scene,THREE,level:null,entries:new Set(),pending:new Map(),epoch:0,remaining:0,framed:false,empty:null,
    stats:{builds:0,hits:0,deferrals:0,evictions:0,invalidations:0,disposals:0,maxBuildsPerRender:0},renderBuilds:0};caches.set(scope,m);}
  m.G=G;resetLevel(m,G.level);return m;
}
function sameSignature(a,b) {
  if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}
function valid(m,e,frame) {
  if(!e.valid)return false;
  if(frame&&e.checkedEpoch===frame.epoch)return true;
  e.checkedEpoch=frame?.epoch;
  const G=m.G,level=m.level;
  if(e.physics!==G.physics||e.raycast!==G.physics?.raycast||e.faces!==level.faces||e.world!==level.triangleWorld||e.triangles!==level.triangleWorld?.triangles){retire(m,e,true);return false;}
  const key=stormBoundarySceneState(level,e.anchor,e.radius+1,e.state);
  if(key!==e.key||!sameSignature(e.signature,e.state.signature)){retire(m,e,true);return false;}
  return true;
}
function bind(m,e,mesh) {
  if(mesh.userData.cacheEntry!==e){detach(mesh);e.users.add(mesh);mesh.userData.cacheEntry=e;mesh.userData.cacheManager=m;}
  m.pending.delete(mesh);e.idleSince=null;e.used=m.epoch;mesh.geometry=e.geometry;
  mesh.userData.anchor.copy(e.anchor);mesh.userData.occlusion=e.state.occlusion;
  mesh.userData.sourceVisits=e.state.sourceVisits;mesh.userData.triangleIds=e.state.triangleIds;
  mesh.userData.cacheStatus='ready';return e;
}
function request(m,mesh,cloud,radius,build,frame) {
  const center=cloud.group.position,top=center.y-.8,old=mesh.userData.cacheEntry;
  if(old&&old.manager===m&&old.radius===radius&&old.top===top&&old.anchor.distanceToSquared(center)<=L.anchorDistance**2&&valid(m,old,frame))return bind(m,old,mesh);
  detach(mesh);
  for(const e of [...m.entries])if(e.radius===radius&&e.top===top&&e.anchor.distanceToSquared(center)<=L.anchorDistance**2&&valid(m,e,frame)){m.stats.hits++;return bind(m,e,mesh);}
  let reason=null;
  if(frame&&m.remaining<=0)reason='frame-budget';
  if(!reason&&m.entries.size>=L.entries){
    let idle=null;for(const e of m.entries)if(!e.users.size&&(!idle||e.used<idle.used))idle=e;
    if(idle)retire(m,idle,false);else reason='cache-capacity';
  }
  if(reason){
    mesh.userData.cacheManager=m;mesh.geometry=empty(m);mesh.visible=false;mesh.userData.cacheStatus=reason;
    mesh.userData.occlusion={rays:0,cuts:0,occluders:0,fallback:reason};
    m.pending.set(mesh,{mesh,cloud,radius,build});m.stats.deferrals++;return null;
  }
  if(frame){m.remaining--;m.renderBuilds++;m.stats.maxBuildsPerRender=Math.max(m.stats.maxBuildsPerRender,m.renderBuilds);}
  const result=build(cloud,m.G,radius,m.THREE),level=m.level;
  const e={manager:m,valid:true,anchor:center.clone(),radius,top,geometry:result.geometry,state:result.state,key:result.key,
    signature:result.state.signature.slice(),physics:m.G.physics,raycast:m.G.physics?.raycast,faces:level.faces,world:level.triangleWorld,
    triangles:level.triangleWorld?.triangles,users:new Set(),used:m.epoch,idleSince:null,checkedEpoch:frame?.epoch};
  m.entries.add(e);m.stats.builds++;return bind(m,e,mesh);
}
export function beginStormBoundaryFrame(G,scene,THREE,scope=scene,renderKey) {
  const m=manager(G,scene,THREE,scope);m.framed=true;m.epoch++;
  // Multiple fixed simulation ticks in one delivered frame share this budget.
  const clock=G.game?.s3Clock;
  const key=renderKey!==undefined?renderKey:clock?.advancing&&Number.isFinite(G.game._frameN)?G.game._frameN:null;
  if(key===null||m.renderKey!==key){m.renderKey=key;m.remaining=L.buildsPerRender;m.renderBuilds=0;}
  for(const e of [...m.entries])if(!e.users.size&&e.idleSince!==null&&m.epoch-e.idleSince>=L.idleTicks)retire(m,e,false);
  const frame={manager:m,epoch:m.epoch};
  // FIFO prevents a moving first cloud from starving other pending clouds.
  const queued=[...m.pending.values()];
  for(const q of queued){
    if(m.remaining<=0)break;
    m.pending.delete(q.mesh);
    if(q.cloud._released||q.cloud.t>=q.cloud.dur||q.cloud.rainBoundary!==q.mesh){detach(q.mesh);continue;}
    request(m,q.mesh,q.cloud,q.radius,q.build,frame);
    q.mesh.visible=false; // Its normal update refreshes uniforms before drawing.
  }
  return frame;
}
export function stormBoundaryPlaceholder(G,scene,THREE,frame) {
  return empty(frame?.manager||manager(G,scene,THREE,scene));
}
export function acquireStormBoundaryGeometry(mesh,cloud,G,scene,radius,THREE,build,frame) {
  const m=frame?.manager||manager(G,scene,THREE,scene);
  resetLevel(m,G.level);return request(m,mesh,cloud,radius,build,frame);
}
export function releaseStormBoundaryGeometry(mesh) {detach(mesh);}
export function clearStormBoundaryCache(scope) {
  const m=caches.get(scope);if(!m)return;
  for(const e of [...m.entries])retire(m,e,true);
  for(const q of [...m.pending.values()])detach(q.mesh);
  m.pending.clear();m.empty?.dispose();m.level=null;caches.delete(scope);
}
export function stormBoundaryCacheSnapshot(scope) {
  const m=caches.get(scope);if(!m)return {entries:0,pending:0,users:0,geometryBytes:0,signatureNumbers:0};
  let users=0,geometryBytes=0,signatureNumbers=0;
  for(const e of m.entries){users+=e.users.size;geometryBytes+=e.geometry.attributes.position?.array.byteLength||0;signatureNumbers+=e.signature.length+e.state.signature.length;}
  return {...m.stats,entries:m.entries.size,pending:m.pending.size,users,geometryBytes,signatureNumbers,remainingBuilds:m.remaining};
}
