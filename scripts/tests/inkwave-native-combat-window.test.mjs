import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {beginNativeCombatWindow,inspectNativeCombatWindow,waitForNativeCombatWindow} from '../lib/inkwave-native-combat-window.mjs';

function fixture(){
 let now=0;
 const G={match:{state:'playing'},level:{},mode:'match',actors:Array.from({length:8},()=>({})),time:12};
 const probe={totalFrames:47,windowFrames:0,contextLost:false};
 const game={mapDef:{id:'kelpline'},frozen:false,_skipRender:false};
 const context=vm.createContext({__G:G,__inkwave:game,__gameplayProbe:probe,performance:{now:()=>now}});
 const run=(fn,arg)=>vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg)??''})`,context);
 return {G,probe,game,run,at(ms,frames=0){now=ms;probe.totalFrames+=frames;probe.windowFrames+=frames;G.time+=frames/60;}};
}

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
