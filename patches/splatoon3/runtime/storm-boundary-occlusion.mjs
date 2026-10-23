// Vertical shadow volumes from the same collision surfaces used by Physics.
// Exact planar clipping avoids missing narrow roofs between visibility probes.
import { STORM_RAIN_REACH } from './storm-effects.mjs';
export const STORM_BOUNDARY_LIMITS = Object.freeze({ blocks: 128, occluders: 512, visits: 2048, cuts: 4096, rays: 64, polygons: 512, vertices: 8192 });
const LIMITS=STORM_BOUNDARY_LIMITS;
const dot = (p, q) => p[0]*q[0] + p[1]*q[1] + p[2]*q[2] + q[3];
function split(poly, plane) {
  const inside = [], outside = [];
  for (let i=0; i<poly.length; i++) {
    const a=poly[i], b=poly[(i+1)%poly.length], da=dot(a,plane), db=dot(b,plane), ia=da>=0, ib=db>=0;
    (ia?inside:outside).push(a);
    if (ia!==ib) {
      const t=da/(da-db), p=a.map((v,k)=>v+(b[k]-v)*t);
      inside.push(p); outside.push(p);
    }
  }
  return [inside,outside];
}
function usable(poly) {
  if(poly.length<3)return false;
  const a=poly[0];let x=0,y=0,z=0;
  for(let i=1;i<poly.length-1;i++){const b=poly[i],c=poly[i+1],bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2];x+=by*cz-bz*cy;y+=bz*cx-bx*cz;z+=bx*cy-by*cx;}
  return Math.hypot(x,y,z)>1e-8;
}
function shadow(a,b,c,top) {
  const area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
  if (Math.abs(area)<1e-9) return null; // A vertical wall does not cover an XZ area.
  const sign=Math.sign(area), qx=((b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]))/area;
  const qz=((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/area, h=a[1]-qx*a[0]-qz*a[2];
  const planes=[a,b,c].map((p,i)=>{const q=[a,b,c][(i+1)%3],dx=q[0]-p[0],dz=q[2]-p[2];return [-dz*sign,0,dx*sign,(dz*p[0]-dx*p[2])*sign];});
  planes.push([qx,-1,qz,h-.012],[-qx,0,-qz,top-h]);
  return {planes,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),
    minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2]),maxY:Math.max(a[1],b[1],c[1])};
}
export function stormBoundarySceneState(level, center, reach, state) {
  const query=level.native?level.queryDynamicBlocks:level.queryBlocks;
  const ids=query.call(level,center.x-reach,center.z-reach,center.x+reach,center.z+reach,state.ids||(state.ids=[]));
  state.sceneOverflow=ids.length>LIMITS.blocks;
  if(state.sceneOverflow)return 0;
  let key=2166136261;
  for(const id of ids) {
    const b=level.blocks[id]; key=Math.imul(key^id,16777619);
    // Includes moving colliders: cached cutouts may not outlive their transform.
    for(const v of [b.center,b.half,...b.axes]) for(const x of [v.x,v.y,v.z]) key=Math.imul(key^Math.round(x*1e6),16777619);
    key=Math.imul(key^(b.solid?1:0),16777619);
  }
  return key;
}
export function clipStormBoundary(positions, cloud, G, state, THREE) {
  const level=G.level, top=cloud.group.position.y-.8, shadows=[], stats={rays:0,cuts:0,occluders:0,fallback:null};
  const fail=reason=>{stats.fallback=reason;state.occlusion=stats;return [];};
  if(!G.physics?.raycast || G.physics.level!==level) return fail('physics-unavailable');
  const lowest=positions.reduce((y,v,i)=>i%3===1?Math.min(y,v):y,Infinity);
  const add=(a,b,c)=>{if(Math.max(a[1],b[1],c[1])<=lowest+.012 || Math.min(a[1],b[1],c[1])>top)return;const s=shadow(a,b,c,top);if(s)shadows.push(s);};
  if(state.sourceFallback)return fail(state.sourceFallback);
  if(level.native) {
    const source=level.triangleWorld.triangles;
    for(const id of state.triangleIds){const i=id*9;add(Array.from(source.subarray(i,i+3)),Array.from(source.subarray(i+3,i+6)),Array.from(source.subarray(i+6,i+9)));}
  }
  for(const id of state.ids) {
    if(level.native && id<level.staticBlockCount) continue;
    const b=level.blocks[id];if(!b.solid)continue;
    const half=[b.half.x,b.half.y,b.half.z];
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
      const n=b.axes[axis];if(n.y*sign<=1e-9)continue;
      const others=[0,1,2].filter(k=>k!==axis),corners=[];
      for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        const p=b.center.clone().addScaledVector(n,half[axis]*sign).addScaledVector(b.axes[others[0]],half[others[0]]*u).addScaledVector(b.axes[others[1]],half[others[1]]*v);
        corners.push(p.toArray());
      }
      add(corners[0],corners[1],corners[2]);add(corners[0],corners[2],corners[3]);
    }
  }
  stats.occluders=shadows.length;if(shadows.length>LIMITS.occluders)return fail('occluder-budget');
  const validated=new Set();
  const result=[], origin=state.rainOrigin||(state.rainOrigin=new THREE.Vector3()), down=state.rainDown||(state.rainDown=new THREE.Vector3(0,-1,0));
  const hit=state.rainHit||(state.rainHit={point:new THREE.Vector3(),normal:new THREE.Vector3()});
  for(let i=0;i<positions.length;) {
    const receiver=state.receiverFaces[i/9]??i;
    let poly=[positions.slice(i,i+3),positions.slice(i+3,i+6),positions.slice(i+6,i+9)];
    if(!level.native){poly.push(positions.slice(i+15,i+18));i+=18;}else i+=9;
    // Receiver faces can span far beyond the queried neighborhood. Crop them
    // before visibility validation so every test point has all its occluders.
    const center=cloud.group.position,r=state.reach;
    for(const plane of [[1,0,0,r-center.x],[-1,0,0,r+center.x],[0,0,1,r-center.z],[0,0,-1,r+center.z]]){
      poly=split(poly,plane)[0];if(poly.length<3)break;
    }
    if(poly.length<3)continue;
    poly=split(poly,[0,-1,0,top])[0];if(poly.length<3)continue;
    poly=split(poly,[0,1,0,STORM_RAIN_REACH-top])[0];if(poly.length<3)continue;
    const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[2]),ys=poly.map(p=>p[1]);
    let pieces=[poly];
    for(const s of shadows) {
      if(s.maxY<=Math.min(...ys)+.012 || s.maxX<Math.min(...xs) || s.minX>Math.max(...xs) || s.maxZ<Math.min(...zs) || s.minZ>Math.max(...zs))continue;
      const next=[];
      for(let piece of pieces) {
        for(const plane of s.planes) {
          if(++stats.cuts>LIMITS.cuts)return fail('clip-budget');
          const [inside,outside]=split(piece,plane);if(usable(outside)){next.push(outside);if(next.length>LIMITS.polygons)return fail('polygon-budget');}
          piece=inside;if(!usable(piece))break;
        }
      }
      pieces=next;if(!pieces.length)break;if(pieces.length>LIMITS.polygons)return fail('polygon-budget');
    }
    if(pieces.length) {
      if(!validated.has(receiver)){
      if(stats.rays>=LIMITS.rays)return fail('ray-budget');stats.rays++;
      // Clipping covers every fragment analytically. Validate one surviving
      // polygon per coplanar receiver face against the live Physics ray.
      // A disagreement rejects the whole boundary rather than exposing a gap.
      const point=[0,0,0], probe=pieces[0];for(const p of probe)for(let k=0;k<3;k++)point[k]+=p[k]/probe.length;
      origin.set(point[0],top,point[2]);
      const rain=G.physics.raycast(origin,down,STORM_RAIN_REACH,hit);
      if(rain.hit && rain.point.y>point[1]+.02)return fail('physics-mismatch');
      validated.add(receiver);
      }
      for(const piece of pieces){if(result.length/3+(piece.length-2)*3>LIMITS.vertices)return fail('vertex-budget');for(let k=1;k<piece.length-1;k++)result.push(...piece[0],...piece[k],...piece[k+1]);}
    }
  }
  state.occlusion=stats;return result;
}

