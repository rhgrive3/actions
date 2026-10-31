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
