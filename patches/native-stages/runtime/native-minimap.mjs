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
export function nativeMinimapSupport(level,x,z,layers=reachableLayers(level)){
 const world=level.triangleWorld,top=world.nodes[4]+1,bottom=world.nodes[1]-1;
 const first=world.ray(origin.set(x,top,z),down,top-bottom,{minNormalY:.45});
 if(!first||!layers)return first;
 const {nav,reachable}=layers,ix=Math.round((x-nav.x0)/nav.step),iz=Math.round((z-nav.z0)/nav.step),candidates=[];
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
  hit=world.ray(origin.set(x,from,z),down,from-bottom,{minNormalY:.45});
 }
 return first;
}

/** Uses the original live map's ink/live layers; leaves physics and paint intact. */
export function buildNativeMinimap(map){
 const L=map.level,W=map.w,H=map.h,N=W*H,w=L.triangleWorld,P=map.paint;
 for(const k of ['canvas','base','inkC','flashC']){map[k].width=W;map[k].height=H;}
 map.inkImg=map.ictx.createImageData(W,H);map.flashImg=map.fctx.createImageData(W,H);
 map.hgt=new Float32Array(N).fill(-99);map.topBlock=new Int32Array(N).fill(-1);map.nrm=new Float32Array(N*2);
 map.pixCell=new Int32Array(N).fill(-1);map.pixFx=new Uint8Array(N);map.pixFy=new Uint8Array(N);map.pixSx=new Int8Array(N);map.pixSy=new Int32Array(N);
 const layers=reachableLayers(L);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,wx=map._worldX(x+.5),wz=map._worldZ(y+.5),h=nativeMinimapSupport(L,wx,wz,layers);if(!h)continue;
  map.hgt[i]=h.point.y;map.topBlock[i]=L.blockForTriangle(h.triangle);const sign=map.flip?1:-1;map.nrm[i*2]=h.normal.x*sign;map.nrm[i*2+1]=h.normal.z*sign;
  const fid=L.data.triangleFace[h.triangle];if(fid<0)continue;const f=L.faces[fid];if(!f.turf)continue;
  const r=w._p.copy(h.point).sub(f.origin),u=r.dot(f.u),v=r.dot(f.v),iu=Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))),iv=Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv))),k=f.grid+iv*f.nu+iu;
  if(!P.dead[k])map.pixCell[i]=k;
 }
 map._drawBase();map.owner=new Uint8Array(N);map._built=true;
}
