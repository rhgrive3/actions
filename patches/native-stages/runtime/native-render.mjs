import * as THREE from 'three';
import {consumeNativeWork,consumeNativeWorkAsync} from './native-work.mjs';
import { createLevelMaterial } from '../../../src/world/levelMaterial.js';
import { enableNativePaintDetail } from './native-paint-detail.mjs';

export function specializeNativeSourceAmbient(shader,roughSpecular=false,facingCones=false){
 const height=shader.envMapCubeUVHeight;
 // Diffuse sky lighting is broad, but a normalScale bound cannot prove the
 // sampled normal's Z component. Preserve pixel-frequency lighting for every
 // normal map; specialize only source materials with no normal map.
 if(!shader.envMap||shader.normalMap||!Number.isFinite(height)||height<=0)return false;
 const common='#include <common>',normal='#include <normal_vertex>',maps='#include <lights_fragment_maps>';
 if(!shader.vertexShader?.includes(common)||!shader.vertexShader.includes(normal)||!shader.fragmentShader?.includes(common)||!shader.fragmentShader.includes(maps))return false;
 if((roughSpecular||facingCones)&&!shader.vertexShader.includes('#include <project_vertex>'))return false;
 const mip=Math.log2(height)-2,width=3*Math.max(2**mip,7*16);
 if(!Number.isInteger(mip))return false;
 const varying='varying vec3 vNativeIrradianceFront,vNativeIrradianceBack;\n'+
  (roughSpecular?'varying vec3 vNativeRadianceFront,vNativeRadianceBack;\n':'');
 shader.vertexShader=shader.vertexShader.replace(common,common+'\n'+varying+(facingCones?'attribute float nativeNormalCone;\n':'')+
  '#define ENVMAP_TYPE_CUBE_UV\n#define CUBEUV_TEXEL_WIDTH '+(1/width)+'\n#define CUBEUV_TEXEL_HEIGHT '+(1/height)+'\n#define CUBEUV_MAX_MIP '+mip.toFixed(1)+'\n'+
  '#include <envmap_common_pars_fragment>\n#include <cube_uv_reflection_fragment>\n#include <envmap_physical_pars_fragment>\n'+(roughSpecular?'uniform float roughness;\n':''))
  .replace(normal,normal+(facingCones?'':'\nvNativeIrradianceFront=getIBLIrradiance(normalize(transformedNormal));\nvNativeIrradianceBack=getIBLIrradiance(-normalize(transformedNormal));\n'));
 if(facingCones)shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
  '#include <project_vertex>\nvec3 nativeView=isOrthographic?vec3(0.0,0.0,1.0):normalize(-mvPosition.xyz);\n'+
  // The normal cone covers every triangle sharing this vertex. Outside that
  // cone's silhouette band, all those primitives have the same facing, so
  // the opposite hemisphere can never be consumed by the fragment shader.
  // Transform the eye into object space with the transposed normal matrix;
  // this also preserves the proof under nonuniform parent scaling.
  'float nativeFacing=clamp(dot(normalize(objectNormal),normalize(nativeView*normalMatrix)),-1.0,1.0);\n'+
  'bool nativeConeSafe=projectionMatrix[0][0]>0.0&&projectionMatrix[1][1]>0.0&&projectionMatrix[0][1]==0.0&&projectionMatrix[1][0]==0.0&&determinant(mat3(viewMatrix))>0.0;\n'+
  // Transparent DoubleSide materials also render with BackSide/FLIP_SIDED.
  // Three reverses both the transformed normal and front-face convention then.
  '#ifdef FLIP_SIDED\nnativeFacing=-nativeFacing;\n#endif\n'+
  'bool nativeSingle=nativeConeSafe&&abs(nativeFacing)>nativeNormalCone;\n'+
  'vec3 nativeNormal=normalize(transformedNormal)*(nativeSingle&&nativeFacing<0.0?-1.0:1.0);\n'+
  'vNativeIrradianceFront=getIBLIrradiance(nativeNormal);vNativeIrradianceBack=vNativeIrradianceFront;\n'+
  (roughSpecular?'vNativeRadianceFront=getIBLRadiance(nativeView,nativeNormal,roughness);vNativeRadianceBack=vNativeRadianceFront;\n':'')+
  'if(!nativeSingle){vNativeIrradianceBack=getIBLIrradiance(-normalize(transformedNormal));\n'+
  (roughSpecular?'vNativeRadianceBack=getIBLRadiance(nativeView,-normalize(transformedNormal),roughness);\n':'')+'}\n');
 else if(roughSpecular)shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
  '#include <project_vertex>\nvec3 nativeView=isOrthographic?vec3(0.0,0.0,1.0):normalize(-mvPosition.xyz);\n'+
  'vNativeRadianceFront=getIBLRadiance(nativeView,normalize(transformedNormal),roughness);\n'+
  'vNativeRadianceBack=getIBLRadiance(nativeView,-normalize(transformedNormal),roughness);\n');
 let lighting=THREE.ShaderChunk.lights_fragment_maps.replace('getIBLIrradiance( geometryNormal )','(gl_FrontFacing?vNativeIrradianceFront:vNativeIrradianceBack)');
 if(roughSpecular)lighting=lighting.replace('getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )','(gl_FrontFacing?vNativeRadianceFront:vNativeRadianceBack)');
 shader.fragmentShader=shader.fragmentShader.replace(common,common+'\n'+varying)
  .replace(maps,lighting);
 return true;
}

