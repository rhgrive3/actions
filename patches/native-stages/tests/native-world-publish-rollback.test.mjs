// #1652: a late exception while publishing a native stage must leave the previous
// world live and playable. The candidate is prepared detached, the previous world
// is only released after the whole publication succeeded, and a failure restores
// every global that publication touched before the candidate is disposed once.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
if(!vm.SourceTextModule){test('native world publish rollback VM subprocess',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--max-old-space-size=128','--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});}else{
const source=fs.readFileSync(new URL('../runtime/native-world.mjs',import.meta.url),'utf8');
const boom=label=>Object.assign(new Error('injected '+label),{injected:label});

async function fixture(){
 const counts={},bump=k=>counts[k]=(counts[k]||0)+1;
 const scene=new Set(),fail={},envCalls=[],shadowRoots=[],palettes=[],made={};
 const sceneApi={
  add(...items){if(fail.sceneAdd){delete fail.sceneAdd;throw boom('scene add');}for(const item of items)if(item)scene.add(item);},
  remove(...items){for(const item of items)scene.delete(item);}
 };
 // dispose() of the real display/ink mesh detaches from the scene as well.
 const owned=(kind,item)=>Object.assign(item,{dispose(){bump(kind+'Dispose');scene.delete(item);}});
 const oldLevel={bounds:{minX:-4,minZ:-4,maxX:4,maxZ:4},tag:'old level'},oldPhysics={tag:'old physics'},oldNav={tag:'old nav'};
 const oldPaint=owned('oldPaint',{tag:'old paint'}),oldMesh=owned('oldMesh',{tag:'old mesh'}),oldMat=owned('oldMat',{tag:'old mat'});
 const oldDecor=owned('oldDecor',{group:{tag:'old decor group'}}),oldMinimap={tag:'old minimap',version:3},oldMapDef={id:'old-map'};
 const oldWorld=owned('oldWorld',{tag:'old world'});
 scene.add(oldMesh);scene.add(oldDecor.group);
 const renderer={capabilities:{maxTextureSize:4096},target:'previous',getRenderTarget(){return this.target},setRenderTarget(x){this.target=x},compileAsync(){return Promise.resolve();}};
 const G={renderer,scene:sceneApi,paint:oldPaint,level:oldLevel,physics:oldPhysics,nav:oldNav,teamColors:[{},{}],
  env:{rebuildForArena(bounds){envCalls.push(bounds);if(fail.env){delete fail.env;throw boom('environment');}}}};
 const game={settings:{quality:'high'},layoutId:'old',mapDef:oldMapDef,_builtQuality:'high',levelMesh:oldMesh,levelMat:oldMat,grateMesh:null,grateMat:null,decor:oldDecor,
  stageLightmap:null,props:null,minimap:oldMinimap,nativeWorld:oldWorld,palette:{name:'palette'},swimWake:{reset(){bump('wake');}},
  _footprint:level=>({footprintOf:level.tag||'candidate'}),_pickPalette(){return{name:'picked'};},
  _shadowRoots(){shadowRoots.push({mesh:this.levelMesh,decor:this.decor});if(fail.shadows){delete fail.shadows;throw boom('shadow roots');}},
  _setPalette(p){palettes.push({palette:p,mat:this.levelMat});if(fail.palette){delete fail.palette;throw boom('palette');}}};
 const data={manifest:{geometry:{vertices:3,triangles:1}}};
 const modules={
  three:{LinearFilter:1},
  ctx:{G},
  paint:{PaintSystem:class{constructor(){bump('paint');made.paint=this;Object.assign(this,owned('paint',{}),{texture:{},dryMesh:{visible:false},rt:{},scene:{},cam:{},grid:new Uint8Array(1),size:1,ppm:1});}}},
  nav:{NavGraph:class{constructor(){bump('nav');made.nav=this;}}},
  minimap:{Minimap:class{constructor(level){assert.ok(level.nativeNav);if(fail.minimap){delete fail.minimap;throw boom('minimap');}bump('minimap');made.minimap=this;this.version=-1;}}},
  swimWake:{SwimWake:class{reset(){bump('newWake');}}},
  'native-load':{loadNativeData:async()=>data,loadNativeTextures:async()=>new Map()},
  'native-texture-budget':{nativeStageTextureCaps:()=>({maxDimension:1024,perRole:{}})},
  'native-level':{NativeLevel:class{constructor(){this.faces=[];this.bounds={minX:0,minZ:0,maxX:2,maxZ:2};made.level=this;}}},
  'native-physics':{NativePhysics:class{constructor(){made.physics=this;}}},
  'native-render':{
   nativeDisplay(){bump('display');made.display=owned('display',{group:{tag:'candidate group'}});return made.display;},
   nativeInkGeometry(){bump('ink');return owned('geometry',{});},
   nativeInkMaterial(){bump('material');made.material=owned('material',{});return made.material;}
  },
  'native-ink-chunks':{NativeInkMesh:class{constructor(geometry){bump('mesh');made.mesh=this;this.geometry=geometry;}bindPaint(){return this;}dispose(){bump('meshDispose');scene.delete(this);this.geometry.dispose();}}},
  'source-menu':{sourceLoadingStatus(){return{update(){},close(){bump('statusClose');}};}}
 };
 const context=vm.createContext({AbortController,DOMException,performance,console:{warn(){bump('warn');},log(){},error(){}},requestAnimationFrame:fn=>setImmediate(()=>fn())}),m=new vm.SourceTextModule(source,{context});
 await m.link(spec=>{const key=spec==='three'?'three':spec.split('/').pop().replace(/\.(mjs|js)$/,'');const values=modules[key];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 await m.evaluate();
 const build=()=>m.namespace.buildNativeWorld(game,{id:'tiny',name:'tiny'},()=>true);
 const previous={level:oldLevel,physics:oldPhysics,nav:oldNav,paint:oldPaint,mesh:oldMesh,mat:oldMat,decor:oldDecor,minimap:oldMinimap,mapDef:oldMapDef,world:oldWorld};
 return{counts,fail,scene,envCalls,shadowRoots,palettes,made,G,game,previous,build};
}

function assertPreviousWorldLive(f){
 const{G,game,previous:p,counts,scene}=f;
 assert.equal(G.level,p.level);assert.equal(G.physics,p.physics);assert.equal(G.paint,p.paint);assert.equal(G.nav,p.nav);
 assert.equal(game.layoutId,'old');assert.equal(game.mapDef,p.mapDef);assert.equal(game._builtQuality,'high');
 assert.equal(game.levelMesh,p.mesh);assert.equal(game.levelMat,p.mat);assert.equal(game.decor,p.decor);
 assert.equal(game.minimap,p.minimap);assert.equal(game.nativeWorld,p.world);
 for(const key of['oldPaintDispose','oldMeshDispose','oldMatDispose','oldDecorDispose','oldWorldDispose'])assert.equal(counts[key]||0,0,key+' must not run while the previous world is live');
 assert.ok(scene.has(p.mesh)&&scene.has(p.decor.group),'previous world stays in the scene');
 assert.ok(!scene.has(f.made.display?.group)&&!scene.has(f.made.mesh),'candidate is not left in the scene');
}
function assertCandidateReleasedOnce(f){
 const{counts}=f;
 for(const key of['display','paint','mesh','geometry','material'])assert.equal(counts[key+'Dispose'],1,key+' disposed exactly once');
}

for(const[label,key,injected]of[['Minimap construction','minimap','minimap'],['environment rebuild','env','environment'],['shadow roots','shadows','shadow roots'],['palette','palette','palette'],['scene add','sceneAdd','scene add']])test('late '+label+' failure keeps the previous world live and retry succeeds',async()=>{
 const f=await fixture();f.fail[key]=true;
 await assert.rejects(f.build(),e=>e.injected===injected,'the publication error is still reported to the caller');
 assertPreviousWorldLive(f);assertCandidateReleasedOnce(f);
 assert.equal(f.counts.statusClose,1);
 // The environment and shadow roots describe the previous world again.
 assert.equal(f.envCalls.at(-1),f.previous.level.bounds,'environment bounds restored to the previous stage');
 const lastShadow=f.shadowRoots.at(-1);assert.equal(lastShadow.mesh,f.previous.mesh);assert.equal(lastShadow.decor,f.previous.decor);
 assert.equal(f.palettes.at(-1).mat,f.previous.mat,'palette re-applied to the previous level material');
 // Retry with the injection consumed: the transaction commits and only then releases the previous world.
 await f.build();
 assert.equal(f.G.paint,f.made.paint);assert.equal(f.G.level,f.made.level);assert.equal(f.game.layoutId,'tiny');
 assert.equal(f.game.nativeWorld.display,f.made.display);assert.equal(f.game.minimap,f.made.minimap);
 assert.equal(f.counts.oldWorldDispose,1);assert.equal(f.counts.oldPaintDispose,1);assert.equal(f.counts.oldDecorDispose,1);
 assert.equal(f.counts.displayDispose,1,'the published candidate is owned by game.nativeWorld and is not disposed again');
 assert.equal(f.counts.paintDispose,1);assert.equal(f.counts.meshDispose,1);assert.equal(f.counts.materialDispose,1);
});

test('a throwing rollback step does not skip the remaining restoration or the candidate cleanup',async()=>{
 const f=await fixture();f.fail.minimap=true;
 const original=f.G.env.rebuildForArena;let calls=0;
 f.G.env.rebuildForArena=function(bounds){calls++;if(calls>=2)throw boom('environment rollback');return original.call(this,bounds);};
 await assert.rejects(f.build(),e=>e.injected==='minimap','the original publication error is the one reported');
 assertPreviousWorldLive(f);assertCandidateReleasedOnce(f);
 assert.equal(f.shadowRoots.at(-1).mesh,f.previous.mesh);assert.equal(f.palettes.at(-1).mat,f.previous.mat);
 assert.ok(f.counts.warn>=1,'the rollback step failure is diagnosable');
});

test('a failing cleanup of the previous world after commit neither rolls back nor double-disposes the new world',async()=>{
 const f=await fixture();f.previous.world.dispose=()=>{f.counts.oldWorldDispose=(f.counts.oldWorldDispose||0)+1;throw boom('old world cleanup');};
 await f.build();
 assert.equal(f.game.layoutId,'tiny');assert.equal(f.game.nativeWorld.display,f.made.display);assert.equal(f.G.paint,f.made.paint);
 assert.equal(f.counts.oldWorldDispose,1);assert.equal(f.counts.oldPaintDispose,1,'later cleanup steps still run');
 assert.ok(f.counts.warn>=1);
 for(const key of['display','paint','mesh','material'])assert.equal(f.counts[key+'Dispose']||0,0,key+' belongs to the published world');
});

test('a successful publication releases the previous world only after the new world is fully installed',async()=>{
 const f=await fixture();let observed=null;
 f.previous.world.dispose=()=>{observed={paint:f.G.paint,display:f.game.nativeWorld.display,minimap:f.game.minimap,layout:f.game.layoutId};f.counts.oldWorldDispose=(f.counts.oldWorldDispose||0)+1;};
 await f.build();
 assert.equal(f.counts.oldWorldDispose,1);
 assert.deepEqual(observed,{paint:f.made.paint,display:f.made.display,minimap:f.made.minimap,layout:'tiny'});
});
}
