import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {installExplosherGeometryLifetime, instrumentExplosherGeometryDriver} from '../lib/inkwave-explosher-geometry-lifetime.mjs';

function fixture({attach=true}={}) {
  const calls = [], result = {}, originalError = Error('native error');
  class GL {
    constructor() { this.canvas = {id:'game-canvas'}; }
    bindBuffer(...args) { calls.push({name:'bindBuffer', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    bufferData(...args) { calls.push({name:'bufferData', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    bufferSubData(...args) { calls.push({name:'bufferSubData', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    deleteBuffer(...args) { calls.push({name:'deleteBuffer', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    bindVertexArray(...args) { calls.push({name:'bindVertexArray', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
  }
  let id = 0;
  class Geometry {
    constructor() { this.id=++id;this.attributes={};this.index=null;this.listeners=new Set(); }
    setAttribute(name, value) { calls.push({name:'setAttribute', receiver:this, args:[name,value]}); if(name==='throw')throw originalError; this.attributes[name]=value;return this; }
    setIndex(value) { calls.push({name:'setIndex', receiver:this,args:[value]});if(value==='throw')throw originalError;this.index=value;return this; }
    addEventListener(name, fn) { assert.equal(name,'dispose');this.listeners.add(fn); }
    removeEventListener(name, fn) { assert.equal(name,'dispose');this.listeners.delete(fn); }
    dispose() { for(const listener of this.listeners)listener.call(this,{type:'dispose'}); }
  }
  const descriptors=[GL,Geometry].flatMap(C=>Object.getOwnPropertyNames(C.prototype).map(name=>({owner:C.prototype,name,descriptor:Object.getOwnPropertyDescriptor(C.prototype,name)})));
  const env={WebGLRenderingContext:GL,WebGL2RenderingContext:GL,document:{getElementById:()=>null},__G:{scene:{children:[]},renderer:{info:{memory:{geometries:281,textures:46}}}},__inkwave:{showcase:{scene:{children:[]}}}};
  const observer=installExplosherGeometryLifetime(env);if(attach)observer.attachGeometry(new Geometry());
  return {calls,result,originalError,GL,Geometry,env,observer,descriptors};
}
test('delegates native this, all arguments, exact return and original errors exactly once; no extra GL calls',()=>{
  const f=fixture();try {
    const gl=new f.GL(),g=new f.Geometry(),array=new Float32Array(3),buffer={};
    assert.equal(g.setAttribute('position',{array}),g);assert.equal(g.setIndex({array:new Uint16Array(3)}),g);
    assert.equal(gl.bindBuffer(34962,buffer),f.result);assert.equal(gl.bufferData(34962,array,35044,0,3),f.result);
    assert.equal(gl.bufferSubData(34962,0,array,0,3),f.result);assert.equal(gl.deleteBuffer(buffer),f.result);
    assert.deepEqual(f.calls.slice(2).map(c=>c.name),['bindBuffer','bufferData','bufferSubData','deleteBuffer']);
    assert(f.calls.slice(2).every(c=>c.receiver===gl));assert.deepEqual(f.calls[3].args,[34962,array,35044,0,3]);
    for(const name of ['bindBuffer','bufferData','bufferSubData','deleteBuffer'])assert.throws(()=>gl[name]('throw'),e=>e===f.originalError);
    assert.throws(()=>g.setAttribute('throw',{}),e=>e===f.originalError);assert.throws(()=>g.setIndex('throw'),e=>e===f.originalError);
    assert.equal(f.calls.length,12,'six normal calls and six throwing originals, once each');
    assert.equal(f.observer.report().counts.bufferData,1,'a thrown native call is not observed as an upload');
  }finally{f.observer.restore();}
});
test('reports shared ArrayBuffer relationships, late census registration and actual disposal call chronology without exclusive ownership claims',()=>{
  const f=fixture();try {
    const gl=new f.GL(),data=new Float32Array(6),buffer={};gl.bindBuffer(34962,buffer);gl.bufferData(34962,data,35044);
    const a=new f.Geometry(),b=new f.Geometry();a.setAttribute('position',{array:data});b.attributes.position={array:data.subarray(0,3)};
    f.env.__G.scene.children=[{geometry:a,children:[]},{geometry:b,children:[]}];
    f.observer.boundary('before-character-reset');
    let r=f.observer.report();assert.equal(r.buffers.length,1);assert.deepEqual(r.buffers[0].geometryIds,[a.id,b.id]);
    assert.deepEqual(r.snapshots[0].sceneGeometryIds.world,[a.id,b.id]);assert.deepEqual(r.snapshots[0].nativeMemory,{geometries:281,textures:46});
    assert.equal(r.geometries.find(g=>g.id===b.id).firstObservation,'scene-census');
    a.dispose();gl.deleteBuffer(buffer);r=f.observer.report();
    assert.equal(r.counts.geometryDispose,1);assert.equal(r.buffers[0].deleted,true);
    assert(r.geometries[0].disposeSequence<r.buffers[0].deleteSequence);
    assert.match(r.scope,/no GL error polling/);assert.match(r.scope,/exclusive GPU ownership/);assert.equal(r.acceptance,false);
    assert.equal(f.env.__G.renderer.info.memory.geometries,281,'global resource gate input was not rewritten');
  }finally{f.observer.restore();}
});
test('observer failures cannot replace successful native calls and malformed/unmapped data is not invented as geometry ownership',()=>{
  const f=fixture();try {
    const gl=new f.GL(),buffer={},geometry=new f.Geometry();Object.defineProperty(geometry,'id',{get(){throw Error('metadata unavailable');}});
    assert.equal(geometry.setAttribute('position',{}),geometry);
    gl.bindBuffer(34962,buffer);assert.equal(gl.bufferData(34962,32,35044),f.result);
    const r=f.observer.report();assert.equal(r.counts.observerErrors,1);assert.deepEqual(r.buffers[0].geometryIds,[]);
  }finally{f.observer.restore();}
});
test('discovers the actual existing geometry module, never a second root-vendor constructor; late coverage stays explicit',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'explosher-geometry-module-'));
  const f=fixture({attach:false});
  try {
    fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
    for(const file of ['three.module.js','three.core.js'])fs.copyFileSync(new URL('../../inkwave-public/vendor/three/build/'+file,import.meta.url),path.join(dir,file));
    const rootModule=await import('../../inkwave-public/vendor/three/build/three.module.js');
    const actualModule=await import(pathToFileURL(path.join(dir,'three.module.js')).href);
    assert.notEqual(rootModule.BufferGeometry,actualModule.BufferGeometry,'versioned and root closures can have distinct constructors');
    const unrelated=Object.getOwnPropertyDescriptor(rootModule.BufferGeometry.prototype,'setAttribute');
    const actualDescriptor=Object.getOwnPropertyDescriptor(actualModule.BufferGeometry.prototype,'setAttribute');
    const existing=new actualModule.BufferGeometry();existing.setAttribute('position',new actualModule.BufferAttribute(new Float32Array(3),3));
    f.env.__G.scene.children=[{geometry:existing,children:[]}];
    assert.equal(f.observer.report().coverage.geometryMethodOwners,0);
    f.observer.boundary('range-entry');
    const later=new actualModule.BufferGeometry();later.setAttribute('position',new actualModule.BufferAttribute(new Float32Array(3),3));
    const r=f.observer.report();assert(r.geometries.some(g=>g.id===existing.id));assert(r.geometries.some(g=>g.id===later.id));
    assert.equal(r.coverage.preConstructionCoverage,false);assert.equal(r.coverage.geometryAttachment,'late-existing-object-only');
    assert.deepEqual(Object.getOwnPropertyDescriptor(rootModule.BufferGeometry.prototype,'setAttribute'),unrelated,'unrelated closure stays untouched');
    f.observer.restore();assert.deepEqual(Object.getOwnPropertyDescriptor(actualModule.BufferGeometry.prototype,'setAttribute'),actualDescriptor);
  }finally{f.observer.restore();fs.rmSync(dir,{recursive:true,force:true});}
});
test('implicit VAO element bindings become unknown, not falsely attributed; WebGL1 extension bindings are not claimed',()=>{
  const f=fixture();try {
    const gl=new f.GL(),data=new Uint16Array(3),a={},b={};
    gl.bindBuffer(34963,a);gl.bufferData(34963,data,35044);
    assert.equal(gl.bindVertexArray(b),f.result);gl.bufferData(34963,data,35044);
    let r=f.observer.report();assert.equal(r.buffers[0].dataCalls,1);assert.equal(r.counts.unmappedBufferCalls,1);
    gl.bindBuffer(34963,b);gl.bufferSubData(34963,0,data);r=f.observer.report();
    assert.equal(r.buffers.length,2);assert.equal(r.buffers[1].subDataCalls,1);
    assert.throws(()=>gl.bindVertexArray('throw'),e=>e===f.originalError);assert.equal(f.observer.report().counts.vertexArrayBind,1);
    assert.equal(r.coverage.extensionVAOBindingsObserved,false);
  }finally{f.observer.restore();}
  const f1=fixture();try {
    // An extension's implicit binding changes cannot be observed through this
    // prototype. Disabling core support is conservative, with no extra GL call.
    delete f1.GL.prototype.bindVertexArray;
    const gl=new f1.GL();gl.bindBuffer(34963,{});gl.bufferData(34963,new Uint16Array(3),35044);
    const r=f1.observer.report();assert.equal(r.buffers.length,0);assert.equal(r.counts.unmappedBufferCalls,1);
  }finally{f1.observer.restore();}
});
test('native deletion implicitly unbinds every observed target and later calls are unknown rather than linked to deleted allocations',()=>{
  const f=fixture();try {
    const gl=new f.GL(),object={},data=new Float32Array(3);
    gl.bindBuffer(34962,object);gl.bindBuffer(36662,object);gl.bufferData(34962,data,35044);
    assert.equal(gl.deleteBuffer(object),f.result);gl.bufferData(34962,data,35044);gl.bufferSubData(36662,0,data);
    const r=f.observer.report();assert.equal(r.buffers.length,1);assert.equal(r.buffers[0].deleted,true);
    assert.equal(r.buffers[0].dataCalls,1);assert.equal(r.buffers[0].subDataCalls,0);assert.equal(r.counts.unmappedBufferCalls,2);
  }finally{f.observer.restore();}
});
test('full descriptor restoration, listener cleanup and late attachment/calls cannot leave a prototype or global observer leak',()=>{
  const f=fixture(),g=new f.Geometry();g.setAttribute('position',{array:new Float32Array(3)});assert.equal(g.listeners.size,1);
  const r=f.observer.restore();assert.equal(r.cleanup.conflicts,0);assert.equal(r.cleanup.restoredMethods,r.cleanup.patchedMethods);assert.equal(g.listeners.size,0);
  for(const p of f.descriptors)assert.deepEqual(Object.getOwnPropertyDescriptor(p.owner,p.name),p.descriptor);
  const before=f.observer.report().counts;g.setAttribute('normal',{array:new Float32Array(3)});g.dispose();
  f.observer.attachGeometry(new f.Geometry());f.observer.boundary('shot-input');
  assert.deepEqual(f.observer.report().counts,before);assert.deepEqual(f.observer.restore(),f.observer.report());
  assert.equal(Object.hasOwn(f.env,'__inkwaveExplosherGeometryLifetime'),false);
});
test('bounded observations remain explicit about truncation and attachment coverage',()=>{
  const f=fixture();try {
    for(let i=0;i<1100;i++)new f.Geometry().setAttribute('position',{array:new Float32Array(3)});
    for(let i=0;i<200;i++)f.observer.boundary('unknown-'+i);
    const gl=new f.GL();gl.bindBuffer(34962,{});for(let i=0;i<200;i++)gl.bufferData(34962,16,35044);
    const r=f.observer.report();assert.equal(r.geometries.length,r.limits.geometries);assert(r.dropped.geometries>0);
    assert.equal(r.events.length,r.limits.events);assert(r.dropped.events>0);assert.equal(r.snapshots.length,0);
    assert.equal(r.coverage.webglPrototypes,1,'shared prototypes are never wrapped twice');assert.equal(r.coverage.geometryMethodOwners,1);
    assert.equal(r.coverage.geometryAttachment,'late-existing-object-only');assert.equal(r.coverage.preConstructionCoverage,false);
    assert(Buffer.byteLength(JSON.stringify(r))<600000,'bounded artifact even after saturation');
  }finally{f.observer.restore();}
});
test('early startup hook wraps only constructed native renderer and censuses before its actual render uploads',()=>{
  const f=fixture({attach:false});try {
    const gl=new f.GL(),data=new Float32Array(3),buffer={},geometry=new f.Geometry();
    geometry.attributes.position={array:data};
    const scene={geometry,children:[]},sentinel={},calls=[];
    const renderer={render(...args){calls.push({receiver:this,args});gl.bindBuffer(34962,buffer);gl.bufferData(34962,data,35044);return sentinel;}};
    const originalRender=Object.getOwnPropertyDescriptor(renderer,'render');
    const startup={measure(name,run,...args){calls.push({name,receiver:this,args});return Reflect.apply(run,this,args);}};
    const originalMeasure=Object.getOwnPropertyDescriptor(startup,'measure');
    f.env.__inkwaveStartup=startup;
    assert.equal(f.observer.report().coverage.startupMeasureHook,true);
    const nativeMeasure=startup.measure,unrelated={renderer:{render(){throw Error('not called');}}};
    assert.equal(nativeMeasure('construct/Other',()=>unrelated),unrelated);
    assert.equal(f.observer.report().coverage.earlyRendererRenderHook,false);
    const owner={renderer},runReceiver={},marker={};
    assert.equal(nativeMeasure.call(runReceiver,'construct/Renderer',function(arg){assert.equal(this,runReceiver);assert.equal(arg,marker);return owner;},marker),owner);
    assert.equal(calls.length,2,'startup hook adds no native render or GL call');
    assert.equal(renderer.render(scene,marker),sentinel);
    let r=f.observer.report();assert.equal(calls.length,3);assert.equal(calls[2].receiver,renderer);assert.deepEqual(calls[2].args,[scene,marker]);
    assert.equal(r.counts.renderCensusCalls,1);assert.equal(r.coverage.earlyRendererRenderHook,true);
    assert.equal(r.coverage.geometryAttachment,'early-render-census-and-late-existing-object');assert.equal(r.coverage.preConstructionCoverage,false);
    assert.equal(r.geometries[0].firstObservation,'render-census');assert.deepEqual(r.buffers[0].geometryIds,[geometry.id]);
    assert(r.geometries[0].firstSequence<r.events.find(e=>e.kind==='bufferData').sequence);
    assert.deepEqual(f.calls.map(c=>c.name),['bindBuffer','bufferData'],'only calls made by the actual renderer');
    const failure=Error('render fails');const originalWrapped=renderer.render;
    Object.defineProperty(scene,'geometry',{get(){throw Error('observer metadata');},configurable:true});
    assert.equal(renderer.render(scene,marker),sentinel,'observer error cannot replace native result');
    assert.equal(f.observer.report().counts.observerErrors,1);
    assert.throws(()=>nativeMeasure('construct/Renderer',()=>{throw failure;}),e=>e===failure);
    assert.equal(renderer.render,originalWrapped);
    r=f.observer.restore();assert.equal(r.cleanup.conflicts,0);
    assert.deepEqual(Object.getOwnPropertyDescriptor(renderer,'render'),originalRender);
    assert.deepEqual(Object.getOwnPropertyDescriptor(startup,'measure'),originalMeasure);
    assert.equal(f.env.__inkwaveStartup,startup,'normal startup data property remains installed');
    assert.equal(Object.hasOwn(f.env,'__inkwaveExplosherGeometryLifetime'),false);
  }finally{f.observer.restore();}
});
test('early hook preserves native render errors and bounded event eviction/drop accounting',()=>{
  const f=fixture({attach:false});try {
    const failure=Error('native render failure'),g=new f.Geometry(),scene={geometry:g,children:[]};
    const gl=new f.GL();let calls=0;const renderer={render(){calls++;gl.bindBuffer(34962,{});gl.bufferData(34962,16,35044);if(calls===201)throw failure;return calls;}};
    f.env.__inkwaveStartup={measure:(_name,run)=>run()};f.env.__inkwaveStartup.measure('construct/Renderer',()=>({renderer}));
    for(let i=0;i<200;i++)assert.equal(renderer.render(scene),i+1);
    assert.throws(()=>renderer.render(scene),e=>e===failure);assert.equal(calls,201);
    const r=f.observer.report();assert.equal(r.counts.renderCensusCalls,201);assert.equal(r.events.length,r.limits.events);
    assert.equal(r.dropped.events,74,'one geometry observation plus 201 uploads minus retained events');
    assert.equal(r.events[0].sequence,75);assert.equal(r.events.at(-1).sequence,202);
    assert.equal(r.counts.bufferData,201);assert.equal(r.counts.registrations,1);
  }finally{f.observer.restore();}
});
test('actual composed and minified startup expose the renderer construction before shader warmup',async()=>{
  const {adaptBuildSource}=await import('../inkwave-source-composition.mjs');
  const {adaptCompiledMain}=await import('../../patches/loading-cache/adapter.mjs');
  const {transform}=await import('esbuild');
  const startup=fs.readFileSync(new URL('../../patches/loading-cache/runtime/startup.mjs',import.meta.url),'utf8');
  assert.match(startup,/window\.__inkwaveStartup\s*=\s*\{/);
  const raw=fs.readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const composed=adaptBuildSource('src/main.js',raw);
  for(const source of [composed,(await transform(composed,{minify:true,format:'esm',target:'es2022'})).code]){
    const adapted=adaptCompiledMain(source).code;
    const construct=adapted.indexOf('\"construct/Renderer\"'),compile=adapted.indexOf('\"boot/shader-compile\"');
    assert(construct>=0&&compile>construct,'native construction hook precedes the real warmup');
    assert.equal(adapted.split('\"construct/Renderer\"').length,2,'exactly one target construction');
  }
});
test('unassigned startup hook is removed without inventing a startup global',()=>{
  const f=fixture({attach:false});assert.equal(Object.hasOwn(f.env,'__inkwaveStartup'),true);
  f.observer.restore();assert.equal(Object.hasOwn(f.env,'__inkwaveStartup'),false);
});
test('source binds the helper bytes and runs focused contracts without changing stage gates, GL state, startup barrier or cleanup error authority',()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
  assert.match(source,/if\(!runtimeUIRoute\)driver=instrumentExplosherGeometryDriver\(driver\)/);
  assert.match(source,/captureProtocolSha256=[^\n]*'inkwave-explosher-geometry-lifetime.mjs'/);
  const helper=fs.readFileSync(new URL('../lib/inkwave-explosher-geometry-lifetime.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/\.getError\(|\.getParameter\(|\.finish\(|\.flush\(|\.render\(|\.warmAll\(|\.setVisible\(/);
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
  for(const file of ['scripts/lib/inkwave-explosher-geometry-lifetime.mjs','scripts/tests/inkwave-explosher-geometry-lifetime.test.mjs'])assert(workflow.includes("      - '"+file+"'\n"),'helper-only changes retain automatic native diagnostic coverage');
  assert.match(workflow,/node --test scripts\/tests\/inkwave-explosher-runtime-ui-preflight.test.mjs scripts\/tests\/inkwave-explosher-geometry-lifetime.test.mjs/);
  assert.match(workflow,/readExplosherStagePair\('preflight'/);assert.equal((workflow.match(/if: false/g)||[]).length,3);assert.doesNotMatch(workflow,/continue-on-error/);
  const driver="let browser;\nconst page = await browser.newPage({});\n  await enterRangeFromMenu(page,base);\n      window.resetExplosherRandom('character-reset');\n      await resetCaptureCharacter(a);\n      window.resetExplosherRandom('shot-input');\n      window.markExplosherRandomBoundary('native-birth');\n          window.markExplosherRandomBoundary('after-draw-probe');\n  await browser?.close();";
  const output=instrumentExplosherGeometryDriver(driver);assert.doesNotThrow(()=>new (Object.getPrototypeOf(async function(){}).constructor)(output));
  assert(output.indexOf('page.addInitScript')<output.indexOf('await enterRangeFromMenu'));
  assert(output.indexOf("boundary('before-character-reset')")<output.indexOf('await resetCaptureCharacter'));
  assert(output.indexOf('observer.restore()')<output.indexOf('await browser?.close()'));
  assert.match(output,/finally \{ delete window\.__inkwaveExplosherGeometryLifetime; \}/);
  assert.doesNotMatch(output,/await import\(|await observer/,'no new native startup readiness barrier');
  assert.doesNotMatch(output,/import\(/,'no second vendor module or versioned constructor-identity assumption');
  assert.throws(()=>instrumentExplosherGeometryDriver(driver.replace('let browser;','')),/anchor/);
  assert.throws(()=>instrumentExplosherGeometryDriver(driver+'\nlet browser;'),/anchor/);
});
test('actual generated finally bounds a never-resolving diagnostic, clears timers and retains the original failure and browser close path',async()=>{
  const driver="let browser;\nconst page = await browser.newPage({});\n  await enterRangeFromMenu(page,base);\n      window.resetExplosherRandom('character-reset');\n      await resetCaptureCharacter(a);\n      window.resetExplosherRandom('shot-input');\n      window.markExplosherRandomBoundary('native-birth');\n          window.markExplosherRandomBoundary('after-draw-probe');\n  await browser?.close();";
  const output=instrumentExplosherGeometryDriver(driver),begin=output.indexOf('  let geometryDiagnosticTimer;');assert(begin>=0);
  const body=output.slice(begin),Async=Object.getPrototypeOf(async function(){}).constructor;
  const run=new Async('geometryPage','browser','fs','path','out','setTimeout','clearTimeout','original',`try { throw original; } finally { ${body} }`);
  for(const mode of ['pending','reject','resolve','closed','native-close-fails']){
    const original=Error('original capture failure'),closeError=Error('native close failure'),timers=new Map(),writes=[];let next=0,closed=0,cleared=0;
    const page={isClosed:()=>mode==='closed',evaluate:()=>mode==='pending'?new Promise(()=>{}):mode==='reject'?Promise.reject(Error('diagnostic rejection')):Promise.resolve({schema:1,acceptance:false,cleanup:{stopped:true}})};
    const browser={close:async()=>{closed++;if(mode==='native-close-fails')throw closeError;}};
    const promise=run(page,browser,{writeFileSync:(_path,value)=>writes.push(JSON.parse(value))},{join:(...p)=>p.join('/')},'/evidence',
      (fn,ms)=>{assert.equal(ms,2000);timers.set(++next,fn);return next;},id=>{cleared++;timers.delete(id);},original);
    const expected=mode==='native-close-fails'?closeError:original;
    const rejection=assert.rejects(promise,error=>error===expected);
    if(mode==='pending'){
      await Promise.resolve();assert.equal(closed,0);assert.equal(timers.size,1);
      [...timers.values()][0]();
    }
    await rejection;assert.equal(closed,1);assert.equal(timers.size,0);assert.equal(cleared,mode==='closed'?0:1);
    assert.equal(writes.length,1);assert.equal(writes[0].acceptance,false);
    if(mode==='pending')assert.equal(writes[0].unavailable,'diagnostic-cleanup-timeout');
    if(mode==='reject')assert.equal(writes[0].unavailable,'diagnostic-cleanup-unavailable');
  }
});
