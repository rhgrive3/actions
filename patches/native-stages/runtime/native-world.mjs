import * as THREE from 'three';
import { G } from '../../../src/core/ctx.js';
import { PaintSystem } from '../../../src/world/paint.js';
import { NavGraph } from '../../../src/game/nav.js';
import { Minimap } from '../../../src/game/minimap.js';
import { SwimWake } from '../../../src/fx/swimWake.js';
import { loadNativeData,loadNativeTextures } from './native-load.mjs';
import { NativeLevel } from './native-level.mjs';
import { NativePhysics } from './native-physics.mjs';
import { nativeDisplay,nativeInkGeometry,nativeInkMaterial } from './native-render.mjs';
import { NativeInkMesh } from './native-ink-chunks.mjs';
import { nativeStageTextureCaps } from './native-texture-budget.mjs';
import { nativeGpuTier,nativeRenderCaps,nativeTextureProfile,nativeCompressedTextureSupport,applyNativeGpuBudget,watchNativeContextLoss } from './native-gpu-budget.mjs';
import {sourceLoadingStatus,showNativeWorldRecovery} from './source-menu.mjs';
// The WebGL context-loss listener persists across stage changes. It must never
// close over a single build's World/Level/Physics or its Promise scope.
let ACTIVE_NATIVE_PENDING = null;
function nativeStageActive(){
 const pending=ACTIVE_NATIVE_PENDING;
 return !!G.level?.native||!!(pending&&!pending.controller.signal.aborted&&pending.current());
}

// Snapshot keeps the previous playable world alive until every fallible
// publication step has completed. Never dispose active resources first.
const SNAPSHOT_KEYS=['layoutId','mapDef','_builtQuality','levelMat','levelMesh','grateMat','grateMesh','decor','stageLightmap','props','minimap','swimWake','nativeWorld'];
const GLOBAL_KEYS=['level','physics','paint','nav'];
function captureWorld(game){
 const snap={};
 for(const k of SNAPSHOT_KEYS)snap[k]=game[k];
 for(const k of GLOBAL_KEYS)snap[k]=G[k];
 return snap;
}
function restoreWorld(game,snap){
 for(const k of SNAPSHOT_KEYS)game[k]=snap[k];
 for(const k of GLOBAL_KEYS)G[k]=snap[k];
 snap.minimap?.activate?.();
}
function disposeOldWorld(game,snap){
 const old=(fn,label)=>{try{fn?.();}catch(e){console.warn('[native] old world cleanup',label,e);}};
 // Removing both opaque and native ink meshes must precede GPU disposal.
 if(snap.levelMesh)G.scene?.remove?.(snap.levelMesh);
 if(snap.grateMesh)G.scene?.remove?.(snap.grateMesh);
 if(snap.nativeWorld)old(()=>snap.nativeWorld.dispose(),'native');
 else if(snap.levelMesh){
  old(()=>snap.levelMesh.geometry?.dispose?.(),'level mesh');
  old(()=>snap.grateMesh?.geometry?.dispose?.(),'grate mesh');
  old(()=>snap.levelMat?.dispose?.(),'level mat');
  old(()=>snap.grateMat?.dispose?.(),'grate mat');
 }
 old(()=>snap.decor?.dispose?.(),'decor');
 old(()=>snap.stageLightmap?.dispose?.(),'lightmap');
 old(()=>snap.props?.dispose?.(),'props');
 old(()=>snap.paint?.dispose?.(),'paint');
 old(()=>snap.minimap?.dispose?.(),'minimap');
}

function yieldNativeWorld(signal){
 return new Promise((resolve,reject)=>{
  let handle,settled=false;
  const frame=typeof globalThis.requestAnimationFrame==='function';
  const cancel=()=>{if(handle===undefined)return;if(frame)globalThis.cancelAnimationFrame?.(handle);else clearTimeout(handle);};
  const finish=error=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);if(error){cancel();reject(error);}else resolve();};
  const abort=()=>finish(new DOMException('Aborted','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  handle=frame?globalThis.requestAnimationFrame(()=>finish()):setTimeout(()=>finish(),0);
 });
}

