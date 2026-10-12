import * as THREE from 'three';
const origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
/** Exact topmost-triangle projection; uses the original live map's ink/live layers. */
export function buildNativeMinimap(map){
 const L=map.level,W=map.w,H=map.h,N=W*H,w=L.triangleWorld,P=map.paint;
 for(const k of ['canvas','base','inkC','flashC']){map[k].width=W;map[k].height=H;}
 map.inkImg=map.ictx.createImageData(W,H);map.flashImg=map.fctx.createImageData(W,H);
 map.hgt=new Float32Array(N).fill(-99);map.topBlock=new Int32Array(N).fill(-1);map.nrm=new Float32Array(N*2);
 map.pixCell=new Int32Array(N).fill(-1);map.pixFx=new Uint8Array(N);map.pixFy=new Uint8Array(N);map.pixSx=new Int8Array(N);map.pixSy=new Int32Array(N);
 const top=w.nodes[4]+1,far=top-w.nodes[1]+1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,wx=map._worldX(x+.5),wz=map._worldZ(y+.5),h=w.ray(origin.set(wx,top,wz),down,far,{minNormalY:.45});if(!h)continue;
  map.hgt[i]=h.point.y;map.topBlock[i]=L.blockForTriangle(h.triangle);const sign=map.flip?1:-1;map.nrm[i*2]=h.normal.x*sign;map.nrm[i*2+1]=h.normal.z*sign;
  const fid=L.data.triangleFace[h.triangle];if(fid<0)continue;const f=L.faces[fid];if(!f.turf)continue;
  const r=w._p.copy(h.point).sub(f.origin),u=r.dot(f.u),v=r.dot(f.v),iu=Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))),iv=Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv))),k=f.grid+iv*f.nu+iu;
  if(!P.dead[k])map.pixCell[i]=k;
 }
 map._drawBase();map.owner=new Uint8Array(N);map._built=true;
}
