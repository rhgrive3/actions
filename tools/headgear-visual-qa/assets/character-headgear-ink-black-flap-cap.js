// INKWAVE original procedural reconstruction, calibrated to Splatoon 3 reference screenshots.
// All coordinates are HEAD BONE LOCAL, +Z forward. No texture/model is copied from the game.
import * as THREE from 'three';
import { headShape, HEAD_C } from './character-face.js';
const V = THREE.Vector3;
const PIVOT = new V(0, 1.05, -0.002);
const C = HEAD_C.clone().sub(PIVOT);
const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const rimKeys=[[0,.57],[.6,.54],[1.2,.32],[1.6,.17],[2.3,.02],[Math.PI,-.03]];
const rim=(az)=>{ const a=Math.abs(Math.atan2(Math.sin(az),Math.cos(az))); for(let i=1;i<rimKeys.length;i++){if(a<=rimKeys[i][0]) {const [x,y]=rimKeys[i-1],[x1,y1]=rimKeys[i]; return y+(y1-y)*(a-x)/(x1-x);}} return -.03;};
export const INK_BLACK_FLAP_CAP_FIT=Object.freeze({
  name:'inkBlackFlapCap', cls:4, col:[-3,1], thick:.0058, exitMax:.05, flare:.008,
  rows:[0,.025,.07,.14,.22,.32], crown:8, rim,
  lift:(az,el)=>.013+.008*Math.max(0,Math.cos(az))*smooth(.6,1.1,el), shape:()=>0,
});
function surface(az,el,off=0){const ce=Math.cos(el);const d=new V(Math.sin(az)*ce,Math.sin(el),Math.cos(az)*ce);return headShape(d.x,d.y,d.z,new V()).addScaledVector(d,off).add(C);}
function grid(nu,nv,fn,reverse=false){const p=[],uv=[],idx=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){p.push(...fn(i/nu,j/nv).toArray());uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(...(reverse?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function path(points,r,segments=32,radial=5){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,r,radial,false);}
/** Standalone preview/attachment group. native clearance(az,el) is ctx.offIn from analyseHat. */
export function createInkBlackFlapCap({lod='hero',clearance}={}){
  const root=new THREE.Group();root.name='InkBlackFlapCap';
  const n=lod==='far'?12:lod==='game'?24:48;
  const mat=(color,roughness=.92)=>new THREE.MeshStandardMaterial({color,roughness,metalness:0,side:THREE.DoubleSide});
  const fabric=mat(0x30312d),edge=mat(0x1a1c1a),inner=edge,ink=mat(0xc5c7b6),snap=mat(0x161916,.55);
  fabric.userData.gearClass=-4;edge.userData.gearClass=-5;ink.userData.gearClass=-4;snap.userData.gearClass=-2;
  function add(name,g,m=fabric){const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;}
  const crown=(az,t,extra=0)=>{const el=rim(az)+(Math.PI/2-rim(az))*t;const q=surface(az,el,(clearance?clearance(az,el):.022+INK_BLACK_FLAP_CAP_FIT.lift(az,el))+.0058+extra);const sideEase=.040*Math.sin(az)**4*(1-t)**2;q.x+=Math.sin(az)*sideEase;q.z+=Math.cos(az)*sideEase;return q;};
  add('structured-crown',grid(n,Math.max(8,n/3|0),(u,v)=>crown((u-.5)*Math.PI*2,v)));
  add('turned-under-rim',grid(n,2,(u,v)=>{const az=(u-.5)*Math.PI*2;return crown(az,.023*v,-.004*(1-v));},true),inner);
  const tubeSeg=lod==='far'?6:lod==='game'?12:24;
  const tube=(points,r,segments=32)=>path(points,r,Math.min(segments,tubeSeg),lod==='hero'?5:3);
  const bill=(u,v)=>{const a=(u-.5)*1.95;const p=crown(a,0);const w=Math.sin(Math.PI*u)**.55; p.x+=Math.sin(a)*.026*v;p.z+=Math.cos(a)*(.09*w+.006)*v;p.y+=.016*v*v-.006*v-.010*(2*u-1)**2*v;return p;};
  add('short-curved-visor',grid(n/2,5,bill,true));
  add('visor-underside',grid(n/2,5,(u,v)=>bill(u,v).add(new V(0,-.0045,0))),inner);
  add('visor-bound-edge',tube(Array.from({length:25},(_,i)=>bill(i/24,1).add(new V(0,-.0018,0))),.0022,tubeSeg),edge);
  // Independent hanging side flaps: a forward-opening face aperture and rounded lower corners.
  // Bulge over the unchanged, backward-pointing main character ears; return inward below the ears.
  function flap(s,u,v,offset=0){
    const az=.98+(Math.PI-.98)*u;
    const top=crown(s*az,0);
    const bottom=-.105+.15*smooth(.39,1,u)+.018*(1-smooth(0,.13,u));
    const earBulge=.035*smooth(0,.14,v)*Math.exp(-(((v-.15)/.20)**2))*Math.exp(-(((az-1.95)/.45)**2));
    const r=.023*smooth(0,.35,v)+earBulge+offset;
    return new V(top.x+s*Math.sin(az)*r,top.y+(bottom-top.y)*v,top.z+Math.cos(az)*r);
  }
  for(const s of [-1,1]){
    add(`side-flap-${s}`,grid(n/3|0,n/2,(u,v)=>flap(s,u,v),s>0));
    add(`flap-lining-${s}`,grid(n/3|0,n/2,(u,v)=>flap(s,u,v,-.004),s<0),inner);
    const border=[];for(let i=0;i<=16;i++)border.push(flap(s,0,i/16));for(let i=1;i<=16;i++)border.push(flap(s,i/16,1));
    add(`flap-bound-edge-${s}`,tube(border,.0025,lod==='far'?12:32),edge);
    for(const u of [.04,.46]){const q=flap(s,u,.035,.002);const g=new THREE.SphereGeometry(.0055,lod==='far'?6:10,lod==='far'?4:6);g.scale(.36,1,1);g.translate(q.x,q.y,q.z);add(`flap-snap-${s}-${u}`,g,snap);}
    // Original angular emblem + compact non-linguistic print strokes, not a borrowed decal.
    if(lod!=='far'){
      const mark=(a,b)=>flap(s,.30+a*s*.14,.44+b*.18,.0045);
      const line=(name,coords,r=.0013)=>{const points=[];for(let k=1;k<coords.length;k++){const a=coords[k-1],b=coords[k];for(let j=0;j<8;j++)points.push(mark(a[0]+(b[0]-a[0])*j/8,a[1]+(b[1]-a[1])*j/8));}points.push(mark(...coords[coords.length-1]));return add(`${name}-${s}`,path(points,r,Math.max(tubeSeg,(coords.length-1)*6),lod==='hero'?5:3),ink);};
      line('flap-square-mark',[[-.8,-.7],[.8,-.7],[.8,.65],[-.8,.65],[-.8,-.7]]);
      line('flap-angle-mark',[[-.63,.4],[.52,-.45],[-.34,-.2],[.45,.4],[-.63,.4]],.0022);
      for(let row=0;row<3;row++)for(let col=0;col<3;col++)line(`flap-print-${row}-${col}`,[[col*.53-.7,.99+row*.24],[col*.53-.37,.99+row*.24]],.0013);
    }
    const cord=[flap(s,.04,.5,-.003),new V(s*.13,.015,.141),new V(s*.052,-.018,.151),new V(0,-.04,.138)];
    add(`chin-cord-${s}`,tube(cord,.0031,lod==='far'?6:18),edge);
  }
  const rearSnap=crown(Math.PI,0);const rearG=new THREE.SphereGeometry(.0055,lod==='far'?6:10,lod==='far'?4:6);rearG.scale(1,1,.4);rearG.translate(rearSnap.x,rearSnap.y-.013,rearSnap.z-.003);add('rear-skirt-snap',rearG,snap);
  const toggle=new THREE.SphereGeometry(.010,lod==='far'?6:10,lod==='far'?4:7);toggle.scale(.66,1.1,.55);toggle.translate(0,-.046,.139);add('chin-toggle',toggle,snap);
  if(lod!=='far')add('toggle-loop',tube([new V(-.004,-.05,.138),new V(-.009,-.079,.137),new V(0,-.087,.137),new V(.008,-.075,.138),new V(.004,-.05,.138)],.002,22),edge);
  // Panel seams and visor stitch stay subordinate to the characteristic flap silhouette.
  if(lod!=='far')for(const az of [-2.2,-.72,.72,2.2])add(`crown-seam-${az}`,tube(Array.from({length:19},(_,i)=>crown(az,i/18,.0008)),.0009,24),edge);
  // Keep the standalone attachment at four draws: preserve authored materials while merging geometry.
  const partNames=root.children.map(o=>o.name), bins=new Map();
  for(const mesh of [...root.children]){if(!bins.has(mesh.material))bins.set(mesh.material,[]);bins.get(mesh.material).push(mesh);root.remove(mesh);}
  let batch=0;
  for(const [material,meshes] of bins){
    const positions=[],normals=[],uvs=[],indices=[],parts=[];
    for(const mesh of meshes){const g=mesh.geometry,base=positions.length/3,first=indices.length;positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uvs.push(...g.attributes.uv.array);for(const index of g.index.array)indices.push(index+base);parts.push({name:mesh.name,firstIndex:first,indexCount:g.index.count});g.dispose();}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeBoundingSphere();g.userData.parts=parts;
    add(`cap-material-batch-${batch++}`,g,material);
  }
  root.userData={assetId:'ink-black-flap-cap',displayName:'シェーディングキャップ スミ',space:'head-bone-local',mainSha:'85acc45d0ab23a95161b599d4287fd8142e8145b',lod,fit:INK_BLACK_FLAP_CAP_FIT.name,partNames};
  root.dispose=()=>disposeInkBlackFlapCap(root);
  root.userData.dispose=root.dispose;
  return root;
}
/** Native builder adapter: shares the existing head skinning and gear material, no new runtime Mesh required. */
export function buildInkBlackFlapCap(B,hat,ctx,D={lod:'hero'}){
  const root=createInkBlackFlapCap({lod:D.lod,clearance:ctx?.offIn});
  root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().translate(PIVOT.x,PIVOT.y,PIVOT.z);B.add(g,{bone:'head',ex:o.material.userData.gearClass,color:o.material.color,uv:true});g.dispose();});
  const materials=new Set();root.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());
}
export function disposeInkBlackFlapCap(root){if(root.userData.disposed)return;root.userData.disposed=true;const materials=new Set();root.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());}
