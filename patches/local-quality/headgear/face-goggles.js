/** フェイスゴーグル / Paintball Mask (S3). Original procedural reconstruction.
 * References: GameWith /splatoon3/390028 (S3 item 3/4 and worn front),
 * Inkipedia /wiki/Paintball_Mask (identity and crossed rear straps).
 * No downloaded mesh or texture. +Z forward; native head-bone local space.
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const FACE_GOGGLES_ID='face-goggles';
export const FACE_GOGGLES_FIT=Object.freeze({name:'faceGoggles',preserveHair:true});
export function createFaceGoggles({lod='hero',inkColor=0x20bc91,headSurface=null,offIn=null,clearance=null}={}) {
  if(!['hero','game','far'].includes(lod))throw new RangeError('Unknown headgear LOD');
  const N={hero:32,game:20,far:12}[lod], root=new THREE.Group();root.name=FACE_GOGGLES_ID;
  const mats={shell:new THREE.MeshStandardMaterial({color:0xe3e4df,roughness:.43,metalness:.04}),
    dark:new THREE.MeshStandardMaterial({color:0x222c2d,roughness:.86}),
    ink:new THREE.MeshStandardMaterial({color:inkColor,roughness:.55}),
    lens:new THREE.MeshStandardMaterial({color:0x9acbd3,roughness:.16,metalness:.08,transparent:true,opacity:.19,depthWrite:false,side:THREE.FrontSide})};
  const buckets=Object.fromEntries(Object.keys(mats).map(k=>[k,[]])),parts=[];
  function add(g,key,name){g.computeVertexNormals();g.computeBoundingBox();parts.push({name,material:key,indexStart:buckets[key].reduce((n,x)=>n+x.index.count,0),indexCount:g.index.count,bounds:g.boundingBox.clone()});buckets[key].push(g);}
  function grid(n,m,fn){const p=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);}for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+n+1;ix.push(a,a+1,b,a+1,b+1,b);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;}
  // A rigid mask MUST NOT follow per-vertex face normals: the nose/jaw sculpt
  // changes those abruptly and would fold the lens and rails into each other.
  // Sample native anchors once, then use a smooth, conservative fit envelope.
  let rx=.178,ry=.176,rz=.165;
  if(headSurface){
    for(const [a,e]of [[Math.PI/2,0],[-Math.PI/2,0],[0,.45],[0,1.35]]){
      const q=new THREE.Vector3();headSurface(a,e,0,q);
      if(!q.toArray().every(Number.isFinite))throw new TypeError('Head surface must be finite');
      if(e===0)rx=Math.max(rx,Math.abs(q.x));
      else if(e<1)rz=Math.max(rz,(q.z-.012)/Math.cos(e));
      else ry=Math.max(ry,(q.y-1.214)/Math.sin(e));
    }
  }
  function pt(a,e,d=.047,rear=false){
    const f=clearance||offIn;let extra=0;
    if(rear&&typeof f==='function'){extra=f(a,e);if(!Number.isFinite(extra))throw new TypeError('Headgear clearance must be finite');extra=Math.max(0,extra);}
    return [(rx+d+extra)*Math.sin(a)*Math.cos(e),.164+(ry+d+extra)*Math.sin(e),.014+(rz+d+extra)*Math.cos(a)*Math.cos(e)];
  }
  // Solid, flattened rectangular rails. All components are batched by material.
  function rail(name,fn,width=.025,depth=.007,key='shell',steps=N,rear=false){
    steps=Math.max(1,Math.round(steps*(lod==='hero'?.7:lod==='game'?.55:.42)));
    const point=(u,v,w)=>{const a=fn(u),lo=fn(Math.max(0,u-.001)),hi=fn(Math.min(1,u+.001));const da=hi[0]-lo[0],de=hi[1]-lo[1],len=Math.hypot(da,de)||1;return pt(a[0]-de/len*v*width,a[1]+da/len*v*width,(a[2]??.047)+w*depth,rear);};
    for(let edge=0;edge<4;edge++)add(grid(steps,1,(u,v)=>{
      if(edge===0)return point(u,v-.5,.5);
      if(edge===1)return point(u,.5-v,-.5);
      if(edge===2)return point(u,.5,.5-v);
      return point(u,-.5,v-.5);
    }),key,name+'-'+edge);
    for(const end of [0,1])add(grid(1,1,(u,v)=>point(end,(end?u:1-u)-.5,v-.5)),key,name+'-end');
  }

  const az=u=>(u-.5)*2.42;
  const nose=a=>Math.max(0,1-Math.sqrt(a*a+.0001)/.30);
  const bottom=a=>-.24+.22*nose(a);
  // Single uninterrupted eye opening, nose cut-out, and generous side wrap.
  add(grid(N,Math.max(3,N/8|0),(u,v)=>{const a=az(u);return pt(a,bottom(a)+(.37-bottom(a))*v,.044);}), 'lens','single-clear-eye-shield');
  rail('lens-top-gasket',u=>[az(u),.375,.043],.058,.008,'dark');
  rail('lens-lower-gasket',u=>[az(u),bottom(az(u)),.045],.055,.008,'dark');
  rail('lens-top-frame',u=>[az(u),.40,.051],.075,.010);
  rail('lens-lower-frame',u=>[az(u),bottom(az(u))-.025,.052],.075,.010);
  for(const s of [-1,1])rail('temple-frame',u=>[s*(1.21+.008*Math.sin(u*Math.PI)),-.28+.72*u,.048],.070,.013,'shell',Math.max(5,N/4|0));
  // Overhanging cap-like peak, visibly forward of lens (not a flat brow bar).
  const peak=(u,v,h)=>{const a=az(u)*1.02,p=pt(a,.405+.035*v,.047+.052*v*Math.pow(Math.max(0,Math.cos(a)),.5));p[1]+=h;return p;};
  add(grid(N,3,(u,v)=>peak(u,1-v,.003)),'shell','visor-top');
  add(grid(N,3,(u,v)=>peak(u,v,-.003)),'shell','visor-bottom');
  add(grid(N,1,(u,v)=>peak(u,1,(v-.5)*.006)),'shell','visor-front-edge');
  add(grid(N,1,(u,v)=>peak(1-u,0,(v-.5)*.006)),'shell','visor-rear-edge');
  for(const side of [0,1])add(grid(3,1,(u,v)=>peak(side,side?1-u:u,(v-.5)*.006)),'shell','visor-side-edge');
  // Open upper ventilation band, with small central forehead badge plate.
  rail('forehead-upper-rim',u=>[az(u),.70-.08*Math.abs(az(u)),.034],.046,.008);
  rail('forehead-lower-rim',u=>[az(u),.48,.039],.032,.008);
  for(const s of [-1,1])for(let i=0;i<6;i++){const a=s*(.23+i*.16);rail('forehead-diagonal-vent',u=>[a+s*.11*u,.49+(.17-.07*Math.abs(a))*u,.038],.022,.006,'shell',2);}
  add(grid(4,2,(u,v)=>pt((u-.5)*.28,.49+.22*v,.042)),'shell','forehead-badge-plate');
  add(grid(4,2,(u,v)=>pt((u-.5)*.12,.56+.09*v,.045)),'dark','original-forehead-emblem');
  add(grid(3,1,(u,v)=>pt((u-.5)*.09,.60+.018*v,.046)),'ink','emblem-slash');
  // Continuous joined rails form the nose chevrons and cheek cage together.
  // No mirrored half-rails, coincident end caps, or crossing central plates.
  const cheek=(a,row)=>bottom(a)-.025-row*.22;
  for(let row=0;row<3;row++){
    rail('joined-cheek-chevron-'+row,u=>{const a=az(u);return [a,cheek(a,row),.052+.014*nose(a)];},.075,.009);
    for(const side of [-1,1])for(let i=0;i<(lod==='far'?3:5);i++){
      const a=side*(.40+i*.16),b=a+side*.10;
      add(grid(1,1,(u,v)=>pt(a+(b-a)*(side<0?1-u:u),cheek(a,row)+(v-.5)*.041,.058)),'ink','recessed-arrow-stripe');
    }
  }
  for(const side of [-1,1]){
    rail('jaw-side-upright',u=>[side*1.17,-.72+.48*u,.048],.075,.010,'shell',8);
    for(let row=0;row<2;row++)for(let i=0;i<(lod==='far'?4:7);i++){
      const a=side*(.16+i*.14);
      rail('vent-diagonal',u=>{const x=a+side*.10*u;return [x,cheek(x,row)-.035-.15*u,.052+.014*nose(x)];},.020,.005,'shell',2);
    }
  }
  rail('joined-chin-chevron',u=>{const a=(u-.5)*.60;return [a,cheek(a,3),.052+.014*nose(a)];},.060,.009);
  for(const side of [-1,1])rail('chin-side-join',u=>{const a=side*(.30-.06*u);return [a,cheek(a,2)-.22*u,.052+.014*nose(a)];},.045,.008,'shell',3);
  // Two actual crossed straps around the exposed rear head, not a helmet crown.
  for(const s of [-1,1]){
    const fn=u=>[1.20+u*(Math.PI*2-2.40),s*.23*Math.cos(u*Math.PI),.014+(s>0?.007:0)];
    rail('crossed-rear-strap',fn,.22,.006,'dark',N,true);
    rail('rear-strap-ink-center',u=>{const p=fn(u);p[2]+=.0033;return p;},.165,.001,'ink',N,true);
  }
  let triangles=0,vertices=0,meshes=0;
  for(const [key,list]of Object.entries(buckets)){
    const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());
    const mesh=new THREE.Mesh(g,mats[key]);mesh.name=key+'-batch';mesh.castShadow=key!=='lens';mesh.receiveShadow=key!=='lens';if(key==='lens')mesh.renderOrder=2;root.add(mesh);
    triangles+=g.index.count/3;vertices+=g.attributes.position.count;meshes++;
  }
  let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>m.dispose());};
  const setInkColor=value=>{mats.ink.color.set(value);return root;};root.dispose=dispose;root.setInkColor=setInkColor;
  root.userData={id:FACE_GOGGLES_ID,lod,parts,dispose,setInkColor,rigidEnvelope:{rx,ry,rz},stats:{triangles,vertices,meshes,materials:4,textures:0,transparentMeshes:1},fit:{attachment:'head bone',headCenter:[0,.164,.014],hairPolicy:'preserveHair; no coverage or tuck',reference:'S3 Paintball Mask',rearStrapRouting:'Reference-informed approximation; hidden buckle unverified'}};
  return root;
}
