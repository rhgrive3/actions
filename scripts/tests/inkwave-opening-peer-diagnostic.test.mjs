import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readOpeningPeerDiagnostic,collectOpeningPeerDiagnostics} from '../lib/inkwave-opening-peer-diagnostic.mjs';
function fixture(fn){const old=[globalThis.__G,globalThis.__inkwave,globalThis.document];try{return fn();}finally{[globalThis.__G,globalThis.__inkwave,globalThis.document]=old;}}
test('both owner and proxy phase, clocks and sampled adoption are captured without mutation',()=>fixture(()=>{
 const actor={isLocal:false,remote:true,alive:true,grounded:true,owner:'PRIVATE',s3:{squidSpawn:{phase:'aim',wait:5,playWait:0,ownerReplicated:true}},net:{ready:true,_adoptionSeq:4,_adoptionTick:20,_adoptionTickOwner:'PRIVATE',cur:{adoption:{sequence:3,tick:19,squidSpawn:{phase:'aim'}}},buf:[{adoption:{sequence:4,tick:20,squidSpawn:{phase:'flight'}}}]}};
 globalThis.__G={time:2,match:{state:'playing',actors:[{isLocal:true,alive:true,grounded:true},actor]}};globalThis.__inkwave={timer:{_delta:0,_elapsed:2000}};globalThis.document={hidden:true,visibilityState:'hidden'};
 const before=JSON.stringify([__G,__inkwave,document]);const r=readOpeningPeerDiagnostic();
 assert.equal(r.hidden,true);assert.equal(r.gameTime,2);assert.equal(r.actors[0].spawnPhase,null);assert.equal(r.actors[1].spawnPhase,'aim');assert.equal(r.actors[1].buffered.spawnPhase,'flight');assert.equal(r.actors[1].acceptedOwnerMatches,true);
 assert.equal(JSON.stringify([__G,__inkwave,document]),before);assert(!JSON.stringify(r).includes('PRIVATE'));
}));
test('missing and nonfinite values fail to null; unbounded actors and unknown phases are not exposed',()=>fixture(()=>{
 globalThis.__G={time:Infinity,match:{actors:Array(100).fill({owner:'SECRET',net:{_adoptionTick:NaN},s3:{squidSpawn:{phase:'SECRET',wait:Infinity}}})}};globalThis.__inkwave={};globalThis.document={visibilityState:'SECRET'};
 const r=readOpeningPeerDiagnostic();assert.equal(r.gameTime,null);assert.equal(r.visibility,null);assert.equal(r.actors.length,2);assert.equal(r.actors[0].wait,null);assert.equal(r.actors[0].acceptedTick,null);assert(!JSON.stringify(r).includes('SECRET'));
}));
test('peer collection is capped at two, handles a rejection without leaking its text',async()=>{
 const r=await collectOpeningPeerDiagnostics([{evaluate:async()=>({gameTime:1})},{evaluate:async()=>{throw Error('PRIVATE URL');}},{evaluate:()=>{throw Error('third page must not run');}}]);
 assert.equal(r.length,2);assert.equal(r[0].peer,0);assert.equal(r[0].status,'captured');assert.deepEqual(r[1],{peer:1,status:'unavailable'});assert(!JSON.stringify(r).includes('PRIVATE'));
});
test('hung page has finite budget, while the other peer still provides evidence',async()=>{
 const r=await collectOpeningPeerDiagnostics([{evaluate:()=>new Promise(()=>{})},{evaluate:async()=>({gameTime:2})}],{timeoutMs:10});
 assert.deepEqual(r[0],{peer:0,status:'timeout'});assert.equal(r[1].snapshot.gameTime,2);
});
test('browser keeps original native readiness, timeouts, failure and no diagnostic mutation',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs',import.meta.url),'utf8');
 assert(s.includes("if(__ceilingPlacement.spawnReady())return true;"));assert(s.includes("if(__G.time-start>10)throw Error('Native opening spawn did not settle within 10 game seconds');"));assert(s.includes('},spawnStarts[i],{timeout:180000}'));
 assert(s.indexOf("report.error=String(error.stack||error)")<s.indexOf('report.openingPeers.failure='));assert(s.includes('openingPeers: report.openingPeers||null'));
 assert(!/\.disconnect\(|\.bringToFront\(|Object\.defineProperty|spawn\.phase\s*=/.test(readOpeningPeerDiagnostic.toString()));
});