// Conservative per-vertex cone around its authored normal. A byte rounded
// upward includes every incident geometric normal plus a numerical margin.
// Inverted normals, thin/invalid triangles and unused vertices keep both
// hemispheres. Source vertices, normals, UVs and triangle order stay intact.
export function nativeNormalCones(vertices,indices){return consumeNativeWork(nativeNormalConeSteps(vertices,indices));}
function* nativeNormalConeSteps(vertices,indices){
 const count=vertices.length/8;if(!Number.isSafeInteger(count)||indices.length%3)return null;
 const bounds=new Float32Array(count),seen=new Uint8Array(count);
 for(let t=0;t<indices.length;t+=3){
  if(t&&t%768===0)yield;
  const a=indices[t],b=indices[t+1],c=indices[t+2];if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(c)||a<0||b<0||c<0||a>=count||b>=count||c>=count)return null;
  const ai=a*8,bi=b*8,ci=c*8,ux=vertices[bi]-vertices[ai],uy=vertices[bi+1]-vertices[ai+1],uz=vertices[bi+2]-vertices[ai+2],
   vx=vertices[ci]-vertices[ai],vy=vertices[ci+1]-vertices[ai+1],vz=vertices[ci+2]-vertices[ai+2],x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,cross=x*x+y*y+z*z;
  if(cross===0)continue;
  const thin=!Number.isFinite(cross)||cross<=1e-10*(ux*ux+uy*uy+uz*uz)*(vx*vx+vy*vy+vz*vz);
  for(let k=0;k<3;k++){
   const index=indices[t+k],i=index*8,nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5],length=nx*nx+ny*ny+nz*nz,dot=x*nx+y*ny+z*nz;
   const sine=thin||!(length>0)||!Number.isFinite(length)||!(dot>0)?1:Math.sqrt(Math.max(0,1-Math.min(1,dot*dot/(cross*length))));
   bounds[index]=Math.max(bounds[index],sine);seen[index]=1;
  }
 }
 const bytes=new Uint8Array(count);for(let i=0;i<count;i++){bytes[i]=seen[i]?Math.min(255,Math.ceil((bounds[i]+.008)*255)):255;if(i&&i%1024===0)yield;}
 return new THREE.BufferAttribute(bytes,1,true);
}

