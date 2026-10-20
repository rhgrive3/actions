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
import {sourceLoadingStatus,showNativeWorldRecovery} from './source-menu.mjs';

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
}

/** Prepare detached, publish atomically through the existing worldCurrent guard. */
export async function buildNativeWorld(game,map,current){
 game._nativeAbort?.abort();const controller=game._nativeAbort=new AbortController(),signal=controller.signal,start=performance.now();
 let display,paint,inkGeometry,inkMat,inkMesh,pendingTextures;
 let snapshot=null,published=false,committed=false;
 const safely=(fn,label)=>{try{fn();}catch(e){console.warn('[native] cleanup',label,e);}};
 const status=sourceLoadingStatus(map.name);
 try{
  const data=await loadNativeData(map.id,signal);if(!current())return;
  status.update('textures');
  const level=new NativeLevel(data),physics=new NativePhysics(level);
  const quality=['high','ultra'].includes(game.settings.quality)?'high':game.settings.quality==='low'?'low':'balanced';
  const textureCaps=nativeStageTextureCaps(data.manifest,quality,{
    mobile:!!game.mobile?.touch,
    deviceMemoryGB:typeof navigator==='undefined'?null:navigator.deviceMemory,
    maxTextureSize:G.renderer.capabilities.maxTextureSize
  });
  const textureLimit=textureCaps.maxDimension;
  const textures=await loadNativeTextures(map.id,data,G.renderer,quality,signal,textureCaps);pendingTextures=textures;display=nativeDisplay(data,textures,quality);pendingTextures=null;
  if(!current())throw new DOMException('Aborted','AbortError');
  paint=new PaintSystem(G.renderer,level,{atlasSize:Math.min(G.renderer.capabilities.maxTextureSize,(game.mobile?.touch||['low','medium'].includes(game.settings.quality))?2048:4096),maxDensity:quality==='low'?4:8,cell:.25});
  // Compact charts use a 2-texel guard. Avoid sampling other charts through
  // distant mip levels; source material maps retain their normal mip chains.
  paint.texture.generateMipmaps=false;paint.texture.minFilter=THREE.LinearFilter;
  // Compile the offscreen paint/drying shaders during loading, in their actual
  // render-target colour space. Do not hold renderer state across the await.
  const warmStart=performance.now(),r=G.renderer,previousTarget=r.getRenderTarget(),dryVisible=paint.dryMesh.visible;
  let warmed;
  try { r.setRenderTarget(paint.rt);paint.dryMesh.visible=true;warmed=r.compileAsync(paint.scene,paint.cam); }
  finally { r.setRenderTarget(previousTarget);paint.dryMesh.visible=dryVisible; }
  await warmed;
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  const shaderWarmMilliseconds=performance.now()-warmStart;
  level.nativePaint=paint;
  inkGeometry=nativeInkGeometry(level,paint);inkMat=nativeInkMaterial(paint,game.murals,game.texlib);
  inkMesh=new NativeInkMesh(inkGeometry,inkMat).bindPaint(paint);
  status.update('navigation');await new Promise(resolve=>requestAnimationFrame(resolve));
  if(signal.aborted||!current())throw new DOMException('Aborted','AbortError');
  const navStart=performance.now(),nav=new NavGraph(level,physics);
  // Minimap preparation must use this detached world's navigation, not G.nav
  // which still belongs to the current world until publication below.
  level.nativeNav=nav;
  if(!current())throw new DOMException('Aborted','AbortError');
  // The minimap's global CURRENT is not touched until final commit.
  const minimap=new Minimap(level,paint,Math.min(3,512/Math.max(level.bounds.maxX-level.bounds.minX,level.bounds.maxZ-level.bounds.minZ)),{deferActivation:true});
  const wake=new SwimWake();
  const nextWorld={display,level,metrics:{loadMilliseconds:performance.now()-start,navMilliseconds:performance.now()-navStart,shaderWarmMilliseconds,vertices:data.manifest.geometry.vertices,triangles:data.manifest.geometry.triangles,faces:level.faces.length,gridBytes:paint.grid.byteLength,atlas:paint.size,ppm:paint.ppm,textureCount:textures.size,textureLimit,quality,version1130Verified:false},
   dispose(){G.scene?.remove?.(inkMesh);display.dispose();inkMesh.dispose();inkMat.dispose();}};
  snapshot=captureWorld(game);
  published=true;
  G.level=level;G.physics=physics;G.paint=paint;G.nav=nav;
  game.layoutId=map.id;game.mapDef=map;game._builtQuality=game.settings.quality;
  game.levelMat=inkMat;game.levelMesh=inkMesh;game.grateMat=null;game.grateMesh=null;
  game.stageLightmap=null;game.props=null;
  G.scene.add(display.group,inkMesh);
  game.decor={group:display.group,setTeamColors(){},update(){},setNight(){},dispose(){}};
  game.swimWake=wake;game.minimap=minimap;game.nativeWorld=nextWorld;
  if(G.env?.rebuildForArena)G.env.rebuildForArena(level.bounds,game._footprint(level));
  game._shadowRoots();if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());
  if(!current()||signal.aborted)throw new DOMException('Aborted','AbortError');
  minimap.activate();wake.reset();
  committed=true;
  disposeOldWorld(game,snapshot);
 }catch(error){
  const recoveryErrors=[];
  const recover=(fn)=>{try{fn();}catch(e){recoveryErrors.push(e);}};
  try{
   if(published && !committed && snapshot){
    recover(()=>{if(display?.group)G.scene?.remove?.(display.group);});
    recover(()=>{if(inkMesh)G.scene?.remove?.(inkMesh);});
    // Restore pointer ownership even when a later activation/rebuild fails.
    recover(()=>restoreWorld(game,snapshot));
    recover(()=>{if(snapshot.level?.bounds && G.env?.rebuildForArena)
      G.env.rebuildForArena(snapshot.level.bounds,game._footprint(snapshot.level));});
    recover(()=>game._shadowRoots());
    recover(()=>{if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());});
   }
  }finally{
   // A recovery exception must not bypass disposal of the detached candidate.
   // Attempt each independently, while preserving the original publication error.
   for(const t of pendingTextures?.values()||[]){
    safely(()=>t.image?.close?.(),'pending image');safely(()=>t.dispose(),'pending texture');
   }
   pendingTextures?.clear();
   if(!committed){
    safely(()=>{if(display?.group)G.scene?.remove?.(display.group);},'display detach');
    safely(()=>{if(inkMesh)G.scene?.remove?.(inkMesh);},'ink detach');
    safely(()=>display?.dispose(),'display');safely(()=>paint?.dispose(),'paint');
    safely(()=>{if(inkMesh)inkMesh.dispose();else inkGeometry?.dispose();},'ink');
    safely(()=>inkMat?.dispose(),'material');
   }
  }
  if(recoveryErrors.length){
   // The old world could not be made playable. Do not update/draw dead handles.
   game._nativeWorldRecoveryFatal={error,recoveryErrors};game.frozen=true;
   safely(()=>showNativeWorldRecovery(game),'recovery dialog');
  }
  if(error.name!=='AbortError'&&current())throw error;
 }finally{safely(()=>status.close(),'loading status');}
}

export function releaseNativeWorld(game){
 game._nativeAbort?.abort();
 if(!game.nativeWorld)return;
 G.scene?.remove?.(game.levelMesh);
 game.nativeWorld.dispose();game.nativeWorld=null;game.levelMesh=null;game.levelMat=null;game.grateMesh=null;game.grateMat=null;
 game.decor=null;
}
