// Original procedural Two-Stripe Mesh study. No copied game meshes or textures.
// Geometry is sampled from current INKWAVE headShape; +Z forward, +Y up.
import * as THREE from 'three';
import { HEAD_C, headShape } from '../../../src/game/character-face.js';
const PI=Math.PI, V=THREE.Vector3, PIVOT=new V(0,1.05,-.002);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const rimTable=[[0,.60],[.6,.55],[1.0,.35],[1.2,.24],[1.6,.20],[2.3,.18],[PI,.18]];
function rim(az){az=Math.abs(Math.atan2(Math.sin(az),Math.cos(az)));for(let i=1;i<rimTable.length;i++){if(az<=rimTable[i][0]){const [a,v]=rimTable[i-1],[b,w]=rimTable[i];return v+(w-v)*smooth(a,b,az);}}return .03;}
export const TWO_LINE_MESH_HAT={name:'two-line-mesh',cls:2,col:[-1,1],thick:.0058,exitMax:.05,flare:.006,rows:[0,.025,.07,.14,.22,.32],crown:8,rim,lift:(az,el)=>.019*Math.max(0,Math.cos(az))**1.5*smooth(.62,1.05,el)*(1-.35*smooth(1.25,1.57,el))+.012*smooth(.75,1.45,el),shape:()=>0};
const capOffset=(az,el)=>.0075+.003*smooth(.45,1,el)+.0135*Math.max(0,-Math.cos(az))*smooth(-.7,.4,el)+.0025*smooth(.8,1.4,el);
function nativeSurface(az,el,off){const d=new V(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));const p=headShape(d.x,d.y,d.z,new V());const a=headShape(Math.cos(el)*Math.sin(az+.001),Math.sin(el),Math.cos(el)*Math.cos(az+.001),new V()).sub(p);const b=headShape(Math.cos(el+.001)*Math.sin(az),Math.sin(el+.001),Math.cos(el+.001)*Math.cos(az),new V()).sub(p);const n=a.cross(b).normalize();if(el>1.55)n.set(0,1,0);return p.addScaledVector(n,off).add(HEAD_C);}
function grid(nu,nv,fn){const pos=[],uv=[],idx=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const p=fn(i/nu,j/nv);pos.push(p.x,p.y,p.z);uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(a,b,c,b,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
function joined(gs){const p=[],n=[],uv=[],idx=[];let off=0;for(const g of gs){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);idx.push(...Array.from(g.index.array,x=>x+off));off+=g.attributes.position.count;g.dispose();}const g=new THREE.BufferGeometry();for(const [k,a,s]of [['position',p,3],['normal',n,3],['uv',uv,2]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));g.setIndex(idx);return g;}
/** ctx.offIn and helpers.headSurf use existing native hat clearance, all returned parts in kid-space. */
export function twoLineMeshParts({lod='game',ctx=null,helpers={}}={}){
 const far=lod==='far',N=far?12:lod==='hero'?36:24,parts=[];
 const add=(name,geo,color,team=false,plastic=false)=>parts.push({name,geo,color,team,plastic});
 const surface=(az,el,extra=0)=>{
  const er=rim(az),v=Math.max(0,Math.min(1,(el-er)/(PI/2-er)));
  const off=(ctx?ctx.offIn(az,er):capOffset(az,er)+.0045+TWO_LINE_MESH_HAT.lift(az,er))+.0058;
  const base=helpers.headSurf?helpers.headSurf(az,er,off,new V()):nativeSurface(az,er,off);
  // Structured trucker crown: a tall vertical front and rounded upper shoulders.
  // Fit is inherited at the rim; the crown is not constrained to a scalp hemisphere.
  const radial=Math.pow(Math.max(0,Math.cos(v*PI/2)),.48);
  const topY=HEAD_C.y+.27;
  const p=new V(base.x*radial,base.y+(topY-base.y)*Math.sin(v*PI/2),HEAD_C.z+(base.z-HEAD_C.z)*radial);
  if(extra){const n=new V(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));p.addScaledVector(n,extra);}
  return p;
 };
 const rearCut=az=>{const d=Math.abs(az-PI);return .44*Math.sqrt(Math.max(0,1-(d/.43)**2));};
 const frontEdge=1.2;
 add('solid-front-crown',grid(N,far?6:10,(u,v)=>{const az=(u*2-1)*frontEdge;return surface(az,rim(az)+(PI/2-rim(az))*v);}),0x3256ff,true);
 // Fine woven fabric uses rounded, staggered cells in physical coordinates.
 // No coarse geometric wire grid; this keeps cell size independent of LOD tessellation.
 const range=2*PI-2*frontEdge;
 add('fine-rear-woven-fabric',grid(N,far?6:14,(u,v)=>{const a=frontEdge+range*u,lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*v);}),0xe3e6dc,'mesh-cell');
 // Two broad rear stripes: dark upper, team lower; both stop at rear arch.
 for(const [name,e,col,team]of [['upper-dark-stripe',.26,0x282b30,false],['lower-ink-stripe',.10,0x3256ff,true]])for(const side of [0,1]){
 add(name+'-'+side,grid(Math.ceil(N*.65),2,(u,v)=>{const elev=e+(v-.5)*.10,cut=.43*Math.sqrt(Math.max(0,1-(elev/.44)**2));const a0=side?PI+cut:frontEdge,a1=side?2*PI-frontEdge:PI-cut;const a=a0+(a1-a0)*u;return surface(a,rim(a)+elev,.0018);}),col,team);
 }
 // Crown panel seams, opening binding, lower edge.
 const seams=[];
 for(const az of [frontEdge,PI/2,PI,3*PI/2,2*PI-frontEdge])seams.push(grid(1,12,(u,v)=>{const a=az+(u-.5)*.014,lo=rim(a)+rearCut(a);return surface(a,lo+(PI/2-lo)*v,.0012);}));
 seams.push(grid(N,1,(u,v)=>{const a=frontEdge+range*u;return surface(a,rim(a)+rearCut(a)+(v-.5)*.024,.0015);}));
 add('mesh-seams-and-opening-binding',joined(seams),0xe3e6dc);
 // Curved bill with true underside and thickness, visibly wider than the forehead.
 const bill=(u,t,y=0)=>{const a=(u*2-1)*1.10,p=surface(a,rim(a),-.002);const length=.15*Math.sqrt(Math.max(0,1-(u*2-1)**2))+.003;return p.add(new V(Math.sin(a)*length*t,-.008*t-.004*(u*2-1)**2*t+y,Math.cos(a)*length*t));};
 add('bill-top',grid(N,6,(u,v)=>bill(u,v)),0x3256ff,true);
 add('bill-underside',grid(N,4,(u,v)=>bill(1-u,v,-.0045)),0x263ed1,true);
 add('bill-rounded-edge',grid(N,2,(u,v)=>bill(u,1,-.0045*v)),0x3256ff,true);
 if(!far){const stitch=[];for(const t of [.32,.52,.72,.9])stitch.push(grid(N,1,(u,v)=>bill(u,t+(v-.5)*.009,.0007)));add('bill-stitch-lines',joined(stitch),0x273ea0,true);}
 const button=new THREE.SphereGeometry(.009,12,6);button.scale(1,.45,1);button.translate(...surface(0,PI/2,.001).toArray());add('top-button',button,0x3256ff,true);
 // Rounded horizontal white badge follows the front curvature. Abstract original glyphs, no source texture.
 const badge=(u,v,extra)=>{const az=(u-.5)*1.17;const round=Math.sqrt(Math.max(0,1-((u-.5)*2)**8));return surface(az,.91+(v-.5)*.28*round,extra);};
 add('front-badge-black-border',grid(far?10:20,far?2:3,(u,v)=>badge(u,v,.002)),0x282b30);
 add('front-badge-white',grid(far?10:20,far?2:3,(u,v)=>badge(.014+u*.972,.06+v*.88,.003)),0xf2f0e6);
 // Broad slanted vector glyphs approximate the reference wordmark silhouette.
 // These are six distinct filled strokes, not repeated circuit-like placeholders.
 const stroke=(points,ux,uy,w,h,thick=.15)=>{
  const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>new V(x,y,0)),false,'centripetal');
  return grid(far?12:22,1,(u,v)=>{const p=curve.getPoint(u),t=curve.getTangent(u);const nx=-t.y,ny=t.x;const x=p.x+nx*(v-.5)*thick,y=p.y+ny*(v-.5)*thick;return badge(ux+(x+.16*(y-.5))*w,uy+y*h,.0048);});
 };
 const glyphPaths=[
  [[0,.08],[.12,.82],[.35,.93],[.54,.81],[.43,.25],[.62,.23],[.76,.81],[.98,.83],[.88,.12]],
  [[.1,.51],[.77,.53],[.85,.77],[.60,.88],[.23,.84],[.09,.55],[.13,.17],[.80,.15]],
  [[.1,.86],[.08,.52],[.32,.4],[.64,.46],[.76,.83],[.58,.13],[.18,.1]],
  [[.06,.12],[.18,.82],[.64,.84],[.77,.64],[.64,.15],[.94,.15]],
  [[.08,.46],[.76,.48],[.83,.71],[.61,.86],[.2,.84],[.08,.19],[.78,.16]],
  [[.08,.16],[.72,.16],[.85,.70],[.71,.91],[.66,.61],[.15,.60],[.08,.16]],
 ];
 const glyphs=glyphPaths.map((path,i)=>stroke(path,.26+i*.108,.20,.102,.57,.19));
 add('slanted-wordmark-vector-approximation',joined(glyphs),0x282b30);
 const oval=(scale,extra)=>grid(far?10:16,far?2:3,(u,v)=>{const a=u*PI*2,r=Math.sqrt(v);return badge(.135+Math.cos(a)*.112*r*scale,.5+Math.sin(a)*.49*r*scale,extra);});
 add('emblem-dark-border',oval(1,.004),0x282b30);add('emblem-yellow-disc',oval(.86,.0048),0xffd524);
 // Single flat black squid mark on the yellow disc, based on viewed emblem outline.
 // The crown/head and swept tentacles are a vector approximation, not an exact logo claim.
 const sh=new THREE.Shape();
 sh.moveTo(-.05,.8);sh.bezierCurveTo(-.08,.5,-.58,.32,-.61,.03);
 sh.bezierCurveTo(-.66,-.20,-.34,-.23,-.17,-.1);
 sh.bezierCurveTo(-.14,-.29,-.31,-.47,-.54,-.34);
 sh.bezierCurveTo(-.48,-.64,-.17,-.59,-.05,-.36);
 sh.lineTo(-.06,-.71);sh.lineTo(.14,-.71);sh.lineTo(.08,-.32);
 sh.bezierCurveTo(.25,-.6,.57,-.63,.59,-.34);
 sh.bezierCurveTo(.39,-.49,.20,-.29,.18,-.11);
 sh.bezierCurveTo(.50,-.20,.70,-.02,.60,.22);
 sh.bezierCurveTo(.5,.49,.11,.39,-.05,.8);
 const mark=new THREE.ShapeGeometry(sh,far?3:6),mp=mark.attributes.position;
 for(let i=0;i<mp.count;i++){const p=badge(.135+mp.getX(i)*.112,.5+mp.getY(i)*.49,.0054);mp.setXYZ(i,p.x,p.y,p.z);}mark.computeVertexNormals();
 add('squid-emblem-vector-approximation',mark,0x282b30);
 // White snap closure bridges rear opening; dark inset discs depict recessed snap holes.
 const strapPoint=(u,v,extra=.003)=>surface(PI+(u-.5)*.94,rim(PI)+(v-.5)*.075+.06,extra);
 add('white-rear-adjustment-strap',grid(18,2,(u,v)=>strapPoint(u,v)),0xf2f0e6,false,true);
 const holes=[];for(let i=-2;i<=2;i++){const at=strapPoint(.5+i*.14,.5,.0048);const g=new THREE.CylinderGeometry(.0022,.0022,.0005,10);g.rotateX(PI/2);g.translate(at.x,at.y,at.z);holes.push(g);}add('snap-recesses',joined(holes),0x282b30,false,true);
 return parts;
}
/** Standalone review Group. Attach to head bone, never root. Ink is configurable. */
export function createTwoLineMesh(options={}){const group=new THREE.Group();group.name='headgear:two-line-mesh';const ink=new THREE.Color(options.inkColor??options.teamColor??0x3256ff);const buckets=new Map();for(const p of twoLineMeshParts(options)){const key=(p.team?'ink:'+p.team:p.color)+':'+p.plastic;if(!buckets.has(key))buckets.set(key,{...p,geos:[],names:[]});buckets.get(key).geos.push(p.geo);buckets.get(key).names.push(p.name);}for(const p of buckets.values()){p.geo=joined(p.geos);p.geo.translate(-PIVOT.x,-PIVOT.y,-PIVOT.z);const material=new THREE.MeshStandardMaterial({color:p.team?(p.team==='mesh-cell'?new THREE.Color(0x8b8d91).lerp(ink,.25):ink):p.color,roughness:p.plastic?.52:.9,side:THREE.DoubleSide});const mesh=new THREE.Mesh(p.geo,material);mesh.name=p.names.join('|');mesh.userData.inkRole=p.team;if(p.team==='mesh-cell')installFineWeave(material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}group.setInkColor=(color)=>{ink.set(color);for(const mesh of group.children)if(mesh.userData.inkRole){mesh.material.color.copy(ink);if(mesh.userData.inkRole==='mesh-cell')mesh.material.color.copy(new THREE.Color(0x8b8d91).lerp(ink,.25));}return group;};let disposed=false;group.dispose=()=>{if(disposed)return;disposed=true;for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();}group.clear();};group.userData={revision:'tall-crown-long-visor-v6-proposal',gearId:'two-line-mesh',headBoneLocal:true,sourceMain:'85acc45d0ab23a95161b599d4287fd8142e8145b'};return group;}
/** Native build adapter: existing B adds head weights and shared fabric shader. */
export function buildTwoLineMesh(B,hat,ctx,helpers={},D=null){for(const p of twoLineMeshParts({lod:D?.lod||'game',ctx,helpers})){B.add(p.geo,{ex:p.plastic?-2:-4,uv:true,color:p.team?new THREE.Color(-1,1,0):new THREE.Color(p.color),bone:'head'});}}

