// PRIVATE diagnostic only. Run via page.evaluate(runFrozenComposerControls) after
// starting current-main inkblot, freezing simulation, and installing the verified
// __captureNativeCanvas(mode) PNG/readPixels-equality helper. No runtime patch.
export async function runFrozenComposerControls({ expectedTheme = "day" } = {}) {
  if (!["day", "sunset"].includes(expectedTheme)) throw Error("Only day/sunset supported");
  globalThis.__lightingControlsPartial={rows:[]};
  const G=globalThis.NG,g=G?.game,r=G?.renderer;
  if(!g?.nativeWorld||G.level?.manifest?.id!=='inkblot')throw Error('Expected actual native inkblot');
  if(typeof globalThis.__captureNativeCanvas!=='function')throw Error('Verified capture helper required');
  if(g._skipRender!==true)throw Error('Caller must freeze simulation and skip automatic render first');
  const T=globalThis.T;
  if(!T?.MeshBasicMaterial)throw Error('Verified Three module must be installed by the shared runner');
  G.camera.updateMatrixWorld();
  const original=new Map(),receivers=new Map();
  g.nativeWorld.display.group.traverse(mesh=>{if(mesh.isMesh){if(Array.isArray(mesh.material)||!mesh.material?.isMeshStandardMaterial)throw Error('Expected single native MeshStandardMaterial');original.set(mesh,mesh.material);receivers.set(mesh,mesh.receiveShadow);}});
  const saved={ink:g.levelMesh.visible,tone:r.toneMapping,exposure:r.toneMappingExposure,shadows:r.shadowMap.enabled,
    camera:G.camera.matrixWorld.toArray(),projection:G.camera.projectionMatrix.toArray(),paint:G.paint.grid.slice(),level:G.level,
    quality:g.settings.quality,theme:g.theme};
  const restore=()=>{for(const [mesh,mat] of original){if(mesh.material!==mat)mesh.material.dispose();mesh.material=mat;mesh.receiveShadow=receivers.get(mesh);}g.levelMesh.visible=saved.ink;r.toneMapping=saved.tone;r.toneMappingExposure=saved.exposure;r.shadowMap.enabled=saved.shadows;};
  const unchanged=()=>{G.camera.updateMatrixWorld();if(G.level!==saved.level||g.settings.quality!==saved.quality||g.theme!==saved.theme||G.paint.grid.some((v,i)=>v!==saved.paint[i])||G.camera.matrixWorld.toArray().some((v,i)=>v!==saved.camera[i])||G.camera.projectionMatrix.toArray().some((v,i)=>v!==saved.projection[i]))throw Error('Frozen state changed');};
  // Settle the production theme-grade uniforms before recording settings.
  g.R.render();unchanged();
  const rows=[];
  globalThis.__lightingControlsPartial={rows,stage:'inkblot',source:G.level.manifest.sourceSha256,baseURI:document.baseURI,camera:saved.camera,projection:saved.projection,theme:saved.theme,quality:saved.quality};
  const settings={toneMapping:saved.tone,exposure:saved.exposure,outputColorSpace:r.outputColorSpace,shadowMapEnabled:saved.shadows,shadowMapType:r.shadowMap.type,environmentIntensity:G.scene.environmentIntensity,grade:Object.fromEntries(Object.entries(g.R.grade?.uniforms||{}).filter(([k])=>k!=='tDiffuse').map(([k,u])=>[k,u.value?.toArray?u.value.toArray():u.value])),materials:[...new Set(original.values())].map(m=>({name:m.name,color:m.color.toArray(),vertexColors:m.vertexColors,roughness:m.roughness,metalness:m.metalness,normalScale:m.normalScale.toArray(),albedoColorSpace:m.map?.colorSpace,normalColorSpace:m.normalMap?.colorSpace,envMapIntensity:m.envMapIntensity,alphaTest:m.alphaTest,transparent:m.transparent}))};
  let shadowCastingLights=0;G.scene.traverse(o=>{if(o.isLight&&o.castShadow)shadowCastingLights++;});
  const mats=[...new Set(original.values())];
  const applicability={nativeMeshes:original.size,shadowReceivers:[...receivers.values()].filter(Boolean).length,shadowCastingLights,normalMapMaterials:mats.filter(m=>m.normalMap).length,roughnessMapMaterials:mats.filter(m=>m.roughnessMap).length,environmentMaterials:G.scene.environment?mats.length:0,inkOverlayVisible:saved.ink,neutralToneMapping:saved.tone===T.NeutralToneMapping};
  globalThis.__lightingControlsPartial.settings=settings;
  globalThis.__lightingControlsPartial.applicability=applicability;
  if(saved.quality!=='high'||saved.theme!==expectedTheme||!saved.shadows||!applicability.shadowReceivers||!shadowCastingLights||!applicability.normalMapMaterials||!applicability.roughnessMapMaterials||!applicability.environmentMaterials||!applicability.neutralToneMapping)throw Error('High/selected-theme lighting prerequisites absent: '+JSON.stringify({quality:saved.quality,theme:saved.theme,shadows:saved.shadows,applicability}));
  try {
    for(const mode of ['baseline','no-ink','no-receive-shadow','no-normal-map','no-roughness-map','no-environment','unlit-albedo','linear-tone-control','restored-baseline']){
      restore();
      if(mode==='no-ink')g.levelMesh.visible=false;
      if(mode==='linear-tone-control')r.toneMapping=T.LinearToneMapping;
      for(const [mesh,mat] of original){
        if(mode==='no-receive-shadow')mesh.receiveShadow=false;
        if(['no-normal-map','no-roughness-map','no-environment'].includes(mode)){
          const c=mat.clone();c.onBeforeCompile=mat.onBeforeCompile;c.customProgramCacheKey=mat.customProgramCacheKey;
          if(mode==='no-normal-map')c.normalMap=null;
          if(mode==='no-roughness-map')c.roughnessMap=null;
          if(mode==='no-environment'){c.envMap=G.scene.environment;c.envMapIntensity=0;}
          c.needsUpdate=true;mesh.material=c;
        }
        if(mode==='unlit-albedo'){
          const c=new T.MeshBasicMaterial({map:mat.map,color:mat.color,side:mat.side,alphaMap:mat.alphaMap,alphaTest:mat.alphaTest,transparent:mat.transparent,opacity:mat.opacity,depthWrite:mat.depthWrite});
          c.onBeforeCompile=mat.onBeforeCompile;c.customProgramCacheKey=mat.customProgramCacheKey;mesh.material=c;
        }
      }
      // Exactly the production post stack. Never substitute r.render(scene,camera).
      g.R.render();unchanged();
      rows.push({mode,capture:await globalThis.__captureNativeCanvas(mode)});
    }
    return {scope:'Diagnostic controls, never acceptance frames or a game fix',...globalThis.__lightingControlsPartial};
  } finally {restore();g.R.render();unchanged();}
}
