/** Original procedural カイトウ・フック / Dapperdasher Hat (Splatoon 3).
 * Public screenshot references are documented in REFERENCES.md; no game meshes,
 * textures, extracted data or AI-generated reference assets are used.
 * Head-bone local coordinates: +Y up, +Z front; native pivot (0,1.05,-.002).
 */
import * as THREE from 'three';
const TAU=Math.PI*2,V=THREE.Vector3;
const rim=()=>.53;
export const THIEF_HOOK_FIT=Object.freeze({name:'thief-hook',cls:2,col:[-1,1],thick:.006,exitMax:.05,flare:.006,rows:[0,.025,.07,.14,.22,.32],crown:8,rim,lift:()=>.012,shape:()=>0});
function grid(n,m,fn,reverse=false){const p=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){p.push(...fn(i/n,j/m));uv.push(i/n,j/m);}for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;ix.push(...(reverse?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;}
function merge(geometries){const p=[],n=[],uv=[],ix=[];let off=0;for(const g of geometries){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);const idx=g.index?g.index.array:Array.from({length:g.attributes.position.count},(_,i)=>i);ix.push(...Array.from(idx,i=>i+off));off+=g.attributes.position.count;g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;}
function cap(n,rx,rz,y,z,up=true){const p=[0,y,z],uv=[.5,.5],ix=[];for(let i=0;i<=n;i++){const a=TAU*i/n;p.push(rx*Math.sin(a),y,z+rz*Math.cos(a));uv.push(.5+.5*Math.sin(a),.5+.5*Math.cos(a));}for(let i=1;i<=n;i++)ix.push(...(up?[0,i+1,i]:[0,i,i+1]));const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;}
export function createThiefHook({lod='hero',inkColor=0xe637ab,headSurface=null,offIn=null,clearance=null,ctx=null}={}){
 const tier=lod==='far'?0:lod==='game'?1:2,N=[20,32,48][tier],root=new THREE.Group();root.name='thief-hook';
 const cloth=new THREE.MeshStandardMaterial({color:0x171819,roughness:.78,metalness:0});
 const satin=new THREE.MeshStandardMaterial({color:new THREE.Color(inkColor).multiplyScalar(.48),roughness:.32,metalness:.08});
 const gold=new THREE.MeshStandardMaterial({color:0xc9a84d,roughness:.28,metalness:.72});
 const glass=new THREE.MeshStandardMaterial({color:0xcde3df,roughness:.11,metalness:.08,transparent:true,opacity:.10,depthWrite:false,side:THREE.DoubleSide});
 // Flat satin checker/weave shading, never embossed geometric tiles.
 satin.onBeforeCompile=shader=>{shader.vertexShader='#define USE_UV\n'+shader.vertexShader;shader.fragmentShader='#define USE_UV\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 ribbonCell=vec2(vUv.x*14.0+vUv.y*.65,vUv.y*2.0);
 float ribbonCheck=mod(floor(ribbonCell.x)+floor(ribbonCell.y),2.0);
 float ribbonAA=1.0-smoothstep(.35,1.0,max(fwidth(ribbonCell.x),fwidth(ribbonCell.y)));
 diffuseColor.rgb*=mix(1.0,mix(.86,1.07,ribbonCheck),ribbonAA);
 `);};satin.customProgramCacheKey=()=> 'thief-hook-flat-satin-v1';
 const materials={cloth,satin,gold,glass},bins={cloth:[],satin:[],gold:[],glass:[]},parts=[];
 const add=(name,g,key)=>{parts.push({name,triangles:(g.index?.count??g.attributes.position.count)/3});bins[key].push(g);};
 const fit=clearance||offIn||ctx?.offIn;
 // Only the lower opening follows the native under-hat envelope. The cylinder
 // above it is independently authored, so a tall hat never stretches scalp/hair.
 const lower=a=>{if(headSurface){const p=new V();headSurface(a,rim(a),(fit?fit(a,rim(a)):.026)+.006,p);return new V(p.x,p.y-1.05,p.z+.002);}return new V(.182*Math.sin(a),.267,.014+.171*Math.cos(a));};
 const base=[];for(let i=0;i<N;i++)base.push(lower(TAU*i/N));
 const bx=Math.max(.182,...base.map(p=>Math.abs(p.x))),bz=Math.max(.171,...base.map(p=>Math.abs(p.z-.014))),by=Math.max(.267,...base.map(p=>p.y));
 const H=.245,zc=.014;
 const profile=[[0,1],[.035,.993],[.18,.977],[.48,1.015],[.78,1.090],[.955,1.155],[1,1.147]];
 const profileAt=t=>{for(let i=1;i<profile.length;i++){if(t<=profile[i][0]){const [a,x]=profile[i-1],[b,y]=profile[i];return x+(y-x)*(t-a)/(b-a);}}return profile.at(-1)[1];};
 const crown=(a,t,extra=0)=>{const k=profileAt(t);return [(bx*k+extra)*Math.sin(a),by+H*t,zc+(bz*k+extra)*Math.cos(a)];};
 add('gently-flared-black-crown',grid(N,12,(u,v)=>crown(u*TAU,v)),'cloth');
 add('flat-crown-top',cap(N,bx*1.147,bz*1.147,by+H,zc),'cloth');
 // Brim is a thin, complete elliptical flange, subtly curled at the side edges.
 const brim=(a,t,yoff=0)=>{const rx=bx+.090*t,rz=bz+.067*t;return [rx*Math.sin(a),by-.006+.014*Math.sin(a)**2*t*t+yoff,zc+rz*Math.cos(a)];};
 add('elliptical-brim-upper',grid(N,3,(u,v)=>brim(u*TAU,v),true),'cloth');
 add('elliptical-brim-under',grid(N,3,(u,v)=>brim(u*TAU,v,-.006)),'cloth');
 add('fine-bound-brim-edge',grid(N,2,(u,v)=>brim(u*TAU,1,-.006*v),true),'cloth');
 add('inner-opening-wall',grid(N,2,(u,v)=>brim(u*TAU,0,-.006*v)),'cloth');
 // Wide satin ribbon sits on the crown. No solid embossed logos or invented print.
 add('ink-satin-ribbon',grid(N,3,(u,v)=>crown(u*TAU,.035+.295*v,.0015)),'satin');
 // Folded ribbon bow: low relief cloth panels rather than blocks or metal buckle.
 const bowAz=1.65;
 const bowPoint=(s,t)=>{const a=bowAz+s*.29,base=crown(a,.16+t*.125,.003);const pleat=.002+.006*(Math.sin(Math.abs(s)*Math.PI)**2)*Math.cos(t*Math.PI/2);base[0]+=Math.sin(a)*pleat;base[2]+=Math.cos(a)*pleat;return base;};
 for(const side of [-1,1])add('folded-satin-bow-'+side,grid([4,6,8][tier],4,(u,v)=>{const s=side*(.09+.91*u),t=(v*2-1)*(.42+.58*u);return bowPoint(s,t);},side<0),'satin');
 add('bow-center-wrap',grid(4,4,(u,v)=>bowPoint((u*2-1)*.10,(v*2-1)*.48)),'satin');
 // The complete hat tilts down at the forehead / up behind the head. Apply
 // this only to hat meshes, not the optical assembly or its ear support.
 for(const key of ['cloth','satin'])for(const g of bins[key])g.translate(0,-by,-zc).rotateX(.14).translate(0,by,zc);
 // Verified in the actual front/side S3 screenshot: wearer RIGHT (-X), viewer left.
 // Author the assembly in +X space, then mirror its positions/winding once below.
 // Use current native headSurface at the adopted eye centre, never mutate face.
 let eye=new V(.091,.174,.173);if(headSurface){headSurface(.52,.05,.017,eye);eye.y-=1.05;eye.z+=.002;}
 const yaw=.26,orient=new THREE.Matrix4().makeRotationY(yaw),X=new V(Math.cos(yaw),0,-Math.sin(yaw)),Y=new V(0,1,0),Z=new V(Math.sin(yaw),0,Math.cos(yaw));
 const eyeMap=g=>g.applyMatrix4(orient).translate(eye.x,eye.y,eye.z);
 const r=.050;
 add('left-monocle-gold-ring',eyeMap(new THREE.TorusGeometry(r,.0028,[5,6,8][tier],[20,32,48][tier])),'gold');
 if(tier>0)add('clear-monocle-lens',eyeMap(new THREE.CircleGeometry(r-.002,[20,32,48][tier])),'glass');
 const world=(x,y,z=0)=>eye.clone().addScaledVector(X,x).addScaledVector(Y,y).addScaledVector(Z,z);
 const tube=(pts,radius,segments)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),segments,radius,[4,5,6][tier],false);
 const templeEnd=new V(.182,.205,-.018);
 add('long-gold-temple-arm',tube([world(r,.005),world(r+.019,.009,-.010),new V(.174,.202,.025),templeEnd],.0025,[8,12,18][tier]),'gold');
 // Black moulded tip bends behind the ear. This geometry is authored directly
 // on the verified wearer-right side, outside the later gold reflection.
 const earTip=[new V(-templeEnd.x,templeEnd.y,templeEnd.z),new V(-.188,.212,-.048),new V(-.191,.185,-.080),new V(-.187,.170,-.084)];
 add('black-bent-earpiece',tube(earTip,.005,[8,12,18][tier]),'cloth');
 // Tiny chain and a genuine small hook pendant, not an oversized pirate hook.
 const anchor=world(r-.002,-.013,.002),end=world(r+.014,-.075,.004);
 if(tier===0)add('chain-far',tube([anchor,world(r+.009,-.041,.004),end],.0018,6),'gold');
 else for(let i=0;i<6;i++){const q=anchor.clone().lerp(end,i/5);q.x+=.004*Math.sin(i/5*Math.PI);const g=new THREE.TorusGeometry(.0034,.001,[4,5][tier-1],8).scale(.72,1,1);if(i%2)g.rotateY(Math.PI/2);g.translate(q.x,q.y,q.z);add('fine-chain-link-'+i,g,'gold');}
 const hook=[end,end.clone().add(new V(.002,-.013,0)),end.clone().add(new V(.017,-.037,0)),end.clone().add(new V(.012,-.050,0)),end.clone().add(new V(-.006,-.047,0)),end.clone().add(new V(-.010,-.033,0)),end.clone().add(new V(-.002,-.019,0))];
 add('small-hook-pendant',tube(hook,.0032,[12,18,24][tier]),'gold');
 const tip=new THREE.ConeGeometry(.006,.014,5);tip.rotateZ(-.45);tip.translate(end.x-.002,end.y-.020,end.z);add('hook-inward-barb',tip,'gold');
 // Narrow nasal bridge and paired small nose pads observed in the front original.
 add('monocle-nasal-bridge',tube([world(-r,.002),world(-r-.017,.005,.004),new V(0,eye.y+.004,eye.z+.013),new V(-.018,eye.y-.003,eye.z+.010)],.0026,[8,12,16][tier]),'gold');
 for(const x of [-.020,.020]){const pad=new THREE.SphereGeometry(.006,[6,8,10][tier],[4,5,6][tier]);pad.scale(.60,1.3,.45);pad.translate(x,eye.y-.013,eye.z+.008);add('nasal-pad-'+x,pad,'gold');}
 // Reflect the complete optical assembly without reversing surface orientation.
 for(const key of ['gold','glass'])for(const g of bins[key]){g.scale(-1,1,1);if(g.index){const a=g.index.array;for(let i=0;i<a.length;i+=3)[a[i+1],a[i+2]]=[a[i+2],a[i+1]];}g.computeVertexNormals();}

 for(const [key,geos] of Object.entries(bins)){if(!geos.length)continue;const mesh=new THREE.Mesh(merge(geos),materials[key]);mesh.name=key;mesh.castShadow=key!=='glass';mesh.receiveShadow=true;root.add(mesh);}
 root.userData.parts=parts;root.userData.fit=THIEF_HOOK_FIT;root.userData.lod=lod;root.userData.referenceIdentity={japanese:'カイトウ・フック',english:'Dapperdasher Hat',game:'Splatoon 3'};
 root.userData.setInkColor=c=>satin.color.set(c).multiplyScalar(.48);
 let disposed=false;root.userData.dispose=()=>{if(disposed)return;disposed=true;root.traverse(o=>o.geometry?.dispose());Object.values(materials).forEach(m=>m.dispose());root.removeFromParent();};
 return root;
}
