import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {awaitExistingExplosherAttractWarmup as wait} from '../lib/inkwave-explosher-attract-warmup.mjs';
import {adaptExplosherControlledCompiledBoot} from '../lib/inkwave-explosher-volume-barrier.mjs';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const scene={},renderer={},pending=Array.from({length:8},deferred),actors=pending.map(job=>({character:{_warmed:job.promise,root:{parent:scene},get warmAll(){throw Error('must not start warmup');}}}));
 const match={attract:true,actors},game={match,fxHooks:{time:0,stamp:0,sprayT:0,featherT:5},_frame(){throw Error('must not advance frames');}},G={match,scene,renderer,game,time:0};
 return {G,game,actors,pending,resolve(){pending.forEach(p=>p.resolve('high'));}};
}
test('awaits only all eight existing promises before subsequent static-menu teardown',async()=>{
 const f=fixture();let admitted=false;const promise=wait(f.G,f.game).then(r=>{admitted=true;return r;});await Promise.resolve();assert.equal(admitted,false);
 f.pending.slice(0,7).forEach(p=>p.resolve('high'));await Promise.resolve();assert.equal(admitted,false);
 f.pending[7].resolve('high');const r=await promise;assert.equal(r.ownerCount,8);assert.equal(r.alreadyStartedOnly,true);assert.equal(r.naturalBootAccepted,false);assert.deepEqual(r.before,r.after);
 await assert.rejects(wait(f.G,f.game),/initial eight-owner/);
});
for(const [label,change]of [
 ['disposed',f=>f.actors[0].character._sourceMotionDisposed=true],
 ['character replaced',f=>f.actors[0].character={_warmed:f.actors[0].character._warmed,root:f.actors[0].character.root}],
 ['promise replaced',f=>f.actors[0].character._warmed=Promise.resolve('high')],
 ['detached',f=>f.actors[0].character.root.parent=null],
 ['match replaced',f=>f.game.match={...f.G.match}],
 ['clock advanced',f=>f.G.time=1],
])test('rejects pending '+label+' without creating or warming replacement owners',async()=>{
 const f=fixture(),p=wait(f.G,f.game);change(f);f.resolve();await assert.rejects(p);
});
test('missing, rejected, canceled and timed-out native warmup stays rejected',async()=>{
 const missing=fixture();delete missing.actors[0].character._warmed;await assert.rejects(wait(missing.G,missing.game),/already-started/);
 const rejected=fixture(),p=wait(rejected.G,rejected.game);rejected.pending[0].reject(Error('native failure'));await assert.rejects(p,/native failure/);
 const canceled=fixture(),q=wait(canceled.G,canceled.game);canceled.pending[0].resolve(false);canceled.pending.slice(1).forEach(p=>p.resolve('high'));await assert.rejects(q,/failed or owner/);
 const pending=fixture();await assert.rejects(wait(pending.G,pending.game,2),/timeout/);assert.equal(pending.game._explosherInitialAttractWarmupObserved,undefined);
});
test('unfenced native warmup permits different cached residency before teardown; existing-promise fence removes that race',async()=>{
 async function run({fence,settleFirst}){
  const f=fixture(),source=deferred(),uploads=[];
  f.actors.forEach((actor,i)=>{actor.character._warmed=source.promise.then(()=>{if(actor.character._sourceMotionDisposed)return false;uploads.push('native-owner-'+i);return 'high';});});
  const teardown=()=>f.actors.forEach(a=>{a.character._sourceMotionDisposed=true;});
  if(fence){const ready=wait(f.G,f.game);source.resolve();await ready;teardown();}
  else if(settleFirst){source.resolve();await Promise.all(f.actors.map(a=>a.character._warmed));teardown();}
  else{teardown();source.resolve();await Promise.all(f.actors.map(a=>a.character._warmed));}
  return uploads;
 }
 assert.notDeepEqual(await run({fence:false,settleFirst:true}),await run({fence:false,settleFirst:false}));
 assert.deepEqual(await run({fence:true,settleFirst:true}),await run({fence:true,settleFirst:false}));
});
test('compiled control waits immediately after only the initial async boot attract call',()=>{
 const source="import {G} from './core/ctx.js';const __iwStartupMeasure=()=>{};class Game{async boot(){this._bindEvents();this._startAttract();next();}_startAttract(){nativeAttract();}later(){this._startAttract();}}";
 const result=adaptExplosherControlledCompiledBoot(source,parse);
 assert.equal(result.split('this._startAttract()').length,source.split('this._startAttract()').length);
 assert.ok(result.includes('this._startAttract(), globalThis.__inkwaveExplosherInitialAttractWarmup = await'));
 assert.equal(result.slice(result.indexOf('_startAttract(){')),source.slice(source.indexOf('_startAttract(){')));
 const guard=fs.readFileSync(new URL('../check-inkwave-explosher-absolute-geometries.mjs',import.meta.url),'utf8');
 assert.ok(guard.includes("assert(b<=a,'Absolute geometry regression"));assert.ok(!guard.includes('281'),'281 is an observed hosted baseline, never a fixed limit');
});
