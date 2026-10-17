// Original procedural Two-Stripe Mesh study. No copied game meshes or textures.
// Geometry is sampled from current INKWAVE headShape; +Z forward, +Y up.
import * as THREE from 'three';
import { HEAD_C, headShape } from '../character-face.js';
const PI=Math.PI, V=THREE.Vector3, PIVOT=new V(0,1.05,-.002);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const rimTable=[[0,.63],[.6,.6],[1.2,.42],[1.6,.29],[2.3,.12],[PI,.03]];
function rim(az){az=Math.abs(Math.atan2(Math.sin(az),Math.cos(az)));for(let i=1;i<rimTable.length;i++){if(az<=rimTable[i][0]){const [a,v]=rimTable[i-1],[b,w]=rimTable[i];return v+(w-v)*smooth(a,b,az);}}return .03;}
export const TWO_LINE_MESH_HAT={name:'two-line-mesh',cls:2,col:[-1,1],thick:.0058,exitMax:.05,flare:.006,rows:[0,.025,.07,.14,.22,.32],crown:8,rim,lift:(az,el)=>.019*Math.max(0,Math.cos(az))**1.5*smooth(.62,1.05,el)*(1-.35*smooth(1.25,1.57,el))+.012*smooth(.75,1.45,el),shape:()=>0};
const capOffset=(az,el)=>.0075+.003*smooth(.45,1,el)+.0135*Math.max(0,-Math.cos(az))*smooth(-.7,.4,el)+.0025*smooth(.8,1.4,el);
function nativeSurface(az,el,off){const d=new V(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));const p=headShape(d.x,d.y,d.z,new V());const a=headShape(Math.cos(el)*Math.sin(az+.001),Math.sin(el),Math.cos(el)*Math.cos(az+.001),new V()).sub(p);const b=headShape(Math.cos(el+.001)*Math.sin(az),Math.sin(el+.001),Math.cos(el+.001)*Math.cos(az),new V()).sub(p);const n=a.cross(b).normalize();if(el>1.55)n.set(0,1,0);return p.addScaledVector(n,off).add(HEAD_C);}
function grid(nu,nv,fn){const pos=[],uv=[],idx=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const p=fn(i/nu,j/nv);pos.push(p.x,p.y,p.z);uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(a,b,c,b,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function joined(gs){const p=[],n=[],uv=[],idx=[];let off=0;for(const g of gs){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);idx.push(...Array.from(g.index.array,x=>x+off));off+=g.attributes.position.count;g.dispose();}const g=new THREE.BufferGeometry();for(const [k,a,s]of [['position',p,3],['normal',n,3],['uv',uv,2]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));g.setIndex(idx);return g;}
/** ctx.offIn and helpers.headSurf use existing native hat clearance, all returned parts in kid-space. */
export function twoLineMeshParts({lod='game',ctx=null,helpers={}}={}){
 const far=lod==='far',N=far?12:lod==='hero'?48:24,parts=[];
 const add=(name,geo,color,team=false,plastic=false)=>parts.push({name,geo,color,team,plastic});
 const surface=(az,el,extra=0)=>{const off=(ctx?ctx.offIn(az,el):capOffset(az,el)+.0045+TWO_LINE_MESH_HAT.lift(az,el))+.0058+.009*Math.exp(-(((el-1.08)/.3)**2))+extra;return helpers.headSurf?helpers.headSurf(az,el,off,new V()):nativeSurface(az,el,off);};
 const rearCut=az=>{const d=Math.abs(az-PI);return .44*Math.sqrt(Math.max(0,1-(d/.43)**2));};
 const frontEdge=1.04;
 add('solid-front-crown',grid(N,far?6:14,(u,v)=>{const az=(u*2-1)*frontEdge;return surface(az,rim(az)+(PI/2-rim(az))*v);}),0x3256ff,true);
 // Actual open grid strips, not a painted opaque gray back. Rear arch remains open.
 const strips=[],cols=far?16:lod==='hero'?80:32,rows=far?8:lod==='hero'?27:14,range=2*PI-2*frontEdge;
 for(let i=0;i<=cols;i++){const az=frontEdge+range*i/cols;strips.push(grid(1,far?3:lod==='hero'?12:6,(u,v)=>{const a=az+(u-.5)*(far?.016:.007);const lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*v,.0001);}));}
 for(let j=0;j<rows;j++){const e=j/rows;strips.push(grid(cols,1,(u,v)=>{const a=frontEdge+range*u;const lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*Math.min(.998,e+(v-.5)*.009),.0003);}));}
 add('open-pale-rear-mesh',joined(strips),0xe3e6dc);
 // Fine textile backing sits beneath the open threads, and preserves the rear arch.
 add('rear-mesh-textile-backing',grid(N,far?4:10,(u,v)=>{const a=frontEdge+range*u,lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*v,-.0014);}),0xe3e6dc,'pale');
 // Two broad rear stripes: dark upper, team lower; both stop at rear arch.
 for(const [name,e,col,team]of [['upper-dark-stripe',.27,0x282b30,false],['lower-ink-stripe',.105,0x3256ff,true]])for(const side of [0,1]){
 add(name+'-'+side,grid(Math.ceil(N*.65),2,(u,v)=>{const elev=e+(v-.5)*.075,cut=.43*Math.sqrt(Math.max(0,1-(elev/.44)**2));const a0=side?PI+cut:frontEdge,a1=side?2*PI-frontEdge:PI-cut;const a=a0+(a1-a0)*u;return surface(a,rim(a)+elev,.0018);}),col,team);
 }
 // Crown panel seams, opening binding, lower edge.
 const seams=[];
 for(const az of [frontEdge,PI/2,PI,3*PI/2,2*PI-frontEdge])seams.push(grid(1,12,(u,v)=>{const a=az+(u-.5)*.014,lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*v,.0012);}));
 seams.push(grid(N,1,(u,v)=>{const a=frontEdge+range*u;return surface(a,rim(a)+rearCut(a)+(v-.5)*.024,.0015);}));
 add('mesh-seams-and-opening-binding',joined(seams),0xe3e6dc);
 // Curved bill with true underside and thickness, visibly wider than the forehead.
 const bill=(u,t,y=0)=>{const a=(u*2-1)*1.00,p=surface(a,rim(a),-.002);const length=.087*Math.sqrt(Math.max(0,1-(u*2-1)**2))+.003;return p.add(new V(Math.sin(a)*length*t,-.015*t-.012*(u*2-1)**2*t+y,Math.cos(a)*length*t));};
 add('bill-top',grid(N,6,(u,v)=>bill(u,v)),0x3256ff,true);
 add('bill-underside',grid(N,4,(u,v)=>bill(1-u,v,-.0045)),0x263ed1,true);
 add('bill-rounded-edge',grid(N,2,(u,v)=>bill(u,1,-.0045*v)),0x3256ff,true);
 if(!far){const stitch=[];for(const t of [.32,.52,.72,.9])stitch.push(grid(N,1,(u,v)=>bill(u,t+(v-.5)*.009,.0007)));add('bill-stitch-lines',joined(stitch),0x273ea0,true);}
 const button=new THREE.SphereGeometry(.009,12,6);button.scale(1,.45,1);button.translate(...surface(0,PI/2,.001).toArray());add('top-button',button,0x3256ff,true);
 // Rounded horizontal white badge follows the front curvature. Abstract original glyphs, no source texture.
 const badge=(u,v,extra)=>{const az=(u-.5)*1.17;const round=Math.sqrt(Math.max(0,1-((u-.5)*2)**8));return surface(az,.91+(v-.5)*.28*round,extra);};
 add('front-badge-black-border',grid(far?10:28,far?2:5,(u,v)=>badge(u,v,.002)),0x282b30);
 add('front-badge-white',grid(far?10:28,far?2:5,(u,v)=>badge(.014+u*.972,.06+v*.88,.003)),0xf2f0e6);
 const glyphs=[];for(let i=0;i<(far?3:6);i++){const x=.28+i*.105;for(const [a,b,c,d]of [[x,.27,x+.026,.72],[x,.69,x+.067,.75],[x+.05,.38,x+.074,.73],[x+.01,.27,x+.064,.33]])glyphs.push(grid(1,1,(u,v)=>badge(a+(c-a)*u,b+(d-b)*v,.004)));}
 add('original-abstract-label-glyphs',joined(glyphs),0x282b30);
 const oval=(scale,extra)=>grid(far?10:24,far?2:5,(u,v)=>{const a=u*PI*2,r=Math.sqrt(v);return badge(.145+Math.cos(a)*.105*r*scale,.5+Math.sin(a)*.43*r*scale,extra);});
 add('emblem-dark-oval',oval(1,.004),0x282b30);add('emblem-yellow-inset',oval(.81,.0048),0xffd524);add('emblem-dark-center',oval(.57,.0054),0x282b30);
 if(!far){const marks=[];for(let j=0;j<3;j++)marks.push(grid(8,1,(u,v)=>{const a=-.9+u*2.5,x=.145+Math.cos(a)*(.035+j*.017),y=.5+Math.sin(a)*(.14+j*.055)+(v-.5)*.022;return badge(x,y,.006); }));add('emblem-original-yellow-arcs',joined(marks),0xffd524);}
 // White snap closure bridges rear opening; dark inset discs depict recessed snap holes.
 const strapPoint=(u,v,extra=.003)=>surface(PI+(u-.5)*.94,rim(PI)+(v-.5)*.075+.06,extra);
 add('white-rear-adjustment-strap',grid(18,2,(u,v)=>strapPoint(u,v)),0xf2f0e6,false,true);
 const holes=[];for(let i=-2;i<=2;i++){const at=strapPoint(.5+i*.14,.5,.0048);const g=new THREE.CylinderGeometry(.0022,.0022,.0005,10);g.rotateX(PI/2);g.translate(at.x,at.y,at.z);holes.push(g);}add('snap-recesses',joined(holes),0x282b30,false,true);
 return parts;
}
/** Standalone review Group. Attach to head bone, never root. Ink is configurable. */
export function createTwoLineMesh(options={}){const group=new THREE.Group();group.name='headgear:two-line-mesh';const ink=new THREE.Color(options.inkColor??options.teamColor??0x3256ff);const buckets=new Map();for(const p of twoLineMeshParts(options)){const key=(p.team?'ink:'+p.team:p.color)+':'+p.plastic;if(!buckets.has(key))buckets.set(key,{...p,geos:[],names:[]});buckets.get(key).geos.push(p.geo);buckets.get(key).names.push(p.name);}for(const p of buckets.values()){p.geo=joined(p.geos);p.geo.translate(-PIVOT.x,-PIVOT.y,-PIVOT.z);const material=new THREE.MeshStandardMaterial({color:p.team?(p.team==='pale'?ink.clone().lerp(new THREE.Color(0xffffff),.76):ink):p.color,roughness:p.plastic?.52:.9,side:THREE.DoubleSide});const mesh=new THREE.Mesh(p.geo,material);mesh.name=p.names.join('|');mesh.userData.inkRole=p.team;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}group.setInkColor=(color)=>{ink.set(color);for(const mesh of group.children)if(mesh.userData.inkRole){mesh.material.color.copy(ink);if(mesh.userData.inkRole==='pale')mesh.material.color.lerp(new THREE.Color(0xffffff),.76);}return group;};let disposed=false;group.dispose=()=>{if(disposed)return;disposed=true;for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();}group.clear();};group.userData={gearId:'two-line-mesh',headBoneLocal:true,sourceMain:'85acc45d0ab23a95161b599d4287fd8142e8145b'};return group;}
/** Native build adapter: existing B adds head weights and shared fabric shader. */
export function buildTwoLineMesh(B,hat,ctx,helpers={},D=null){for(const p of twoLineMeshParts({lod:D?.lod||'game',ctx,helpers})){B.add(p.geo,{ex:p.plastic?-2:-4,uv:true,color:p.team?new THREE.Color(-1,1,0):new THREE.Color(p.color),bone:'head'});}}
