import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../patches/native-stages/runtime/native-world.mjs',import.meta.url),'utf8')
  .replace(/^import .*$/gm,'').replace(/\bexport (?=(?:async )?function )/g,'') +
  '\n;globalThis.buildNativeWorld=buildNativeWorld;';

function fixture(fail) {
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
    nativeInkGeometry:()=>({dispose(){}}),nativeInkMaterial:()=>({dispose(){}}),
    sourceLoadingStatus:()=>({update(){},close(){}}),
    requestAnimationFrame:f=>f(),performance:{now:()=>5},
    AbortController,DOMException,navigator:{deviceMemory:4},
    console:{warn(){}},
  };
  const ctx=vm.createContext(mock);
  vm.runInContext(source,ctx);
  return {build:ctx.buildNativeWorld,G,game,scene,counters,oldLevel,oldPaint,oldMesh,oldWorld,oldMinimap};
}
test('late shadow failure keeps previous playable world and cleans candidate once',async()=>{
  const f=fixture({shadow:1,env:0,palette:0,minimap:0});
  await assert.rejects(()=>f.build(f.game,{id:'native-test',name:'Native'},()=>true),/shadow injected/);
  assert.equal(f.G.level,f.oldLevel);
  assert.equal(f.G.paint,f.oldPaint);
  assert.equal(f.game.nativeWorld,f.oldWorld);
  assert.equal(f.game.levelMesh,f.oldMesh);
  assert.equal(f.counters.old,0,'previous GPU resources must stay live');
  assert.equal(f.counters.newDisplay,1);
  assert.equal(f.counters.newPaint,1);
  assert.equal(f.counters.newMesh,1);
  assert.equal(f.scene.items.has(f.oldMesh),true);
  assert.equal(f.counters.oldMinimapActive,1);
  await f.build(f.game,{id:'native-test',name:'Native'},()=>true);
  assert.equal(f.G.paint===f.oldPaint,false,'retry really publishes candidate');
  assert.equal(f.counters.old>0,true,'previous world disposes after successful publication');
  assert.equal(f.counters.newMinimapActive,1);
});
test('minimap constructor failure never touches live global handles',async()=>{
  const f=fixture({minimap:1,shadow:0,env:0,palette:0});
  await assert.rejects(()=>f.build(f.game,{id:'native-test',name:'Native'},()=>true),/minimap injected/);
  assert.equal(f.G.paint,f.oldPaint);
  assert.equal(f.game.nativeWorld,f.oldWorld);
  assert.equal(f.counters.old,0);
  assert.equal(f.counters.newPaint,1);
});
test('environment failure rolls back stage pointers and can retry',async()=>{
  const f=fixture({env:1,shadow:0,palette:0,minimap:0});
  await assert.rejects(()=>f.build(f.game,{id:'native-test',name:'Native'},()=>true),/env injected/);
  assert.equal(f.G.level,f.oldLevel);
  assert.equal(f.game.layoutId,'old');
  assert.equal(f.game.levelMesh,f.oldMesh);
  assert.equal(f.counters.old,0);
  await f.build(f.game,{id:'native-test',name:'Native'},()=>true);
  assert.equal(f.game.layoutId,'native-test');
});
