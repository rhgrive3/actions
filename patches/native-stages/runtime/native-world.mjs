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
 let display,paint,inkGeometry,inkMat;
 try{
  const data=await loadNativeData(map.id,signal);if(!current())return;
  const level=new NativeLevel(data),physics=new NativePhysics(level);
  const quality=game.settings.quality==='high'?'high':game.settings.quality==='low'?'low':'balanced';
  const textures=await loadNativeTextures(map.id,data,G.renderer,quality,signal);display=nativeDisplay(data,textures,quality);
  if(!current()){display.dispose();return;}
  paint=new PaintSystem(G.renderer,level,{atlasSize:Math.min(G.renderer.capabilities.maxTextureSize,quality==='low'?2048:4096),maxDensity:quality==='low'?4:8,cell:.25});
  // Compact charts use a 2-texel guard. Avoid sampling other charts through
  // distant mip levels; source material maps retain their normal mip chains.
  paint.texture.generateMipmaps=false;paint.texture.minFilter=THREE.LinearFilter;
  inkGeometry=nativeInkGeometry(level,paint);inkMat=nativeInkMaterial(paint,game.murals,game.texlib);
  const inkMesh=new THREE.Mesh(inkGeometry,inkMat);inkMesh.name='native-game-ink';inkMesh.receiveShadow=true;
  const navStart=performance.now(),nav=new NavGraph(level,physics);
  if(!current()){display.dispose();paint.dispose();inkGeometry.dispose();inkMat.dispose();return;}
  releaseCurrent(game);
  G.level=level;G.physics=physics;G.paint=paint;G.nav=nav;game.layoutId=map.id;game.mapDef=map;game._builtQuality=game.settings.quality;
  game.levelMat=inkMat;game.levelMesh=inkMesh;G.scene.add(display.group,inkMesh);
  // Preserve palette and lifecycle hooks expected by the live game.
  game.decor={group:display.group,setTeamColors(){},update(){},setNight(){},dispose(){}};
  (game.swimWake||(game.swimWake=new SwimWake())).reset();
  game.minimap=new Minimap(level,paint,Math.min(3,512/Math.max(level.bounds.maxX-level.bounds.minX,level.bounds.maxZ-level.bounds.minZ)));
  game.nativeWorld={display,level,metrics:{loadMilliseconds:performance.now()-start,navMilliseconds:performance.now()-navStart,vertices:data.manifest.geometry.vertices,triangles:data.manifest.geometry.triangles,faces:level.faces.length,gridBytes:paint.grid.byteLength,atlas:paint.size,ppm:paint.ppm,textureCount:textures.size,quality,version1130Verified:false},
   dispose(){display.dispose();inkMesh.removeFromParent();inkGeometry.dispose();inkMat.dispose();}};
  if(G.env?.rebuildForArena)G.env.rebuildForArena(level.bounds,game._footprint(level));
  game._shadowRoots();if(G.teamColors[0])game._setPalette(game.palette||game._pickPalette());
 }catch(error){
  display?.dispose();paint?.dispose();inkGeometry?.dispose();inkMat?.dispose();
  if(error.name!=='AbortError'&&current())throw error;
 }
}

export function releaseNativeWorld(game){
 game._nativeAbort?.abort();
 if(!game.nativeWorld)return;
 game.nativeWorld.dispose();game.nativeWorld=null;game.levelMesh=null;game.levelMat=null;game.grateMesh=null;game.grateMat=null;
 game.decor=null;
}

