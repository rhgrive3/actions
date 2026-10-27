import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExplosherGeometryLifetime, instrumentExplosherGeometryDriver} from '../lib/inkwave-explosher-geometry-lifetime.mjs';

function fixture() {
  const calls = [], result = {}, originalError = Error('native error');
  class GL {
    constructor() { this.canvas = {id:'game-canvas'}; }
    bindBuffer(...args) { calls.push({name:'bindBuffer', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    bufferData(...args) { calls.push({name:'bufferData', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    bufferSubData(...args) { calls.push({name:'bufferSubData', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
    deleteBuffer(...args) { calls.push({name:'deleteBuffer', receiver:this, args}); if(args[0]==='throw')throw originalError; return result; }
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
  const observer=installExplosherGeometryLifetime(env);observer.attachThree({BufferGeometry:Geometry});
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
test('full descriptor restoration, listener cleanup and late attachment/calls cannot leave a prototype or global observer leak',()=>{
  const f=fixture(),g=new f.Geometry();g.setAttribute('position',{array:new Float32Array(3)});assert.equal(g.listeners.size,1);
  const r=f.observer.restore();assert.equal(r.cleanup.conflicts,0);assert.equal(r.cleanup.restoredMethods,r.cleanup.patchedMethods);assert.equal(g.listeners.size,0);
  for(const p of f.descriptors)assert.deepEqual(Object.getOwnPropertyDescriptor(p.owner,p.name),p.descriptor);
  const before=f.observer.report().counts;g.setAttribute('normal',{array:new Float32Array(3)});g.dispose();
  f.observer.attachThree({BufferGeometry:f.Geometry});f.observer.boundary('shot-input');
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
    assert.equal(r.coverage.webglPrototypes,1,'shared prototypes are never wrapped twice');assert.equal(r.coverage.threeAttachBeforeCanvas,true);
    assert(Buffer.byteLength(JSON.stringify(r))<600000,'bounded artifact even after saturation');
  }finally{f.observer.restore();}
});
test('source binds the helper bytes and runs focused contracts without changing stage gates, GL state, startup barrier or cleanup error authority',()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-explosher-flight-glitter.mjs',import.meta.url),'utf8');
  assert.match(source,/if\(!runtimeUIRoute\)driver=instrumentExplosherGeometryDriver\(driver\)/);
  assert.match(source,/captureProtocolSha256=[^\n]*'inkwave-explosher-geometry-lifetime.mjs'/);
  const helper=fs.readFileSync(new URL('../lib/inkwave-explosher-geometry-lifetime.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/\.getError\(|\.getParameter\(|\.finish\(|\.flush\(|\.render\(|\.warmAll\(|\.setVisible\(/);
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
  assert.match(workflow,/node --test scripts\/tests\/inkwave-explosher-runtime-ui-preflight.test.mjs scripts\/tests\/inkwave-explosher-geometry-lifetime.test.mjs/);
  assert.match(workflow,/readExplosherStagePair\('preflight'/);assert.equal((workflow.match(/if: false/g)||[]).length,3);assert.doesNotMatch(workflow,/continue-on-error/);
  const driver="let browser;\nconst page = await browser.newPage({});\n  await enterRangeFromMenu(page,base);\n      window.resetExplosherRandom('character-reset');\n      await resetCaptureCharacter(a);\n      window.resetExplosherRandom('shot-input');\n      window.markExplosherRandomBoundary('native-birth');\n          window.markExplosherRandomBoundary('after-draw-probe');\n  await browser?.close();";
  const output=instrumentExplosherGeometryDriver(driver);assert.doesNotThrow(()=>new (Object.getPrototypeOf(async function(){}).constructor)(output));
  assert(output.indexOf('page.addInitScript')<output.indexOf('await enterRangeFromMenu'));
  assert(output.indexOf("boundary('before-character-reset')")<output.indexOf('await resetCaptureCharacter'));
  assert(output.indexOf('observer.restore()')<output.indexOf('await browser?.close()'));
  assert.match(output,/finally \{ delete window\.__inkwaveExplosherGeometryLifetime; \}/);
  assert.doesNotMatch(output,/await import\(|await observer/,'no new native startup readiness barrier');
  assert.throws(()=>instrumentExplosherGeometryDriver(driver.replace('let browser;','')),/anchor/);
  assert.throws(()=>instrumentExplosherGeometryDriver(driver+'\nlet browser;'),/anchor/);
});
