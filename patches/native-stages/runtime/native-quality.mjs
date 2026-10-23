import * as THREE from 'three';
import {loadNativeTextures} from './native-load.mjs';
import {nativeStageTextureCaps} from './native-texture-budget.mjs';
import {capQuality,nativeRenderCaps,nativeTextureQuality,nativeTierTextureCaps} from './native-gpu-budget.mjs';

// A texture profile is owned by one loaded data object, not just a stage name.
// All caps matter: equal top-level size does not imply equal normal-map size.
function sameTextureProfile(a,data,quality,caps){
 if(!a||a.data!==data||a.quality!==quality||a.caps.maxDimension!==caps.maxDimension)return false;
 const left=a.caps.perRole||{},right=caps.perRole||{},keys=Object.keys(left);
 return keys.length===Object.keys(right).length&&keys.every(key=>left[key]===right[key]);
}
function disposeTextures(textures){
 if(!textures)return;
 for(const t of textures.values()){
  try{t.image?.close?.();}catch{}
  try{t.dispose();}catch{}
 }
 textures.clear();
}

/** Keep physics, nav, actors and authoritative CPU paint when quality changes. */
export async function applyNativeQuality(game,settings,mobile,deps){
 const {G,updatePaintQuality,updateEnvironmentShadowQuality,updateFXQuality}=deps,world=game.nativeWorld;
 if(!world)return;
 // Keep the stage's GPU budget (and any step-down after context loss) across setting changes.
 const tier=world.gpuTier||0,q=capQuality(deps.q,nativeRenderCaps({mobile:!!mobile?.touch,tier}));
 updatePaintQuality(game,q.paintAtlas,G,THREE);
 G.paint.texture.generateMipmaps=false;G.paint.texture.minFilter=THREE.LinearFilter;
 const ranked=G.match?.rankedWorld,face=ranked?.towerPaintFace,u=ranked?.towerInkMaterial?.uniforms;
 if(face?.atlas&&u){const a=face.atlas,S=G.paint.size;u.uPaint.value=G.paint.texture;u.uAtlasOrigin.value.set((a.x+a.pad)/S,(a.y+a.pad)/S);u.uAtlasScale.value.set(face.su*a.ppm/S,face.sv*a.ppm/S);}
 updateEnvironmentShadowQuality(G.env,q.shadowSize,game.shadowCache);updateFXQuality(G.fx,q.particles,THREE);
 const quality=nativeTextureQuality(settings.quality,tier);
 game._builtQuality=settings.quality;
 const data=world.level.data;
 const caps=nativeTierTextureCaps(nativeStageTextureCaps(data.manifest,quality,{
  mobile:!!mobile?.touch,
  deviceMemoryGB:typeof navigator==='undefined'?null:navigator.deviceMemory,
  maxTextureSize:G.renderer.capabilities.maxTextureSize
 }),tier);
 world.metrics.atlas=G.paint.size;world.metrics.ppm=G.paint.ppm;
 const previous=world.qualityOperation;
 // Coalesce the same request without invalidating the current publisher.
 if(previous&&!previous.controller.signal.aborted&&sameTextureProfile(previous.profile,data,quality,caps))return previous.promise;
 const token=world.qualityToken={};
 previous?.controller.abort();
 // A return to the currently displayed profile also cancels pending work.
 // Paint/shadow/effect changes above must still be applied on High <-> Ultra.
 if(!world.disposed&&sameTextureProfile(world.textureProfile,data,quality,caps)){
  if(previous)await previous.promise;
  return;
 }
 const controller=new AbortController(),parent=game._nativeAbort?.signal;
 const abort=()=>controller.abort();
 if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
 const operation={controller,profile:{data,quality,caps},promise:null};
 world.qualityOperation=operation;
 operation.promise=Promise.resolve().then(async()=>{
  let textures;
  try{
   // Decoding itself is not cancellable. Wait for the aborted generation to
   // release its bitmap before starting another full texture pipeline.
   if(previous)await previous.promise;
   if(controller.signal.aborted||game.nativeWorld!==world||world.disposed)return;
   textures=await loadNativeTextures(world.level.layout.id,data,G.renderer,quality,controller.signal,caps);
   if(controller.signal.aborted||game.nativeWorld!==world||world.qualityToken!==token||world.disposed)return;
   world.display.updateTextures(textures,quality);
   world.textureProfile=operation.profile;
   world.metrics.quality=quality;world.metrics.textureCount=textures.size;world.metrics.textureLimit=caps.maxDimension;
   delete world.metrics.qualityError;
   textures=null; // ownership transferred to nativeDisplay
  }catch(error){
   if(error.name!=='AbortError'&&game.nativeWorld===world&&world.qualityToken===token&&!controller.signal.aborted){
    world.metrics.qualityError=error.message;
    console.warn('[native] retained previous texture maps after quality update failure: '+error.message);
   }
  }finally{
   disposeTextures(textures);
   parent?.removeEventListener('abort',abort);
   if(world.qualityOperation===operation)world.qualityOperation=null;
  }
 });
 return operation.promise;
}
