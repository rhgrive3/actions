import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import{fileURLToPath,pathToFileURL}from'node:url';
export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const EMITTED=!!process.env.INKWAVE_BUILT_SITE;
export const SITE=EMITTED?path.resolve(process.env.INKWAVE_BUILT_SITE):path.join(ROOT,'inkwave-public');
export const RUNTIME=path.join(EMITTED?SITE:ROOT,'patches/native-stages/runtime');
assert(vm.SourceTextModule,'Use --experimental-vm-modules for source and emitted recovery tests');
export function readRuntime(name){return fs.readFileSync(path.join(RUNTIME,name),'utf8');}
export async function loadRecoveryMenu(document,location){const context=vm.createContext({document,location,console}),m=new vm.SourceTextModule(readRuntime('source-menu.mjs'),{context});await m.link(spec=>{assert(spec.endsWith('/build-config.mjs'));return new vm.SyntheticModule(['nativeStageBuild'],function(){this.setExport('nativeStageBuild',null);},{context});});await m.evaluate();return m.namespace.showNativeWorldRecovery;}
export async function loadDockRebuild(){const THREE=await import(pathToFileURL(path.join(SITE,'vendor/three/build/three.module.js')).href),context=vm.createContext({console}),m=new vm.SourceTextModule(fs.readFileSync(path.join(SITE,'src/world/environment.js'),'utf8'),{context});const exports={three:THREE,'three/addons/utils/BufferGeometryUtils.js':{mergeGeometries(){throw Error('unused geometry merge');}},'../config.js':{PLAYER:{waterY:-1.6},effectiveQuality(){throw Error('unused quality lookup');}},'../core/ctx.js':{G:{}},'../../patches/local-quality/idle-resources.mjs':{environmentBudget(){throw Error('unused idle budget');},releaseFarReflection(){throw Error('unused reflection release');},releaseReflection(){throw Error('unused reflection release');}},'../../patches/local-quality/resource-budget.mjs':{reflectionDue(){throw Error('unused reflection budget');}}};await m.link(spec=>{const values=exports[spec];assert(values,'unexpected Environment dependency '+spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();return m.namespace.Environment.prototype._rebuildDock;}
export async function createRecoveryFixture(fail,options={}) {
  const counters={old:0,newPaint:0,newDisplay:0,newMesh:0,oldMinimapActive:0,newMinimapActive:0};
  const scene={items:new Set(),add(...xs){xs.forEach(x=>this.items.add(x));},
    remove(...xs){xs.forEach(x=>this.items.delete(x));}};
  const oldMesh={old:true},oldGroup={old:true},oldPaint={dispose(){counters.old++}};
  const oldMinimap={activate(){counters.oldMinimapActive++}};
  const oldWorld={dispose(){counters.old++;scene.remove(oldGroup);}};
  scene.add(oldMesh,oldGroup);
  const oldLevel={bounds:{minX:0,maxX:100,minZ:0,maxZ:100}};
  const G={scene,level:oldLevel,physics:{old:true},paint:oldPaint,nav:{old:true},
    renderer:{capabilities:{maxTextureSize:4096},getRenderTarget(){return null;},
      setRenderTarget(){},compileAsync(){return Promise.resolve()}},
    teamColors:[],env:{rebuildForArena(){if(fail.env>0){fail.env--;throw Error('env injected')}}}};
  const game={settings:{quality:'low'},mobile:{touch:true},layoutId:'old',levelMesh:oldMesh,
    minimap:oldMinimap,nativeWorld:oldWorld,decor:{dispose(){counters.old++}},
    mapDef:{id:'old'},swimWake:{reset(){}},_footprint(){return {};},
    _shadowRoots(){if(fail.shadow>0){fail.shadow--;throw Error('shadow injected')}},
    _setPalette(){if(fail.palette>0){fail.palette--;throw Error('palette injected')}},_pickPalette(){return 1}};
  class PaintSystem{
    constructor(){this.rt={};this.texture={};this.dryMesh={visible:false};
      this.scene={};this.cam={};this.grid=new Uint8Array(4);this.size=32;this.ppm=1;}
    dispose(){counters.newPaint++}
  }
  class NativeLevel{constructor(){this.bounds={minX:0,maxX:100,minZ:0,maxZ:100};this.faces=[]}}
  class NativeInkMesh{
    constructor(){this.name='newInk'}
    bindPaint(){return this}
    dispose(){counters.newMesh++}
  }
  class Minimap{
    constructor(level,paint,ppm,opts){assert.equal(opts.deferActivation,true);if(fail.minimap>0){fail.minimap--;throw Error('minimap injected')}}
    activate(){counters.newMinimapActive++}
  }
  const mock={
    G,THREE:{LinearFilter:1},
    PaintSystem,NativeLevel,NativePhysics:class{},
    NativeInkMesh,Minimap,SwimWake:class{reset(){}},NavGraph:class{},
    loadNativeData:async()=>({manifest:{geometry:{vertices:3,triangles:1}}}),
    loadNativeTextures:async()=>new Map(),
    nativeStageTextureCaps:()=>({maxDimension:1024}),
    nativeDisplay:()=>{const group={name:'new'};return{group,dispose(){counters.newDisplay++;scene.remove(group)}}},
    nativeInkGeometry:()=>({dispose(){}}),nativeInkMaterial:()=>({dispose(){counters.newMat=(counters.newMat||0)+1;options.materialDispose?.();}}),
    sourceLoadingStatus:()=>({update(){},close(){counters.statusClose=(counters.statusClose||0)+1;options.statusClose?.();}}),showNativeWorldRecovery(){counters.dialog=(counters.dialog||0)+1;options.dialog?.();},
    requestAnimationFrame:f=>f(),performance:{now:()=>5},
    AbortController,DOMException,navigator:{deviceMemory:4},
    console:{warn(){}},
  };
  options.modify?.({mock,counters,G,game,scene,oldMinimap});
  if(options.sharedG){Object.assign(options.sharedG,G);mock.G=options.sharedG;}
  const ctx=vm.createContext(mock),world=new vm.SourceTextModule(readRuntime('native-world.mjs'),{context:ctx});
  const imports={
    three:{THREE:mock.THREE},ctx:{G:mock.G},paint:{PaintSystem:mock.PaintSystem},nav:{NavGraph:mock.NavGraph},minimap:{Minimap:mock.Minimap},swimWake:{SwimWake:mock.SwimWake},
    'native-load':{loadNativeData:mock.loadNativeData,loadNativeTextures:mock.loadNativeTextures},'native-level':{NativeLevel:mock.NativeLevel},'native-physics':{NativePhysics:mock.NativePhysics},
    'native-render':{nativeDisplay:mock.nativeDisplay,nativeInkGeometry:mock.nativeInkGeometry,nativeInkMaterial:mock.nativeInkMaterial},'native-ink-chunks':{NativeInkMesh:mock.NativeInkMesh},
    'native-texture-budget':{nativeStageTextureCaps:mock.nativeStageTextureCaps},'source-menu':{sourceLoadingStatus:mock.sourceLoadingStatus,showNativeWorldRecovery:mock.showNativeWorldRecovery}
  };imports.three=mock.THREE;
  await world.link(spec=>{const key=spec==='three'?'three':spec.split('/').pop().replace(/\.(mjs|js)$/,'');const values=imports[key];assert(values,'unexpected world dependency '+spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});});await world.evaluate();
  return {build:world.namespace.buildNativeWorld,G:mock.G,game,scene,counters,oldLevel,oldPaint,oldMesh,oldWorld,oldMinimap};
}