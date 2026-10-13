import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {installRematchRenderObserver} from '../lib/inkwave-rematch-render-observer.mjs';
function fixture(options={}) {
  let now=0; const program={},calls=[];
  const gl={getProgramParameter(p,n){assert.equal(this,gl);assert.equal(p,program);calls.push(['query',n]);now+=14000;return true;},linkProgram(p){assert.equal(this,gl);assert.equal(p,program);calls.push(['link']);},getProgramInfoLog(){return 'native log'}};
  const promise=Promise.resolve('compiled');
  const renderer={getContext:()=>gl,render(){calls.push(['render']);return gl.getProgramParameter(program,0x8b82)},compileAsync(){return promise},shadowMap:{render(){return 'shadow'}}};
  const game={_frameN:0,match:{attract:true,state:'playing'},menus:{current:'main',update(dt){calls.push(['menu',dt]);return dt}},R:{render(){return renderer.render()}},showcase:{render(){return 'showcase'}},_frame(dt){this._frameN++;this.R.render();return this.menus.update(dt)},_warmCharacters(){return promise}};
  const env={__G:{mode:'menu',renderer},performance:{now:()=>now}};
  const original={frame:game._frame,query:gl.getProgramParameter};
  const observer=installRematchRenderObserver(game,env,options);
  return {observer,game,renderer,gl,program,promise,calls,original};
}
test('observer captures actual nested render boundary and GL pname without extra native work',()=>{
 const f=fixture();f.observer.start(1);assert.equal(f.game._frame(1/60),1/60);const r=f.observer.stop();
 assert.deepEqual(f.calls,[['render'],['query',0x8b82],['menu',1/60]]);
 const q=r.events.find(e=>e.label==='gl.getProgramParameter');
 assert.deepEqual(q.parents,['Game._frame','world.render','WebGLRenderer.render']);assert.equal(q.pname,0x8b82);assert.equal(q.durationMs,14000);assert.equal(q.result,true);assert.equal(q.program,1);assert.match(q.callerStack,/render observation/);
 assert.equal(r.events.find(e=>e.label==='Menus.update').start,14000);assert.equal(r.dropped,0);assert.deepEqual(r.observerErrors,[]);
});
test('inactive observer is transparent and native promise identity is retained',()=>{
 const f=fixture();f.game._frame(.1);assert.equal(f.observer.snapshot(),null);f.observer.start(1);
 assert.equal(f.renderer.compileAsync(),f.promise);assert.equal(f.game._warmCharacters(),f.promise);f.gl.linkProgram(f.program);
 const r=f.observer.stop();assert.equal(r.events.find(e=>e.label==='WebGLRenderer.compileAsync(sync-part)').durationMs,0);assert.equal(r.events.find(e=>e.label==='gl.linkProgram').program,1);
});
test('native receiver, arguments and thrown error survive instrumentation',()=>{
 const error=new Error('native failure');const game={_frame(...args){assert.equal(this,game);assert.deepEqual(args,[1,2]);throw error}};
 const observer=installRematchRenderObserver(game,{performance:{now:()=>0}});observer.start(1);assert.throws(()=>game._frame(1,2),e=>e===error);
 const r=observer.stop();assert.equal(r.events[0].thrown,'native failure');assert.deepEqual(r.events[0].parents,[]);
});
test('bounded capture preserves total count and explicitly discloses lost event detail',()=>{
 const f=fixture({maxEvents:2});f.observer.start(1);f.game._frame(.1);f.game._frame(.1);const r=f.observer.stop();
 assert.equal(r.events.length,2);assert.equal(r.observed,10);assert.equal(r.dropped,8);assert.equal(r.totals[' > Game._frame'].calls,2);assert.equal(r.totals[' > Game._frame'].totalMs,28000);
 f.observer.start(2);assert.equal(f.observer.snapshot().observed,0);assert.throws(()=>f.observer.start(3),/already active/);f.observer.stop();
});
test('dispose restores descriptors and never overwrites a newer function owner',()=>{
 const f=fixture();const prior=Object.getOwnPropertyDescriptor(f.game,'_frame');f.observer.dispose();assert.equal(f.game._frame,f.original.frame);assert.equal(f.gl.getProgramParameter,f.original.query);assert.equal(Object.getOwnPropertyDescriptor(f.game,'_frame').enumerable,prior.enumerable);
 const proto={_frame(){return 'prototype'}};const game=Object.create(proto);const o=installRematchRenderObserver(game,{performance:{now:()=>0}});assert(Object.hasOwn(game,'_frame'));o.dispose();assert(!Object.hasOwn(game,'_frame'));
 const g=fixture();const newer=()=>42;g.game._frame=newer;g.observer.dispose();assert.equal(g.game._frame,newer);
});
test('helper can execute as a standalone page-evaluation function',()=>{
 const env=vm.createContext({performance:{now:()=>0}});const factory=vm.runInContext('('+installRematchRenderObserver.toString()+')',env);const g={_frame(){return 3}};const o=factory(g);o.start(1);assert.equal(g._frame(),3);assert.equal(o.stop().observed,1);o.dispose();
});
test('diagnostic readback stays after unchanged strict gate and original poll is byte-identical',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-rematch-lifecycle.mjs',import.meta.url),'utf8');
 assert(source.includes("const profileRenderCalls = process.argv.includes('--profile-render-calls');"));
 assert(source.indexOf('const readback = await boundedDiagnostic')>source.indexOf("'keyboard handoff restores the selection ring"));
 const start=source.indexOf('const alignedFocusSnapshot ='),end=source.indexOf('\nconst check =',start);
 assert.equal(crypto.createHash('sha256').update(source.slice(start,end)).digest('hex'), '232fa17cdf456f25d83c7eac3705cc99b09f6ef331a4073266a938c114298958');
 assert(!source.slice(start,end).includes('renderObserver'));
});
