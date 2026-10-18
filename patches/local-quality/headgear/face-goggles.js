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
    const S=name.startsWith('temple-')?3:name==='central-chevron-inlay'?2:(name==='molded-wrap-shell'||name.startsWith('vent-recess-'))?1:(lod==='hero'?2:1);
    const step=lod==='hero'?.26:lod==='game'?.33:.40;
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
  const eyeBottom=a=>-.17+.165*bump(a)+.018*a*a;
  const lower=a=>-.67+.22*(Math.abs(a)/1.28)**2.5,crown=a=>.78+.37*Math.cos(a);
  const depth=(a,e)=>{
    if(e>=eyeTop(a)){const t=(e-eyeTop(a))/(crown(a)-eyeTop(a));return .046+.050*Math.exp(-((t/.38)**2))*Math.cos(a/1.6)**2;}
    return .046+.050*Math.exp(-(((e-eyeTop(a))/.12)**2))*Math.cos(a/1.6)**2+.020*Math.max(0,Math.cos(Math.min(1,Math.abs(a)/.38)*Math.PI/2))**2*Math.max(0,Math.min(1,(-e+.08)/.26));
  };
  const stations=lod==='far'?16:24,outline=[],window=[];
  for(let i=0;i<=stations;i++){const a=-span+2*span*i/stations;outline.push([a,crown(a)]);}
  const sideContour=[[1.39,.65],[1.48,.46],[1.53,.25],[1.52,.04],[1.44,-.19],[1.30,-.39],[span-.16,lower(span-.16)]];for(const p of sideContour)outline.push(p);
  for(let i=stations-1;i>=0;i--){const a=-(span-.16)+2*(span-.16)*i/stations;outline.push([a,lower(a)]);}
  for(const p of sideContour.slice(0,-1).reverse())outline.push([-p[0],p[1]]);
  for(let i=0;i<=stations;i++){const a=-eyeSpan+2*eyeSpan*i/stations;window.push([a,eyeTop(a)]);}
  for(let i=stations;i>=0;i--){const a=-eyeSpan+2*eyeSpan*i/stations;window.push([a,eyeBottom(a)]);}
  const vents=[];
  for(let row=0;row<3;row++){
    const w=.35-row*.025,base=-.09-row*.16,h=.085,slope=.13;
    vents.push([[-w+.018,base-slope+.009],[-.02,base-.009],[0,base],[.02,base-.009],[w-.018,base-slope+.009],[w,base-slope-.008],[w,base-slope-h+.018],[w-.018,base-slope-h],[.02,base-h-.009],[0,base-h],[-.02,base-h-.009],[-w+.018,base-slope-h],[-w,base-slope-h+.018],[-w,base-slope-.008]]);
  }
  // Each cheek is one continuous dark perforated band with slender
  // diagonals, not isolated downward triangular holes in a broad white slab.
  const cheekEdge=(a,t)=>eyeBottom(a)+(lower(a)-eyeBottom(a))*t;
  for(const side of [-1,1]){
    const h=[];
    for(let i=0;i<=8;i++){const a=side*(.43+i*.085);h.push([a,cheekEdge(a,.39)]);}
    for(let i=8;i>=0;i--){const a=side*(.43+i*.085);h.push([a,cheekEdge(a,.73)]);}
    vents.push(h);
  }
  // Two broad forehead windows with internal diagonal webs, matching the
  // grouped source apertures rather than a row of separate perforations.
  const forehead=[];
  for(const side of [-1,1]){const h=[];for(let i=0;i<=8;i++){const a=side*(.23+i*.105);h.push([a,crown(a)-.075]);}for(let i=8;i>=0;i--){const a=side*(.23+i*.105);h.push([a,crown(a)-.255]);}forehead.push(h);}
  const sideInsets=[-1,1].map(side=>[[1.14,.17],[1.25,.23],[1.36,.17],[1.39,.02],[1.31,-.10],[1.18,-.09]].map(([a,e])=>[a*side,e]));
  panel('molded-wrap-shell',outline,[window,...vents,...forehead],depth,.012);
  for(const [i,h]of [...vents,...forehead].entries())panel('vent-recess-'+i,h,[],(a,e)=>depth(a,e)-.012,.002,'dark');
  // Three dominant connected breathing slots with restrained inset lattice.
  for(let row=0;row<3;row++)for(const side of [-1,1])for(let i=0;i<3;i++){
    const w=.35-row*.025,base=-.09-row*.16,h=.085;
    rail('central-slot-web',u=>{const a=side*w*(i+.15+.70*u)/3,e=base-.13*Math.abs(a)/w-h*(i%2?u:1-u);return [a,e,depth(a,e)-.002];},.009,.003,'shell',2);
  }
  for(const side of [-1,1])for(let i=0;i<6;i++)rail('cheek-slot-web',u=>{
    const a=side*(.445+(i+.90*u)*.108),t=.39+.34*(i%2?u:1-u);
    const e=cheekEdge(a,t);return [a,e,depth(a,e)-.002];
  },.010,.003,'shell',3);
  for(const side of [-1,1])for(let i=0;i<5;i++)rail('forehead-window-web',u=>{const a=side*(.25+(i+.90*u)*.16),e=crown(a)-.075-.18*(i%2?u:1-u);return [a,e,depth(a,e)-.001];},.024,.006,'shell',3);
  // Broad ink chevrons are a source-visible part of each central separator.
  // They follow the narrowed rounded breathing unit without adding a rim.
  for(let row=0;row<3;row++){
    const w=.35-row*.025,base=-.09-row*.16;
    const edge=a=>base-.13*Math.abs(a)/w+.030;
    const h=[];for(const a of [-w+.03,-.02,0,.02,w-.03])h.push([a,edge(a)+.013]);
    for(const a of [w-.03,.02,0,-.02,-w+.03])h.push([a,edge(a)-.010]);
    panel('central-chevron-inlay',h,[],(a,e)=>depth(a,e)+.010,.001,'ink');
  }
  // Surface color blocks follow the molded cheek curvature; no separate bars.
  for(const side of [-1,1])for(const row of [.20,.86])for(let i=0;i<5;i++){
    const a=side*(.43+i*.15),b=a+side*.105,at=x=>eyeBottom(x)+(lower(x)-eyeBottom(x))*row;
    panel('cheek-ink-inlay',[[a,at(a)+.023],[b,at(b)+.023],[b,at(b)-.023],[a,at(a)-.023]],[],(a,e)=>depth(a,e)+.0068,.001,'ink');
  }
  // Compact shallow side insets belong to the rounded face shell. The
  // source does not establish a large anatomical ear hole.
  for(const h of sideInsets){
    panel('temple-inset-border',h,[],(a,e)=>depth(a,e)+.0105,.001,'dark');
    const ca=h.reduce((n,p)=>n+p[0],0)/h.length,ce=h.reduce((n,p)=>n+p[1],0)/h.length;
    panel('temple-ink-inlay',h.map(([a,e])=>[ca+(a-ca)*.70,ce+(e-ce)*.75]),[],(a,e)=>depth(a,e)+.012,.001,'ink');
  }
  // A distinct cap-like canopy projects in front of the shield. The rooted
  // seam, free rounded leading edge and underside remain separate in profile.
  const canopy=(u,v,bottom=false)=>{const a=(u-.5)*2*1.18;
    const A=pt(a,.55-.050*Math.sin(a)**2,.075),B=pt(a,.34-.045*Math.sin(a)**2,.105+.030*Math.cos(a)**2);B[2]+=.020*Math.cos(a)**2;B[0]*=1-.17*Math.sin(a)**2;
    const reach=.12+.88*Math.cos(a/1.18*Math.PI/2)**2;const p=A.map((x,k)=>x+(B[k]-x)*v*reach);p[1]+=.003*Math.sin(Math.PI*v)*Math.cos(a)**2;if(bottom)p[1]-=.007;return p;};
  const canopyEdge=(u,v,at)=>{const A=canopy(u,at,true),B=canopy(u,at,false);return A.map((x,k)=>x+(B[k]-x)*v);};
  add(grid(Math.ceil(N*.75),4,(u,v)=>canopy(u,1-v)),'shell','cap-visor-top');
  add(grid(Math.ceil(N*.75),4,(u,v)=>canopy(u,v,true)),'shell','cap-visor-bottom');
  add(grid(Math.ceil(N*.75),1,(u,v)=>canopyEdge(u,v,1)),'shell','cap-visor-front');
  add(grid(Math.ceil(N*.75),1,(u,v)=>canopyEdge(1-u,v,0)),'shell','cap-visor-root');
  for(const side of [0,1])add(grid(4,1,(u,v)=>canopyEdge(side,v,side?1-u:u)),'shell','cap-visor-side');
  // The lens is seated inside the heavy sloping brow and temple surround.
  add(grid(N,6,(u,v)=>{const a=(u-.5)*2*eyeSpan,e=eyeBottom(a)+(eyeTop(a)-eyeBottom(a))*v,d0=depth(a,eyeBottom(a)),d1=depth(a,eyeTop(a));return pt(a,e,d0+(d1-d0)*v+.008*Math.sin(Math.PI*v));}),'lens','panoramic-lens');
  rail('eye-upper-gasket',u=>{const a=(u-.5)*2*eyeSpan;return [a,eyeTop(a)-.009,depth(a,eyeTop(a))-.006];},.018,.004,'dark');
  panel('forehead-badge',[[-.075,.90],[.075,.90],[.065,1.03],[-.065,1.03]],[],(a,e)=>depth(a,e)+.007,.001,'dark');
  panel('forehead-emblem',[[-.05,.95],[.05,.965],[.03,.985],[-.04,.975]],[],(a,e)=>depth(a,e)+.009,.001,'ink');
  // Historical S2 back: convex webbing with dark rolled edges and an
  // unequal layered crossing. S3 rear remains unverified. Closed elliptical
  // cross-sections replace the previous flat rectangular ribbons.
  function bandPath(s,u){
    const start=s>0?1.44:1.40,end=Math.PI*2-(s>0?1.40:1.44);
    const a=start+u*(end-start),e=s*(.22*Math.cos(Math.PI*u)+.045*Math.sin(2*Math.PI*u));
    const base=.045+(s>0?.016:0)+.012*Math.sin(Math.PI*u)**2;
    const join=Math.max(0,1-Math.min(u,1-u)/.14)**2,fa=a>Math.PI?a-Math.PI*2:a;
    return [a,e,base+(depth(fa,e)-base)*join];
  }
  for(const s of [-1,1]){
    const steps={hero:48,game:32,far:20}[lod],around=8;
    const bandPoint=(u,t,ink=false)=>{
      const q=bandPath(s,u),lo=bandPath(s,Math.max(0,u-.001)),hi=bandPath(s,Math.min(1,u+.001)),da=hi[0]-lo[0],de=hi[1]-lo[1],len=Math.hypot(da,de);
      const angle=ink?(-Math.PI*.36+t*Math.PI*.72):t*Math.PI*2;
      const w=Math.sin(angle)*.115,d=Math.cos(angle)*.0075;
      // Low amplitude broad ridges; silhouette stays rounded at far LOD.
      const rib=ink&&lod!=='far'?.0012*(.5+.5*Math.cos(u*Math.PI*48))*Math.cos(angle):0;
      return pt(q[0]-de/len*w,q[1]+da/len*w,q[2]+d+(ink?.0007:0)+rib,true);
    };
    add(grid(steps,around,(u,v)=>bandPoint(u,v)),'dark','rounded-rear-band');
    for(const end of [0,1]){
      const p=[],uv=[],ix=[],center=pt(...bandPath(s,end),true);
      p.push(...center);uv.push(0,0);
      for(let j=0;j<around;j++){p.push(...bandPoint(end,j/around));uv.push(j/around,end);}
      for(let j=0;j<around;j++){const a=j+1,b=(j+1)%around+1;ix.push(...(end?[0,b,a]:[0,a,b]));}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);add(g,'dark','rounded-rear-band-cap');
    }
    add(grid(steps,4,(u,v)=>bandPoint(u,v,true)),'ink','rounded-rear-ink');
  }
  let triangles=0,vertices=0,meshes=0;
  for(const [key,list]of Object.entries(buckets)){
    const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());
    const mesh=new THREE.Mesh(g,mats[key]);mesh.name=key+'-batch';mesh.castShadow=key!=='lens';mesh.receiveShadow=key!=='lens';if(key==='lens')mesh.renderOrder=2;root.add(mesh);
    triangles+=g.index.count/3;vertices+=g.attributes.position.count;meshes++;
  }
  let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>m.dispose());};
  const setInkColor=value=>{mats.ink.color.set(value);return root;};root.dispose=dispose;root.setInkColor=setInkColor;
  root.userData={construction:{billPlan:[0,.25,.5,.75,1].map(u=>({root:canopy(u,0),tip:canopy(u,1)})),foreheadProfile:[-.6,-.01,0,.01,.6].map(a=>pt(a,crown(a),depth(a,crown(a)))),centralSlotHalfWidths:[.35,.325,.30],sideInsets:'closed compact inset; no ear opening',rearSection:{width:.23,thickness:.015,layerSeparation:.016},visorSection:{root:canopy(.5,0),tip:canopy(.5,1),lensUpper:pt(0,eyeTop(0),depth(0,eyeTop(0)))},browSection:[.90,.65,.45,.32].map(e=>({e,point:pt(0,e,depth(0,e))})),templeAnchors:[-1,1].flatMap(side=>[-1,1].map(s=>{const a=side*(s>0?1.44:1.40),e=s*.22,d=depth(a,e);return {a,e,point:pt(a,e,d),strapDepth:d,shellDepth:depth(a,e)};})),centralExtraDepth:depth(0,-.4)-depth(.6,-.4)},id:FACE_GOGGLES_ID,lod,parts,dispose,setInkColor,rigidEnvelope:{rx,ry,rz},stats:{triangles,vertices,meshes,materials:4,textures:0,transparentMeshes:1},fit:{attachment:'head bone',headCenter:[0,.164,.014],hairPolicy:'preserveHair; no coverage or tuck',reference:'S3 Paintball Mask',rearStrapRouting:'S3 rear unverified; S2-informed convex layered bands with compact side anchors'}};
  return root;
}

