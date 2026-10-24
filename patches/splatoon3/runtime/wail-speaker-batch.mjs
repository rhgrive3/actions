// Each actor keeps its six independently posed logical devices. Only opaque,
// compatible finish meshes share draws; any divergent mesh returns to its
// original parent and native rendering without changing its material/flags.
const scalarMaterialKeys = ['transparent','opacity','alphaTest','depthTest','depthWrite','side','colorWrite','blending','blendSrc','blendDst','blendEquation','blendSrcAlpha','blendDstAlpha','blendEquationAlpha','premultipliedAlpha','dithering','toneMapped','visible','roughness','metalness','emissiveIntensity','flatShading','vertexColors','wireframe','fog','polygonOffset','polygonOffsetFactor','polygonOffsetUnits'];
const textureMaterialKeys = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','aoMap','lightMap','bumpMap','displacementMap','envMap'];
function sameMaterial(a,b,version) {
  if (!a || !b || a.transparent || b.transparent || a.version!==version || b.version!==version || a.type!==b.type) return false;
  if (a.onBeforeCompile!==b.onBeforeCompile || a.customProgramCacheKey!==b.customProgramCacheKey) return false;
  if(a.defines!==b.defines){
    if(!a.defines||!b.defines)return false;
    for(const key in a.defines)if(!Object.is(a.defines[key],b.defines[key]))return false;
    for(const key in b.defines)if(!(key in a.defines))return false;
  }
  for(const key in a.userData)return false;for(const key in b.userData)return false;
  if (!a.color?.equals(b.color) || !a.emissive?.equals(b.emissive)) return false;
  for (const key of scalarMaterialKeys) if (!Object.is(a[key],b[key])) return false;
  for (const key of textureMaterialKeys) if (a[key]!==b[key]) return false;
  return true;
}
function visibleFrom(group,root) {
  for(let o=group;o;o=o.parent){if(!o.visible)return false;if(o===root)return true;}
  return false;
}
export function createWailSpeakerBatch(THREE,scene,devices) {
  const root=new THREE.Group();root.name='killer-wail-speaker-batches';
  const parts=[];
  for(let i=0;i<devices.length;i++) {
    const meshes=[];devices[i].model.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
    for(let j=0;j<meshes.length;j++) {
      const source=meshes[j],group=source.parent;
      let part=parts[j];
      if(!part){
        const mesh=new THREE.InstancedMesh(source.geometry,source.material,devices.length);
        mesh.name='killer-wail-speakers:'+source.userData.s3Finish;
        mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.frustumCulled=source.frustumCulled;
        mesh.layers.mask=source.layers.mask;mesh.renderOrder=source.renderOrder;mesh.count=0;
        mesh.userData.s3Finish=source.userData.s3Finish;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
        part={mesh,records:[],version:source.material.version};parts.push(part);
      }
      part.records.push({source,group,root:devices[i].holder,before:source.onBeforeRender,after:source.onAfterRender});source.removeFromParent();
    }
  }
  scene?.add?.(root);
  return {root,parts,inverse:new THREE.Matrix4(),matrix:new THREE.Matrix4()};
}
export function updateWailSpeakerBatch(batch) {
  const {root,parts,inverse,matrix}=batch;root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();
  // All source hierarchies are logical and remain independently observable.
  for(const record of parts[0]?.records||[])record.root.updateWorldMatrix(true,true);
  for(const part of parts){
    const mesh=part.mesh,reference=mesh.material;let n=0;
    for(const record of part.records){
      const {source,group}=record;
      const compatible=source.geometry===mesh.geometry && source.castShadow===mesh.castShadow && source.receiveShadow===mesh.receiveShadow
        && source.frustumCulled===mesh.frustumCulled && source.layers.mask===mesh.layers.mask && source.renderOrder===mesh.renderOrder
        && source.onBeforeRender===record.before && source.onAfterRender===record.after && sameMaterial(source.material,reference,part.version);
      if(!compatible){if(source.parent!==group)group.add(source);continue;}
      source.removeFromParent();
      if(!source.visible||!visibleFrom(group,record.root))continue;
      if(source.matrixAutoUpdate)source.updateMatrix();
      matrix.multiplyMatrices(inverse,group.matrixWorld).multiply(source.matrix);mesh.setMatrixAt(n++,matrix);
    }
    mesh.count=n;mesh.visible=n>0;mesh.instanceMatrix.needsUpdate=true;
    if(n)mesh.computeBoundingSphere();
  }
}
export function retireWailSpeakerBatch(batch,disposeModel) {
  if(batch.retired)return;batch.retired=true;
  // One traversal deduplicates materials across the original source meshes and
  // the five batches. Shared model geometry remains owned by its cache.
  for(const part of batch.parts)for(const {source} of part.records)batch.root.add(source);
  disposeModel(batch.root);
  for(const part of batch.parts)part.mesh.dispose();
  batch.root.clear();
}
