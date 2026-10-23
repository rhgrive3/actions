import * as THREE from 'three';
const origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
function reachableLayers(level){
 const nav=level.nativeNav;if(nav?.level!==level||!nav.validIds?.length)return null;
 const reachable=new Uint8Array(nav.nodes.length),queue=[];
 for(const pad of level.spawnPads){const id=nav.nearest(pad,1.2);if(id>=0&&nav.valid[id]&&!reachable[id]){reachable[id]=1;queue.push(id);}}
 for(let i=0;i<queue.length;i++)for(const edge of nav.nodes[queue[i]].nb)if(nav.valid[edge.to]&&!reachable[edge.to]){reachable[edge.to]=1;queue.push(edge.to);}
 return {nav,reachable};
}

/** Project exact display triangles at the highest locally reachable floor layer.
 * Unreachable roofs cannot cover the floor below. Obstacle-only pixels retain
 * their original topmost silhouette; this is a local map policy, not retail data. */
export function nativeMinimapSupport(level,x,z,layers=reachableLayers(level),scratch=null){
 scratch||={candidates:[],first:{point:new THREE.Vector3(),normal:new THREE.Vector3()},next:{point:new THREE.Vector3(),normal:new THREE.Vector3()},options:{minNormalY:.45}};
 const world=level.triangleWorld,top=world.nodes[4]+1,bottom=world.nodes[1]-1;
 const first=world.ray(origin.set(x,top,z),down,top-bottom,scratch.options,scratch.first);
 if(!first||!layers)return first;
 const {nav,reachable}=layers,ix=Math.round((x-nav.x0)/nav.step),iz=Math.round((z-nav.z0)/nav.step),candidates=scratch.candidates;candidates.length=0;
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const cx=ix+dx,cz=iz+dz;if(cx<0||cz<0||cx>=nav.nx||cz>=nav.nz)continue;
  for(const id of nav.cells[cz*nav.nx+cx])if(reachable[id]){
   const n=nav.nodes[id];if(Math.hypot(n.x-x,n.z-z)<=nav.step*1.1)candidates.push(n);
  }
 }
 if(!candidates.length)return first;
 let hit=first;
 for(let layer=0;hit&&layer<16;layer++){
  // Compare planes rather than only heights, so sloped floor pixels can select
  // the same support as an offset navigation sample without flattening ramps.
  for(const n of candidates){const height=n.y-(hit.normal.x*(x-n.x)+hit.normal.z*(z-n.z))/hit.normal.y;if(Math.abs(height-hit.point.y)<.15)return hit;}
  const from=hit.point.y-.02;if(from<=bottom)break;
  hit=world.ray(origin.set(x,from,z),down,from-bottom,scratch.options,scratch.next);
 }
 return first;
}

// Source triangles/masks are immutable within a NativeLevel. Their owners use
// invalidateMinimapSupport() if a diagnostic deliberately changes them in place.
// Navigation is small enough to compare actual dependency values, never a hash.
function supportReferences(map,layers){
 const L=map.level,w=L.triangleWorld;
 return [L,L.data,w,w.triangles,w.normals,w.flags,w.objectIds,w.nodes,w.order,L.data.triangleFace,L.objectBlock,L.faces,map.paint,map.paint.dead,L.mask,layers?.nav||null,map._worldX,map._worldZ];
}
function visitSupportValues(map,layers,emit){
 const L=map.level,B=L.bounds,w=L.triangleWorld;
 for(const value of [map.w,map.h,map.s,B.minX,B.maxX,B.minZ,B.maxZ,L.staticBlockCount,L.faces.length,L.minimapSupportRevision||0,w.nodes[1],w.nodes[4]])emit(value);
 if(!layers){emit(null);return;}
 const {nav,reachable}=layers;emit(nav.x0);emit(nav.z0);emit(nav.step);emit(nav.nx);emit(nav.nz);emit(nav.nodes.length);
 for(let i=0;i<nav.nodes.length;i++){const n=nav.nodes[i];emit(n.x);emit(n.y);emit(n.z);emit(reachable[i]);}
 emit(nav.cells.length);for(const cell of nav.cells){emit(cell.length);for(const id of cell)emit(id);}
}
function supportMatches(map,layers,cache){
 const refs=supportReferences(map,layers);if(refs.length!==cache.refs.length||refs.some((value,i)=>value!==cache.refs[i]))return false;
 let index=0,same=true;visitSupportValues(map,layers,value=>{if(!Object.is(value,cache.values[index++]))same=false;});return same&&index===cache.values.length;
}
function rememberSupport(map,layers,hits){
 const values=[];visitSupportValues(map,layers,value=>values.push(value));
 map._nativeSupportCache={refs:supportReferences(map,layers),values,flip:map.flip,hits};
}
function rotateSupport(map,cache){
 const arrays=[map.hgt,map.topBlock,map.pixCell],normal=map.nrm,hits=cache.hits,N=map.w*map.h;
 for(let i=0;i<Math.ceil(N/2);i++){
  const j=N-1-i,hi=hits[i],hj=hits[j];
  for(const array of arrays){const value=array[i];array[i]=array[j];array[j]=value;}
  const x=normal[i*2],z=normal[i*2+1],otherX=normal[j*2],otherZ=normal[j*2+1];
  normal[i*2]=hj?-otherX:otherX;normal[i*2+1]=hj?-otherZ:otherZ;
  normal[j*2]=hi?-x:x;normal[j*2+1]=hi?-z:z;hits[i]=hj;hits[j]=hi;
 }
 cache.flip=map.flip;
}

