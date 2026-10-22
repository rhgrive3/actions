import test from 'node:test';import assert from 'node:assert/strict';
import {installExplosherRandom} from '../../../scripts/lib/inkwave-explosher-startup.mjs';
function isolated(run){const random=Math.random,win=globalThis.window;globalThis.window={};try{run();}finally{Math.random=random;if(win===undefined)delete globalThis.window;else globalThis.window=win;}}
test('bounded trace does not change same seeded sequence',()=>isolated(()=>{
 installExplosherRandom(false);window.resetExplosherRandom('shot-input');const plain=Array.from({length:600},()=>Math.random()),a=window.readExplosherRandom();
 installExplosherRandom(true);window.resetExplosherRandom('shot-input');const traced=Array.from({length:600},()=>Math.random()),b=window.readExplosherRandom();
 assert.deepEqual(traced,plain);assert.deepEqual(b,a);const d=window.readExplosherRandomDiagnostic();assert.equal(d.untracedShotDraws,88);assert(d.callers.length<=16);assert.equal(d.callers.reduce((n,c)=>n+c.count,0)+d.overflowDraws,512);
}));
test('normal capture and nonshot phases have no caller stack collection',()=>isolated(()=>{
 for(const [enabled,phase]of [[false,'shot-input'],[true,'character-reset']]){installExplosherRandom(enabled);window.resetExplosherRandom(phase);Math.random();assert.deepEqual(window.readExplosherRandomDiagnostic().callers,[]);}
}));
test('boundary records are owned copies and do not reset the stream',()=>isolated(()=>{
 installExplosherRandom(true);window.resetExplosherRandom('shot-input');Math.random();const a=window.readExplosherRandom();window.markExplosherRandomBoundary('native-birth');assert.deepEqual(window.readExplosherRandom(),a);
 const d=window.readExplosherRandomDiagnostic();d.boundaries[0].label='changed';assert.notEqual(window.readExplosherRandomDiagnostic().boundaries[0].label,'changed');
}));
test('unexpected replacement remains fail-closed at phase boundary',()=>isolated(()=>{installExplosherRandom(true);Math.random=()=>.5;assert.throws(()=>window.readExplosherRandom());assert.throws(()=>window.markExplosherRandomBoundary('bad'));}));

test('fixed boot samples preserve all 70010 random values and exact counter state',()=>isolated(()=>{
 installExplosherRandom(false);const expected=Array.from({length:70010},()=>Math.random()),state=window.readExplosherRandom();
 assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,0);
 installExplosherRandom(true);for(let i=0;i<expected.length;i++)assert.equal(Math.random(),expected[i]);
 assert.deepEqual(window.readExplosherRandom(),state);
 const b=window.readExplosherRandomDiagnostic().bootSampling;
 assert.equal(b.samples,1251);assert.equal(b.unobservedSamples,1251);assert.equal(b.observedSamples,0);
 assert.equal(b.callers.reduce((n,c)=>n+c.samples,0)+b.overflowSamples,1251);
 assert.equal(Math.min(...b.callers.map(c=>c.firstDraw)),30000);assert.equal(Math.max(...b.callers.map(c=>c.lastDraw)),70000);
 for(const c of b.callers){assert(c.stack.length<=900);assert.equal(c.lastPortrait.observed,false);}
 assert.match(b.scope,/No guarantee of observing the first ambient call/);
}));
test('boot window rejects outside indices and nonboot phases without resetting samples',()=>isolated(()=>{
 installExplosherRandom(true);for(let i=0;i<29999;i++)Math.random();assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,0);
 Math.random();assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,1);
 for(let i=0;i<31;i++)Math.random();assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,1);
 Math.random();assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,2);
 window.resetExplosherRandom('character-reset');for(let i=0;i<70010;i++)Math.random();assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,2);
}));
test('more than 24 unique sampled callers are explicitly overflow, never silently dropped',()=>isolated(()=>{
 installExplosherRandom(true);for(let i=0;i<29999;i++)Math.random();
 for(let i=0;i<30;i++){
  new Function('random',`return function bootCaller${i}(){return random();}`)(Math.random)();
  for(let j=0;j<31;j++)Math.random();
 }
 const b=window.readExplosherRandomDiagnostic().bootSampling;assert.equal(b.samples,30);assert.equal(b.callers.length,24);assert.equal(b.overflowSamples,6);
 assert.equal(b.callers.reduce((n,c)=>n+c.samples,0)+b.overflowSamples,b.samples);
}));
test('1536 sample cap is hard and survives reset labels; excluded samples are explicit',()=>isolated(()=>{
 installExplosherRandom(true);for(let i=0;i<70001;i++)Math.random();window.resetExplosherRandom('boot');for(let i=0;i<70001;i++)Math.random();
 const b=window.readExplosherRandomDiagnostic().bootSampling;assert.equal(b.samples,1536);assert.equal(b.capExcludedSamples,966);assert(b.callers.length<=24);
 assert.equal(b.callers.reduce((n,c)=>n+c.samples,0)+b.overflowSamples,1536);
}));
test('published portrait observation is read-only, owned, and returned as independent data',()=>isolated(()=>{
 const showcase=Object.freeze({_warmState:'busy',_pq:Object.freeze([{}]),_portraitJob:Object.freeze({}),_portraitTask:Object.freeze({}),_portraitActiveCharacter:Object.freeze({}),_pflight:1});
 const game=Object.freeze({showcase});const G=Object.freeze({game});window.__G=G;window.__inkwave=game;
 installExplosherRandom(true);for(let i=0;i<30000;i++)Math.random();const d=window.readExplosherRandomDiagnostic();
 assert.equal(d.bootSampling.observedSamples,1);assert.deepEqual(d.bootSampling.callers[0].lastPortrait,{observed:true,showcasePresent:true,warmState:'busy',queued:1,hasJob:true,hasTask:true,hasActiveCharacter:true,inFlight:1});
 d.bootSampling.callers[0].lastPortrait.inFlight=999;assert.equal(window.readExplosherRandomDiagnostic().bootSampling.callers[0].lastPortrait.inFlight,1);assert.equal(showcase._pflight,1);
 window.__G={game:{}};for(let i=0;i<32;i++)Math.random();const b=window.readExplosherRandomDiagnostic().bootSampling;
 assert.equal(b.observedSamples,1);assert.equal(b.unobservedSamples,1);assert(b.callers.some(c=>c.lastPortrait.reason==='Published native context owner mismatch'));
}));
test('native temporary presentation routing still permits the captured alias without changing global identity',()=>isolated(()=>{
 installExplosherRandom(true);const captured=Math.random,presentation=()=>.125;Math.random=presentation;
 for(let i=0;i<30000;i++)captured();assert.equal(Math.random,presentation);
 assert.throws(()=>window.readExplosherRandom(),/identity replaced/);Math.random=captured;
 assert.equal(window.readExplosherRandom().draws,30000);assert.equal(window.readExplosherRandomDiagnostic().bootSampling.samples,1);
}));
