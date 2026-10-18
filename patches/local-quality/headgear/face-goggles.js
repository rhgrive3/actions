/** フェイスゴーグル / Paintball Mask (S3). Original procedural reconstruction.
 * References: GameWith /splatoon3/390028 (S3 item 3/4 and worn front),
 * Inkipedia /wiki/Paintball_Mask (identity and crossed rear straps).
 * No downloaded mesh or texture. +Z forward; native head-bone local space.
 */
import * as THREE from 'three';
function mergeGeometries(list){const pos=[],normal=[],uv=[],indices=[];let offset=0;for(const g of list){pos.push(...g.attributes.position.array);normal.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);for(const i of g.index.array)indices.push(i+offset);offset+=g.attributes.position.count;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return g;}
export const FACE_GOGGLES_ID='face-goggles';
export const FACE_GOGGLES_FIT=Object.freeze({name:'faceGoggles',preserveHair:true});
export function createFaceGoggles({lod='hero',inkColor=0x20bc91,headSurface=null,offIn=null,clearance=null}={}) {
  if(!['hero','game','far'].includes(lod))throw new RangeError('Unknown headgear LOD');
  const N={hero:32,game:20,far:12}[lod], root=new THREE.Group();root.name=FACE_GOGGLES_ID;
  const mats={shell:new THREE.MeshStandardMaterial({color:0xe3e4df,roughness:.43,metalness:.04}),
    dark:new THREE.MeshStandardMaterial({color:0x222c2d,roughness:.86}),
    ink:new THREE.MeshStandardMaterial({color:inkColor,roughness:.55}),
    lens:new THREE.MeshStandardMaterial({color:0x9acbd3,roughness:.19,metalness:0,transparent:true,opacity:.30,depthWrite:false,side:THREE.FrontSide})};
  const buckets=Object.fromEntries(Object.keys(mats).map(k=>[k,[]])),parts=[];
  function add(g,key,name){if(!g.attributes.normal)g.computeVertexNormals();g.computeBoundingBox();parts.push({name,material:key,indexStart:buckets[key].reduce((n,x)=>n+x.index.count,0),indexCount:g.index.count,bounds:g.boundingBox.clone()});buckets[key].push(g);}
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

  // Molded panels, not separate horizontal bars. Holes are actual apertures
  // triangulated in angular space, with continuous front/back and wall surfaces.
  function panel(name,outline,holes=[],depth=.055,thickness=.009,key='shell'){
    const S=name==='molded-forehead-shell'?2:(lod==='hero'?2:1);
    const outer=outline.map(p=>new THREE.Vector2(...p)),hs=holes.map(h=>h.map(p=>new THREE.Vector2(...p)));
    if(THREE.ShapeUtils.isClockWise(outer))outer.reverse();
    for(const h of hs)if(!THREE.ShapeUtils.isClockWise(h))h.reverse();
    const points=[...outer,...hs.flat()],tri=THREE.ShapeUtils.triangulateShape(outer,hs),p=[],uv=[],ix=[];
    const d=(a,e)=>typeof depth==='function'?depth(a,e):depth;
    const put=(a,e,z)=>{const i=p.length/3;p.push(...pt(a,e,d(a,e)+z));uv.push(a,e);return i;};
    for(const face of [1,-1])for(const t of tri){const A=points[t[0]],B=points[t[1]],C=points[t[2]],ids=[];
      for(let j=0;j<=S;j++){ids[j]=[];for(let i=0;i<=S-j;i++){const a=A.x+(B.x-A.x)*i/S+(C.x-A.x)*j/S,e=A.y+(B.y-A.y)*i/S+(C.y-A.y)*j/S;ids[j][i]=put(a,e,face*thickness/2);}}
      for(let j=0;j<S;j++)for(let i=0;i<S-j;i++){const t=[ids[j][i],ids[j][i+1],ids[j+1][i]];ix.push(...(face>0?t:t.reverse()));if(i<S-j-1){const t2=[ids[j][i+1],ids[j+1][i+1],ids[j+1][i]];ix.push(...(face>0?t2:t2.reverse()));}}
    }
    for(const loop of [outer,...hs])for(let k=0;k<loop.length;k++){const A=loop[k],B=loop[(k+1)%loop.length];for(let i=0;i<S;i++){const a=A.x+(B.x-A.x)*i/S,e=A.y+(B.y-A.y)*i/S,a1=A.x+(B.x-A.x)*(i+1)/S,e1=A.y+(B.y-A.y)*(i+1)/S;const q=[put(a,e,-thickness/2),put(a1,e1,-thickness/2),put(a,e,thickness/2),put(a1,e1,thickness/2)];ix.push(q[0],q[1],q[2],q[1],q[3],q[2]);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();const faceVertices=tri.length*(S+1)*(S+2)/2;for(let i=0;i<faceVertices*2;i++){const sign=i<faceVertices?1:-1,q=new THREE.Vector3(p[i*3]/(rx*rx),(p[i*3+1]-.164)/(ry*ry),(p[i*3+2]-.014)/(rz*rz)).normalize().multiplyScalar(sign);g.attributes.normal.setXYZ(i,q.x,q.y,q.z);}add(g,key,name);
  }
  const span=1.20,az=u=>(u-.5)*2*span;
  const bump=a=>Math.max(0,1-Math.abs(a)/.32);
  const eyeTop=a=>.285+.115*Math.cos(a)**2;
  const eyeBottom=a=>-.19+.235*bump(a);
  const lower=a=>-.63-.09*Math.cos(a)**6;
  const stations=lod==='far'?12:20;
  const upper=[],bottom=[];for(let i=0;i<=stations;i++){const a=-span+2*span*i/stations;upper.push([a,eyeBottom(a)-.025-.012*(a/span)**2]);bottom.push([a,lower(a)]);}
  const vents=[];
  // Three continuous short chevron slots, with inset diagonal webs.
  for(let row=0;row<3;row++){
    const w=.285-row*.020,base=-.085-row*.18,h=.105,slope=.100;
    vents.push([[-w,base-slope],[0,base],[w,base-slope],[w,base-slope-h],[0,base-h],[-w,base-slope-h]]);
  }
  // Side cheeks have ONE dark vent band between two broad solid ink-marked bands.
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const a=side*(.40+i*.125),b=side*(.38+(i+1)*.125),m=(a+b)/2;
    vents.push([[a,-.40+.02*a*a],[b,-.40+.02*b*b],[m,-.505+.02*m*m]]);
  }
  const shellDepth=(a,e)=>{const central=Math.max(0,Math.cos(Math.min(1,Math.max(0,Math.abs(a)-.15)/.21)*Math.PI/2))**2;return .050+.031*central*Math.max(0,Math.min(1,(-e+.06)/.30));};
  panel('molded-lower-face-shell',[...upper,...bottom.reverse()],vents,shellDepth,.012);
  // Continuous rounded oval perimeter around the projecting central block.
  rail('central-block-perimeter',u=>{const t=u*Math.PI*2,a=.305*Math.sin(t),e=-.335+.365*Math.cos(t);return [a,e,shellDepth(a,e)+.008];},.050,.010,'shell',36);
  // Thin recessed webs preserve the three dominant connected slot bands.
  for(let row=0;row<3;row++)for(const side of [-1,1])for(let i=0;i<3;i++){
    const w=.285-row*.020,base=-.085-row*.18,h=.105;
    rail('central-slot-web',u=>{const a=side*w*(i+.18+.64*u)/3,e=base-.100*Math.abs(a)/w-h*(i%2?u:1-u);return [a,e,shellDepth(a,e)-.002];},.012,.004,'shell',2);
  }
  // Recessed dark lining behind punched vents provides cavity depth without
  // filling the eye window or replacing the real aperture geometry with paint.
  for(const [i,h]of vents.entries())panel('vent-recess-'+i,h,[],(a,e)=>shellDepth(a,e)-.012,.002,'dark');
  for(const side of [-1,1])for(const row of [-.285,-.60])for(let i=0;i<5;i++){
    const a=side*(.40+i*.15),b=a+side*.105;
    panel('cheek-ink-inlay',[[a,row+.032],[b,row+.025],[b,row-.025],[a,row-.032]],[],.057,.001,'ink');
  }
  // Thick outer frame. Window is compact and follows the original nose saddle.
  rail('eye-upper-frame',u=>[az(u),eyeTop(az(u))+.025,.055],.105,.013);
  rail('eye-lower-frame',u=>[az(u),eyeBottom(az(u))-.015,.056],.100,.012);
  for(const side of [-1,1])rail('eye-side-frame',u=>[side*span,eyeBottom(span)+(eyeTop(span)-eyeBottom(span))*u,.054],.140,.014,'shell',8);
  rail('eye-upper-gasket',u=>[az(u),eyeTop(az(u))-.020,.050],.022,.006,'dark');
  // One bowed transparent shield stands in front of eyes and below the broad cap.
  add(grid(N,6,(u,v)=>{const a=az(u);return pt(a,eyeBottom(a)+(eyeTop(a)-eyeBottom(a))*v,.059+.030*Math.sin(Math.PI*v)*Math.cos(a));}),'lens','panoramic-lens');
  // Tall broad forehead plate with short angular vents, not an open hair rail.
  const browBase=a=>eyeTop(a)+.13,crown=a=>.80+.21*Math.cos(a)**2;
  const foreTop=[],foreBot=[];for(let i=0;i<=stations;i++){const a=-span+2*span*i/stations;foreTop.push([a,crown(a)]);foreBot.push([a,browBase(a)]);}
  const foreHoles=[];for(const side of [-1,1])for(let i=0;i<5;i++){const a=side*(.25+i*.17),b=a+side*.14;foreHoles.push([[a,browBase(a)+.075],[b,browBase(b)+.075],[(a+b)/2,browBase((a+b)/2)+.205]]);}
  panel('molded-forehead-shell',[...foreBot,...foreTop.reverse()],foreHoles,(a,e)=>.039+.009*Math.sin(Math.PI*Math.max(0,Math.min(1,(e-browBase(a))/(crown(a)-browBase(a))))),.012);
  for(const [i,h]of foreHoles.entries())panel('forehead-vent-recess-'+i,h,[],.027,.002,'dark');
  // Broad domed forward brim joins the forehead plate to the eye-frame arch.
  const peak=(u,v)=>{const a=az(u)*1.025;const p=pt(a,eyeTop(a)+.16*(1-v)+.025,.042+.065*v*Math.cos(a/1.8));p[1]+=.005+.008*v*Math.cos(a)**2;return p;};
  // The underside returns continuously to the thick eye frame, making one
  // molded brim instead of two separated flat shelves.
  const under=(u,v)=>{const a=az(u)*1.025,A=peak(u,0),B=pt(a,eyeTop(a)+.025,.062);A[1]-=.010;return A.map((x,k)=>x+(B[k]-x)*v);};
  const edge=(u,v,at)=>{const A=under(u,at),B=peak(u,at);return A.map((x,k)=>x+(B[k]-x)*v);};
  add(grid(N,5,(u,v)=>peak(u,1-v)),'shell','visor-top');
  add(grid(N,5,(u,v)=>under(u,v)),'shell','visor-bottom');
  add(grid(N,1,(u,v)=>edge(u,v,1)),'shell','visor-front-edge');
  add(grid(N,1,(u,v)=>edge(1-u,v,0)),'shell','visor-rear-edge');
  for(const side of [0,1])add(grid(5,1,(u,v)=>edge(side,v,side?1-u:u)),'shell','visor-side-edge');
  // Small original forehead emblem; not a recovered game texture.
  panel('forehead-badge',[[-.075,.74],[.075,.74],[.065,.83],[-.065,.83]],[],.047,.001,'dark');
  panel('forehead-emblem',[[-.05,.775],[.05,.79],[.03,.81],[-.04,.80]],[],.049,.001,'ink');
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

