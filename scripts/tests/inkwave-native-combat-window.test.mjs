import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {beginNativeCombatWindow,inspectNativeCombatWindow,waitForNativeCombatWindow,nativeCombatWindowTimeoutState} from '../lib/inkwave-native-combat-window.mjs';

function fixture(){
 let now=0;
 const coverage=[0.01,0];
 const G={match:{state:'playing'},level:{},mode:'match',actors:Array.from({length:8},()=>({})),time:12,paint:{coverage:()=>coverage}};
 const probe={totalFrames:47,windowFrames:0,contextLost:false};
 const game={mapDef:{id:'kelpline'},frozen:false,_skipRender:false};
 const context=vm.createContext({__G:G,__inkwave:game,__gameplayProbe:probe,performance:{now:()=>now}});
 const run=(fn,arg)=>vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg)??''})`,context);
 return {G,probe,game,coverage,run,at(ms,frames=0){now=ms;probe.totalFrames+=frames;probe.windowFrames+=frames;G.time+=frames/60;}};
}
function storedCoverage(f){
 const paint=f.G.paint;Object.assign(paint,{grid:{},dead:{},paintFaces:[],version:1,_s3ObservedPaintVersion:1,_s3TurfVersion:1,_s3CoverageVersion:1,_s3Coverage:f.coverage.slice()});
 paint._s3CoverageGrid=paint.grid;paint._s3CoverageDead=paint.dead;paint._s3CoverageFaces=paint.paintFaces;
}

test('the hosted three-frame window waits for actual native paint without advancing the scene',()=>{
 const f=fixture();f.coverage[0]=0;f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});
 f.at(5051.1,3);assert.equal(f.run(inspectNativeCombatWindow),false,'elapsed time and three frames do not prove paint');
 const before={time:f.G.time,frames:f.probe.totalFrames,match:f.G.match,level:f.G.level,actors:[...f.G.actors]};
 f.at(7000);assert.equal(f.run(inspectNativeCombatWindow),false);
 assert.deepEqual({time:f.G.time,frames:f.probe.totalFrames,match:f.G.match,level:f.G.level,actors:[...f.G.actors]},before,'observation cannot paint, simulate or replace native owners');
 f.coverage[1]=Number.MIN_VALUE;
 const receipt=f.run(inspectNativeCombatWindow);assert.equal(receipt.frames,3);assert.deepEqual(Array.from(receipt.coverage),[0,Number.MIN_VALUE]);
 f.coverage[1]=0;assert.deepEqual(Array.from(receipt.coverage),[0,Number.MIN_VALUE],'receipt retains an independent coverage snapshot');
});

test('missing or corrupt native paint observations fail closed',()=>{
 const changes=[f=>delete f.G.paint,f=>f.G.paint={},f=>f.G.paint.coverage=()=>undefined,f=>f.G.paint.coverage=()=>[],f=>f.G.paint.coverage=()=>[0.1],f=>f.G.paint.coverage=()=>[0.1,NaN],f=>f.G.paint.coverage=()=>[Infinity,0],f=>f.G.paint.coverage=()=>[-1,0.1],f=>f.G.paint.coverage=()=>[0.1,,]];
 for(const change of changes){const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});f.at(6000,3);change(f);assert.throws(()=>f.run(inspectNativeCombatWindow),/paint coverage/);}
});

test('a zero-paint window uses the existing bounded timeout and releases its lease',async()=>{
 const f=fixture();f.coverage[0]=0;let captured=false;
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg,options){assert.deepEqual(options,{polling:100,timeout:125000});f.at(125000,30);assert.equal(f.run(fn,arg),false);throw Error('Timeout waiting for native paint');}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},()=>{captured=true;}),/Timeout/);
 assert.equal(captured,false);assert.equal(f.probe.combatWindow,undefined);
});

test('paint clearing between readiness and atomic capture invalidates the retained lease',async()=>{
 const f=fixture();let captured=false;
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg){f.at(6000,3);return {jsonValue:async()=>f.run(fn,arg),dispose:async()=>{}};}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},async receipt=>{
  f.coverage[0]=0;
  await page.evaluate(id=>{const p=globalThis.__gameplayProbe;if(!p.combatWindow?.inspect||!p.combatWindow.inspect(id))throw Error('Native combat window invalid at capture');},receipt.leaseId);
  captured=true;
 }),/invalid at capture/);
 assert.equal(captured,false);assert.equal(f.probe.combatWindow,undefined);
});

test('the hosted two-frame/5-second failure waits for a third actual frame without changing the native scene',()=>{
 const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});
 assert.equal(f.probe.combatWindow.match.deref(),f.G.match);assert.equal(f.probe.combatWindow.level.deref(),f.G.level);
 f.at(6176,2);assert.equal(f.run(inspectNativeCombatWindow),false);
 const before={time:f.G.time,frames:f.probe.totalFrames};
 f.at(9000);assert.equal(f.run(inspectNativeCombatWindow),false);
 assert.deepEqual({time:f.G.time,frames:f.probe.totalFrames},before,'polling cannot advance simulation or synthesize a frame');
 f.at(10500,1);const receipt=f.run(inspectNativeCombatWindow);
 assert.equal(receipt.frames,3);assert.equal(receipt.elapsedMs,10500);assert.equal(receipt.minimumMs,5000);
});

test('many fast frames cannot shorten the requested real-time combat interval',()=>{
 const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});
 f.at(1000,60);assert.equal(f.run(inspectNativeCombatWindow),false);
 f.at(5000);assert.equal(f.run(inspectNativeCombatWindow).frames,60);
});

test('old warm-up frames and stalled simulation cannot satisfy a new window',()=>{
 const f=fixture();f.probe.windowFrames=999;f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});
 f.at(5000);assert.equal(f.run(inspectNativeCombatWindow),false);
 f.probe.totalFrames+=3;assert.equal(f.run(inspectNativeCombatWindow),false,'simulation time must advance too');
});

test('replacement matches, stage identity, ended games and suppressed rendering fail closed',()=>{
 const changes=[f=>f.G.match={state:'playing'},f=>f.G.level={},f=>f.game.mapDef.id='tidewater',f=>f.G.match.state='results',f=>f.G.mode='menu',f=>f.G.actors.pop(),f=>f.game.frozen=true,f=>f.game._skipRender=true,f=>f.probe.contextLost=true];
 for(const change of changes){const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});f.at(6000,3);change(f);assert.throws(()=>f.run(inspectNativeCombatWindow),/scene changed/);}
});

test('a stalled browser uses a bounded timeout, while a successful wait releases its remote handle',async()=>{
 const f=fixture(),calls=[];let disposed=0;
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg,options){calls.push(options);f.at(125000);assert.equal(f.run(fn),false);throw Error('Timeout');}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000}),/Timeout/);
 assert.equal(f.probe.combatWindow,undefined,'timeout releases observer window');
 assert.deepEqual(calls,[{polling:100,timeout:125000}]);
 page.waitForFunction=async fn=>{f.at(131000,3);const result=f.run(fn);return {jsonValue:async()=>result,dispose:async()=>disposed++};};
 const result=await waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000});
 assert.equal(result.frames,3);assert.equal(disposed,1);assert.equal(f.probe.combatWindow,undefined);
});

test('invalid duration and observer corruption cannot disable the sampling gate',async()=>{
 for(const minimumMs of [0,-1,NaN,Infinity]){const f=fixture();assert.throws(()=>beginNativeCombatWindow.call(null,{mapId:'kelpline',minimumMs}),/duration/);}
 const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000});f.at(6000);f.probe.totalFrames=0;assert.throws(()=>f.run(inspectNativeCombatWindow),/observation/);
 await assert.rejects(waitForNativeCombatWindow({}, {mapId:'kelpline',minimumMs:5000,extraTimeoutMs:0}),/timeout/);
});

test('same-map match or level replacement between wait and capture is rejected in the capture task',async()=>{
 // Verify the harness actually invokes the lease guard inside its capture evaluate.
 const source=readFileSync(new URL('../check-inkwave-gameplay-resources.mjs',import.meta.url),'utf8');
 assert.match(source,/page\.evaluate\(leaseId=>\{const G=__G,g=__inkwave,p=__gameplayProbe;if\(leaseId!==null&&\(!p\.combatWindow\?\.inspect\|\|!p\.combatWindow\.inspect\(leaseId\)\)\)throw/);
 assert.match(source,/await capture\('combat-'\+cycle,false,receipt\.leaseId\)/);
 for(const replace of [f=>f.G.match={state:'playing'},f=>f.G.level={}]){
  const f=fixture();let captured=false,profileStopped=false;
  const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg){f.at(6000,3);const result=f.run(fn,arg);return {jsonValue:async()=>result,dispose:async()=>{}};}};
  await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},async receipt=>{
   profileStopped=true;replace(f);
   await page.evaluate(id=>{const p=globalThis.__gameplayProbe;if(!p.combatWindow?.inspect||!p.combatWindow.inspect(id))throw Error('Native combat window invalid at capture');return globalThis.__G.time;},receipt.leaseId);
   captured=true;
  }),/scene changed/);
  assert.equal(profileStopped,true);assert.equal(captured,false);assert.equal(f.probe.combatWindow,undefined);
 }
});

test('an older parallel wait cannot delete the newer lease',async()=>{
 const f=fixture();let releaseOld,oldReady;
 const oldStarted=new Promise(resolve=>{oldReady=resolve;});
 const oldGate=new Promise(resolve=>{releaseOld=resolve;});
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg){f.at(6000,3);const result=f.run(fn,arg);return {jsonValue:async()=>result,dispose:async()=>{}};}};
 const old=waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},async()=>{oldReady();await oldGate;});
 await oldStarted;
 let releaseNew,newReady;const newStarted=new Promise(resolve=>{newReady=resolve;});const newGate=new Promise(resolve=>{releaseNew=resolve;});
 const newer=waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},async()=>{newReady();await newGate;});
 await newStarted;const lease=f.probe.combatWindow.leaseId;
 releaseOld();await old;assert.equal(f.probe.combatWindow.leaseId,lease);
 releaseNew();await newer;assert.equal(f.probe.combatWindow,undefined);
});

test('cleanup attempts both operations and preserves the primary failure',async()=>{
 const f=fixture();const primary=Error('capture failed');let cleanup=0;
 const page={async evaluate(fn,arg){if(fn!==beginNativeCombatWindow)cleanup++;return f.run(fn,arg);},async waitForFunction(fn,arg){f.at(6000,3);const result=f.run(fn,arg);return {jsonValue:async()=>result,dispose:async()=>{throw Error('dispose failed');}};}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},async()=>{throw primary;}),error=>error===primary);
 assert.equal(cleanup,1);assert.equal(f.probe.combatWindow,undefined);
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000}),/dispose failed/);
 assert.equal(f.probe.combatWindow,undefined);
});

test('a lost begin response still attempts lease cleanup and preserves the original thrown value',async()=>{
 const f=fixture();let evaluations=0,caught=false;
 const page={async evaluate(fn,arg){evaluations++;const value=f.run(fn,arg);if(evaluations===1)throw undefined;return value;}};
 try{await waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000});assert.fail('expected failure');}
 catch(error){caught=true;assert.equal(error,undefined);}
 assert.equal(caught,true);assert.equal(evaluations,2);assert.equal(f.probe.combatWindow,undefined);
});

test('timeout snapshot separates clock, actual-frame and paint predicates without advancing the scene',()=>{
 const f=fixture();storedCoverage(f);f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000,leaseId:'lease'});f.at(125000,2);
 const before={time:f.G.time,frames:f.probe.totalFrames,match:f.G.match,level:f.G.level};
 const state=f.run(nativeCombatWindowTimeoutState,{leaseId:'lease'});
 assert.equal(state.frames,2);assert.equal(state.minimumDurationMet,true);assert.equal(state.threeFramesMet,false);assert.equal(state.timeAdvanced,true);assert.equal(state.paintPositive,true);
 assert.equal(state.sameMatch,true);assert.equal(state.sameLevel,true);assert.equal(state.actorCount,8);
 assert.deepEqual({time:f.G.time,frames:f.probe.totalFrames,match:f.G.match,level:f.G.level},before);
 assert.equal(f.run(inspectNativeCombatWindow,{leaseId:'lease'}),false,'metadata cannot turn a two-frame failure into acceptance');
});

test('nonfinite timeout diagnostics remain null/unobserved and contain no actor identities',()=>{
 const f=fixture();f.G.actors[0].name='PRIVATE-NAME';f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000,leaseId:'lease'});
 f.probe.totalFrames=Infinity;f.G.time=NaN;storedCoverage(f);f.G.paint._s3Coverage[0]=NaN;
 const state=f.run(nativeCombatWindowTimeoutState,{leaseId:'lease'});assert.equal(state.totalFrames,null);assert.equal(state.frames,null);assert.equal(state.endTime,null);assert.equal(state.coverage,null);assert.equal(state.paintPositive,null);
 assert(!JSON.stringify(state).includes('PRIVATE-NAME'));assert(!JSON.stringify(state).includes('Infinity'));assert(!JSON.stringify(state).includes('NaN'));
});

test('wrong timeout lease does not query another window paint or expose its scene',()=>{
 const f=fixture();f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000,leaseId:'new'});let queries=0;f.G.paint.coverage=()=>{queries++;return [1,1];};
 const state=f.run(nativeCombatWindowTimeoutState,{leaseId:'old'});assert.deepEqual(JSON.parse(JSON.stringify(state)),{available:false,leaseMatches:false});assert.equal(queries,0);
});

test('a real TimeoutError persists bounded primitive state before cleanup and preserves the primary failure',async()=>{
 const f=fixture(),primary=Object.assign(Error('native predicate timeout'),{name:'TimeoutError'}),diagnostics=[];let captured=false;
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(fn,arg,options){assert.deepEqual(options,{polling:100,timeout:125000});f.at(125000,2);throw primary;}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},()=>{captured=true;},value=>diagnostics.push(value)),error=>error===primary);
 assert.equal(captured,false);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].status,'captured');assert.equal(diagnostics[0].state.frames,2);assert.equal(diagnostics[0].state.threeFramesMet,false);assert.equal(f.probe.combatWindow,undefined);
});

test('diagnostic read or persistence failure cannot replace a TimeoutError',async()=>{
 for(const failRead of [false,true]){
  const f=fixture(),primary=Object.assign(Error('primary'),{name:'TimeoutError'});let callbacks=0;
  const page={async evaluate(fn,arg){if(fn===nativeCombatWindowTimeoutState&&failRead)throw Error('diagnostic read unavailable');return f.run(fn,arg);},async waitForFunction(){throw primary;}};
  await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},null,diagnostic=>{callbacks++;if(failRead)assert.equal(diagnostic.status,'unavailable');throw Error('persistence unavailable');}),error=>error===primary);
  assert.equal(callbacks,1);assert.equal(f.probe.combatWindow,undefined);
 }
});

test('unresponsive failure-only diagnostic has a finite independent budget, without extending admission',async()=>{
 const f=fixture(),primary=Object.assign(Error('primary'),{name:'TimeoutError'});let diagnostic;
 const page={async evaluate(fn,arg){if(fn===nativeCombatWindowTimeoutState)return new Promise(()=>{});return f.run(fn,arg);},async waitForFunction(fn,arg,options){assert.equal(options.timeout,125000);throw primary;}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},null,value=>diagnostic=value),error=>error===primary);
 assert.deepEqual(diagnostic,{status:'diagnostic-timeout'});assert.equal(f.probe.combatWindow,undefined);
});

test('normal success and non-timeout failure never issue a diagnostic query',async()=>{
 for(const success of [true,false]){
  const f=fixture();let diagnostics=0,queries=0;
  const page={async evaluate(fn,arg){if(fn===nativeCombatWindowTimeoutState)queries++;return f.run(fn,arg);},async waitForFunction(fn,arg){if(!success)throw Error('not a timeout');f.at(6000,3);return {jsonValue:async()=>f.run(fn,arg),dispose:async()=>{}};}};
  const work=waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},null,()=>diagnostics++);
  if(success)assert.equal((await work).frames,3);else await assert.rejects(work,/not a timeout/);
  assert.equal(queries,0);assert.equal(diagnostics,0);
 }
});

test('resource reporter persists timeout metadata separately from the original raw error',()=>{
 const source=readFileSync(new URL('../check-inkwave-gameplay-resources.mjs',import.meta.url),'utf8');
 assert.match(source,/diagnostic=>\{report\.combatWindowTimeout=\{phase,\.\.\.diagnostic\};checkpoint\(\);\}/);
 assert.match(source,/report\.errors\.push\(e\.stack\)/);
});

test('timeout snapshot never calls scoring.coverage or refreshes stale production caches',()=>{
 const f=fixture();storedCoverage(f);f.run(beginNativeCombatWindow,{mapId:'kelpline',minimumMs:5000,leaseId:'lease'});let calls=0;
 f.G.paint.coverage=()=>{calls++;f.G.paint._s3ObservedPaintVersion=99;throw Error('mutating scoring query');};
 const before={...f.G.paint};let state=f.run(nativeCombatWindowTimeoutState,{leaseId:'lease'});
 assert.equal(calls,0);assert.equal(state.paintCache.fresh,true);assert.deepEqual(Array.from(state.coverage),[0.01,0]);assert.deepEqual(f.G.paint,before);
 for(const mutate of [()=>f.G.paint.version++,()=>f.G.paint.grid={},()=>f.G.paint._s3CoverageVersion++,()=>delete f.G.paint._s3ObservedPaintVersion]){
  Object.assign(f.G.paint,before);mutate();const current={...f.G.paint};state=f.run(nativeCombatWindowTimeoutState,{leaseId:'lease'});
  assert.notEqual(state.paintCache.fresh,true);assert.equal(state.coverage,null);assert.equal(state.paintPositive,null);assert.equal(calls,0);assert.deepEqual(f.G.paint,current);
 }
});

test('an asynchronous diagnostic rejection is consumed without replacing the native timeout',async()=>{
 const f=fixture(),primary=Object.assign(Error('primary timeout'),{name:'TimeoutError'});
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(){throw primary;}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},null,async()=>{throw Error('async persistence rejected');}),error=>error===primary);
 assert.equal(f.probe.combatWindow,undefined);
});

test('unresponsive asynchronous persistence shares the same finite diagnostic budget',async()=>{
 const f=fixture(),primary=Object.assign(Error('primary timeout'),{name:'TimeoutError'});let captured=0;
 const page={async evaluate(fn,arg){return f.run(fn,arg);},async waitForFunction(){throw primary;}};
 await assert.rejects(waitForNativeCombatWindow(page,{mapId:'kelpline',minimumMs:5000},null,()=>{captured++;return new Promise(()=>{});}),error=>error===primary);
 assert.equal(captured,1);assert.equal(f.probe.combatWindow,undefined);
});

test('failure diagnostic budget uses the Node monotonic clock rather than wall-clock time',()=>{
 const source=readFileSync(new URL('../lib/inkwave-native-combat-window.mjs',import.meta.url),'utf8');
 assert.match(source,/diagnosticStarted=performance\.now\(\)/);assert.match(source,/2000-\(performance\.now\(\)-diagnosticStarted\)/);assert.doesNotMatch(source,/Date\.now\(\)/);
});

// Failure-only CPU profiler lifetime; collected by this existing CI entry.
import fs from 'node:fs';
import {createGameplayCpuProfileCapture} from '../lib/inkwave-gameplay-cpu-profile.mjs';
const profile={nodes:[{id:1,callFrame:{functionName:'native game'}}],samples:[1],timeDeltas:[1000]},tick=()=>new Promise(r=>setImmediate(r));
function rig({stop=()=>({profile}),save=()=>{},disable=()=>({}),budget=50}={}){const calls=[],saved=[];const cdp={send(method){calls.push(method);return method==='Profiler.stop'?stop():disable();}};const capture=createGameplayCpuProfileCapture({cdp,fileName:'combat-0.cpuprofile',failureBudgetMs:budget,save(p){calls.push('save');saved.push(p);return save(p);}});return {calls,saved,capture};}
test('success retains one stop then the exact acquired profile save, without failure disable',async()=>{const r=rig();await r.capture.stopAndSave();await r.capture.stopAndSave();assert.deepEqual(r.calls,['Profiler.stop','save']);assert.equal(r.saved[0],profile);});
test('failure before onReady stops, persists the actual profile and disables the profiler',async()=>{const r=rig();const x=await r.capture.cleanupFailure();assert.deepEqual(r.calls,['Profiler.stop','save','Profiler.disable']);assert.equal(x.status,'saved');assert.equal(x.saved,true);assert.equal(x.disableStatus,'disabled');assert.equal(r.saved[0],profile);});
test('cleanup never replaces primary error identity, including falsy thrown values',async()=>{for(const error of [new Error('TimeoutError sentinel'),undefined,null,0,false,'']){const r=rig({stop(){throw new Error('secondary stop');},disable(){throw new Error('secondary disable');}});let caught=false,actual;try{try{throw error;}catch(primary){await r.capture.cleanupFailure();throw primary;}}catch(e){caught=true;actual=e;}assert(caught);assert.equal(actual,error);assert.deepEqual(r.calls,['Profiler.stop','Profiler.disable']);}});
test('a profile save failure is diagnostic and still disables; it is never retried',async()=>{const error=new Error('disk write');const r=rig({save(){throw error;}});await assert.rejects(r.capture.stopAndSave(),e=>e===error);const x=await r.capture.cleanupFailure();assert.equal(x.status,'profile-save-failed');assert.equal(x.saved,false);assert.equal(x.profileReceived,true);assert.deepEqual(r.calls,['Profiler.stop','save','Profiler.disable']);});
test('a stop rejection from onReady is reused, not sent again on cleanup',async()=>{const error=new Error('CDP stopped/lost reply');const r=rig({stop:()=>Promise.reject(error)});await assert.rejects(r.capture.stopAndSave(),e=>e===error);const x=await r.capture.cleanupFailure();assert.equal(x.status,'profile-stop-failed');assert.deepEqual(r.calls,['Profiler.stop','Profiler.disable']);});
test('a later error after successful capture keeps the existing saved file and only disables',async()=>{const r=rig();await r.capture.stopAndSave();const x=await r.capture.cleanupFailure();assert.equal(x.saved,true);assert.deepEqual(r.calls,['Profiler.stop','save','Profiler.disable']);});
test('concurrent/repeated cleanup owns one stop, save and disable transaction',async()=>{const r=rig();const a=r.capture.cleanupFailure(),b=r.capture.cleanupFailure();assert.equal(a,b);assert.deepEqual(await a,await b);assert.deepEqual(r.calls,['Profiler.stop','save','Profiler.disable']);});
test('a hanging stop has a finite wait and late completion cannot start a file write',async()=>{let resolve;const r=rig({stop:()=>new Promise(r=>{resolve=r;}),budget:15});const began=performance.now(),x=await r.capture.cleanupFailure();assert(performance.now()-began<1000);assert.equal(x.status,'profile-timeout');assert.equal(x.saved,false);assert.deepEqual(r.calls,['Profiler.stop','Profiler.disable']);resolve({profile});await tick();await tick();assert.equal(r.saved.length,0);});
test('a hanging asynchronous save shares the same finite wait budget',async()=>{const r=rig({save:()=>new Promise(()=>{}),budget:15});const began=performance.now(),x=await r.capture.cleanupFailure();assert(performance.now()-began<1000);assert.equal(x.status,'profile-timeout');assert.equal(x.profileReceived,true);assert.equal(x.saved,false);assert.deepEqual(r.calls,['Profiler.stop','save','Profiler.disable']);});
test('a hanging disable is bounded and does not erase the successfully saved data',async()=>{const r=rig({disable:()=>new Promise(()=>{}),budget:15});const x=await r.capture.cleanupFailure();assert.equal(x.status,'saved');assert.equal(x.saved,true);assert.equal(x.disableStatus,'budget-exhausted');});
test('late asynchronous failures are observed, with no unhandled rejection',async()=>{let reject;const unhandled=[];const on=e=>unhandled.push(e);process.on('unhandledRejection',on);try{const r=rig({stop:()=>new Promise((_,j)=>{reject=j;}),budget:15});await r.capture.cleanupFailure();reject(new Error('late stop failure'));await tick();await tick();assert.deepEqual(unhandled,[]);}finally{process.off('unhandledRejection',on);}});
test('the runner keeps readiness/window thresholds, successful capture path and raw error record unchanged',()=>{const source=fs.readFileSync(new URL('../check-inkwave-gameplay-resources.mjs',import.meta.url),'utf8');assert(source.includes("await cdp.send('Profiler.enable');await cdp.send('Profiler.start');"));assert(source.includes('waitForNativeCombatWindow(page,{mapId,minimumMs:seconds*1000}'));assert(source.includes("await cpuProfile.stopAndSave();\n   await capture('combat-'+cycle,false,receipt.leaseId);"));assert(source.includes("report.status='failed';report.errors.push(e.stack);console.error(e);"));assert(source.includes('try{report.cpuProfileFailure=await cpuProfile.cleanupFailure();}catch{}'));assert(source.includes("await browser?.close();"));assert(source.includes("await captureGameplayViewportPng({cdp,width,height,timeoutMs:120000,"));assert(source.includes("save:png=>fs.writeFileSync(path.join(out,'combat-'+cycle+'.png'),png)"));assert(source.includes("import {captureGameplayViewportPng} from './lib/inkwave-gameplay-viewport.mjs';"));});


// The new source captures a real browser viewport via CDP rather than
// Playwright's post-frame screenshot synchronization. Exercise its exact
// binary acceptance block with complete and corrupted PNG headers; this never
// replaces live RAF, the actual screenshot API, or gameplay-window thresholds.
test('native combat CDP screenshot rejects empty, truncated and wrong-size PNG payloads',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-gameplay-resources.mjs',import.meta.url),'utf8');
 assert(source.includes('await captureGameplayViewportPng({cdp,width,height,timeoutMs:120000,'));
 // Preserve the current tests' actual viewport sizes and failure controls.
 // The prior header-only768B positive was not a complete PNG.
 const good=vpImage({width:480,height:300,blank:true});
 assert.equal(validateGameplayViewportPng(good,480,300).bytes,good.length);
 const missing=[Buffer.alloc(0),good.subarray(0,20)];
 for(const payload of missing)assert.throws(()=>validateGameplayViewportPng(payload,480,300),/missing or incomplete/);
 const wrongSignature=Buffer.from(good);wrongSignature[0]=0;
 assert.throws(()=>validateGameplayViewportPng(wrongSignature,480,300),/missing or incomplete/);
 assert.throws(()=>validateGameplayViewportPng(good,481,300),/dimensions/);
 assert.throws(()=>validateGameplayViewportPng(good,480,301),/dimensions/);
});

test('the actual runner catch preserves raw timeout error before profile cleanup failure',async()=>{
 const source=readFileSync(new URL('../check-inkwave-gameplay-resources.mjs',import.meta.url),'utf8');
 const start=source.indexOf("}catch(e){report.status='failed';report.errors.push(e.stack);console.error(e);"),end=source.indexOf('}finally{',start);assert(start>=0&&end>start);
 const body=source.slice(start+'}catch(e){'.length,end),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('report','cpuProfile','e','console',body),primary=new Error('native combat timeout');primary.name='TimeoutError';
 for(const cpuProfile of [{async cleanupFailure(){throw new Error('unexpected diagnostic failure');}},rig({stop(){throw Error('lost CDP');}}).capture]){
  const report={status:'running',errors:[]},logs=[];await run(report,cpuProfile,primary,{error:e=>logs.push(e)});
  assert.equal(report.status,'failed');assert.deepEqual(report.errors,[primary.stack]);assert.deepEqual(logs,[primary]);
 }
});

test('synchronous CDP reentry cannot send stop twice or duplicate persistence/disposal',async()=>{
 for(const entry of ['cleanup','onReady']){
  let capture,reentrant,entered=false;const calls=[],saved=[];
  const cdp={send(method){calls.push(method);if(method==='Profiler.stop'&&!entered){entered=true;reentrant=capture.cleanupFailure();}return method==='Profiler.stop'?{profile}:{};}};
  capture=createGameplayCpuProfileCapture({cdp,fileName:'combat-0.cpuprofile',save:value=>{calls.push('save');saved.push(value);}});
  await (entry==='cleanup'?capture.cleanupFailure():capture.stopAndSave());await reentrant;
  assert.deepEqual(calls,['Profiler.stop','save','Profiler.disable']);assert.equal(saved.length,1);assert.equal(saved[0],profile);
 }
});

test('a stop settling beyond the monotonic deadline cannot dispatch save before a delayed timer task',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=0,resolve;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 try{
  const r=rig({stop:()=>new Promise(ok=>{resolve=ok;}),budget:100});const pending=r.capture.cleanupFailure();await tick();now=110;resolve({profile});
  const result=await pending;await tick();assert.equal(result.status,'profile-timeout');assert.equal(result.saved,false);assert.equal(r.saved.length,0);assert.deepEqual(r.calls,['Profiler.stop','Profiler.disable']);
 }finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});

test('a deadline crossed after stop settlement is rechecked immediately before the actual writer call',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),setTimer=globalThis.setTimeout;let now=0,timers=0;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 globalThis.setTimeout=(fn,ms,...args)=>{if(++timers===2)now=110;return setTimer(fn,ms,...args);};
 try{
  const r=rig({stop(){now=90;return {profile};},budget:100});const result=await r.capture.cleanupFailure();assert(timers>=2);assert.equal(result.status,'profile-timeout');assert.equal(result.saved,false);assert.equal(r.saved.length,0);assert.deepEqual(r.calls,['Profiler.stop','Profiler.disable']);
 }finally{globalThis.setTimeout=setTimer;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});

import {captureGameplayViewportPng as captureNativeViewport,validateGameplayViewportPng} from '../lib/inkwave-gameplay-viewport.mjs';
import {deflateSync as vpDeflate} from 'node:zlib';
const vpCrc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function vpChunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4,'latin1');data.copy(b,8);b.writeUInt32BE(vpCrc(b.subarray(4,-4)),b.length-4);return b;}
function vpImage({width=2,height=2,rgba=false,blank=false,filter=0,pad=true}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=rgba?6:2;const channels=rgba?4:3,row=width*channels+1,raw=Buffer.alloc(row*height);
 for(let y=0;y<height;y++){raw[y*row]=filter;for(let x=1;x<row;x++)raw[y*row+x]=blank?0:(x*41+y*17)&255;}
 const chunks=[vpChunk('IHDR',header)];if(pad)chunks.push(vpChunk('tEXt',Buffer.from('fixture\0'+'x'.repeat(512))));chunks.push(vpChunk('IDAT',vpDeflate(raw)),vpChunk('IEND',Buffer.alloc(0)));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...chunks]);
}
function vpParts(png){const a=[];for(let p=8;p<png.length;){const n=png.readUInt32BE(p),end=p+12+n;a.push({type:png.toString('latin1',p+4,p+8),data:png.subarray(p+8,end-4),bytes:png.subarray(p,end)});p=end;}return a;}
const vpPack=parts=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...parts.map(x=>x.bytes||vpChunk(x.type,x.data))]);
function vpRig({send,save,timeoutMs=100}={}){const calls=[],writes=[],png=vpImage();const cdp={send(method,params){calls.push([method,params,this]);return send?send(method,params):{data:png.toString('base64')};},detach(){throw Error('shared CDP must not be detached');}};return {png,cdp,calls,writes,run:()=>captureNativeViewport({cdp,width:2,height:2,timeoutMs,save:b=>{writes.push(b);return save?.(b);}})};}
test('current CDP route is unchanged, writes the real bytes once, and keeps the shared session owned by the caller',async()=>{
 const r=vpRig(),out=await r.run();assert.equal(out.complete,true);assert.deepEqual(r.writes,[r.png]);assert.equal(r.calls.length,1);assert.equal(r.calls[0][2],r.cdp);assert.deepEqual(r.calls[0].slice(0,2),['Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false}]);
});
test('complete RGB/RGBA, legal uniform images, and larger DPR viewports retain the current minimum-dimension policy',()=>{
 for(const rgba of [false,true])for(let filter=0;filter<5;filter++)assert.equal(validateGameplayViewportPng(vpImage({rgba,blank:true,filter}),2,2).complete,true);
 assert.equal(validateGameplayViewportPng(vpImage({width:4,height:4}),2,2).width,4);assert.throws(()=>validateGameplayViewportPng(vpImage(),3,2),/dimensions/);assert.throws(()=>validateGameplayViewportPng(vpImage({pad:false}),2,2),/missing or incomplete/);
});
test('actual legacy 512-byte header-shaped fake PNG is rejected before persistence',async()=>{
 const b=Buffer.alloc(512);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(480,16);b.writeUInt32BE(300,20);b[24]=8;b[25]=2;
 assert.throws(()=>validateGameplayViewportPng(b,480,300));const r=vpRig({send:()=>({data:b.toString('base64')})});await assert.rejects(r.run());assert.equal(r.writes.length,0);
});
test('PNG CRC, missing IDAT/IEND, duplicate IHDR, trailing bytes and invalid filters fail closed',()=>{
 const png=vpImage(),parts=vpParts(png),bad=Buffer.from(png);bad[29]^=1;
 for(const b of [bad,vpPack(parts.filter(x=>x.type!=='IDAT')),vpPack(parts.filter(x=>x.type!=='IEND')),vpPack([parts[0],...parts]),Buffer.concat([png,Buffer.from([0])]),vpImage({filter:5})])assert.throws(()=>validateGameplayViewportPng(b,2,2));
});
test('non-ASCII highbit chunk-type aliases are rejected even with correct recalculated CRCs',()=>{
 const png=vpImage();let at=8;for(const part of vpParts(png)){for(let letter=0;letter<4;letter++){const b=Buffer.from(png);b[at+4+letter]|=128;b.writeUInt32BE(vpCrc(b.subarray(at+4,at+8+part.data.length)),at+8+part.data.length);assert.throws(()=>validateGameplayViewportPng(b,2,2));}at+=part.bytes.length;}
});
test('continuous split IDAT stays valid while non-contiguous IDAT and unused zlib input are rejected',()=>{
 const parts=vpParts(vpImage()),idx=parts.findIndex(p=>p.type==='IDAT'),data=parts[idx].data,k=Math.floor(data.length/2),a={type:'IDAT',data:data.subarray(0,k)},b={type:'IDAT',data:data.subarray(k)};
 assert.equal(validateGameplayViewportPng(vpPack([...parts.slice(0,idx),a,b,...parts.slice(idx+1)]),2,2).complete,true);
 assert.throws(()=>validateGameplayViewportPng(vpPack([...parts.slice(0,idx),a,{type:'tEXt',data:Buffer.from('gap\0x')},b,...parts.slice(idx+1)]),2,2),/IDAT/);
 for(const extra of [Buffer.from([0]),data])assert.throws(()=>validateGameplayViewportPng(vpPack(parts.map(p=>p.type==='IDAT'?{type:'IDAT',data:Buffer.concat([data,extra])}:p)),2,2),/zlib/);
});
test('malformed compression and a valid zlib stream with wrong decoded row length are rejected',()=>{
 const parts=vpParts(vpImage());for(const data of [Buffer.from('not zlib'),vpDeflate(Buffer.alloc(3))])assert.throws(()=>validateGameplayViewportPng(vpPack(parts.map(p=>p.type==='IDAT'?{type:'IDAT',data}:p)),2,2));
});
test('a native CDP error retains exact identity and never triggers another capture or detaches the shared session',async()=>{
 for(const primary of [new Error('CDP primary'),null,false,0,undefined,'']){const r=vpRig({send(){throw primary;}});let caught=false;try{await r.run();}catch(error){caught=true;assert.equal(error,primary);}assert.equal(caught,true);assert.equal(r.writes.length,0);assert.equal(r.calls.length,1);}
});
test('a PNG writer error is primary and is not retried through another screenshot route',async()=>{
 const primary=new Error('disk primary'),r=vpRig({save(){throw primary;}});await assert.rejects(r.run(),e=>e===primary);assert.equal(r.writes.length,1);assert.equal(r.calls.length,1);
});
test('capture deadline is finite, and a late successful response cannot dispatch a file write',async()=>{
 let resolve;const r=vpRig({send:()=>new Promise(ok=>{resolve=ok;}),timeoutMs:5});await assert.rejects(r.run(),{name:'TimeoutError'});resolve({data:r.png.toString('base64')});await new Promise(setImmediate);assert.equal(r.writes.length,0);assert.equal(r.calls.length,1);
});
test('late native rejection is consumed after the deadline rather than replacing the terminal timeout',async()=>{
 let reject;const r=vpRig({send:()=>new Promise((_,no)=>{reject=no;}),timeoutMs:5});await assert.rejects(r.run(),{name:'TimeoutError'});reject(Error('late native'));await new Promise(setImmediate);assert.equal(r.writes.length,0);
});
test('a successful reply after the monotonic deadline fails even before delayed timer callbacks run',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 try{const r=vpRig({send(){now=130000;return {data:vpImage().toString('base64')};},timeoutMs:120000});await assert.rejects(r.run(),{name:'TimeoutError'});assert.equal(r.writes.length,0);}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});
test('an early wall timer is rearmed until the actual monotonic deadline, not treated as an early timeout',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),nativeTimer=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;let now=0,resolve;const timers=[];
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};globalThis.clearTimeout=()=>{};
 try{const r=vpRig({send:()=>new Promise(ok=>{resolve=ok;}),timeoutMs:100}),pending=r.run();await new Promise(setImmediate);now=20;timers[0].fn();assert.equal(timers.length,2);assert.equal(timers[1].ms,80);now=100;timers[1].fn();await assert.rejects(pending,{name:'TimeoutError'});resolve({data:r.png.toString('base64')});await new Promise(setImmediate);assert.equal(r.writes.length,0);}finally{globalThis.setTimeout=nativeTimer;globalThis.clearTimeout=nativeClear;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});

test('a terminal timeout cannot permit a late write even if an injected clock is subsequently moved backwards',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),nativeTimer=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;let now=0,resolve,expire;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});globalThis.setTimeout=fn=>{expire=fn;return 1;};globalThis.clearTimeout=()=>{};
 try{const r=vpRig({send:()=>new Promise(ok=>{resolve=ok;}),timeoutMs:100}),pending=r.run();await new Promise(setImmediate);now=100;expire();await assert.rejects(pending,{name:'TimeoutError'});now=95;resolve({data:r.png.toString('base64')});await new Promise(setImmediate);assert.equal(r.writes.length,0);}finally{globalThis.setTimeout=nativeTimer;globalThis.clearTimeout=nativeClear;if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
});