export function specializeNativeInkSurface(fragment){
 const originalStart=fragment.indexOf('  float big = fbm(');
 const start=originalStart>=0?originalStart:fragment.indexOf('  float big, fine;');
 const end=fragment.indexOf('  // ---- wet ink',start);
 const split=fragment.indexOf('    float halo = smoothstep(',end);
 const signature='TexlibSample texlibSample(sampler2DArray tA, sampler2DArray tN, sampler2DArray tO, vec2 uv, float layer, int mode, int sym) {';
 const gradient='  vec2 gx = dFdx(uv), gy = dFdy(uv);';
 if(start<0||end<start||split<end||fragment.split(signature).length!==2||fragment.split(gradient).length!==2)return fragment;
 const surface=fragment.slice(start,end),setupStart=surface.indexOf('#ifdef USE_TEXLIB\n  {'),setupEnd=surface.indexOf('    TexlibSample ts = texlibSample(');
 if(setupStart<0||setupEnd<setupStart)return fragment;
 const uvSetup=surface.slice(setupStart,setupEnd)+
  '    gNativeBaseDx=dFdx(tuv);gNativeBaseDy=dFdy(tuv);\n  }\n#endif\n';
 // Evaluate every texture coordinate derivative before the paint-dependent
 // branch; textureGrad inside texlibSample can then run on a partial quad.
 const reordered=fragment.slice(0,start)+uvSetup+fragment.slice(end,split)+
  '    if(gInk<1.0||gInkKeep>0.0||gTexKeep>0.0){\n'+surface+'    }\n'+fragment.slice(split);
 return reordered.replace(signature,'vec2 gNativeBaseDx=vec2(0.0),gNativeBaseDy=vec2(0.0);\n'+signature)
  .replace(gradient,'  vec2 gx = gNativeBaseDx, gy = gNativeBaseDy;');
}

export function nativeInkMaterial(paint, murals, texlib){
 const detail=enableNativePaintDetail(paint);
 const mat=createLevelMaterial(paint.texture,paint.size,murals,{paint,texlib,nativeInkOverlay:true});
 if(detail)mat.userData.nativePaintDetail=detail;
 mat.transparent=true;mat.depthWrite=false;mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
 const compile=mat.onBeforeCompile;
 mat.onBeforeCompile=shader=>{
  compile(shader);
  // These channels are constants in nativeInkGeometry's vertex shader, but
  // varyings hide that fact from the fragment compiler. Expose the same exact
  // values so it can remove procedural stage patterns and mural branches
  // that the native overlay can never use. Size and wall orientation remain
  // interpolated as before; paint, lighting and derivative order are intact.
  shader.fragmentShader=shader.fragmentShader
   .replace(/\bvFaceData\.x\b/g,'0.0').replace(/\bvFaceData\.y\b/g,'1.0')
   .replace(/\bvFaceFlags\.y\b/g,'0.0').replace(/\bvFaceFlags\.z\b/g,'(-1.0)');
  shader.fragmentShader=specializeNativeInkSurface(shader.fragmentShader);
  // Ink shading uses dFdx/fwidth. Discarding at the start of a non-uniform
  // fragment quad makes those derivatives undefined at the ink edge. Evaluate
  // shading first, then suppress unpainted fragments before writing colour.
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','if (texture2D(uPaint, vPaintUv).a < 0.015) discard;\ndiffuseColor.a *= gInk;\n#include <opaque_fragment>');
  // This overlay never writes depth. A zero-alpha fragment preserves the
  // destination colour/alpha just like discard, including alpha-to-coverage.
  // Avoid shader kills so early stencil rejection can skip physical shading;
  // reflection targets without stencil keep the same transparent result.
  shader.fragmentShader=shader.fragmentShader.replace(/\bdiscard\s*;/g,'diffuseColor.a = 0.0;');
  if(detail){Object.assign(shader.uniforms,detail.uniforms);shader.fragmentShader=detail.decorate(shader.fragmentShader);}
 };
 mat.defaultAttributeValues={...mat.defaultAttributeValues,color:[1,1,1],lightUv:[-1,-1]};
 mat.customProgramCacheKey=()=> 'native-ink-overlay-v9'+(detail?'-detail':'');return mat;
}