/** Prepare detached, publish atomically through the existing worldCurrent guard. */
export async function buildNativeWorld(game,map,current){
 game._nativeAbort?.abort();const controller=game._nativeAbort=new AbortController(),signal=controller.signal,start=performance.now();
 let display,paint,inkGeometry,inkMat,inkMesh,pendingTextures,pendingNavigation,minimap;
 let snapshot=null,published=false,committed=false;
 const safely=(fn,label)=>{try{fn();}catch(e){console.warn('[native] cleanup',label,e);}};
 const status=sourceLoadingStatus(map.name);
 // Watch the detached candidate before its first GPU allocation. The token
 // belongs to this operation; an old cancellation cannot clear a newer load.
 const pendingBuild={controller,current};
 game._nativePendingBuild=pendingBuild;
 ACTIVE_NATIVE_PENDING=pendingBuild;
 watchNativeContextLoss(G.renderer.domElement,nativeStageActive);
 try{
  // Pass the authoritative main-thread touch profile: iPadOS can advertise a Macintosh UA in WorkerNavigator.
  // Constrained stages must not clone large derived arrays through IndexedDB during activation.
  const data=await loadNativeData(map.id,signal,{constrained:!!game.mobile?.touch});if(!current())return;
  status.update('textures');
  const level=NativeLevel.create?await NativeLevel.create(data,{signal,current}):new NativeLevel(data);
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  const physics=new NativePhysics(level);
  // A previous context loss on a native stage lowers this load's budget.
  // Touch devices start one texture step lower unless the stage ships KTX2
  // and this GPU receives it compressed (about a quarter of the memory).
  const gpuTier=nativeGpuTier();
  const {quality,caps:textureCaps}=nativeTextureProfile({settingsQuality:game.settings.quality,tier:gpuTier,touch:!!game.mobile?.touch,
    compressed:!!data.manifest.prebuiltTextures&&nativeCompressedTextureSupport(G.renderer),
    stageCaps:q=>nativeStageTextureCaps(data.manifest,q,{
      mobile:!!game.mobile?.touch,
      deviceMemoryGB:typeof navigator==='undefined'?null:navigator.deviceMemory,
      maxTextureSize:G.renderer.capabilities.maxTextureSize
    })});
  const textureLimit=textureCaps.maxDimension;
  let navStart=performance.now();
  // Desktop navigation yields in short slices while texture fetch/decode waits.
  // Constrained devices retain serial construction to avoid competing peaks.
  if(globalThis.navigator&&!game.mobile?.touch&&!(globalThis.navigator.deviceMemory>0&&globalThis.navigator.deviceMemory<=4))
   pendingNavigation=NavGraph.createNative(level,physics,{signal,current}).then(nav=>({nav}),error=>{const failed=!signal.aborted&&current()&&error.name!=='AbortError';controller.abort(error);return {error,failed};});
  const textures=await loadNativeTextures(map.id,data,G.renderer,quality,signal,textureCaps);pendingTextures=textures;display=nativeDisplay(data,textures,quality);pendingTextures=null;
  if(!current())throw new DOMException('Aborted','AbortError');
  const paintAtlasSize=Math.min(G.renderer.capabilities.maxTextureSize,(game.mobile?.touch||gpuTier>0||['low','medium'].includes(game.settings.quality))?2048:4096);
  // Use the same contour sampling budget as ordinary stages. The packer may
  // reduce density to fit all charts; atlas dimensions/GPU safety caps stay fixed.
  paint=new PaintSystem(G.renderer,level,{atlasSize:paintAtlasSize,maxDensity:paintAtlasSize>=4096?30:18,cell:.25});
  // Compact charts use a 2-texel guard. Avoid sampling other charts through
  // distant mip levels; source material maps retain their normal mip chains.
  paint.texture.generateMipmaps=false;paint.texture.minFilter=THREE.LinearFilter;
  // Compile the offscreen paint/drying shaders during loading, in their actual
  // render-target colour space. Do not hold renderer state across the await.
  const warmStart=performance.now(),r=G.renderer,previousTarget=r.getRenderTarget(),dryVisible=paint.dryMesh.visible;
  const gl=r.getContext?.(),canSkipWarm=!!(gl&&!gl.isContextLost?.()&&r._iwPaintWarmGl===gl);
  let warmed;
  if(canSkipWarm){warmed=Promise.resolve();}
  else{
   try { r.setRenderTarget(paint.rt);paint.dryMesh.visible=true;warmed=r.compileAsync(paint.scene,paint.cam); }
   finally { r.setRenderTarget(previousTarget);paint.dryMesh.visible=dryVisible; }
  }
  await warmed;
  if(gl&&!gl.isContextLost?.())r._iwPaintWarmGl=gl;
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  let shaderWarmMilliseconds=performance.now()-warmStart;
  level.nativePaint=paint;
  inkGeometry=nativeInkGeometry(level,paint);inkMat=nativeInkMaterial(paint,game.murals,game.texlib);
  inkMesh=new NativeInkMesh(inkGeometry,inkMat,16,{willBindPaint:true}).bindPaint(paint,{knownEmpty:true});
  // Link the stage's display/ink programs now (parallel compile where
  // available) instead of synchronously on the first battle frames. Any
  // render target selects the composer's key: linear output, no tone map.
  const stageWarmStart=performance.now();let stageWarmed;
  try { r.setRenderTarget(paint.rt);stageWarmed=Promise.all([r.compileAsync(display.group,G.camera,G.scene),r.compileAsync(inkMesh,G.camera,G.scene)]); }
  finally { r.setRenderTarget(previousTarget); }
  await stageWarmed;
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  const stageShaderWarmMilliseconds=performance.now()-stageWarmStart;
  status.update('navigation');await yieldNativeWorld(signal);
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  if(!pendingNavigation)navStart=performance.now();
  const navigation=pendingNavigation?await pendingNavigation:{nav:await NavGraph.createNative(level,physics,{signal,current})};
  if(navigation.error)throw navigation.error;const nav=navigation.nav;
  // Minimap preparation must use this detached world's navigation, not G.nav
  // which still belongs to the current world until publication below.
  level.nativeNav=nav;
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  // The minimap's global CURRENT is not touched until final commit.
  minimap=new Minimap(level,paint,Math.min(3,512/Math.max(level.bounds.maxX-level.bounds.minX,level.bounds.maxZ-level.bounds.minZ)),{deferActivation:true});
  if(G.settings?.minimap!==false)await minimap.prepareNative?.({signal,current});
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  const wake=new SwimWake();
  const gpuBudget=nativeRenderCaps({mobile:!!game.mobile?.touch,tier:gpuTier});
  const nextWorld={display,level,gpuTier,textureProfile:{data,quality,caps:textureCaps},disposed:false,metrics:{gpuTier,gpuBudget,loadMilliseconds:performance.now()-start,navMilliseconds:performance.now()-navStart,navBuild:nav.nativeBuildMetrics,shaderWarmMilliseconds,stageShaderWarmMilliseconds,vertices:data.manifest.geometry.vertices,triangles:data.manifest.geometry.triangles,faces:level.faces.length,gridBytes:paint.grid.byteLength,atlas:paint.size,ppm:paint.ppm,textureCount:textures.size,textureLimit,quality,version1130Verified:false},
   dispose(){
    if(this.disposed)return;
    this.disposed=true;this.textureProfile=null;
    safely(()=>this.qualityOperation?.controller.abort(),'quality cancellation');
    safely(()=>G.scene?.remove?.(inkMesh),'ink detach');
    safely(()=>display.dispose(),'display');safely(()=>inkMesh.dispose(),'ink');
    safely(()=>inkMat.dispose(),'material');
    safely(()=>textures._releaseWorkers?.(),'idle texture workers');
   }};
  snapshot=captureWorld(game);
  published=true;
  G.level=level;G.physics=physics;G.paint=paint;G.nav=nav;
  game.layoutId=map.id;game.mapDef=map;game._builtQuality=game.settings.quality;
  game.levelMat=inkMat;game.levelMesh=inkMesh;game.grateMat=null;game.grateMesh=null;
  game.stageLightmap=null;game.props=null;
  G.scene.add(display.group,inkMesh);
  applyNativeGpuBudget(game,G,gpuBudget);
  game.decor={group:display.group,setTeamColors(){},update(){},setNight(){},dispose(){}};
  game.swimWake=wake;game.minimap=minimap;game.nativeWorld=nextWorld;
  if(G.env?.rebuildForArena)G.env.rebuildForArena(level.bounds,game._footprint(level));
  game._shadowRoots();if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());
  if(!current()||signal.aborted)throw new DOMException('Aborted','AbortError');
  minimap.activate();wake.reset();
  committed=true;
  // Once published, the display alone holds views of the source vertex/index
  // arrays and releases them as they upload. A failed attempt keeps its input.
  data.vertices=null;data.indices=null;
  // Only activated NativeLevel data remains authoritative after publication.
  data.manifest.faces=null;data.faceTriangles=null;
  disposeOldWorld(game,snapshot);
 }catch(error){
  controller.abort(error);
  if(pendingNavigation){const navigation=await pendingNavigation;if(navigation.failed)error=navigation.error;}
  const recoveryErrors=[];
  const recover=(fn)=>{try{fn();}catch(e){recoveryErrors.push(e);}};
  try{
   if(published && !committed && snapshot){
    recover(()=>{if(display?.group)G.scene?.remove?.(display.group);});
    recover(()=>{if(inkMesh)G.scene?.remove?.(inkMesh);});
    // Restore pointer ownership even when a later activation/rebuild fails.
    recover(()=>restoreWorld(game,snapshot));
    recover(()=>applyNativeGpuBudget(game,G,snapshot.nativeWorld?.metrics?.gpuBudget||null));
    recover(()=>{if(snapshot.level?.bounds && G.env?.rebuildForArena)
      G.env.rebuildForArena(snapshot.level.bounds,game._footprint(snapshot.level));});
    recover(()=>game._shadowRoots());
    recover(()=>{if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());});
   }
  }finally{
   // A recovery exception must not bypass disposal of the detached candidate.
   // Attempt each independently, while preserving the original publication error.
   for(const t of new Set(pendingTextures?.values()||[])){
    safely(()=>t.image?.close?.(),'pending image');safely(()=>t.dispose(),'pending texture');
   }
   pendingTextures?.clear();
   if(!committed){
    safely(()=>{if(display?.group)G.scene?.remove?.(display.group);},'display detach');
    safely(()=>{if(inkMesh)G.scene?.remove?.(inkMesh);},'ink detach');
    safely(()=>display?.dispose(),'display');safely(()=>paint?.dispose(),'paint');
    safely(()=>{if(inkMesh)inkMesh.dispose();else inkGeometry?.dispose();},'ink');
    safely(()=>inkMat?.dispose(),'material');
    safely(()=>minimap?.dispose?.(),'minimap');
   }
  }
  if(recoveryErrors.length){
   // The old world could not be made playable. Do not update/draw dead handles.
   game._nativeWorldRecoveryFatal={error,recoveryErrors};game.frozen=true;
   safely(()=>showNativeWorldRecovery(game),'recovery dialog');
  }
  if(error.name!=='AbortError'&&current())throw error;
 }finally{
  if(game._nativePendingBuild===pendingBuild)game._nativePendingBuild=null;
  if(ACTIVE_NATIVE_PENDING===pendingBuild)ACTIVE_NATIVE_PENDING=null;
  safely(()=>status.close(),'loading status');
 }
}

export function releaseNativeWorld(game){
 game._nativeAbort?.abort();
 if(!game.nativeWorld)return;
 applyNativeGpuBudget(game,G,null);
 G.scene?.remove?.(game.levelMesh);
 game.nativeWorld.dispose();game.nativeWorld=null;game.levelMesh=null;game.levelMat=null;game.grateMesh=null;game.grateMat=null;
 game.decor=null;
}
