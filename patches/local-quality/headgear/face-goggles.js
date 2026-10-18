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
  const brow=a=>.40+.22*Math.cos(a)**2;
  const crown=a=>brow(a)+.22;
  // Single uninterrupted eye opening, nose cut-out, and generous side wrap.
  add(grid(N,Math.max(3,N/8|0),(u,v)=>{const a=az(u);return pt(a,bottom(a)+(brow(a)-.035-bottom(a))*v,.050+.032*Math.sin(v*Math.PI)*Math.cos(a));}), 'lens','single-clear-eye-shield');
  rail('lens-top-gasket',u=>[az(u),brow(az(u))-.025,.046],.030,.008,'dark');
  rail('lens-lower-gasket',u=>[az(u),bottom(az(u)),.045],.055,.008,'dark');
  rail('lens-top-frame',u=>[az(u),brow(az(u)),.054],.115,.012);
  rail('lens-lower-frame',u=>[az(u),bottom(az(u))-.025,.052],.105,.010);
  for(const s of [-1,1])rail('temple-frame',u=>[s*(1.21+.008*Math.sin(u*Math.PI)),-.28+(brow(1.21)+.28)*u,.052],.110,.013,'shell',Math.max(5,N/4|0));
  // Overhanging cap-like peak, visibly forward of lens (not a flat brow bar).
  const peak=(u,v,h)=>{const a=az(u)*1.02,p=pt(a,brow(a)+.025-.075*v*Math.cos(a),.052+.045*v*Math.pow(Math.max(0,Math.cos(a)),.5));p[1]+=h;return p;};
  add(grid(N,3,(u,v)=>peak(u,1-v,.0045)),'shell','visor-top');
  add(grid(N,3,(u,v)=>peak(u,v,-.0045)),'shell','visor-bottom');
  add(grid(N,1,(u,v)=>peak(u,1,(v-.5)*.009)),'shell','visor-front-edge');
  add(grid(N,1,(u,v)=>peak(1-u,0,(v-.5)*.009)),'shell','visor-rear-edge');
  for(const side of [0,1])add(grid(3,1,(u,v)=>peak(side,side?1-u:u,(v-.5)*.009)),'shell','visor-side-edge');
  // Open upper ventilation band, with small central forehead badge plate.
  rail('forehead-upper-rim',u=>[az(u),crown(az(u)),.034],.075,.010);
  rail('forehead-lower-rim',u=>[az(u),brow(az(u))+.055,.039],.055,.010);
  for(const side of [-1,1])for(let i=0;i<12;i++){
    const a=side*(.20+i*.083),b=a+side*.083;
    rail('forehead-triangular-web',u=>{const x=a+(b-a)*u,t=i%2?1-u:u;return [x,brow(x)+.075+.12*t,.038];},.026,.007,'shell',2);
  }
  add(grid(4,2,(u,v)=>pt((u-.5)*.28,brow((u-.5)*.28)+.04+.20*v,.042)),'shell','forehead-badge-plate');
  add(grid(4,2,(u,v)=>pt((u-.5)*.12,.71+.09*v,.045)),'dark','original-forehead-emblem');
  add(grid(3,1,(u,v)=>pt((u-.5)*.09,.75+.018*v,.046)),'ink','emblem-slash');
  // Continuous joined rails form the nose chevrons and cheek cage together.
  // No mirrored half-rails, coincident end caps, or crossing central plates.
  const cheek=(a,row)=>bottom(a)-.025-row*.19;
  for(let row=0;row<3;row++){
    rail('joined-cheek-chevron-'+row,u=>{const a=az(u);return [a,cheek(a,row),.052+.014*nose(a)];},.110,.010);
    for(const side of [-1,1])for(let i=0;i<(lod==='far'?3:5);i++){
      const a=side*(.40+i*.16),b=a+side*.10;
      add(grid(1,1,(u,v)=>pt(a+(b-a)*(side<0?1-u:u),cheek(a,row)+(v-.5)*.041,.058)),'ink','recessed-arrow-stripe');
    }
  }
  for(const side of [-1,1]){
    rail('jaw-side-upright',u=>[side*1.17,-.66+.42*u,.052],.105,.010,'shell',8);
    const cells=lod==='far'?8:lod==='game'?14:18;
    for(let row=0;row<2;row++)for(let i=0;i<cells;i++){
      const a=side*(i*1.15/cells),b=side*((i+1)*1.15/cells);
      rail('triangular-vent-web',u=>{const x=a+(b-a)*u,t=i%2?1-u:u;return [x,cheek(x,row)-.045-.10*t,.052+.014*nose(x)];},.025,.006,'shell',2);
    }
  }
  const chin=a=>-.77+.045*(Math.abs(a)/.31)**2;
  rail('joined-chin-chevron',u=>{const a=(u-.5)*.62;return [a,chin(a),.056];},.090,.010);
  for(const side of [-1,1]){
    rail('chin-side-join',u=>{const a=side*.31;return [a,cheek(a,2)+(chin(a)-cheek(a,2))*u,.056];},.060,.010,'shell',3);
    for(let i=0;i<5;i++)rail('chin-triangular-web',u=>{const a=side*(i+u)*.31/5,t=i%2?1-u:u;return [a,cheek(a,2)-.04+(chin(a)-cheek(a,2)+.08)*t,.056];},.022,.006,'shell',2);
  }
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
