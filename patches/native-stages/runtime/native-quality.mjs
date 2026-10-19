import * as THREE from 'three';
import {loadNativeTextures} from './native-load.mjs';
import {nativeStageTextureCaps} from './native-texture-budget.mjs';

/** Keep physics, nav, actors and authoritative CPU paint when quality changes. */
export async function applyNativeQuality(game,settings,mobile,deps){
 const {G,q,updatePaintQuality,updateEnvironmentShadowQuality,updateFXQuality}=deps,world=game.nativeWorld;
 if(!world)return;
 const token=world.qualityToken={};
 updatePaintQuality(game,q.paintAtlas,G,THREE);
 G.paint.texture.generateMipmaps=false;G.paint.texture.minFilter=THREE.LinearFilter;
 const ranked=G.match?.rankedWorld,face=ranked?.towerPaintFace,u=ranked?.towerInkMaterial?.uniforms;
 if(face?.atlas&&u){const a=face.atlas,S=G.paint.size;u.uPaint.value=G.paint.texture;u.uAtlasOrigin.value.set((a.x+a.pad)/S,(a.y+a.pad)/S);u.uAtlasScale.value.set(face.su*a.ppm/S,face.sv*a.ppm/S);}
 updateEnvironmentShadowQuality(G.env,q.shadowSize,game.shadowCache);updateFXQuality(G.fx,q.particles,THREE);
 const quality=['high','ultra'].includes(settings.quality)?'high':settings.quality==='low'?'low':'balanced';
 game._builtQuality=settings.quality;
 const dispose=textures=>{for(const t of textures.values()){t.image?.close?.();t.dispose();}textures.clear();};
 try{
  const textureCaps=nativeStageTextureCaps(world.level.data.manifest,quality,{
    mobile:!!mobile?.touch,
    deviceMemoryGB:typeof navigator==='undefined'?null:navigator.deviceMemory,
    maxTextureSize:G.renderer.capabilities.maxTextureSize
  });
  const textureLimit=textureCaps.maxDimension;
  const textures=await loadNativeTextures(world.level.layout.id,world.level.data,G.renderer,quality,game._nativeAbort?.signal,textureCaps);
  if(game.nativeWorld!==world||world.qualityToken!==token){dispose(textures);return;}
  world.display.updateTextures(textures,quality);world.metrics.quality=quality;world.metrics.atlas=G.paint.size;world.metrics.ppm=G.paint.ppm;world.metrics.textureCount=textures.size;world.metrics.textureLimit=textureLimit;
 }catch(error){if(error.name!=='AbortError'&&game.nativeWorld===world){world.metrics.qualityError=error.message;console.warn('[native] retained previous texture maps after quality update failure: '+error.message);}}
}
