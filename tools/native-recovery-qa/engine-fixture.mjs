import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { preparedStageAssets, PREPARED_STAGE_ID } from './prepared-assets.mjs';
// Only external preparation and resource fault hooks. The production engine's
// internal publication, allocation, cleanup, cancellation and UI code is intact.
export async function createEngineFixture(engine, THREE, options = {}) {
  assert(vm.SourceTextModule, 'Use --experimental-vm-modules');
  const assets = await preparedStageAssets(webcrypto), faults = {...(options.faults ?? {shadow:1})};
  const counts = {old:0,paint:0,displayGeometry:0,displayMaterial:0,inkGeometry:0,inkMaterial:0,env:0,shadow:0,palette:0,fetch:0,reload:0,nativePreparation:0,minimap:0,oldMinimap:0,statusClose:0,statusOpen:0,worker:0,workerTerminate:0,dialog:0,inkDispose:0};
  const errors = {}, warnings = [], created = [], listeners = new Map();
  function fault(name) { if(faults[name]>0){faults[name]--;throw errors[name] || (errors[name]=Error(name+' injected'));} }
  function element(tag) {
    const e = {tag,style:{},attrs:{},children:[],events:{},focusCalls:0,
      setAttribute(k,v){this.attrs[k]=v;},
      append(...xs){for(const x of xs)this.appendChild(x);},
      appendChild(x){if(x.attrs.role==='alertdialog'){counts.dialog++;fault('dialog');}if(x.id==='native-stage-loading')counts.statusOpen++;this.children.push(x);x.parent=this;},
      addEventListener(k,v){this.events[k]=v;},focus(){this.focusCalls++;},
      remove(){if(this.id==='native-stage-loading'){counts.statusClose++;fault('statusClose');}if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
    };created.push(e);return e;
  }
  const document = options.domFree ? undefined : {body:element('body'),createElement:element};
  const G = {scene:new THREE.Scene(),teamColors:[{}],settings:{},actors:[]};
  const oldGroup=new THREE.Group();G.scene.add(oldGroup);
  const oldLevel={bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4}},oldPaint={dispose(){counts.old++;}},oldWorld={dispose(){counts.old++;G.scene.remove(oldGroup);}},oldMinimap={activate(){counts.oldMinimap++;fault('oldMinimap');}};
  Object.assign(G,{level:oldLevel,paint:oldPaint,physics:{old:true},nav:{old:true},renderer:{capabilities:{maxTextureSize:4096},getRenderTarget(){return null;},setRenderTarget(){},compileAsync(){return Promise.resolve();}}});
  G.env={rebuildForArena(){counts.env++;fault('env');}};
  const game={R:{},settings:{quality:'low'},mobile:{touch:true},nativeWorld:oldWorld,minimap:oldMinimap,layoutId:'old',mapDef:{id:'old'},levelMesh:oldGroup,
    _footprint(){return{};},_shadowRoots(){counts.shadow++;fault('shadow');},_setPalette(){counts.palette++;fault('palette');},_pickPalette(){return 0;}};
  if(options.priorOverlay)game.R._contextRecoveryOverlay=options.priorOverlay;
  const resources=[],seen=new WeakSet();
  function observe(object,key){assert(!seen.has(object),'single resource observer');seen.add(object);resources.push({object,key});object.addEventListener('dispose',()=>{counts[key]++;});const dispose=object.dispose;object.dispose=function(...args){const result=dispose.apply(this,args);fault(key+'Dispose');return result;};return object;}
  // Constructor proxies create unchanged real Three instances; they attach only
  // dispose observers/fault hooks, including detached resources before scene.add.
  let geometries=0,materials=0;
  const instrumentedThree={...THREE,
    BufferGeometry:new Proxy(THREE.BufferGeometry,{construct(target,args,newTarget){const object=Reflect.construct(target,args,newTarget);return observe(object,++geometries%2===1?'displayGeometry':'inkGeometry');}}),
    MeshStandardMaterial:new Proxy(THREE.MeshStandardMaterial,{construct(target,args,newTarget){materials++;return observe(Reflect.construct(target,args,newTarget),'displayMaterial');}})
  };
  const observedMeshes=new WeakSet(),add=G.scene.add;
  G.scene.add=function(...objects){for(const o of objects)if(o.name==='native-game-ink'&&!observedMeshes.has(o)){observedMeshes.add(o);const dispose=o.dispose;o.dispose=function(...args){const result=dispose.apply(this,args);counts.inkDispose++;fault('inkDispose');return result;};}return add.apply(this,objects);};
  class PaintSystem{constructor(){this.rt={};this.texture={};this.dryMesh={visible:false};this.scene={};this.cam={};this.grid=new Uint8Array(4);this.paintFaces=[];this.size=32;this.ppm=1;} _pushQuad(){}clear(){}dispose(){counts.paint++;fault('paintDispose');}}
  class Level{constructor(layout){this.layout=layout;this.bounds=layout.bounds;this.spawnPads=layout.spawnPads.map(p=>new THREE.Vector3(...p));}_buildHash(){}}
  class Physics{constructor(level){this.level=level;}}
  class Hit{constructor(){this.point=new THREE.Vector3();this.normal=new THREE.Vector3();}}
  class GroundHit extends Hit{}
  const config=options.browserDirect?{...assets.config,mode:'browser-direct',runtimeSha256:'prepared-worker-result',stages:[{id:PREPARED_STAGE_ID,name:'Prepared recovery'}]}:assets.config;
  const externals={
    three:instrumentedThree,'../../../src/config.js':{PLAYER:{},WEAPONS:[]},'../../../src/core/ctx.js':{G},
    '../../../src/world/level.js':{Level},'../../../src/game/physics.js':{Physics,Hit,GroundHit,makeContacts(){throw Error('unused contact boundary');}},
    '../../../src/world/paint.js':{PaintSystem},'../../../src/game/nav.js':{NavGraph:class{constructor(level,physics){assert.equal(level.native,true);assert.equal(physics.world,level.triangleWorld);assert.equal(level.data.manifest.id,PREPARED_STAGE_ID);counts.nativePreparation++;}}},
    '../../../src/game/minimap.js':{Minimap:class{constructor(_l,_p,_n,opts){assert.equal(opts.deferActivation,true);counts.minimap++;fault('minimap');}activate(){fault('minimapActivate');}}},
    '../../../src/fx/swimWake.js':{SwimWake:class{reset(){}}},'../../../src/world/levelMaterial.js':{createLevelMaterial(){return observe(new THREE.MeshStandardMaterial(),'inkMaterial');}},
    '../../splatoon3/runtime/clock.mjs':{STEP:1/60},'../../splatoon3/runtime/movement.mjs':{squidSurgeParameters(){throw Error('unused movement boundary');}},
    './registry.mjs':{nativeStageURL(id,file){assert.equal(id,PREPARED_STAGE_ID);return'https://prepared.invalid/'+file;}},'./build-config.mjs':{nativeStageBuild:config}
  };
  class PreparedWorker{constructor(url,opts){assert.equal(url.href,'https://emitted.invalid/patches/native-stages/runtime/source-worker.mjs');assert.equal(opts.type,'module');counts.worker++;}postMessage(message){assert.equal(message.id,PREPARED_STAGE_ID);assert.equal(message.runtimeSha256,config.runtimeSha256);queueMicrotask(()=>this.onmessage({data:{result:assets.data}}));}terminate(){counts.workerTerminate++;}}
  const context=vm.createContext({console:{warn(...args){warnings.push(args.map(x=>x?.message||String(x)));}},document,window:undefined,location:{reload(){counts.reload++;}},crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortController,DOMException,performance,Worker:PreparedWorker,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
    addEventListener(k,v){listeners.set(k,v);},removeEventListener(k,v){assert.equal(listeners.get(k),v);listeners.delete(k);},dispatchEvent(e){listeners.get(e.type)?.(e);},requestAnimationFrame:f=>f(),navigator:{deviceMemory:4},
    fetch:async url=>{const prefix='https://prepared.invalid/';assert(String(url).startsWith(prefix),'known prepared asset URL');const b=assets.files.get(String(url).slice(prefix.length));assert(b,'known prepared asset');counts.fetch++;return{ok:true,arrayBuffer:async()=>{const copy=b.slice();if(options.assetMismatch&&String(url).endsWith('manifest.json'))copy[0]^=1;return copy.buffer;}};}});
  const module=new vm.SourceTextModule(engine,{context,initializeImportMeta(meta){meta.url='https://emitted.invalid/patches/native-stages/runtime/engine.mjs';}}),linked=[];
  await module.link(spec=>{assert(Object.hasOwn(externals,spec),'unknown bundle external: '+spec);linked.push(spec);const values=externals[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
  await module.evaluate();assert.equal(typeof module.namespace.buildNativeWorld,'function','public buildNativeWorld export');assert.equal(typeof module.namespace.releaseNativeWorld,'function','public releaseNativeWorld export');
  return{game,G,counts,document,created,linked,oldLevel,oldPaint,oldWorld,oldMinimap,oldGroup,assets,faults,errors,warnings,resources,listeners,
    async run(current=()=>true){let error;try{await module.namespace.buildNativeWorld(game,{id:PREPARED_STAGE_ID,name:'Prepared recovery'},current);}catch(e){error=e;}return error;}};
}
export async function loadEmittedEnvironment(source,THREE){
  const context=vm.createContext({console}),externals={three:THREE,'three/addons/utils/BufferGeometryUtils.js':{mergeGeometries(){throw Error('unused geometry merge');}},'../config.js':{PLAYER:{waterY:-1.6},effectiveQuality(){throw Error('unused quality lookup');}},'../core/ctx.js':{G:{}},'../../patches/local-quality/idle-resources.mjs':{environmentBudget(){throw Error('unused idle budget');},releaseFarReflection(){throw Error('unused reflection release');},releaseReflection(){throw Error('unused reflection release');}},'../../patches/local-quality/resource-budget.mjs':{reflectionDue(){throw Error('unused reflection budget');}}};
  const module=new vm.SourceTextModule(source,{context});await module.link(spec=>{assert(Object.hasOwn(externals,spec),'unknown Environment external: '+spec);const values=externals[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await module.evaluate();assert.equal(typeof module.namespace.Environment,'function','public Environment export');return module.namespace.Environment;
}
