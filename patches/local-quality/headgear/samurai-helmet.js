/** Original procedural S3 Samurai Helmet interpretation. See REFERENCES.md.
 * +Y up, +Z face; head-bone local. No imported meshes/textures or character edits. */
import * as THREE from 'three';
export const SAMURAI_HELMET_FIT=Object.freeze({name:'samurai-helmet',thick:.010,exitMax:.05,flare:.008,
 rim:a=>.25+.32*Math.max(0,Math.cos(a))-.16*Math.max(0,-Math.cos(a)),lift:()=>.008,shape:()=>0});
export const SAMURAI_HELMET_METADATA=Object.freeze({id:'samurai-helmet',headBone:'head',restHead:[0,1.05,-.002],reference:'Splatoon 3 Samurai Helmet / サムライヘルメット',sideDepth:'Inferred from S3 rear three-quarter and inventory icon; no orthographic measurement.'});
const PI=Math.PI;
export function createSamuraiHelmet({lod='hero',inkColor=0xe637ab,headSurface=null,offIn=null,clearance=null,ctx=null}={}){
 const d=lod==='far'?0:lod==='game'?1:2,N=[16,28,48][d],R=[5,8,14][d];
 const root=new THREE.Group();root.name='samurai-helmet';
 const mats={dark:new THREE.MeshStandardMaterial({color:0x232629,roughness:.57,metalness:.35}),gold:new THREE.MeshPhysicalMaterial({color:0xcda32f,roughness:.26,metalness:.78,clearcoat:.65,clearcoatRoughness:.18}),ink:new THREE.MeshStandardMaterial({color:inkColor,roughness:.83,metalness:.03}),wing:new THREE.MeshStandardMaterial({color:0xd8d4bb,roughness:.7,metalness:.12})};
 // Flat analytic lacing/pattern, not hundreds of tiny cord/dot meshes.
 const inkUniform={value:new THREE.Color(inkColor)};
 mats.wing.onBeforeCompile=s=>{s.vertexShader='#define USE_UV\n'+s.vertexShader;s.fragmentShader='#define USE_UV\nuniform vec3 samuraiInk;\n'+s.fragmentShader;s.uniforms.samuraiInk=inkUniform;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 q=vUv;float edge=min(min(q.x,1.0-q.x),min(q.y,1.0-q.y));
 float aa=max(fwidth(edge),.001);float border=1.0-smoothstep(.055-aa,.055+aa,edge);
 vec2 cell=fract(q*vec2(14.,10.));float dots=1.0-smoothstep(.13,.23,length(cell-.5));
 float fade=1.0-smoothstep(.7,1.5,max(fwidth(q.x*14.),fwidth(q.y*10.)));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.17,.15),dots*.7*fade);
 diffuseColor.rgb=mix(diffuseColor.rgb,samuraiInk,border);`);};
 mats.wing.customProgramCacheKey=()=> 'samurai-flat-wing-v1';
 mats.ink.onBeforeCompile=s=>{s.vertexShader='#define USE_UV\n'+s.vertexShader;s.fragmentShader='#define USE_UV\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 q=vUv*vec2(40.,4.);float aa=max(fwidth(q.x),.025);
 // Dark lamellar plates crossed by broad, diagonal ink-colored lace stitches.
 float diagonal=abs(fract(q.x+floor(q.y)*.5+fract(q.y)*.65)-.5);
 float stitch=1.-smoothstep(.19-aa,.19+aa,diagonal);
 float row=smoothstep(.04,.14,fract(q.y))*(1.-smoothstep(.84,.96,fract(q.y)));
 float fade=1.-smoothstep(.7,1.5,max(fwidth(q.x),fwidth(q.y)));
 diffuseColor.rgb*=mix(.48,.14+.86*stitch*row,fade);`);};
 mats.ink.customProgramCacheKey=()=> 'samurai-flat-lacing-v1';
 const chunks=Object.fromEntries(Object.keys(mats).map(k=>[k,[]])),parts=[];
 const add=(name,g,k)=>{if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));g.computeVertexNormals();chunks[k].push(g);parts.push({name,triangles:(g.index?g.index.count:g.attributes.position.count)/3});};
 const grid=(nu,nv,fn)=>{const p=[],uv=[],ix=[];for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){p.push(...fn(i/nu,j/nv));uv.push(i/nu,j/nv);}for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){let a=j*(nu+1)+i,b=a+1,c=a+nu+1;ix.push(a,b,c,b,c+1,c);}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;};
 // Native lifecycle passes clearance as an offset function, and ctx as analyseHat.
 const fit=ctx?.hat||(typeof clearance?.rim==='function'?clearance:SAMURAI_HELMET_FIT);
 const offset=offIn||ctx?.offIn||(typeof clearance==='function'?clearance:null);
 const scalp=(a,e,extra=0)=>{if(headSurface){const q=new THREE.Vector3();headSurface(a,e,(offset?offset(a,e):.022)+fit.thick+extra,q);return [q.x,q.y-1.05,q.z+.002];}return [(.206+extra)*Math.sin(a)*Math.cos(e),.164+(.196+extra)*Math.sin(e),.014+(.194+extra)*Math.cos(a)*Math.cos(e)];};
 // Low domed iron bowl follows the existing native hat fit at the rim.
 const dome=(a,t,extra=0)=>{const e=fit.rim(a)+(PI/2-.002-fit.rim(a))*t,p=scalp(a,e,extra);p[1]+=.012*Math.sin(t*PI/2);return p;};
 add('low-black-kabuto-bowl',grid(N,R,(u,v)=>dome(u*PI*2,v)),'dark');
 add('gold-lower-circumference',grid(N,d===2?2:1,(u,v)=>scalp(u*PI*2,fit.rim(u*PI*2)+(v-.5)*.045,.004)),'gold');
 // Gold broad ribs on the bowl, and deliberately coarse major studs.
 for(let i=0;i<8;i++){const a=i*PI/4;add('bowl-gold-rib-'+i,grid(1,R,(u,v)=>dome(a+(u-.5)*.035,v,.002)),'gold');}
 for(let row=0;row<2;row++)for(let i=0;i<8;i++){const a=(i+.5)*PI/4,p=dome(a,.22+row*.36,.001);const g=new THREE.SphereGeometry(.022,[4,6,10][d],[3,4,6][d]);g.scale(1,.68,1);g.translate(...p);add('large-gold-stud-'+row+'-'+i,g,'gold');}
 const top=scalp(0,PI/2);const topG=new THREE.CylinderGeometry(.035,.042,.011,[8,12,24][d]);topG.translate(0,top[1]+.012,.014);add('crown-top-ring',topG,'gold');
 // Wide, shallow, flared shikoro. S3 rear reference has a horizontal sweep,
 // not a long vertical neck skirt. Its opening leaves cheeks/eyes unobstructed.
 const skirt=(u,v,extra=0)=>{const a=.95+u*(PI*2-1.9),r=.205+v*.103;return [Math.sin(a)*r,.220-v*.075+.085*v*v*v*Math.pow(Math.abs(Math.sin(a)),4)+extra,.003+Math.cos(a)*(r+.012)];};
 for(let row=0;row<3;row++){
  const band=grid(N,[1,2,3][d],(u,t)=>{const p=skirt(1-u,(row+t)/3);p[1]+=.004*(1-t);return p;});
  // Keep continuous lacing UVs while the three broad plate lips overlap.
  const uv=band.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,(row+uv.getY(i))/3);
  add('ink-laced-neck-guard-plate-'+row,band,'ink');
  add('neck-guard-plate-lip-'+row,grid(N,1,(u,t)=>{const p=skirt(u,(row+1)/3);p[1]-=.003*t;return p;}),'dark');
 }
 add('neck-guard-underface',grid(N,[1,2,4][d],(u,v)=>skirt(u,v,-.009)),'dark');
 add('neck-guard-outer-black-binding',grid(N,d===2?2:1,(u,v)=>skirt(u,1,-v*.009)),'dark');
 for(const v of [.0,.34,.67,1])add('flat-neck-guard-row-'+v,grid(N,1,(u,t)=>skirt(1-u,Math.max(0,Math.min(1,v+(t-.5)*.026)),.001)),'dark');
 // Shape extrusion with triangulated concave front/back, true gold thickness.
 const plate=(xy,depth,z,transform=null)=>{const s=new THREE.Shape();xy.forEach((p,i)=>i?s.lineTo(...p):s.moveTo(...p));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:3});g.translate(0,0,z-depth/2);if(transform)g.applyMatrix4(transform);return g;};
 // Tall outward-curving kuwagata: wide gold sheet horns, not thin antlers.
 // Smooth, broad sheet profile; bevel-sized edge stays physical, ornament is not subdivided.
 const hornShape=new THREE.Shape();hornShape.moveTo(.064,.282);
 hornShape.bezierCurveTo(.126,.284,.213,.316,.244,.383);
 hornShape.bezierCurveTo(.268,.432,.257,.479,.218,.524);
 hornShape.bezierCurveTo(.199,.546,.180,.569,.168,.579);
 hornShape.bezierCurveTo(.153,.574,.151,.566,.157,.552);
 hornShape.bezierCurveTo(.183,.500,.189,.458,.173,.415);
 hornShape.bezierCurveTo(.155,.368,.120,.344,.071,.337);hornShape.closePath();
 for(const side of [-1,1]){
  const hornGeo=new THREE.ExtrudeGeometry(hornShape,{depth:.009,bevelEnabled:true,bevelSize:.003,bevelThickness:.002,bevelSegments:1,curveSegments:[3,5,8][d]});
  const hp=hornGeo.attributes.position;for(let i=0;i<hp.count;i++){hp.setX(i,hp.getX(i)*side);hp.setZ(i,hp.getZ(i)+.1875-.19*(hp.getY(i)-.30));}
  // Reflection across X reverses winding, including the thin edge faces.
  if(side<0){for(const key of ['position','normal','uv']){const at=hornGeo.attributes[key];for(let i=0;i<at.count;i+=3)for(let k=0;k<at.itemSize;k++){const p=(i+1)*at.itemSize+k,q=(i+2)*at.itemSize+k,v=at.array[p];at.array[p]=at.array[q];at.array[q]=v;}}}
  add('broad-gold-kuwagata-'+side,hornGeo,'gold');
  // Curved rectangular fukigaeshi with pale speckled field and gold border.
  const wing=(u,v,front=0)=>{const pu=(u-.5)*2,pv=(v-.5)*2,ru=pu*Math.sqrt(1-.25*pv*pv)*.5,rv=pv*Math.sqrt(1-.25*pu*pu)*.5;const x=.263+ru*.115+rv*.082,y=.250-ru*.082+rv*.115,z=.103-.047*ru+.055*ru*ru+.040*rv*rv+front;return [side*x,y,z];};
  add('wing-gold-frame-'+side,grid([4,6,10][d],[3,4,6][d],(u,v)=>wing(side>0?u:1-u,v)),'gold');
  add('wing-pattern-field-'+side,grid([4,6,10][d],[3,4,6][d],(u,v)=>wing(side>0?.055+.89*u:.945-.89*u,.07+.86*v,.002)),'wing');
  add('wing-back-'+side,grid([4,6,10][d],[3,4,6][d],(u,v)=>wing(side>0?1-u:u,v,-.009)),'dark');
  const disc=new THREE.SphereGeometry(.028,[6,10,16][d],[4,5,8][d]);disc.scale(1,1,.28);disc.translate(side*.263,.278,.116);add('wing-gold-roundel-'+side,disc,'gold');
 }
 // Original stylized squid crest silhouette, broad surface rather than filigree.
 const crestShape=new THREE.Shape();crestShape.moveTo(0,.430);
 crestShape.bezierCurveTo(-.027,.407,-.046,.377,-.052,.345);
 crestShape.bezierCurveTo(-.085,.351,-.121,.337,-.137,.310);
 crestShape.bezierCurveTo(-.141,.282,-.104,.257,-.057,.251);
 crestShape.quadraticCurveTo(0,.238,.057,.251);
 crestShape.bezierCurveTo(.104,.257,.141,.282,.137,.310);
 crestShape.bezierCurveTo(.121,.337,.085,.351,.052,.345);
 crestShape.bezierCurveTo(.046,.377,.027,.407,0,.430);crestShape.closePath();
 const crestBase=new THREE.ExtrudeGeometry(crestShape,{depth:.010,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:[3,4,6][d]});crestBase.translate(0,0,.219);add('broad-embossed-crest-base',crestBase,'gold');
 const tube=(name,points,r,k,closed=false)=>{const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal');add(name,new THREE.TubeGeometry(c,d===2?28:name.startsWith('bow-tail')?[3,4][d]:name.startsWith('crest-')?[6,8][d]:[8,12][d],r,[4,5,9][d],closed),k);};
 // Raised central squid mantle: broad convex volume catches the same native
 // light as the bowl studs. Its two eyes sit within a brow, not a smiling face.
 const mantle=grid([10,14,20][d],[6,8,12][d],(u,v)=>{const y=.280+v*.137,w=.055*Math.pow(Math.sin(PI*v),.8),a=u*PI;return [Math.cos(a)*w,y,.235+Math.sin(a)*.026*Math.sin(PI*v)];});
 // u runs from right to left, v up: front-facing winding is reversed.
 const mi=mantle.index.array;for(let i=0;i<mi.length;i+=3){const q=mi[i+1];mi[i+1]=mi[i+2];mi[i+2]=q;}add('raised-squid-mantle',mantle,'gold');
 for(const side of [-1,1]){
  tube('crest-broad-scroll-'+side,[[side*.012,.260,.239],[side*.065,.262,.243],[side*.113,.286,.242],[side*.113,.312,.242],[side*.087,.322,.244],[side*.075,.303,.247],[side*.088,.293,.248]],.009,'gold');
  tube('crest-squid-tentacle-'+side,[[side*.013,.321,.263],[side*.027,.299,.258],[side*.023,.278,.251],[side*.041,.268,.244]],.006,'gold');
  const eye=new THREE.SphereGeometry(.008,[4,6,8][d],[3,4,6][d]);eye.scale(1,.65,.35);eye.translate(side*.022,.338,.259);add('crest-eye-inset-'+side,eye,'dark');
 }
 // Thick ink-colored chin tie follows adopted lower-face surface without editing it.
 const jaw=(a,e)=>{if(headSurface){const q=new THREE.Vector3();headSurface(a,e,.018,q);return [q.x,q.y-1.05,q.z+.002];}return [.178*Math.sin(a)*Math.cos(e),.164+.16*Math.sin(e),.014+.17*Math.cos(a)*Math.cos(e)];};
 const chin=jaw(0,-1.02);chin[1]-=.016;chin[2]+=.014;
 for(const side of [-1,1]){tube('thick-chin-cord-'+side,[[side*.174,.215,.095],jaw(side*1.15,-.40),jaw(side*.62,-.84),chin],.015,'ink');tube('bow-loop-'+side,[chin,[side*.058,chin[1]+.019,chin[2]+.018],[side*.075,chin[1]-.009,chin[2]+.024],[side*.044,chin[1]-.022,chin[2]+.026],chin],.014,'ink');tube('bow-tail-'+side,[chin,[side*.026,chin[1]-.038,chin[2]+.009],[side*.038,chin[1]-.060,chin[2]+.013]],.013,'ink');}
 const knot=new THREE.SphereGeometry(.018,[6,8,10][d],[4,5,6][d]);knot.scale(1,.8,.7);knot.translate(...chin);add('chin-bow-knot',knot,'ink');
 // One draw per material, independent of decorative part count.
 for(const [key,gs] of Object.entries(chunks)){const positions=[],normals=[],uv=[],indices=[];let base=0;for(const g of gs){positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);const index=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);indices.push(...index.map(i=>i+base));base+=g.attributes.position.count;g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,mats[key]);mesh.name=key;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
 root.userData.parts=parts;root.userData.fit=SAMURAI_HELMET_METADATA;root.userData.lod=lod;root.userData.setInkColor=color=>{mats.ink.color.set(color);inkUniform.value.set(color);};
 let disposed=false;root.userData.dispose=()=>{if(disposed)return;disposed=true;root.traverse(o=>o.geometry?.dispose());Object.values(mats).forEach(m=>m.dispose());root.removeFromParent();};
 return root;
}