/** Uses the original live map's ink/live layers; leaves physics and paint intact. */
export function buildNativeMinimap(map,canonicalProjection=false){
 const L=map.level,W=map.w,H=map.h,N=W*H,w=L.triangleWorld,P=map.paint;
 for(const [key,context] of [['canvas','ctx'],['base','bctx'],['inkC','ictx'],['flashC','fctx']]){
  const canvas=map[key];if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}else if(map._built){const ctx=map[context];if(typeof ctx.reset==='function')ctx.reset();else canvas.width=W;}
 }
 if(map.inkImg?.width!==W||map.inkImg?.height!==H)map.inkImg=map.ictx.createImageData(W,H);else map.inkImg.data.fill(0);
 if(map.flashImg?.width!==W||map.flashImg?.height!==H)map.flashImg=map.fctx.createImageData(W,H);else map.flashImg.data.fill(0);
 const layers=reachableLayers(L),cache=map._nativeSupportCache;
 if(canonicalProjection&&map._built&&cache&&cache.flip!==map.flip&&cache.hits.length===N&&supportMatches(map,layers,cache)){
  rotateSupport(map,cache);map._drawBase();map.owner=new Uint8Array(N);map._built=true;return;
 }
 const hits=canonicalProjection?new Uint8Array(N):null;
 map._nativeSupportCache=null;
 map.hgt=new Float32Array(N).fill(-99);map.topBlock=new Int32Array(N).fill(-1);map.nrm=new Float32Array(N*2);
 map.pixCell=new Int32Array(N).fill(-1);
 // Native projection selects one exact paint cell; no bilinear neighbors exist.
 map.pixFx=map.pixFy=map.pixSx=map.pixSy=null;
 const scratch={candidates:[],first:{point:new THREE.Vector3(),normal:new THREE.Vector3()},next:{point:new THREE.Vector3(),normal:new THREE.Vector3()},options:{minNormalY:.45}};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,wx=map._worldX(x+.5),wz=map._worldZ(y+.5),h=nativeMinimapSupport(L,wx,wz,layers,scratch);if(!h)continue;
  if(hits)hits[i]=1;
  map.hgt[i]=h.point.y;map.topBlock[i]=L.blockForTriangle(h.triangle);const sign=map.flip?1:-1;map.nrm[i*2]=h.normal.x*sign;map.nrm[i*2+1]=h.normal.z*sign;
  const fid=L.data.triangleFace[h.triangle];if(fid<0)continue;const f=L.faces[fid];if(!f.turf)continue;
  const r=w._p.copy(h.point).sub(f.origin),u=r.dot(f.u),v=r.dot(f.v),iu=Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))),iv=Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv))),k=f.grid+iv*f.nu+iu;
  if(!P.dead[k])map.pixCell[i]=k;
 }
 map._drawBase();map.owner=new Uint8Array(N);map._built=true;
 if(hits)rememberSupport(map,layers,hits);
}