export function nativeInkGeometry(level,paint){return consumeNativeWork(nativeInkGeometrySteps(level,paint));}
nativeInkGeometry.create=(level,paint,options)=>consumeNativeWorkAsync(nativeInkGeometrySteps(level,paint),options);
function* nativeInkGeometrySteps(level,paint){
  // The source triangle/paint order is fixed. Allocate final GPU attributes once:
  // temporary JS number arrays used to double peak memory on large OBJ stages.
  const specs=[['position',3],['normal',3],['paintUv',2],['faceUv',2],
    ['nativeFaceSize',2],['nativeWall',1],['faceTan',3]];
  let count=0;
  for(const f of paint.paintFaces)if(f.atlas&&f.triangles)count+=f.triangles.length*3;
  const arrays=Object.fromEntries(specs.map(([name,size])=>[name,name==='nativeWall'?new Uint8Array(count*size):new Float32Array(count*size)]));
  const {position,normal,paintUv,faceUv,nativeFaceSize,nativeWall,faceTan}=arrays;
  const triangles=level.data.triangles;
  let vertex=0;
  for(const f of paint.paintFaces){
    const a=f.atlas;if(!a||!f.triangles)continue;
    for(const id of f.triangles)for(let k=0;k<3;k++){
      const at=id*9+k*3,x=triangles[at],y=triangles[at+1],z=triangles[at+2],rx=x-f.origin.x,ry=y-f.origin.y,rz=z-f.origin.z;
      const u=rx*f.u.x+ry*f.u.y+rz*f.u.z,v=rx*f.v.x+ry*f.v.y+rz*f.v.z,i2=vertex*2,i3=vertex*3;
      position[i3]=x;position[i3+1]=y;position[i3+2]=z;
      normal[i3]=f.n.x;normal[i3+1]=f.n.y;normal[i3+2]=f.n.z;
      paintUv[i2]=(a.x+a.pad+u*a.ppm)/paint.size;
      paintUv[i2+1]=(a.y+a.pad+v*a.ppm)/paint.size;
      faceUv[i2]=u;faceUv[i2+1]=v;
      nativeFaceSize[i2]=f.su;nativeFaceSize[i2+1]=f.sv;
      nativeWall[vertex]=f.wall?1:0;
      faceTan[i3]=f.u.x;faceTan[i3+1]=f.u.y;faceTan[i3+2]=f.u.z;
      vertex++;
      if(vertex%768===0)yield;
    }
  }
  const g=new THREE.BufferGeometry();
  // BufferAttribute accepts Float32Array without making the second copy that
  // Float32BufferAttribute's constructor would allocate.
  for(const [name,size] of specs)g.setAttribute(name,new THREE.BufferAttribute(arrays[name],size));
  let completed=false;
  try{yield* nativeGeometrySphereSteps(g);completed=true;return g;}
  finally{if(!completed)g.dispose();}
}

// Same Float32 positions, Box3 centre and distance arithmetic as Three's
// BufferGeometry.computeBoundingSphere, split at bounded vertex batches.
function* nativeGeometrySphereSteps(g){
 const position=g.getAttribute('position'),box=new THREE.Box3(),point=new THREE.Vector3();
 for(let i=0;i<position.count;i++){box.expandByPoint(point.fromBufferAttribute(position,i));if(i&&i%1024===0)yield;}
 const sphere=new THREE.Sphere();box.getCenter(sphere.center);let radiusSq=0;
 for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i);radiusSq=Math.max(radiusSq,sphere.center.distanceToSquared(point));if(i&&i%1024===0)yield;}
 sphere.radius=Math.sqrt(radiusSq);g.boundingSphere=sphere;
 if(!Number.isFinite(sphere.radius))g.computeBoundingSphere();
}
function objectBoundingSphere(g,bounds,prepared){return consumeNativeWork(objectBoundingSphereSteps(g,bounds,prepared));}
function* objectBoundingSphereSteps(g,bounds,prepared){
 if(!Array.isArray(bounds)||bounds.length!==2||!bounds.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite))||bounds[0].some((x,i)=>x>bounds[1][i])){yield* nativeGeometrySphereSteps(g);return;}
 const box=g.boundingBox=new THREE.Box3(new THREE.Vector3(...bounds[0]),new THREE.Vector3(...bounds[1]));
 const sphere=g.boundingSphere=new THREE.Sphere();box.getCenter(sphere.center);
 if(prepared&&Number.isFinite(prepared.radius)&&prepared.radius>=0&&Array.isArray(prepared.center)&&prepared.center.length===3&&prepared.center.every((value,i)=>value===sphere.center.getComponent(i))){sphere.radius=prepared.radius;return;}
 const position=g.getAttribute('position'),point=new THREE.Vector3();let radiusSq=0;
 for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i);radiusSq=Math.max(radiusSq,sphere.center.distanceToSquared(point));if(i&&i%1024===0)yield;}
 sphere.radius=Math.sqrt(radiusSq);
 if(!Number.isFinite(sphere.radius))g.computeBoundingSphere();
}