/** Original procedural fabric: small staggered rounded holes bounded by pale fiber.
 * Density is in head-local metres, not grid UVs, so arch/crown topology does not stretch the cells.
 * fwidth fades fine detail under minification instead of causing wireframe aliasing.
 */
function installFineWeave(material) {
 material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWeavePosition;');
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeavePosition = position;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWeavePosition;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    vec3 weaveP = vWeavePosition - vec3(0.0, 0.164, 0.014);
    vec2 weaveUV = vec2(atan(weaveP.x, weaveP.z) * 0.18, weaveP.y) * 135.0;
    float weaveRow = floor(weaveUV.y);
    weaveUV.x += mod(weaveRow, 2.0) * 0.5;
    vec2 weaveCell = fract(weaveUV) - 0.5;
    float weaveD = length(weaveCell * vec2(1.0, 1.1));
    float weaveAA = max(fwidth(weaveD), 0.025);
    float weaveFiber = smoothstep(0.32 - weaveAA, 0.40 + weaveAA, weaveD);
    float weaveResolve = 1.0 - smoothstep(0.35, 1.2, max(fwidth(weaveUV.x), fwidth(weaveUV.y)));
    weaveFiber = mix(0.55, weaveFiber, weaveResolve);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.77, 0.79, 0.72), weaveFiber);
  `);
 };
 material.customProgramCacheKey = () => 'two-line-mesh-fabric-v4';
 material.needsUpdate = true;
}
