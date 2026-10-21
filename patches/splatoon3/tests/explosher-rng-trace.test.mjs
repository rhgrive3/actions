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
