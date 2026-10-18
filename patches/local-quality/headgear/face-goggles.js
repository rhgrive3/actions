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
    steps=Math.max(rear?(lod==='hero'?24:lod==='game'?20:16):1,Math.round(steps*(lod==='hero'?.7:lod==='game'?.55:.42)));
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
    const S=name==='molded-wrap-shell'?1:(lod==='hero'?2:1);
    const step=lod==='hero'?.23:lod==='game'?.28:.34;
    const densify=loop=>loop.flatMap((A,i)=>{const B=loop[(i+1)%loop.length],n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/step));return Array.from({length:n},(_,j)=>[A[0]+(B[0]-A[0])*j/n,A[1]+(B[1]-A[1])*j/n]);});
    if(name==='molded-wrap-shell'){outline=densify(outline);holes=holes.map(densify);}
    const outer=outline.map(p=>new THREE.Vector2(...p)),hs=holes.map(h=>h.map(p=>new THREE.Vector2(...p)));
    if(THREE.ShapeUtils.isClockWise(outer))outer.reverse();
    for(const h of hs)if(!THREE.ShapeUtils.isClockWise(h))h.reverse();
    const points=[...outer,...hs.flat()],tri=THREE.ShapeUtils.triangulateShape(outer,hs),p=[],uv=[],ix=[];
    if(name==='molded-wrap-shell'){
      // Conforming angular refinement: split shared long edges together, so
      // curved brow/temple surfaces do not become large flat fan triangles.
      for(let pass=0;pass<8;pass++){
        const mids=new Map(),edge=(a,b)=>a<b?a+','+b:b+','+a;
        for(const t of tri)for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=edge(a,b);if(!mids.has(key)&&points[a].distanceTo(points[b])>step*1.01){mids.set(key,points.length);points.push(points[a].clone().add(points[b]).multiplyScalar(.5));}}
        if(!mids.size)break;const next=[];
        for(const [a,b,c]of tri){const ab=mids.get(edge(a,b)),bc=mids.get(edge(b,c)),ca=mids.get(edge(c,a)),n=[ab,bc,ca].filter(x=>x!==undefined).length;
          if(n===0)next.push([a,b,c]);
          else if(n===3)next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
          else if(n===1){if(ab!==undefined)next.push([a,ab,c],[ab,b,c]);else if(bc!==undefined)next.push([b,bc,a],[bc,c,a]);else next.push([c,ca,b],[ca,a,b]);}
          else {if(ab===undefined)next.push([c,ca,bc],[ca,a,b],[ca,b,bc]);else if(bc===undefined)next.push([a,ab,ca],[ab,b,c],[ab,c,ca]);else next.push([b,bc,ab],[bc,c,a],[bc,a,ab]);}
        }tri.splice(0,tri.length,...next);
      }
    }
    for(let i=tri.length-1;i>=0;i--){const [A,B,C]=tri[i].map(k=>points[k]);if(Math.abs((B.x-A.x)*(C.y-A.y)-(B.y-A.y)*(C.x-A.x))<1e-12)tri.splice(i,1);}
    const d=(a,e)=>typeof depth==='function'?depth(a,e):depth;
    const put=(a,e,z)=>{const i=p.length/3;p.push(...pt(a,e,d(a,e)+z));uv.push(a,e);return i;};
    for(const face of [1,-1])for(const t of tri){const A=points[t[0]],B=points[t[1]],C=points[t[2]],ids=[];
      for(let j=0;j<=S;j++){ids[j]=[];for(let i=0;i<=S-j;i++){const a=A.x+(B.x-A.x)*i/S+(C.x-A.x)*j/S,e=A.y+(B.y-A.y)*i/S+(C.y-A.y)*j/S;ids[j][i]=put(a,e,face*thickness/2);}}
      for(let j=0;j<S;j++)for(let i=0;i<S-j;i++){const t=[ids[j][i],ids[j][i+1],ids[j+1][i]];ix.push(...(face>0?t:t.reverse()));if(i<S-j-1){const t2=[ids[j][i+1],ids[j+1][i+1],ids[j+1][i]];ix.push(...(face>0?t2:t2.reverse()));}}
    }
    for(const loop of [outer,...hs])for(let k=0;k<loop.length;k++){const A=loop[k],B=loop[(k+1)%loop.length];for(let i=0;i<S;i++){const a=A.x+(B.x-A.x)*i/S,e=A.y+(B.y-A.y)*i/S,a1=A.x+(B.x-A.x)*(i+1)/S,e1=A.y+(B.y-A.y)*(i+1)/S;const q=[put(a,e,-thickness/2),put(a1,e1,-thickness/2),put(a,e,thickness/2),put(a1,e1,thickness/2)];ix.push(q[0],q[1],q[2],q[1],q[3],q[2]);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();const faceVertices=tri.length*(S+1)*(S+2)/2;for(let i=0;i<faceVertices*2;i++){const sign=i<faceVertices?1:-1,a=uv[i*2],e=uv[i*2+1],eps=1e-4,z=sign*thickness/2,P=new THREE.Vector3(...pt(a,e,d(a,e)+z)),A=new THREE.Vector3(...pt(a+eps,e,d(a+eps,e)+z)).sub(P),B=new THREE.Vector3(...pt(a,e+eps,d(a,e+eps)+z)).sub(P),q=A.cross(B).normalize().multiplyScalar(sign);g.attributes.normal.setXYZ(i,q.x,q.y,q.z);}add(g,key,name);
  }
  // One continuous molded surround: sloping brow, broad temples, cheeks and
  // rounded chin share a closed shell, rather than a shelf on thin posts.
  const span=1.28,az=u=>(u-.5)*2*span;
  const eyeSpan=1.04,eyeTop=a=>.20+.12*Math.cos(a)**2;
  const bump=a=>Math.max(0,1-Math.abs(a)/.34);
  const eyeBottom=a=>-.17+.215*bump(a)+.018*a*a;
  const lower=a=>-.45-.25*Math.cos(a)**2,crown=a=>.80+.20*Math.cos(a)**2;
  const depth=(a,e)=>{
    if(e>=eyeTop(a)){const t=(e-eyeTop(a))/(crown(a)-eyeTop(a));return .046+.050*Math.exp(-((t/.38)**2))*Math.cos(a/1.6)**2;}
    return .046+.050*Math.exp(-(((e-eyeTop(a))/.12)**2))*Math.cos(a/1.6)**2+.020*Math.max(0,Math.cos(Math.min(1,Math.abs(a)/.38)*Math.PI/2))**2*Math.max(0,Math.min(1,(-e+.08)/.26));
  };
  const stations=lod==='far'?16:24,outline=[],window=[];
  for(let i=0;i<=stations;i++){const a=-span+2*span*i/stations;outline.push([a,crown(a)]);}
  for(let i=1;i<=8;i++){const t=i/8;outline.push([span-.16*t*t+.03*Math.sin(Math.PI*t),crown(span)+(lower(span-.16)-crown(span))*t]);}
  for(let i=stations-1;i>=0;i--){const a=-(span-.16)+2*(span-.16)*i/stations;outline.push([a,lower(a)]);}
  for(let i=7;i>=1;i--){const t=i/8;outline.push([-(span-.16*t*t+.03*Math.sin(Math.PI*t)),crown(span)+(lower(span-.16)-crown(span))*t]);}
  for(let i=0;i<=stations;i++){const a=-eyeSpan+2*eyeSpan*i/stations;window.push([a,eyeTop(a)]);}
  for(let i=stations;i>=0;i--){const a=-eyeSpan+2*eyeSpan*i/stations;window.push([a,eyeBottom(a)]);}
  const vents=[];
  for(let row=0;row<3;row++){
    const w=.32-row*.020,base=-.11-row*.16,h=.100,slope=.100;
    vents.push([[-w,base-slope],[0,base],[w,base-slope],[w,base-slope-h],[0,base-h],[-w,base-slope-h]]);
  }
  // Cheek apertures follow the rising chin-to-temple curve.
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const a=side*(.43+i*.115),b=side*(.41+(i+1)*.115),m=(a+b)/2;
    const edge=(x,t)=>eyeBottom(x)+(lower(x)-eyeBottom(x))*t;
    vents.push([[a,edge(a,.42)],[b,edge(b,.42)],[m,edge(m,.70)]]);
  }
  // Two broad forehead windows with internal diagonal webs, matching the
  // grouped source apertures rather than a row of separate perforations.
  const forehead=[];
  for(const side of [-1,1]){const h=[];for(let i=0;i<=8;i++){const a=side*(.23+i*.105);h.push([a,crown(a)-.065]);}for(let i=8;i>=0;i--){const a=side*(.23+i*.105);h.push([a,crown(a)-.205]);}forehead.push(h);}
  panel('molded-wrap-shell',outline,[window,...vents,...forehead],depth,.012);
  for(const [i,h]of [...vents,...forehead].entries())panel('vent-recess-'+i,h,[],(a,e)=>depth(a,e)-.012,.002,'dark');
  // Three dominant connected breathing slots with restrained inset lattice.
  for(let row=0;row<3;row++)for(const side of [-1,1])for(let i=0;i<3;i++){
    const w=.32-row*.020,base=-.11-row*.16,h=.100;
    rail('central-slot-web',u=>{const a=side*w*(i+.15+.70*u)/3,e=base-.100*Math.abs(a)/w-h*(i%2?u:1-u);return [a,e,depth(a,e)-.002];},.012,.004,'shell',2);
  }
  for(const side of [-1,1])for(let i=0;i<5;i++)rail('forehead-window-web',u=>{const a=side*(.25+(i+.90*u)*.16),e=crown(a)-.065-.14*(i%2?u:1-u);return [a,e,depth(a,e)-.001];},.024,.006,'shell',3);
  // Surface color blocks follow the molded cheek curvature; no separate bars.
  for(const side of [-1,1])for(const row of [.20,.86])for(let i=0;i<5;i++){
    const a=side*(.43+i*.15),b=a+side*.105,at=x=>eyeBottom(x)+(lower(x)-eyeBottom(x))*row;
    panel('cheek-ink-inlay',[[a,at(a)+.023],[b,at(b)+.023],[b,at(b)-.023],[a,at(a)-.023]],[],(a,e)=>depth(a,e)+.0068,.001,'ink');
  }
  // The lens is seated inside the heavy sloping brow and temple surround.
  add(grid(N,6,(u,v)=>{const a=(u-.5)*2*eyeSpan,e=eyeBottom(a)+(eyeTop(a)-eyeBottom(a))*v,d0=depth(a,eyeBottom(a)),d1=depth(a,eyeTop(a));return pt(a,e,d0+(d1-d0)*v+.008*Math.sin(Math.PI*v));}),'lens','panoramic-lens');
  rail('eye-upper-gasket',u=>{const a=(u-.5)*2*eyeSpan;return [a,eyeTop(a)-.009,depth(a,eyeTop(a))-.006];},.018,.004,'dark');
  panel('forehead-badge',[[-.075,.78],[.075,.78],[.065,.88],[-.065,.88]],[],(a,e)=>depth(a,e)+.007,.001,'dark');
  panel('forehead-emblem',[[-.05,.815],[.05,.83],[.03,.85],[-.04,.84]],[],(a,e)=>depth(a,e)+.009,.001,'ink');
  // Two actual crossed straps around the exposed rear head, not a helmet crown.
  for(const s of [-1,1]){
    const fn=u=>{const a=1.20+u*(Math.PI*2-2.40),e=s*.23*Math.cos(u*Math.PI),base=.042+(s>0?.007:0),join=Math.max(0,1-Math.min(u,1-u)/.12)**2;const frontAz=a>Math.PI?a-Math.PI*2:a;return [a,e,base+(depth(frontAz,e)-base)*join];};
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
  root.userData={construction:{browSection:[.90,.65,.45,.32].map(e=>({e,point:pt(0,e,depth(0,e))})),templeAnchors:[-1,1].flatMap(side=>[-1,1].map(s=>{const a=side*1.20,e=s*.23,d=depth(a,e);return {a,e,point:pt(a,e,d),strapDepth:d,shellDepth:depth(a,e)};})),centralExtraDepth:depth(0,-.4)-depth(.6,-.4)},id:FACE_GOGGLES_ID,lod,parts,dispose,setInkColor,rigidEnvelope:{rx,ry,rz},stats:{triangles,vertices,meshes,materials:4,textures:0,transparentMeshes:1},fit:{attachment:'head bone',headCenter:[0,.164,.014],hairPolicy:'preserveHair; no coverage or tuck',reference:'S3 Paintball Mask',rearStrapRouting:'S3 rear unverified; native scalp-clearing X bands with overlapping temple anchors'}};
  return root;
}

