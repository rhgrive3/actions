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
 // Uneven low-frequency mottled cloth; no regular polka-dot rows.
 vec2 cellId=floor(q*vec2(15.,13.));vec2 cell=fract(q*vec2(15.,13.));
 float h=fract(sin(dot(cellId,vec2(127.1,311.7)))*43758.5453);
 float h2=fract(sin(dot(cellId+3.7,vec2(269.5,183.3)))*43758.5453);
 vec2 center=vec2(.25+.5*h,.25+.5*h2);float radius=.13+.20*h2;
 float dots=1.-smoothstep(radius,radius+.08,length((cell-center)*vec2(1.,.7+.6*h)));
 float fade=1.-smoothstep(.7,1.5,max(fwidth(q.x*15.),fwidth(q.y*13.)));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.17,.15),dots*(.50+.35*h)*fade);
 diffuseColor.rgb=mix(diffuseColor.rgb,samuraiInk,border);`);};
 mats.wing.customProgramCacheKey=()=> 'samurai-flat-wing-v2-mottle';
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
 const dome=(a,t,extra=0)=>{const e=fit.rim(a)+(PI/2-.002-fit.rim(a))*t,p=scalp(a,e,extra);p[1]+=.062*Math.sin(t*PI/2);return p;};
 add('low-black-kabuto-bowl',grid(N,R,(u,v)=>dome(u*PI*2,v)),'dark');
 add('gold-lower-circumference',grid(N,d===2?2:1,(u,v)=>scalp(u*PI*2,fit.rim(u*PI*2)+(v-.5)*.045,.004)),'gold');
 // Gold broad ribs on the bowl, and deliberately coarse major studs.
 for(let i=0;i<8;i++){const a=i*PI/4;add('bowl-gold-rib-'+i,grid(1,R,(u,v)=>dome(a+(u-.5)*.035,v,.002)),'gold');}
 for(let row=0;row<2;row++)for(let i=0;i<8;i++){const a=(i+.5)*PI/4,p=dome(a,.22+row*.36,.001);const g=new THREE.SphereGeometry(.022,[4,6,10][d],[3,4,6][d]);g.scale(1,.68,1);g.translate(...p);add('large-gold-stud-'+row+'-'+i,g,'gold');}
 const top=dome(0,1);const topG=new THREE.CylinderGeometry(.035,.042,.011,[8,12,24][d]);topG.translate(0,top[1]+.004,.014);add('crown-top-ring',topG,'gold');
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
  // Broad fukigaeshi: preserve inner/top attachment, extend outer/lower
  // panel and roll the lower lip rearward. All points stay ahead of shikoro.
  const wing=(u,v,front=0)=>{const pu=(u-.5)*2,pv=(v-.5)*2,ru=pu*Math.sqrt(1-.06*pv*pv)*.5,rv=pv*Math.sqrt(1-.06*pu*pu)*.5;const x=.263+ru*.135+rv*.100,y=.233-ru*.095+rv*.145,z=.185-.045*ru+.030*rv+.025*ru*ru-.045*Math.pow(Math.max(0,-rv)*2,2)*Math.max(0,Math.min(1,(x-.28)/.07))+.018*(1-v)+front;return [side*x,y,z];};
  const W=[5,8,12][d],H=[4,6,8][d];
  add('wing-black-outer-binding-'+side,grid(W,H,(u,v)=>wing(side>0?u:1-u,v,-.001)),'dark');
  add('wing-gold-frame-'+side,grid(W,H,(u,v)=>wing(side>0?.025+.95*u:.975-.95*u,.025+.95*v,.001)),'gold');
  add('wing-pattern-field-'+side,grid(W,H,(u,v)=>wing(side>0?.070+.86*u:.930-.86*u,.070+.86*v,.003)),'wing');
  add('wing-back-'+side,grid(W,H,(u,v)=>wing(side>0?1-u:u,v,-.010)),'dark');
  // Close the rolling lip with its actual ink-colored underside, rather than
  // allowing the unrelated neck-guard triangle to cross over the pale front.
  add('wing-rolled-lower-edge-'+side,grid(W,2,(u,t)=>wing(side>0?1-u:u,0,-.010*t)),'ink');
  // Turned concentric gold medallion, roughly half the plate width. Its
  // circular profile is aligned with the curved panel, not the camera plane.
  const c=new THREE.Vector3(...wing(.40,.69,.006));
  const dx=new THREE.Vector3(...wing(.401,.69)).sub(new THREE.Vector3(...wing(.399,.69))).normalize();
  const dy0=new THREE.Vector3(...wing(.40,.691)).sub(new THREE.Vector3(...wing(.40,.689))).normalize();
  const normal=dx.clone().cross(dy0).normalize().multiplyScalar(side);
  const tangentY=normal.clone().cross(dx).normalize();
  const profile=[[0,.016],[.016,.013],[.022,.005],[.025,.011],[.029,.011],[.032,.004],[.035,.009],[.039,.009],[.042,.003],[.045,.007],[.048,.007],[.051,.001]];
  const medallion=grid([16,24,40][d],profile.length-1,(u,v)=>{const i=Math.min(profile.length-2,Math.floor(v*(profile.length-1))),f=v*(profile.length-1)-i;const r=profile[i][0]*(1-f)+profile[i+1][0]*f,h=profile[i][1]*(1-f)+profile[i+1][1]*f,a=-u*PI*2;return c.clone().addScaledVector(dx,Math.cos(a)*r).addScaledVector(tangentY,Math.sin(a)*r).addScaledVector(normal,h).toArray();});
  add('wing-concentric-gold-medallion-'+side,medallion,'gold');

 }
 // Original stylized squid crest silhouette, broad surface rather than filigree.
 // Enlarged S3 comparison reveals a diamond backing under the squid relief.
 const backing=new THREE.Shape();backing.moveTo(0,.451);backing.lineTo(-.119,.330);backing.lineTo(0,.238);backing.lineTo(.119,.330);backing.closePath();
 const backingGeo=new THREE.ExtrudeGeometry(backing,{depth:.007,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1});backingGeo.translate(0,0,.211);add('crest-diamond-backing',backingGeo,'gold');
 const crestShape=new THREE.Shape();crestShape.moveTo(0,.430);
 crestShape.bezierCurveTo(-.027,.407,-.046,.377,-.052,.345);
 crestShape.bezierCurveTo(-.085,.351,-.121,.337,-.137,.310);
 crestShape.bezierCurveTo(-.141,.282,-.104,.257,-.057,.251);
 crestShape.quadraticCurveTo(0,.238,.057,.251);
 crestShape.bezierCurveTo(.104,.257,.141,.282,.137,.310);
 crestShape.bezierCurveTo(.121,.337,.085,.351,.052,.345);
 crestShape.bezierCurveTo(.046,.377,.027,.407,0,.430);crestShape.closePath();
 const crestBase=new THREE.ExtrudeGeometry(crestShape,{depth:.010,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:[3,4,6][d]});crestBase.scale(1.08,1,1);crestBase.translate(0,0,.219);add('broad-embossed-crest-base',crestBase,'gold');
 const tube=(name,points,r,k,closed=false)=>{const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal');add(name,new THREE.TubeGeometry(c,d===2?28:name.startsWith('bow-tail')?[3,4][d]:name.startsWith('crest-')?[6,8][d]:[8,12][d],r,[4,5,9][d],closed),k);};
 // Raised central squid mantle: broad convex volume catches the same native
 // light as the bowl studs. Its two eyes sit within a brow, not a smiling face.
 const mantle=grid([10,14,20][d],[6,8,12][d],(u,v)=>{const y=.288+v*.139,w=.068*Math.pow(1-v,.78),a=u*PI;return [Math.cos(a)*w,y,.239+(.023*Math.sin(a)+.006*Math.pow(Math.sin(a),12))*Math.sin(PI*(.14+.86*v))];});
 // u runs from right to left, v up: front-facing winding is reversed.
 const mi=mantle.index.array;for(let i=0;i<mi.length;i+=3){const q=mi[i+1];mi[i+1]=mi[i+2];mi[i+2]=q;}add('raised-squid-mantle',mantle,'gold');
 for(const side of [-1,1]){
  tube('crest-broad-scroll-'+side,[[side*.023,.262,.243],[side*.074,.263,.246],[side*.122,.287,.246],[side*.135,.330,.238],[side*.112,.311,.247],[side*.088,.300,.251],[side*.072,.313,.252],[side*.084,.324,.250]],.009,'gold');
  // Two curled tendrils beside the upper mantle, not random decorative dots.
  tube('crest-upper-curl-'+side,[[side*.057,.343,.242],[side*.077,.366,.240],[side*.066,.382,.239],[side*.050,.374,.243]],.0055,'gold');
  for(let strand=0;strand<2;strand++)tube('crest-squid-tentacle-'+side+'-'+strand,[[side*(.010+strand*.016),.320,.265],[side*(.016+strand*.016),.294,.260],[side*(.016+strand*.014),.267,.251],[side*(.030+strand*.028),.251,.242]],.0055,'gold');
  // Eye sockets are recessed gold-rimmed bowls, not painted black pupils.
  const eye=new THREE.SphereGeometry(.010,[6,8,12][d],[4,5,6][d]);eye.scale(1,.78,.34);eye.translate(side*.026,.333,.262);add('crest-eye-recess-'+side,eye,'dark');
  const brow=new THREE.TorusGeometry(.010,.003,[4,5,6][d],[8,12,16][d]);brow.scale(1,.78,1);brow.translate(side*.026,.333,.265);add('crest-eye-gold-rim-'+side,brow,'gold');
 }
 tube('crest-central-tentacle',[[0,.313,.268],[0,.284,.258],[0,.249,.242]],.005,'gold');
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
