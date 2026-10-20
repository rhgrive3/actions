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
import {sourceLoadingStatus} from './source-menu.mjs';

// Everything the previous world owns. It stays alive and untouched until the
// candidate is completely published; only then is `disposePrevious` allowed to
// release it. A late exception restores this snapshot instead (#1652).
const GAME_KEYS=['layoutId','mapDef','_builtQuality','levelMat','levelMesh','grateMat','grateMesh','decor','stageLightmap','props','minimap','nativeWorld'];
const GLOBAL_KEYS=['level','physics','paint','nav'];
function captureCurrent(game){
 const snapshot={};
 for(const key of GAME_KEYS)snapshot[key]=game[key];
 for(const key of GLOBAL_KEYS)snapshot['G.'+key]=G[key];
 return snapshot;
}
function restoreCurrent(game,snapshot){
 for(const key of GAME_KEYS)game[key]=snapshot[key];
 for(const key of GLOBAL_KEYS)G[key]=snapshot['G.'+key];
}
function disposePrevious(snapshot){
 const attempt=(label,fn)=>{try{fn();}catch(error){console.warn('[native-world] previous world cleanup failed:',label,error);}};
 if(snapshot.nativeWorld)attempt('native world',()=>snapshot.nativeWorld.dispose());
 else if(snapshot.levelMesh){
  attempt('level mesh',()=>{G.scene.remove(snapshot.levelMesh,snapshot.grateMesh);snapshot.levelMesh.geometry.dispose();});
  attempt('grate mesh',()=>snapshot.grateMesh?.geometry.dispose());
  attempt('level material',()=>snapshot.levelMat?.dispose());attempt('grate material',()=>snapshot.grateMat?.dispose());
 }
 attempt('decor',()=>snapshot.decor?.dispose?.());attempt('stage lightmap',()=>snapshot.stageLightmap?.dispose());
 attempt('props',()=>snapshot.props?.dispose?.());attempt('paint',()=>snapshot['G.paint']?.dispose());
}

/** Prepare detached, publish through the existing worldCurrent guard, and keep the previous world live until the whole publication succeeded. */
export async function buildNativeWorld(game,map,current){
 game._nativeAbort?.abort();const controller=game._nativeAbort=new AbortController(),signal=controller.signal,start=performance.now();
 let display,paint,inkGeometry,inkMat,inkMesh,pendingTextures,previous=null,published=false,committed=false;
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
  if(!current()){display.dispose();return;}
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
  if(!current()){display.dispose();paint.dispose();inkMesh.dispose();inkMat.dispose();return;}
  // Publication. The previous world is not touched until every fallible step
  // below has succeeded; `previous` is the rollback point (#1652). The Minimap is
  // constructed last because its constructor activates a module-global instance.
  const nativeWorld={display,level,metrics:{loadMilliseconds:performance.now()-start,navMilliseconds:performance.now()-navStart,shaderWarmMilliseconds,vertices:data.manifest.geometry.vertices,triangles:data.manifest.geometry.triangles,faces:level.faces.length,gridBytes:paint.grid.byteLength,atlas:paint.size,ppm:paint.ppm,textureCount:textures.size,textureLimit,quality,version1130Verified:false},
   dispose(){display.dispose();inkMesh.dispose();inkMat.dispose();}};
  previous=captureCurrent(game);published=true;
  G.level=level;G.physics=physics;G.paint=paint;G.nav=nav;game.layoutId=map.id;game.mapDef=map;game._builtQuality=game.settings.quality;
  game.levelMat=inkMat;game.levelMesh=inkMesh;game.grateMat=null;game.grateMesh=null;game.stageLightmap=null;game.props=null;
  G.scene.add(display.group,inkMesh);
  // Preserve palette and lifecycle hooks expected by the live game.
  game.decor={group:display.group,setTeamColors(){},update(){},setNight(){},dispose(){}};
  game.nativeWorld=nativeWorld;
  if(G.env?.rebuildForArena)G.env.rebuildForArena(level.bounds,game._footprint(level));
  game._shadowRoots();if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());
  game.minimap=new Minimap(level,paint,Math.min(3,512/Math.max(level.bounds.maxX-level.bounds.minX,level.bounds.maxZ-level.bounds.minZ)));
  (game.swimWake||(game.swimWake=new SwimWake())).reset();
  committed=true;disposePrevious(previous);
 }catch(error){
  for(const t of pendingTextures?.values()||[]){t.image?.close?.();t.dispose();}pendingTextures?.clear();
  // A late publication failure must leave the previous world live: restore it
  // before the still-detached candidate is released, so no global ever points at
  // a disposed resource. After commit the candidate belongs to game.nativeWorld.
  if(published&&!committed)rollbackPublication(game,previous,display,inkMesh);
  if(!committed){display?.dispose();paint?.dispose();if(inkMesh)inkMesh.dispose();else inkGeometry?.dispose();inkMat?.dispose();}
  if(error.name!=='AbortError'&&current())throw error;
 }finally{status.close();}
}

// Every step is independent: one failing restoration must not skip the others.
function rollbackPublication(game,previous,display,inkMesh){
 const attempt=(label,fn)=>{try{fn();}catch(error){console.warn('[native-world] rollback step failed:',label,error);}};
 attempt('detach candidate',()=>{G.scene.remove(display.group,inkMesh);});
 restoreCurrent(game,previous);
 const old=previous['G.level'];
 if(old&&G.env?.rebuildForArena)attempt('environment bounds',()=>G.env.rebuildForArena(old.bounds,game._footprint(old)));
 attempt('shadow roots',()=>game._shadowRoots());
 if(game.levelMat&&G.teamColors?.[0])attempt('palette',()=>game._setPalette(game.palette||game._pickPalette()));
}

export function releaseNativeWorld(game){
 game._nativeAbort?.abort();
 if(!game.nativeWorld)return;
 game.nativeWorld.dispose();game.nativeWorld=null;game.levelMesh=null;game.levelMat=null;game.grateMesh=null;game.grateMat=null;
 game.decor=null;
}
