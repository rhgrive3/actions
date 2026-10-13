import * as THREE from 'three';
import { createLevelMaterial } from '../../../src/world/levelMaterial.js';

export function nativeInkMaterial(paint, murals, texlib){
 const mat=createLevelMaterial(paint.texture,paint.size,murals,{paint,texlib});
 mat.transparent=true;mat.depthWrite=false;mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
 const compile=mat.onBeforeCompile;
 mat.onBeforeCompile=shader=>{
  compile(shader);
  // Ink shading uses dFdx/fwidth. Discarding at the start of a non-uniform
  // fragment quad makes those derivatives undefined at the ink edge. Evaluate
  // shading first, then suppress unpainted fragments before writing colour.
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','if (texture2D(uPaint, vPaintUv).a < 0.015) discard;\ndiffuseColor.a *= gInk;\n#include <opaque_fragment>');
 };
 mat.customProgramCacheKey=()=> 'native-ink-overlay-v3';return mat;
}

export function nativeInkGeometry(level,paint){
 const positions=[],normals=[],colors=[],uv=[],faceUv=[],faceData=[],faceFlags=[],tan=[],light=[];
 const p=new THREE.Vector3(),rel=new THREE.Vector3();
 for(const f of paint.paintFaces){
  const a=f.atlas;if(!a||!f.triangles)continue;
  for(const id of f.triangles)for(let k=0;k<3;k++){
   p.fromArray(level.data.triangles,id*9+k*3);rel.copy(p).sub(f.origin);const u=rel.dot(f.u),v=rel.dot(f.v);
   positions.push(p.x,p.y,p.z);normals.push(f.n.x,f.n.y,f.n.z);colors.push(1,1,1);
   uv.push((a.x+a.pad+u*a.ppm)/paint.size,(a.y+a.pad+v*a.ppm)/paint.size);
   faceUv.push(u,v);faceData.push(0,1,f.su,f.sv);faceFlags.push(f.wall?1:0,0,-1);tan.push(f.u.x,f.u.y,f.u.z);light.push(-1,-1);
  }
 }
 const g=new THREE.BufferGeometry();
 for(const [key,arr,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['paintUv',uv,2],['faceUv',faceUv,2],['faceData',faceData,4],['faceFlags',faceFlags,3],['faceTan',tan,3],['lightUv',light,2]])g.setAttribute(key,new THREE.Float32BufferAttribute(arr,size));
 g.computeBoundingSphere();return g;
}

// Display geometry keeps exporter positions/indices/UVs. Background is culled per
// source object. Only GPU texture representations have an explicit quality cap.
export function nativeDisplay(data,textures,quality){
 let liveTextures=textures;
 const {manifest:m,vertices,indices}=data,group=new THREE.Group(),geometries=[],materials=[],cache=new Map();group.name='native-source-display';
 for(const o of m.objects){
  if(!o.active)continue;const src=m.materials[o.material]||{},glass=o.glass||/_Water$/.test(o.material),alpha=src.hasAlpha||!!src.maps?.opacity;
  let mat=cache.get(o.material);
  if(!mat){
   mat=new THREE.MeshStandardMaterial({color:src.albedo?0xffffff:(src.tint||'#c3c3b8'),map:textures.get(src.albedo)||null,
    side:THREE.DoubleSide,roughness:glass?.24:.78,metalness:glass?.1:0,transparent:glass,opacity:glass?.48:1,depthWrite:!glass,alphaTest:alpha?.3:0});
   mat.alphaMap=textures.get(src.maps?.opacity)||null;
   if(quality==='high'){mat.normalMap=textures.get(src.maps?.normal)||null;mat.normalScale.set(.28,.28);mat.roughnessMap=textures.get(src.maps?.roughness)||null;mat.emissiveMap=textures.get(src.maps?.emissive)||null;if(mat.emissiveMap){mat.emissive.set(0xffffff);mat.emissiveIntensity=.13;}}
   const opacity=src.channels?.opacity||'g',rough=src.channels?.roughness||'g';
   mat.onBeforeCompile=shader=>{
    if(mat.alphaMap&&opacity==='r')shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',THREE.ShaderChunk.alphamap_fragment.replace('.g;','.r;'));
    if(mat.roughnessMap&&rough==='r')shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment.replace('texelRoughness.g','max(texelRoughness.r, 0.55)'));
   };
   mat.customProgramCacheKey=()=>`native-channels-${opacity}-${rough}`;mat.name=o.material;cache.set(o.material,mat);materials.push(mat);
  }
  const vb=new Float32Array(vertices.buffer,vertices.byteOffset+o.vo*32,o.vc*8),ib=new Uint32Array(indices.buffer,indices.byteOffset+o.io*4,o.ic),inter=new THREE.InterleavedBuffer(vb,8),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));g.setAttribute('normal',new THREE.InterleavedBufferAttribute(inter,3,3));g.setAttribute('uv',new THREE.InterleavedBufferAttribute(inter,2,6));g.setIndex(new THREE.BufferAttribute(ib,1));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,mat);mesh.name=o.name;mesh.castShadow=o.collidable&&!glass&&!alpha;mesh.receiveShadow=!glass;mesh.userData.nativeObject=o;group.add(mesh);geometries.push(g);
 }
 return {group,updateTextures(next,quality){
  for(const [name,mat] of cache){const src=m.materials[name]||{};mat.map=next.get(src.albedo)||null;mat.alphaMap=next.get(src.maps?.opacity)||null;
   mat.normalMap=quality==='high'?(next.get(src.maps?.normal)||null):null;mat.normalScale.set(.28,.28);
   mat.roughnessMap=quality==='high'?(next.get(src.maps?.roughness)||null):null;mat.emissiveMap=quality==='high'?(next.get(src.maps?.emissive)||null):null;
   mat.emissive.set(mat.emissiveMap?0xffffff:0x000000);mat.emissiveIntensity=.13;mat.needsUpdate=true;
  }
  for(const t of liveTextures.values()){t.image?.close?.();t.dispose();}liveTextures.clear();liveTextures=next;
 },dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());for(const t of liveTextures.values()){t.image?.close?.();t.dispose();}liveTextures.clear();}};
}