export function collectStormBoundaryTriangles(level, center, reach, state, THREE) {
  state.sourceFallback=state.sceneOverflow?'block-budget':null;state.triangleIds=[];state.sourceVisits=0;
  if(state.sourceFallback)return;
  if(!level.native)return;
  if(!level.triangleWorld?.queryBox){state.sourceFallback='collision-triangles-unavailable';return;}
  const top=center.y-.8, source=level.triangleWorld.triangles;
  level.triangleWorld.queryBox(new THREE.Vector3(center.x-reach,top-STORM_RAIN_REACH,center.z-reach),new THREE.Vector3(center.x+reach,top,center.z+reach),id=>{
    if(++state.sourceVisits>LIMITS.visits){state.sourceFallback='bvh-visit-budget';return false;}
    const i=id*9;
    if(Math.max(source[i],source[i+3],source[i+6])<center.x-reach || Math.min(source[i],source[i+3],source[i+6])>center.x+reach ||
       Math.max(source[i+2],source[i+5],source[i+8])<center.z-reach || Math.min(source[i+2],source[i+5],source[i+8])>center.z+reach ||
       Math.max(source[i+1],source[i+4],source[i+7])<top-STORM_RAIN_REACH || Math.min(source[i+1],source[i+4],source[i+7])>top)return;
    if(state.triangleIds.length>=LIMITS.occluders){state.sourceFallback='occluder-budget';return false;}
    state.triangleIds.push(id);
  },true);
  state.triangleIds.sort((a,b)=>a-b);
}
