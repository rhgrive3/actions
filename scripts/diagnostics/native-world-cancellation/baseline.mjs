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
import {sourceLoadingStatus} from './source-menu.mjs';

function releaseCurrent(game){
 if(game.nativeWorld){game.nativeWorld.dispose();game.nativeWorld=null;}
 else if(game.levelMesh){G.scene.remove(game.levelMesh,game.grateMesh);game.levelMesh.geometry.dispose();game.grateMesh?.geometry.dispose();game.levelMat.dispose();game.grateMat?.dispose();}
 game.levelMesh=null;game.grateMesh=null;game.levelMat=null;game.grateMat=null;
 game.decor?.dispose?.();game.decor=null;
 game.stageLightmap?.dispose();game.stageLightmap=null;game.props?.dispose?.();game.props=null;
 G.paint?.dispose();
}

/** Prepare detached, publish atomically through the existing worldCurrent guard. */
export async function buildNativeWorld(game,map,current){
 game._nativeAbort?.abort();const controller=game._nativeAbort=new AbortController(),signal=controller.signal,start=performance.now();
 let display,paint,inkGeometry,inkMat,inkMesh,pendingTextures;
 const status=sourceLoadingStatus(map.name);
 try{
  const data=await loadNativeData(map.id,signal);if(!current())return;
  status.update('textures');
  const level=new NativeLevel(data),physics=new NativePhysics(level);
  const quality=['high','ultra'].includes(game.settings.quality)?'high':game.settings.quality==='low'?'low':'balanced';
  const textures=await loadNativeTextures(map.id,data,G.renderer,quality,signal,game.mobile?.touch?1024:undefined);pendingTextures=textures;display=nativeDisplay(data,textures,quality);pendingTextures=null;
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
  const shaderWarmMilliseconds=performance.now()-warmStart;
  level.nativePaint=paint;
  inkGeometry=nativeInkGeometry(level,paint);inkMat=nativeInkMaterial(paint,game.murals,game.texlib);
  inkMesh=new NativeInkMesh(inkGeometry,inkMat);
  status.update('navigation');await new Promise(resolve=>requestAnimationFrame(resolve));
  const navStart=performance.now(),nav=new NavGraph(level,physics);
  // Minimap preparation must use this detached world's navigation, not G.nav
  // which still belongs to the current world until publication below.
  level.nativeNav=nav;
  if(!current()){display.dispose();paint.dispose();inkMesh.dispose();inkMat.dispose();return;}
  releaseCurrent(game);
  G.level=level;G.physics=physics;G.paint=paint;G.nav=nav;game.layoutId=map.id;game.mapDef=map;game._builtQuality=game.settings.quality;
  game.levelMat=inkMat;game.levelMesh=inkMesh;G.scene.add(display.group,inkMesh);
  // Preserve palette and lifecycle hooks expected by the live game.
  game.decor={group:display.group,setTeamColors(){},update(){},setNight(){},dispose(){}};
  (game.swimWake||(game.swimWake=new SwimWake())).reset();
  game.minimap=new Minimap(level,paint,Math.min(3,512/Math.max(level.bounds.maxX-level.bounds.minX,level.bounds.maxZ-level.bounds.minZ)));
  game.nativeWorld={display,level,metrics:{loadMilliseconds:performance.now()-start,navMilliseconds:performance.now()-navStart,shaderWarmMilliseconds,vertices:data.manifest.geometry.vertices,triangles:data.manifest.geometry.triangles,faces:level.faces.length,gridBytes:paint.grid.byteLength,atlas:paint.size,ppm:paint.ppm,textureCount:textures.size,quality,version1130Verified:false},
   dispose(){display.dispose();inkMesh.dispose();inkMat.dispose();}};
  if(G.env?.rebuildForArena)G.env.rebuildForArena(level.bounds,game._footprint(level));
  game._shadowRoots();if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());
 }catch(error){
  for(const t of pendingTextures?.values()||[]){t.image?.close?.();t.dispose();}pendingTextures?.clear();
  display?.dispose();paint?.dispose();if(inkMesh)inkMesh.dispose();else inkGeometry?.dispose();inkMat?.dispose();
  if(error.name!=='AbortError'&&current())throw error;
 }finally{status.close();}
}

export function releaseNativeWorld(game){
 game._nativeAbort?.abort();
 if(!game.nativeWorld)return;
 game.nativeWorld.dispose();game.nativeWorld=null;game.levelMesh=null;game.levelMat=null;game.grateMesh=null;game.grateMat=null;
 game.decor=null;
}