function releaseArray(){this.array=null;}

/** Cull whole source triangles inside large, baked opaque objects. One mesh
 * still submits one draw in the original index order. No positions, normals,
 * UVs, materials or collision data change. Tile bounds include every corner
 * of boundary-crossing triangles, rather than just their centroid. */
export function installNativeDisplayCulling(mesh,tileSize=16,minTriangles=512){return consumeNativeWork(nativeDisplayCullingSteps(mesh,tileSize,minTriangles));}
function* nativeDisplayCullingSteps(mesh,tileSize=16,minTriangles=512){
 const g=mesh.geometry,p=g.getAttribute('position'),source=g.index?.array;
 if(!source||source.length<minTriangles*3||!Number.isFinite(tileSize)||tileSize<=0)return null;
 const tiles=[],byKey=new Map(),ids=new Uint32Array(source.length/3),point=new THREE.Vector3();
 for(let t=0;t<ids.length;t++){
  if(t&&t%256===0)yield;
  const at=t*3,a=source[at],b=source[at+1],c=source[at+2];
  const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,y=(p.getY(a)+p.getY(b)+p.getY(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
  const key=Math.floor(x/tileSize)+','+Math.floor(y/tileSize)+','+Math.floor(z/tileSize);
  let id=byKey.get(key);
  if(id===undefined){id=tiles.length;byKey.set(key,id);tiles.push({box:new THREE.Box3()});}
  ids[t]=id;
  const box=tiles[id].box;
  box.expandByPoint(point.fromBufferAttribute(p,a));box.expandByPoint(point.fromBufferAttribute(p,b));box.expandByPoint(point.fromBufferAttribute(p,c));
 }
 // Small/local objects already have the renderer's per-object culling.
 if(tiles.length<2)return null;
 for(const tile of tiles){tile.sphere=tile.box.getBoundingSphere(new THREE.Sphere());tile.sphere.radius+=Math.max(1,tile.sphere.radius)*1e-7;}
 const tileOf=tiles.length<=65536?new Uint16Array(ids):ids;
 // Source exporters usually keep neighbouring triangles together. Store
 // their tile runs once so a camera switch can copy contiguous source spans
 // instead of comparing and assigning every index individually. Highly
 // interleaved objects retain the scalar path to avoid many tiny copies.
 const runTiles=[],runStarts=[],runEnds=[];
 for(let start=0;start<tileOf.length;){
  const tile=tileOf[start];let end=start+1;
  while(end<tileOf.length&&tileOf[end]===tile)end++;
  runTiles.push(tile);runStarts.push(start*3);runEnds.push(end*3);start=end;
 }
 const runs=runTiles.length<=tileOf.length/4?{
  tiles:tileOf.constructor.from(runTiles),starts:Uint32Array.from(runStarts),ends:Uint32Array.from(runEnds)
 }:null;
 const index=new THREE.BufferAttribute(source.slice(),1).setUsage(THREE.DynamicDrawUsage);
 g.setIndex(index);
 const view=new THREE.Matrix4(),frustum=new THREE.Frustum(),last=new Float64Array(16),visible=new Uint8Array(tiles.length).fill(1);
 const upload={start:0,count:0};
 let valid=false,coordinateSystem,reversedDepth,disposed=false;
 const select=camera=>{
  if(disposed)return;
  view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const e=view.elements;
  let same=valid&&coordinateSystem===camera.coordinateSystem&&reversedDepth===camera.reversedDepth;
  if(same)for(let i=0;i<16;i++)if(!Object.is(e[i],last[i])){same=false;break;}
  if(same)return;
  last.set(e);valid=true;coordinateSystem=camera.coordinateSystem;reversedDepth=camera.reversedDepth;
  frustum.setFromProjectionMatrix(view,coordinateSystem,reversedDepth);
  let changed=false;
  for(let i=0;i<tiles.length;i++){
   const on=frustum.intersectsSphere(tiles[i].sphere)?1:0;
   if(on!==visible[i])changed=true;
   visible[i]=on;
  }
  if(!changed)return;
  const target=index.array;
  let count=0,dirtyStart=Infinity;
  if(runs){
   // Different tiles can still occupy one contiguous visible source span.
   // Merge those neighbouring runs before copying: the index order and
   // unchanged-prefix comparison stay identical, without a subarray per tile.
   let spanStart=-1,spanEnd=0;
   for(let r=0;r<=runs.tiles.length;r++){
    if(r<runs.tiles.length&&visible[runs.tiles[r]]){
     if(spanStart<0)spanStart=runs.starts[r];
     spanEnd=runs.ends[r];continue;
    }
    if(spanStart<0)continue;
    let start=spanStart,end=spanEnd;spanStart=-1;
    // Only the unchanged prefix can narrow the pending upload. Once a value
    // differs the full remaining selected tail is uploaded either way.
    if(dirtyStart===Infinity){
     while(start<end&&target[count]===source[start]){start++;count++;}
     if(start<end)dirtyStart=count;
    }
    if(start<end){target.set(source.subarray(start,end),count);count+=end-start;}
   }
  }else{
   for(let t=0;t<tileOf.length;t++){
    if(!visible[tileOf[t]])continue;
    const at=t*3;
    for(let k=0;k<3;k++){
     const value=source[at+k];
     if(target[count]!==value){dirtyStart=Math.min(dirtyStart,count);target[count]=value;}
     count++;
    }
   }
  }
  g.setDrawRange(0,count);
  if(dirtyStart<count){
   // A later camera (e.g. a water reflection) may change the selection before
   // an upload. Preserve all pending writes until WebGL consumes the buffer.
   let start=dirtyStart,end=count;
   for(const range of index.updateRanges){start=Math.min(start,range.start);end=Math.max(end,range.start+range.count);}
   upload.start=start;upload.count=end-start;
   index.clearUpdateRanges();index.updateRanges.push(upload);index.needsUpdate=true;
  }
 };
 const beforeRender=mesh.onBeforeRender,beforeShadow=mesh.onBeforeShadow;
 mesh.onBeforeRender=function(r,s,c,geometry,material,group){select(c);return beforeRender.call(this,r,s,c,geometry,material,group);};
 mesh.onBeforeShadow=function(r,o,c,shadowCamera,geometry,material,group){select(shadowCamera);return beforeShadow.call(this,r,o,c,shadowCamera,geometry,material,group);};
 return {tiles:tiles.length,select,dispose(){disposed=true;mesh.onBeforeRender=beforeRender;mesh.onBeforeShadow=beforeShadow;}};
}

// Display geometry keeps exporter positions/indices/UVs. Background is culled per
// source object. Only GPU texture representations have an explicit quality cap.
// WebGL2 reserves the largest index of each type for primitive restart. Match
// Three's arrayNeedsUint32 boundary, using actual indices rather than metadata
// vertex counts. Geometry order and every numeric index remain unchanged.
export function compactNativeIndices(indices){
 for(let i=indices.length-1;i>=0;i--)if(indices[i]>=65535)return indices;
 return new Uint16Array(indices);
}

export function nativeDisplay(data,textures,quality){return consumeNativeWork(nativeDisplaySteps(data,textures,quality));}
nativeDisplay.create=(data,textures,quality,options)=>consumeNativeWorkAsync(nativeDisplaySteps(data,textures,quality),options);
function* nativeDisplaySteps(data,textures,quality){
 let liveTextures=textures;
 const {manifest:m,vertices,indices}=data,group=new THREE.Group(),geometries=[],materials=[],cullers=[],cache=new Map();group.name='native-source-display';
 let completed=false;
 try{
 for(const o of m.objects){
  if(!o.active)continue;const src=m.materials[o.material]||{},glass=o.glass||/_Water$/.test(o.material),alpha=src.hasAlpha||!!src.maps?.opacity;
  let mat=cache.get(o.material)?.mat;
  if(!mat){
   mat=new THREE.MeshStandardMaterial({color:src.albedo?0xffffff:(src.tint||'#c3c3b8'),map:textures.get(src.albedo)||null,
    side:THREE.DoubleSide,roughness:glass?.24:.78,metalness:glass?.1:0,transparent:glass,opacity:glass?.48:1,depthWrite:!glass,alphaTest:alpha?.3:0});
   mat.alphaMap=textures.get(src.maps?.opacity)||null;
   if(quality==='high'){mat.normalMap=textures.get(src.maps?.normal)||null;mat.normalScale.set(.28,.28);mat.roughnessMap=textures.get(src.maps?.roughness)||null;mat.emissiveMap=textures.get(src.maps?.emissive)||null;if(mat.emissiveMap){mat.emissive.set(0xffffff);mat.emissiveIntensity=.13;}}
   // Carry inferred channels through profile updates: they affect the shader program.
   const channels={opacity:src.channels?.opacity||'g',rough:src.channels?.roughness||'g'};
   // Matte source surfaces can interpolate the broad sky lobe too. Ink and
   // glass retain their view-dependent reflections at full pixel frequency.
   const roughSpecular=()=>mat.roughness>=.7&&!mat.roughnessMap&&mat.metalness===0;
   const syncChannelProgram=()=>{
     mat.onBeforeCompile=shader=>{
      specializeNativeSourceAmbient(shader,roughSpecular(),true);
      if(mat.alphaMap&&channels.opacity==='r')shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',THREE.ShaderChunk.alphamap_fragment.replace('.g;','.r;'));
      if(mat.roughnessMap&&channels.rough==='r')shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment.replace('texelRoughness.g','max(texelRoughness.r, 0.55)'));
     };
     mat.customProgramCacheKey=()=>`native-ambient-v5-${roughSpecular()?1:0}-${mat.alphaMap&&channels.opacity==='r'?'r':'g'}-${mat.roughnessMap&&channels.rough==='r'?'r':'g'}`;
   };
   syncChannelProgram();
   mat.defaultAttributeValues={...mat.defaultAttributeValues,nativeNormalCone:[1]};
   mat.name=o.material;cache.set(o.material,{mat,channels,syncChannelProgram});materials.push(mat);
  }
  const vb=new Float32Array(vertices.buffer,vertices.byteOffset+o.vo*32,o.vc*8),ib=new Uint32Array(indices.buffer,indices.byteOffset+o.io*4,o.ic),inter=new THREE.InterleavedBuffer(vb,8),g=new THREE.BufferGeometry();
  geometries.push(g);
  const cones=yield* nativeNormalConeSteps(vb,ib);if(cones){g.setAttribute('nativeNormalCone',cones);cones.onUpload(releaseArray);}
  g.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));g.setAttribute('normal',new THREE.InterleavedBufferAttribute(inter,3,3));g.setAttribute('uv',new THREE.InterleavedBufferAttribute(inter,2,6));g.setIndex(new THREE.BufferAttribute(compactNativeIndices(ib),1));yield* objectBoundingSphereSteps(g,m.sourceMode==='browser-direct'?o.bounds:null,m.sourceMode==='browser-direct'?o.boundingSphere:null);
  // Bounds are final above and nothing raycasts the display: once the GPU
  // holds the vertices/indices, drop these CPU views (Three's disposeArray).
  inter.onUpload(releaseArray);
  const mesh=new THREE.Mesh(g,mat);
  // Exporter positions are already baked; these per-object local transforms
  // stay identity. Skip hundreds of unchanged matrix compositions per frame,
  // while retaining matrixWorld updates for transforms of the parent group.
  mesh.matrixAutoUpdate=false;
  mesh.name=o.name;
  // Keep silhouette and contact shadows: a blanket 0.75m exclusion
  // erased visible railings, poles and gameplay landmarks.
  // Limit omission to genuinely tiny (< 2.5cm radius) native objects.
  const sphere=g.boundingSphere;
  const subTexelCaster=!!sphere&&Number.isFinite(sphere.radius)&&sphere.radius<0.025;
  mesh.castShadow=o.collidable&&!glass&&!alpha&&!subTexelCaster;
  mesh.receiveShadow=!glass;
  const culler=!glass&&!alpha?yield* nativeDisplayCullingSteps(mesh):null;
  if(culler)cullers.push(culler);else g.index.onUpload(releaseArray);
  if(glass||alpha){
    // GTAO normal/depth override would turn transparent materials opaque.
    // Always restore the exact source draw range for colour rendering.
    const drawStart=g.drawRange.start,drawCount=g.drawRange.count;
    mesh.onBeforeRender=(_renderer,scene)=>{
      if(scene?.overrideMaterial)g.setDrawRange(0,0);
      else if(g.drawRange.start!==drawStart||g.drawRange.count!==drawCount)g.setDrawRange(drawStart,drawCount);
    };
  }
  mesh.userData.nativeObject=o;group.add(mesh);yield;
 }
 completed=true;
 return {group,currentTextures(){return liveTextures;},updateTextures(next,quality){
  for(const [name,{mat,channels,syncChannelProgram}] of cache){const src=m.materials[name]||{},map=next.get(src.albedo)||null,alpha=next.get(src.maps?.opacity)||null,
   normal=quality==='high'?(next.get(src.maps?.normal)||null):null,rough=quality==='high'?(next.get(src.maps?.roughness)||null):null,emissive=quality==='high'?(next.get(src.maps?.emissive)||null):null;
   const changed=mat.map!==map||mat.alphaMap!==alpha||mat.normalMap!==normal||mat.roughnessMap!==rough||mat.emissiveMap!==emissive;
   const nextOpacity=src.channels?.opacity||'g',nextRough=src.channels?.roughness||'g';
   const channelsChanged=channels.opacity!==nextOpacity||channels.rough!==nextRough;
   channels.opacity=nextOpacity;channels.rough=nextRough;
   if(channelsChanged)syncChannelProgram();
   mat.map=map;mat.alphaMap=alpha;mat.normalMap=normal;mat.normalScale.set(.28,.28);mat.roughnessMap=rough;mat.emissiveMap=emissive;
   mat.emissive.set(emissive?0xffffff:0x000000);mat.emissiveIntensity=.13;
   if(changed||channelsChanged)mat.needsUpdate=true;
  }
  if(liveTextures!==next){
   const retained=new Set(next.values());
   for(const t of new Set(liveTextures.values()))if(!retained.has(t)){t.image?.close?.();t.dispose();}
   liveTextures.clear();liveTextures=next;
  }
  next._nativeBorrowed?.clear(); // the new displayed profile now owns all entries
 },dispose(){group.removeFromParent();cullers.forEach(c=>c.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());for(const t of new Set(liveTextures.values())){t.image?.close?.();t.dispose();}liveTextures.clear();}};
 }finally{
  if(!completed){group.removeFromParent();cullers.forEach(c=>c.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 }
}
