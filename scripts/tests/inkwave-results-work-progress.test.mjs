// Component doubles prove observation contracts, never GPU/FPS acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createResultsProgress,measureResultsWork,runResultsWorkDiagnostic,boundIdleEvaluations,runIdleProbe,idleFailureReporter,formatIdleFailureProgress,primaryIdleFailure,IDLE_OPERATION_TIMEOUT_MS,RESULTS_WORK_TIMEOUT_MS} from '../check-inkwave-idle-resources.mjs';
// Frozen exact61543 callback, independently hash checked against its original.
const baselineSource="()=>{\n   const G=__G,g=G.game,match=g.match,gl=G.renderer.getContext(),restore=[];\n   const beforeState=match.state,beforePaused=match.paused;let counts;\n   const hook=(obj,key,label)=>{const old=obj[key];if(typeof old!=='function')throw Error('Missing native work producer '+key);obj[key]=function(...args){counts[label]++;return old.apply(this,args);};restore.push(()=>{obj[key]=old;});};\n   for(const a of G.actors)hook(a,'update','actorUpdates');\n   for(const [obj,key,label] of [[G.projectiles,'update','projectileUpdates'],[G.paint,'flush','paintFlushes'],[G.fx,'update','fxUpdates'],[g.R,'render','worldRenders']])hook(obj,key,label);\n   for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'])hook(gl,key,'gpuDrawSubmissions');\n   const sample=state=>{counts={actorUpdates:0,projectileUpdates:0,paintFlushes:0,fxUpdates:0,worldRenders:0,gpuDrawSubmissions:0};match.state=state;match.paused=false;const start=performance.now();for(let i=0;i<120;i++)g._frame(1/60);return {...counts,cpuSubmissionMs:performance.now()-start};};\n   try{return {frames:120,playing:sample('playing'),results:sample('results'),measurement:'native published Game._frame producers and real WebGL submission counts; not GPU execution time or device power'};}\n   finally{restore.forEach(f=>f());match.state=beforeState;match.paused=beforePaused;}\n  }";
assert.equal(crypto.createHash('sha256').update(baselineSource).digest('hex'),'27510a169f39a0937d4d65b8b3ef93c766c0f32cfba43eb586d7ec3dc323bfed');
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
function fixture(options={}){
 const work=[],frames=[],messages=[],originals=[];let time=0,frame=0,clockErrorOnce=false,renderNesting=0;
 const match={state:'intro',paused:true},G={time:0,settings:{quality:'low'},actors:[]},g={match,frozen:true,_skipRender:false};G.game=g;
 const op=(label,body=()=>{})=>function(...args){
  work.push([label,match.state,frame,args.map(a=>typeof a==='number'?a:typeof a)]);time+=options.delays?.[label]??0;
  try{if(options.producer===label&&match.state===options.state&&(options.failFrame===undefined?frame%120===5:frame===options.failFrame))throw options.error;return body.apply(this,args);}
  finally{if(options.failClockAfterProducer===label)clockErrorOnce=true;}
 };
 const object=(label,keys)=>Object.fromEntries(keys.map(key=>[key,op(label+'.'+key)]));
 G.actors=Array.from({length:options.actorCount??2},(_,i)=>object('actor'+i,['update']));G.projectiles=object('projectile',['update','syncSights','syncVisuals','updateArc']);G.paint=object('paint',['flush','advanceSimulation']);G.fx=object('fx',['update']);G.env=object('environment',['update']);G.audio=object('audio',['setListener']);
 const gl=object('gl',['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']);
 if(options.nestedDraw)gl.drawArrays=op('gl.drawArrays',()=>gl.drawElements(4,3,5123,0));
 G.renderer={getContext:()=>gl,render:op('renderer.render',()=>{if(options.nestedRenderer&&!renderNesting){renderNesting++;try{G.renderer.render();}finally{renderNesting--;}}for(let i=0;i<(options.drawsPerFrame??1);i++)gl.drawArrays(4,0,3);})};g.R={composer:{render:op('composer.render',()=>G.renderer.render())},render:op('world.render',()=>g.R.composer.render())};
 g.input=object('input',['pollPad','endFrame']);g.decor=object('decor',['update']);g.rig=object('camera',['update']);g.showcase={...object('showcase',['update','render']),fullFrame:false};g.menus=object('menus',['update']);g._padMenus=op('padMenus');g._updateHud=op('hud');g._updateLocalLoops=op('audio.loops');g._updateAmbience=op('audio.ambience');
 class Clock{advance(dt,tick){this.advancing=true;this.accumulator+=dt;tick();this.ticks++;this.accumulator-=dt;this.advancing=false;}}
 g.s3Clock=Object.assign(new Clock(),{ticks:7,accumulator:.005,advancing:false,finalTick:true});
 g._frame=dt=>{frame++;frames.push([match.state,dt,match.paused]);for(let i=0;i<(options.pollsPerFrame??1);i++)g.input.pollPad();g._padMenus(dt);g.s3Clock.advance(dt,()=>{G.time+=dt;G.paint.advanceSimulation(dt);if(match.state==='playing'){for(const a of G.actors)a.update(dt);G.projectiles.update(dt);}});g._s3Ticked=1;
  if(match.state==='playing'){G.fx.update(dt);G.paint.flush(dt);}G.env.update(dt);g.decor.update(dt);g.rig.update(dt);G.projectiles.syncSights();G.projectiles.syncVisuals();G.projectiles.updateArc();g.showcase.update(dt);g._updateLocalLoops(dt);g._updateAmbience(dt);G.audio.setListener();g.R.render();g.showcase.render();if(match.state==='playing')g._updateHud(dt);g.menus.update(dt);g.input.endFrame();};
 for(const obj of [...G.actors,G.projectiles,G.paint,G.fx,G.env,G.audio,G.renderer,g.R,g.R.composer,g.input,g.decor,g.rig,g.showcase,g.menus,g,g.s3Clock,gl])for(const key of Reflect.ownKeys(obj))if(typeof obj[key]==='function')originals.push([obj,key,obj[key]]);
 const context={__G:G,document:{hidden:false},performance:{now:()=>{if(clockErrorOnce){clockErrorOnce=false;throw Error('diagnostic clock');}time+=options.clockStep??1;return time;}},console:{info:text=>{time+=options.emitDelayMs??0;messages.push(text);options.sink?.(text);if(options.consoleError)throw options.consoleError;}}};
 return {G,g,match,work,frames,messages,advanceTime:ms=>{time+=ms;},run(source=measureResultsWork.toString(),args={token:'test'}){return vm.runInNewContext('('+source+')',context)(args);},restored(){for(const [obj,key,fn]of originals)assert.equal(obj[key],fn,key);assert.equal(match.state,'intro');assert.equal(match.paused,true);assert.equal(Object.hasOwn(g.s3Clock,'advance'),false);}};
}
test('one synchronous evaluate preserves all240 native calls/order/dt/state and original work counts',async()=>{
 const original=fixture(),expected=original.run(baselineSource),progress=createResultsProgress('test'),f=fixture({sink:progress.accept});let calls=0,listener;
 const page={on(_event,fn){listener=fn;},off(_event,fn){assert.equal(fn,listener);listener=null;},evaluate(fn,args){calls++;assert.equal(fn,measureResultsWork);return Promise.resolve(f.run(fn.toString(),args));}};
 const actual=await runResultsWorkDiagnostic(page,progress);assert.equal(calls,1);assert.equal(f.frames.length,240);assert.deepEqual(f.work,original.work);assert.deepEqual(f.frames,original.frames);
 assert.deepEqual(f.frames.map(x=>x[0]),[...Array(120).fill('playing'),...Array(120).fill('results')]);assert(f.frames.every(x=>x[1]===1/60&&x[2]===false));
 for(const state of ['playing','results'])for(const key of ['actorUpdates','projectileUpdates','paintFlushes','fxUpdates','worldRenders','gpuDrawSubmissions'])assert.equal(actual[state][key],expected[state][key]);
 assert.equal(actual.playing.worldRenders,120);assert.equal(actual.results.worldRenders,120);assert.equal(actual.results.actorUpdates,0);assert.equal(actual.results.projectileUpdates,0);
 assert.equal(f.G.time,original.G.time);assert.equal(f.g.s3Clock.ticks,247);f.restored();assert(progress.snapshot().sealed);assert.equal(listener,null);
 const events=progress.snapshot().events;assert(events.some(e=>e.state==='results'&&e.completed===120&&e.totalCompleted===240));assert(events.some(e=>e.producer==='clock.advance'));assert(events.some(e=>e.producer==='camera'));assert(events.some(e=>e.producer==='R.render'));assert(events.some(e=>e.producer==='composer'));assert(events.some(e=>e.counts?.gpuDrawSubmissions>0));assert(events.some(e=>e.clock?.ticks>7));assert(events.some(e=>e.clock?.advancing===true));assert(events.every(e=>Number.isFinite(e.clock?.accumulator)&&e.dt===1/60));assert(progress.snapshot().diagnosticOnly);
});
for(const state of ['playing','results'])for(const value of [Error('native'),0,false,null,undefined])test(`native ${state} throw ${String(value)} is exact and observation restores methods/state`,()=>{
 const progress=createResultsProgress('test'),f=fixture({producer:'camera.update',state,error:value,sink:progress.accept});let failed=false,caught;
 try{f.run();}catch(error){failed=true;caught=error;}assert(failed);assert.equal(caught,value);f.restored();
 const events=progress.snapshot().events;assert(events.some(e=>e.producer==='camera'&&e.edge==='throw'));assert(events.some(e=>e.producer==='frame'&&e.edge==='throw'));assert(!events.some(e=>e.state===state&&e.completed===120));
});
test('observation emission failure cannot replace a native falsy throw',()=>{
 const f=fixture({producer:'camera.update',state:'playing',error:0,consoleError:Error('observer console')});let failed=false,caught;try{f.run();}catch(error){failed=true;caught=error;}assert(failed);assert.equal(caught,0);f.restored();
});
test('partial observer installation failure restores existing hooks and original state',()=>{
 const f=fixture(),menus=f.g.menus;f.g.menus=new Proxy(menus,{set(){throw 0;}});let failed=false,caught;
 try{f.run();}catch(error){failed=true;caught=error;}assert(failed);assert.equal(caught,0);assert.equal(f.frames.length,0);f.restored();
});
test('detail cap is independent of reserved progress and never reduces native workload',()=>{
 const p=createResultsProgress('test'),f=fixture({sink:p.accept});f.run(undefined,{token:'test',maxDetailEvents:4});const s=p.snapshot();assert.equal(f.frames.length,240);assert.equal(s.detail.received,5);assert(s.detail.truncated);assert.equal(s.detail.events.at(-1).edge,'limit');assert.equal(s.events.at(-1).totalCompleted,240);assert.equal(s.events.at(-1).producer,'cleanup');assert.equal(s.truncated,false);f.restored();
});
test('100 draws/frame and high actor counts exhaust only detail, retain all240 frames and exact counters',()=>{
 const options={drawsPerFrame:100,actorCount:96},original=fixture(options),expected=original.run(baselineSource),p=createResultsProgress('test'),f=fixture({...options,sink:p.accept}),actual=f.run(),s=p.snapshot();
 assert.deepEqual(f.work,original.work);assert.deepEqual(f.frames,original.frames);assert.equal(f.frames.length,240);assert.equal(actual.playing.gpuDrawSubmissions+actual.results.gpuDrawSubmissions,24000);assert.equal(actual.playing.actorUpdates,11520);
 for(const state of ['playing','results'])for(const key of ['actorUpdates','projectileUpdates','paintFlushes','fxUpdates','worldRenders','gpuDrawSubmissions'])assert.equal(actual[state][key],expected[state][key]);
 assert.equal(s.detail.received,129);assert.equal(s.detail.events.length,32);assert(s.detail.truncated);assert.equal(s.truncated,false);assert.equal(s.rejected,0);assert(s.received<32769);assert(s.events.some(e=>e.producer==='frame'&&e.state==='results'&&e.completed===120&&e.totalCompleted===240));assert.equal(s.events.at(-1).producer,'cleanup');assert.equal(s.events.at(-1).detailSuppressed,actual.playing.actorUpdates*2-128);
 assert(f.messages.length<15000);assert(f.messages.every(text=>!JSON.parse(text.slice(text.indexOf('{'))).producer.startsWith('gl.')));assert(s.events.some(e=>e.producer==='renderer'&&e.edge==='exit'&&e.counts.gpuDrawSubmissions===12000));f.restored();
});
test('detail exhaustion cannot hide a late native failure or the pending render entry before it',()=>{
 const p=createResultsProgress('test'),f=fixture({drawsPerFrame:100,actorCount:96,producer:'renderer.render',state:'results',failFrame:239,error:0,sink:p.accept});let failed=false,caught;
 try{f.run();}catch(error){failed=true;caught=error;}assert(failed);assert.equal(caught,0);const s=p.snapshot();assert(s.detail.truncated);assert.equal(s.truncated,false);assert(s.events.some(e=>e.producer==='renderer'&&e.edge==='enter'&&e.frame===119&&e.totalCompleted===238));assert(s.events.some(e=>e.producer==='frame'&&e.edge==='throw'&&e.state==='results'&&e.completed===118));assert(!s.events.some(e=>e.totalCompleted===240));f.restored();
});
test('sampled actor and aggregate GL wrappers preserve falsy native failures after detail exhaustion',()=>{
 for(const [producer,state,failFrame,error]of [['actor95.update','playing',119,0],['gl.drawArrays','results',239,false]]){
  const p=createResultsProgress('test'),f=fixture({drawsPerFrame:100,actorCount:96,producer,state,failFrame,error,sink:p.accept});let failed=false,caught;
  try{f.run();}catch(value){failed=true;caught=value;}assert(failed);assert.equal(caught,error);assert(p.snapshot().detail.truncated);assert(p.snapshot().events.some(e=>e.producer==='frame'&&e.edge==='throw'));f.restored();
 }
});
test('repeated coarse callees have a per-frame cap; reserved frame/state progress continues afterwards',()=>{
 const p=createResultsProgress('test'),f=fixture({pollsPerFrame:100,sink:p.accept});f.run();const s=p.snapshot();assert(s.truncated);assert(s.events.some(e=>e.edge==='limit'));assert(s.events.some(e=>e.state==='results'&&e.producer==='frame'&&e.completed===120));assert.equal(s.events.at(-1).totalCompleted,240);assert(s.events.at(-1).criticalSuppressed>0);assert(s.received<=31446);f.restored();
});
test('collector has bounded memory/message size and rejects malformed/spoofed/out-of-order input',()=>{
 const p=createResultsProgress('test',{capacity:3,detailCapacity:2,maxMessages:5,maxDetailMessages:3,maxChars:512}),message=(seq,channel='critical')=>'INKWAVE_RESULTS_WORK test '+JSON.stringify({channel,seq,producer:'frame',edge:'enter',state:'playing'});
 const q=createResultsProgress('test',{capacity:3,maxMessages:5,maxChars:512});assert(q.accept(message(2)));
 for(const bad of [message(2),message(1),'INKWAVE_RESULTS_WORK test {','INKWAVE_RESULTS_WORK test '+ 'x'.repeat(513)])assert.equal(q.accept(bad),false);
 assert.equal(q.snapshot().received,1);assert.equal(q.snapshot().rejected,2);assert.equal(q.snapshot().invalidMessages,2);
 for(let i=1;i<=20;i++)p.accept(message(i));p.accept('INKWAVE_RESULTS_WORK wrong {}');p.accept('INKWAVE_RESULTS_WORK test '+ 'x'.repeat(513));p.accept('INKWAVE_RESULTS_WORK test {');
 const s=p.snapshot();assert.equal(s.events.length,3);assert.equal(s.received,5);assert(s.truncated);assert(s.rejected>=15);assert.deepEqual(s.events.map(x=>x.seq),[3,4,5]);for(let i=1;i<=10;i++)p.accept(message(i,'detail'));assert.equal(p.snapshot().detail.received,3);assert.deepEqual(p.snapshot().detail.events.map(x=>x.seq),[2,3]);assert.deepEqual(p.snapshot().events,s.events);p.seal();const sealed=p.snapshot();p.accept(message(100));p.accept(message(100,'detail'));assert.deepEqual(p.snapshot(),sealed);
 for(const opts of [{capacity:513},{detailCapacity:65},{maxMessages:32770},{maxDetailMessages:130},{maxChars:4097}])assert.throws(()=>createResultsProgress('test',opts),TypeError);
});
test('the unchanged comparison can finish after120 and before240 seconds under one host deadline',async()=>{
 const pending=new Map(),delays=[];let time=0,serial=0,listener,finish,evaluations=0,settled=false,cleanups=0;
 const timers={setTimeout(fn,ms){const id=++serial;delays.push(ms);pending.set(id,{fn,at:time+ms});return id;},clearTimeout(id){pending.delete(id);}};
 const tick=ms=>{time+=ms;for(const [id,x]of pending)if(x.at<=time){pending.delete(id);x.fn();}};
 const progress=createResultsProgress('test'),f=fixture({sink:text=>listener({text:()=>text})});
 const page={on(_e,fn){listener=fn;},off(){listener=null;},evaluate(fn,args){evaluations++;assert.equal(fn,measureResultsWork);assert.deepEqual(args,{token:'test'});return new Promise(resolve=>{finish=()=>resolve(f.run(fn.toString(),args));});}};boundIdleEvaluations(page,()=> 'results-work',timers);
 const task=runIdleProbe(()=>runResultsWorkDiagnostic(page,progress),{diagnose:()=>assert.fail('successful comparison must not diagnose'),cleanup:()=>{cleanups++;assert(progress.snapshot().sealed);}}).then(value=>{settled=true;return value;});await flush();
 assert.equal(IDLE_OPERATION_TIMEOUT_MS,120000);assert.equal(RESULTS_WORK_TIMEOUT_MS,240000);assert.deepEqual(delays,[240000]);tick(120000);await flush();assert.equal(settled,false);assert.equal(cleanups,0);tick(60000);finish();const value=await task;
 assert.equal(value.frames,120);assert.equal(value.playing.worldRenders,120);assert.equal(value.results.worldRenders,120);assert.equal(f.frames.length,240);assert.deepEqual(f.frames.map(x=>x[0]),[...Array(120).fill('playing'),...Array(120).fill('results')]);assert(f.frames.every(x=>x[1]===1/60));f.restored();assert.equal(evaluations,1);assert.equal(serial,1);assert.equal(cleanups,1);assert.equal(pending.size,0);assert.equal(listener,null);
});
test('other phases and unrelated callbacks retain120-second supervision even with a results-work label',async()=>{
 const cases=[{phase:'results-work',fn:()=>{}},{phase:'results-work',fn:measureResultsWork.bind(null)},...['identity','boot','audio','clouds','clouds:day','far-stage-transitions','pause','gpu-identity','cold-boot-mobile'].map(phase=>({phase,fn:measureResultsWork}))];
 for(const {phase,fn}of cases){
  let time=0,serial=0,failure,settled=false;const pending=new Map(),delays=[],timers={setTimeout(f,ms){const id=++serial;delays.push(ms);pending.set(id,{f,at:time+ms});return id;},clearTimeout(id){pending.delete(id);}};
  const tick=ms=>{time+=ms;for(const [id,x]of pending)if(x.at<=time){pending.delete(id);x.f();}};
  const page=boundIdleEvaluations({evaluate:()=>new Promise(()=>{})},()=>phase,timers),task=page.evaluate(fn).then(()=>{settled=true;},error=>{settled=true;failure=error;});await flush();assert.deepEqual(delays,[120000]);tick(119999);await flush();assert.equal(settled,false);tick(1);await task;assert.equal(failure.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(failure.phase,phase);assert.equal(failure.timeoutMs,120000);assert.equal(pending.size,0);
 }
});
for(const failsCleanup of [false,true])test(`one240-second comparison deadline retains progress before ${failsCleanup?'failing':'ordinary'} cleanup and ignores late completion`,async t=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'results-progress-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));const file=path.join(output,'receipt.json'),progress=createResultsProgress('test'),pending=new Map(),order=[],stderr=[];let time=0,serial=0,listener,evaluateCalls=0,resolve;
 const timers={setTimeout(fn,ms){const id=++serial;pending.set(id,{fn,at:time+ms});return id;},clearTimeout(id){pending.delete(id);}};
 const tick=ms=>{time+=ms;for(const [id,x]of pending)if(x.at<=time){pending.delete(id);x.fn();}};
 const page={on(_e,fn){listener=fn;},off(){listener=null;},evaluate(){evaluateCalls++;return new Promise(r=>{resolve=r;});},screenshot(){throw Error('No screenshot/evaluate after timeout');}};boundIdleEvaluations(page,()=> 'results-work',timers);
 const publish=receipt=>{order.push('receipt');fs.writeFileSync(file,JSON.stringify(receipt));},diagnose=idleFailureReporter({publish,snapshot:()=>({resultsWorkProgress:progress.snapshot()}),page:()=>page,screenshotPath:'unused',stderr:line=>{order.push('stderr');stderr.push(line);}});
 const closeError=Error('secondary cleanup failure');let failure;const task=runIdleProbe(()=>runResultsWorkDiagnostic(page,progress),{diagnose,cleanup:()=>{order.push('cleanup');const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.status,'failed');assert(saved.resultsWorkProgress.sealed);assert.equal(saved.resultsWorkProgress.events.at(-1).producer,'composer');if(failsCleanup)throw closeError;}}).catch(error=>{failure=error;});await flush();
 for(let j=1;j<=150;j++)listener({text:()=> 'INKWAVE_RESULTS_WORK test '+JSON.stringify({channel:'detail',seq:j,state:'playing',producer:'actor[0].update',edge:'enter'})});assert(progress.snapshot().detail.truncated);
 for(let i=1;i<=2;i++){tick(40000);listener({text:()=> 'INKWAVE_RESULTS_WORK test '+JSON.stringify({channel:'critical',seq:i,state:'results',producer:'composer',edge:'enter',frame:118+i,completed:117+i,totalCompleted:237+i,elapsedMs:time,stateElapsedMs:time-40000,clock:{ticks:237+i,accumulator:.005},counts:{gpuDrawSubmissions:100*i,worldRenders:118+i}})});}
 tick(39999);await flush();assert.equal(failure,undefined);assert.equal(serial,1);assert.equal(stderr.length,0);tick(1);await flush();assert.equal(failure,undefined);assert.equal(pending.size,1);tick(119999);await flush();assert.equal(failure,undefined);tick(1);await task;const primary=primaryIdleFailure(failure);assert.equal(primary.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(primary.timeoutMs,240000);assert.equal(primary.phase,'results-work');assert.equal(evaluateCalls,1);assert.deepEqual(order,failsCleanup?['stderr','receipt','cleanup','receipt']:['stderr','receipt','cleanup']);assert.equal(pending.size,0);if(failsCleanup){assert(failure instanceof AggregateError);assert.equal(failure.cause,primary);assert.equal(failure.errors[1],closeError);}else assert.equal(failure,primary);
 assert.equal(stderr.length,1);const summary=JSON.parse(stderr[0].slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert.equal(summary.phase,'results-work');assert.equal(summary.state,'results');assert.equal(summary.totalCompleted,239);assert.equal(summary.sampledRegion,'composer');assert.equal(summary.regionEdge,'enter');assert.equal(summary.elapsedMs,80000);assert.equal(summary.stateElapsedMs,40000);assert.equal(summary.gpuDrawSubmissions,200);assert.equal(summary.worldRenders,120);assert(summary.observations.detail.truncated);assert(stderr[0].length<=1024);const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.operation.timeoutMs,240000);assert.equal(saved.primaryError,primary.stack);
 const before=fs.readFileSync(file,'utf8'),snapshot=progress.snapshot();resolve({});await flush();assert.equal(fs.readFileSync(file,'utf8'),before);assert.deepEqual(progress.snapshot(),snapshot);assert.equal(listener,null);
});
test('listener cleanup error retains the exact original falsy evaluate failure as cause',async()=>{
 const cleanup=Error('off failed'),p=createResultsProgress('test'),page={on(){},evaluate(){return Promise.reject(0);},off(){throw cleanup;}};
 await assert.rejects(runResultsWorkDiagnostic(page,p),error=>error instanceof AggregateError&&error.cause===0&&error.errors[0]===0&&error.errors[1]===cleanup);assert(p.snapshot().sealed);
});
const summaryData=()=>({phase:'results-work',resultsWorkProgress:{capacity:256,maxMessages:32769,received:1000,truncated:false,events:[{state:'results',frame:119,completed:118,totalCompleted:238,producer:'camera',edge:'throw',criticalSuppressed:0,detailSuppressed:300},{state:'results',frame:119,completed:118,totalCompleted:238,producer:'frame',edge:'throw',criticalSuppressed:0,detailSuppressed:300},{state:'restoring',frame:119,completed:118,totalCompleted:238,producer:'cleanup',edge:'exit'}],detail:{capacity:32,maxMessages:129,received:129,truncated:true,events:[]}}});
test('stderr summary is compact, allowlisted and does not echo tokens, URLs, traces or stale-phase progress',()=>{
 const secret='SECRET https://private.invalid/?token=secret\ntrace '+ 'x'.repeat(20000),data=summaryData(),before=structuredClone(data);data.resultsWorkProgress.token=secret;data.extra=secret;
 const text=formatIdleFailureProgress(Error(secret),data),s=JSON.parse(text.slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert(text.length<=1024);assert(!text.includes('SECRET'));assert(!text.includes('https:'));assert(!text.includes('\n'));assert(!text.includes('trace'));assert.equal(s.state,'results');assert.equal(s.frame,119);assert.equal(s.totalCompleted,238);assert.equal(s.sampledRegion,'camera');assert.equal(s.regionEdge,'throw');assert.deepEqual(data.resultsWorkProgress.events,before.resultsWorkProgress.events);
 const latest=data.resultsWorkProgress.events[1];Object.assign(latest,{state:secret,frame:secret,completed:Infinity,totalCompleted:241,producer:secret,edge:secret,criticalSuppressed:Number.MAX_SAFE_INTEGER+1,detailSuppressed:secret});
 const unsafe=formatIdleFailureProgress({phase:secret},data);assert(unsafe.length<=1024);assert(!unsafe.includes('SECRET'));assert.equal(JSON.parse(unsafe.slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length)).phase,'unknown');
 const malformed=JSON.parse(formatIdleFailureProgress(null,data).slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert.equal(malformed.state,'unknown');assert.equal(malformed.frame,null);assert.equal(malformed.completed,null);assert.equal(malformed.totalCompleted,null);assert.equal(malformed.sampledRegion,'unknown');assert.equal(malformed.regionEdge,'unknown');
 const stale=JSON.parse(formatIdleFailureProgress({phase:'gpu-identity'},summaryData()).slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert.equal(stale.state,'unknown');assert.equal(stale.sampledRegion,'unknown');assert.equal(stale.totalCompleted,null);
 const full=summaryData(),event=full.resultsWorkProgress.events[1];Object.assign(event,{criticalSuppressed:Number.MAX_SAFE_INTEGER,detailSuppressed:Number.MAX_SAFE_INTEGER});full.resultsWorkProgress.events=Array(512).fill(event);Object.assign(full.resultsWorkProgress,{capacity:512,received:32769,truncated:true});Object.assign(full.resultsWorkProgress.detail,{capacity:64,events:Array(64).fill(event)});assert(formatIdleFailureProgress(null,full).length<=1024);
});
test('summary scans at most512 critical entries and emits no full event arrays',()=>{
 const data=summaryData();let reads=0;data.resultsWorkProgress.events=new Proxy(new Array(1000000),{get(target,key){if(/^\d+$/.test(String(key))){reads++;return {state:'results',frame:120,completed:119,totalCompleted:239,producer:'frame',edge:'enter'};}return Reflect.get(target,key);}});
 const text=formatIdleFailureProgress(null,data);assert.equal(reads,512);assert(text.length<=1024);assert(!text.includes('events'));assert.equal(JSON.parse(text.slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length)).totalCompleted,239);
});
test('numeric failure summary preserves already-captured clock and submission counters',()=>{
 const data=summaryData(),latest=data.resultsWorkProgress.events[1];Object.assign(latest,{elapsedMs:119875.125,stateElapsedMs:14500.25,counts:{gpuDrawSubmissions:12345,worldRenders:118}});
 Object.assign(data.resultsWorkProgress.events[0],{elapsedMs:1,stateElapsedMs:1,counts:{gpuDrawSubmissions:1,worldRenders:1}});Object.assign(data.resultsWorkProgress.events[2],{elapsedMs:999999,stateElapsedMs:999999,counts:{gpuDrawSubmissions:999999,worldRenders:999999}});
 const text=formatIdleFailureProgress(null,data),s=JSON.parse(text.slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert.equal(s.elapsedMs,119875.125);assert.equal(s.stateElapsedMs,14500.25);assert.equal(s.gpuDrawSubmissions,12345);assert.equal(s.worldRenders,118);assert.equal(s.totalCompleted,238);assert.equal(s.sampledRegion,'camera');assert.equal(s.scope,'sampled diagnostic; not GPU/FPS evidence');assert(Buffer.byteLength(text,'utf8')<=1024);assert.match(text,/^[\x20-\x7e]+$/);
});
test('numeric failure summary omits malformed or out-of-bound times and counters',()=>{
 for(const value of [undefined,null,NaN,Infinity,-Infinity,-1,Number.MAX_SAFE_INTEGER+1,'120',false,{},[]]){
  const data=summaryData();Object.assign(data.resultsWorkProgress.events[1],{elapsedMs:value,stateElapsedMs:value,counts:{gpuDrawSubmissions:value,worldRenders:value}});
  const s=JSON.parse(formatIdleFailureProgress(null,data).slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));for(const key of ['elapsedMs','stateElapsedMs','gpuDrawSubmissions','worldRenders'])assert.equal(Object.hasOwn(s,key),false,key+' '+String(value));
 }
 const data=summaryData();Object.assign(data.resultsWorkProgress.events[1],{elapsedMs:.5,stateElapsedMs:.25,counts:{gpuDrawSubmissions:1.5,worldRenders:.5}});const s=JSON.parse(formatIdleFailureProgress(null,data).slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));assert.equal(s.elapsedMs,.5);assert.equal(s.stateElapsedMs,.25);assert.equal(Object.hasOwn(s,'gpuDrawSubmissions'),false);assert.equal(Object.hasOwn(s,'worldRenders'),false);
});
test('numeric failure summary preserves zero and remains bounded at largest admitted values',()=>{
 for(const value of [0,Number.MAX_SAFE_INTEGER]){
  const data=summaryData(),event=data.resultsWorkProgress.events[1];Object.assign(event,{elapsedMs:value,stateElapsedMs:value,counts:{gpuDrawSubmissions:value,worldRenders:value},criticalSuppressed:Number.MAX_SAFE_INTEGER,detailSuppressed:Number.MAX_SAFE_INTEGER});data.resultsWorkProgress.events=Array(512).fill(event);Object.assign(data.resultsWorkProgress,{capacity:512,received:32769,truncated:true});Object.assign(data.resultsWorkProgress.detail,{capacity:64,events:Array(64).fill(event)});
  const text=formatIdleFailureProgress(null,data),s=JSON.parse(text.slice('INKWAVE_IDLE_FAILURE_PROGRESS '.length));for(const key of ['elapsedMs','stateElapsedMs','gpuDrawSubmissions','worldRenders'])assert.equal(s[key],value);assert(Buffer.byteLength(text,'utf8')<=1024);assert.match(text,/^[\x20-\x7e]+$/);assert.equal(text.includes('events'),false);
 }
});
test('summary precedes cleanup, occurs once across cleanup failure, and leaves failed JSON and original cause intact',async()=>{
 const original=Error('original'),cleanupError=Error('cleanup'),order=[],receipts=[],lines=[],data=summaryData();
 const diagnose=idleFailureReporter({snapshot:()=>data,publish:r=>{order.push('receipt');receipts.push(r);},page:()=>null,stderr:line=>{order.push('stderr');lines.push(line);}});
 await assert.rejects(runIdleProbe(()=>{throw original;},{diagnose,cleanup:()=>{order.push('cleanup');assert.equal(lines.length,1);throw cleanupError;}}),error=>error instanceof AggregateError&&error.cause===original&&error.errors[1]===cleanupError);
 assert.deepEqual(order,['stderr','receipt','cleanup','receipt']);assert.equal(lines.length,1);assert.equal(receipts.length,2);assert(receipts.every(r=>r.status==='failed'&&r.primaryError===original.stack));assert.deepEqual(receipts[0].resultsWorkProgress,data.resultsWorkProgress);
});
test('summary remains best effort on snapshot/publish/stderr failure and is absent on ordinary success',async()=>{
 for(const stage of ['snapshot','publish','stderr']){
  const diagnosticError=Error(stage),order=[];let outputs=0;
  const diagnose=idleFailureReporter({snapshot:()=>{if(stage==='snapshot')throw diagnosticError;return summaryData();},publish:()=>{order.push('receipt');if(stage==='publish')throw diagnosticError;},page:()=>null,stderr:()=>{outputs++;order.push('stderr');if(stage==='stderr')throw diagnosticError;}});
  let caught,failed=false;try{await runIdleProbe(()=>{throw 0;},{diagnose,cleanup:()=>{assert.equal(outputs,1);order.push('cleanup');}});}catch(error){failed=true;caught=error;}
  assert(failed);if(stage==='stderr')assert.equal(caught,0);else assert(caught instanceof AggregateError&&caught.cause===0&&caught.errors[1]===diagnosticError);assert.equal(outputs,1);assert.equal(order.at(-1),'cleanup');
 }
 let outputs=0;const diagnose=idleFailureReporter({snapshot:summaryData,publish:()=>assert.fail('no failure receipt on success'),page:()=>null,stderr:()=>{outputs++;}});assert.equal(await runIdleProbe(()=>42,{diagnose,cleanup:()=>{}}),42);assert.equal(outputs,0);
});

const diagnosticSamples=f=>f.messages.filter(text=>text.includes('"producer":"sample","edge":"exit"')).map(text=>JSON.parse(text.slice(text.indexOf('{'))));
for(const control of [
 {name:'console only',emitDelayMs:3,drawsPerFrame:1,delays:{},renderer:0,draw:0,other:0},
 {name:'renderer body only',emitDelayMs:0,drawsPerFrame:1,delays:{'renderer.render':7},renderer:7,draw:0,other:7},
 {name:'native draw only',emitDelayMs:0,drawsPerFrame:3,delays:{'gl.drawArrays':5},renderer:15,draw:15,other:0},
 {name:'mixed independent delays',emitDelayMs:2,drawsPerFrame:4,delays:{'renderer.render':7,'gl.drawArrays':3},renderer:19,draw:12,other:7},
])test('diagnostic wall attribution separates '+control.name+' without changing the pinned workload',()=>{
 const options={...control,clockStep:0},baseline=fixture(options),expected=baseline.run(baselineSource),p=createResultsProgress('test'),f=fixture({...options,sink:p.accept}),actual=f.run();
 assert.deepEqual(f.work,baseline.work);assert.deepEqual(f.frames,baseline.frames);assert.equal(f.frames.length,240);assert.equal(f.G.time,baseline.G.time);assert.equal(f.g.s3Clock.ticks,247);
 for(const state of ['playing','results'])for(const key of ['actorUpdates','projectileUpdates','paintFlushes','fxUpdates','worldRenders','gpuDrawSubmissions'])assert.equal(actual[state][key],expected[state][key]);
 const samples=diagnosticSamples(f);assert.equal(samples.length,2);
 for(const e of samples){const t=e.timing;assert(t.diagnosticOnly);assert.equal(t.clockErrors,0);assert.equal(t.renderer.calls,120);assert.equal(t.renderer.outerCalls,120);assert.equal(t.renderer.wallMs,120*control.renderer);assert.equal(t.renderer.drawCallWallMs,120*control.draw);assert.equal(t.renderer.otherWallMs,120*control.other);assert.equal(t.draws.wallMs,120*control.draw);assert.equal(t.draws.calls,120*control.drawsPerFrame);assert.equal(t.draws.outerCalls,t.draws.calls);assert.equal(t.renderer.nestedEmitWallMs,0);assert.equal(t.emitWallMs>0,control.emitDelayMs>0);}
 assert.equal(p.snapshot().invalidMessages,0);assert.equal(p.snapshot().rejected,0);assert(f.messages.every(text=>text.length<=4096));assert(f.messages.every(text=>!JSON.parse(text.slice(text.indexOf('{'))).producer.startsWith('gl.')));assert.equal(Object.hasOwn(actual.playing,'timing'),false);assert.equal(Object.hasOwn(actual.results,'timing'),false);f.restored();
});
test('nested renderer and draw wrappers retain every call and do not double count wall intervals',()=>{
 const options={clockStep:0,emitDelayMs:2,nestedRenderer:true,nestedDraw:true,delays:{'renderer.render':7,'gl.drawArrays':3,'gl.drawElements':5}},baseline=fixture(options),expected=baseline.run(baselineSource),f=fixture(options),actual=f.run();
 assert.deepEqual(f.work,baseline.work);assert.deepEqual(f.frames,baseline.frames);assert.equal(actual.playing.gpuDrawSubmissions,expected.playing.gpuDrawSubmissions);
 for(const e of diagnosticSamples(f)){const t=e.timing;assert.equal(t.renderer.calls,240);assert.equal(t.renderer.outerCalls,120);assert.equal(t.renderer.wallMs,4080);assert.equal(t.renderer.nestedEmitWallMs,480);assert.equal(t.renderer.drawCallWallMs,1920);assert.equal(t.renderer.otherWallMs,1680);assert.equal(t.draws.calls,480);assert.equal(t.draws.outerCalls,240);assert.equal(t.draws.wallMs,1920);assert.equal(t.draws.methods.drawArrays.wallMs,1920);assert.equal(t.draws.methods.drawElements.calls,240);assert.equal(t.draws.methods.drawElements.outerCalls,0);assert.equal(t.draws.methods.drawElements.wallMs,0);}
 f.restored();
});
test('timing clock failures cannot replace successful calls or a native falsy draw failure',()=>{
 for(const fail of [false,true]){
  const p=createResultsProgress('test'),f=fixture({clockStep:0,failClockAfterProducer:'gl.drawArrays',...(fail?{producer:'gl.drawArrays',state:'results',failFrame:239,error:false}:{}),sink:p.accept});let caught,failed=false,result;
  try{result=f.run();}catch(error){failed=true;caught=error;}
  assert.equal(failed,fail);if(fail){assert.equal(caught,false);assert.equal(f.frames.length,239);}else{assert.equal(f.frames.length,240);assert.equal(result.playing.gpuDrawSubmissions,120);assert.equal(result.results.gpuDrawSubmissions,120);}
  assert(p.snapshot().events.some(e=>e.timing?.clockErrors>0));f.restored();
 }
});
test('renderer and existing aggregate draw wrappers preserve borrowed receivers, arguments and return values',()=>{
 const f=fixture({clockStep:0}),gl=f.G.renderer.getContext(),oldRenderer=f.G.renderer.render,oldDraw=gl.drawArrays,oldFrame=f.g._frame;
 const receiver={},arg={},rendererReturn={},drawReturn={};let rendererCalls=0,drawCalls=0;
 const renderer=function(...args){if(this===receiver){assert.deepEqual(args,[17,arg]);rendererCalls++;return rendererReturn;}return oldRenderer.apply(this,args);};
 const draw=function(...args){if(this===receiver){assert.deepEqual(args,[23,arg]);drawCalls++;return drawReturn;}return oldDraw.apply(this,args);};
 f.G.renderer.render=renderer;gl.drawArrays=draw;f.g._frame=dt=>{assert.equal(f.G.renderer.render.call(receiver,17,arg),rendererReturn);assert.equal(gl.drawArrays.call(receiver,23,arg),drawReturn);return oldFrame(dt);};
 f.run();assert.equal(rendererCalls,240);assert.equal(drawCalls,240);assert.equal(f.G.renderer.render,renderer);assert.equal(gl.drawArrays,draw);
 f.G.renderer.render=oldRenderer;gl.drawArrays=oldDraw;f.g._frame=oldFrame;f.restored();
});

function nonDrawFixture({nested=false,throwValue,throws=false,...options}={}){
 const f=fixture({clockStep:0,...options}),gl=f.G.renderer.getContext(),oldRenderer=f.G.renderer.render,oldWorld=f.g.R.render;
 const calls=[];
 const method=(name,delay)=>function(){calls.push([name,this===gl,Array.from(arguments)]);f.advanceTime(delay);if(throws&&name==='bufferData'&&f.match.state==='results'&&f.frames.length===239)throw throwValue;if(nested&&name==='bufferData'){gl.uniform1f(5,6);gl.drawArrays(4,0,3);}return name;};
 const methods={compileShader:method('compileShader',2),bufferData:method('bufferData',3),bindFramebuffer:method('bindFramebuffer',4),clear:method('clear',5),getParameter:method('getParameter',6),uniform1f:method('uniform1f',7),useProgram:method('useProgram',8)};
 const proto=Object.create(Object.getPrototypeOf(gl));proto.bufferData=methods.bufferData;Object.setPrototypeOf(gl,proto);
 for(const [name,fn]of Object.entries(methods))if(name!=='bufferData')Object.defineProperty(gl,name,{value:fn,writable:true,configurable:true,enumerable:false});
 const descriptors=Object.fromEntries(Object.keys(methods).map(name=>[name,Object.getOwnPropertyDescriptor(gl,name)]));
 f.G.renderer.render=function(){gl.compileShader(1);gl.bufferData(2,3);if(!nested)gl.uniform1f(5,6);gl.clear(7);gl.getParameter(8);gl.useProgram(9);return oldRenderer.apply(this,arguments);};
 f.g.R.render=function(){gl.bindFramebuffer(10,11);return oldWorld.apply(this,arguments);};
 const renderer=f.G.renderer.render,world=f.g.R.render;
 return {...f,gl,calls,methods,verifyRestored(){assert.equal(f.G.renderer.render,renderer);assert.equal(f.g.R.render,world);for(const key of Object.keys(methods)){assert.equal(gl[key],methods[key]);assert.deepEqual(Object.getOwnPropertyDescriptor(gl,key),descriptors[key]);}f.G.renderer.render=oldRenderer;f.g.R.render=oldWorld;f.restored();}};
}
test('opt-in non-draw attribution preserves all240 calls and separates renderer wall from outer target work',()=>{
 const base=nonDrawFixture(),expected=base.run(baselineSource),f=nonDrawFixture(),actual=f.run(undefined,{token:'test',nonDrawGL:true});
 assert.deepEqual(f.frames,base.frames);assert.deepEqual(f.work,base.work);assert.deepEqual(f.calls,base.calls);
 for(const state of ['playing','results'])for(const key of ['actorUpdates','projectileUpdates','paintFlushes','fxUpdates','worldRenders','gpuDrawSubmissions'])assert.equal(actual[state][key],expected[state][key]);
 for(const e of diagnosticSamples(f)){
  const t=e.timing,n=t.nonDrawGL;assert.equal(n.calls,840);assert.equal(n.outerCalls,840);assert.equal(n.wallMs,4200);assert.equal(n.inRendererWallMs,3720);
  assert.equal(t.renderer.wallMs,3720);assert.equal(t.renderer.otherWallMs,3720);assert.equal(t.draws.wallMs,0);
  for(const [group,method,delay]of [['program','compileShader',2],['upload','bufferData',3],['target','bindFramebuffer',4],['clear','clear',5],['query','getParameter',6],['uniform','uniform1f',7],['state','useProgram',8]]){
   const b=n.groups[group];assert.equal(b.calls,120);assert.equal(b.outerCalls,120);assert.equal(b.wallMs,120*delay);assert.equal(b.inRendererWallMs,group==='target'?0:120*delay);assert.equal(b.maxWallMs,delay);assert.equal(b.maxMethod,method);assert.equal(b.maxFrame,1);assert.equal(b.maxRendererOrdinal,group==='target'?0:1);assert.equal(b.availableMethods,1);assert(b.unavailableMethods>=0);
  }
 }
 assert(f.messages.every(text=>text.length<=4096));assert(f.messages.every(text=>!JSON.parse(text.slice(text.indexOf('{'))).producer.startsWith('gl.')));assert.equal(f.frames.length,240);base.verifyRestored();f.verifyRestored();
});
test('non-draw instrumentation defaults off and never invokes an uncalled native query or sync',()=>{
 const f=nonDrawFixture();for(const key of ['finish','flush','readPixels','clientWaitSync'])f.gl[key]=()=>assert.fail('observer invoked '+key);
 f.run();for(const e of diagnosticSamples(f))assert.equal(e.timing.nonDrawGL,undefined);f.verifyRestored();
 const enabled=nonDrawFixture();for(const key of ['finish','flush','readPixels','clientWaitSync'])enabled.gl[key]=()=>assert.fail('observer invoked '+key);
 enabled.run(undefined,{token:'test',nonDrawGL:true});enabled.verifyRestored();
});
test('nested non-draw categories count calls once and exclude nested observed draws from wall attribution',()=>{
 const f=nonDrawFixture({nested:true,delays:{'gl.drawArrays':4}});f.run(undefined,{token:'test',nonDrawGL:true});
 for(const e of diagnosticSamples(f)){
  const t=e.timing,n=t.nonDrawGL;assert.equal(n.calls,840);assert.equal(n.outerCalls,720);assert.equal(n.wallMs,4200);assert.equal(n.inRendererWallMs,3720);
  assert.equal(n.groups.upload.wallMs,1200);assert.equal(n.groups.uniform.calls,120);assert.equal(n.groups.uniform.outerCalls,0);assert.equal(n.groups.uniform.wallMs,0);
  assert.equal(t.draws.wallMs,960);assert.equal(t.renderer.otherWallMs,3720);
 }
 f.verifyRestored();
});
for(const value of [Error('native GL'),0,false,null,undefined])test('optional non-draw wrapper preserves native throw '+String(value)+' and exact descriptors',()=>{
 const f=nonDrawFixture({throws:true,throwValue:value});let failed=false,caught;try{f.run(undefined,{token:'test',nonDrawGL:true});}catch(error){failed=true;caught=error;}
 assert.equal(failed,true);assert.equal(caught,value);assert.equal(f.frames.length,239);f.verifyRestored();
});
test('optional non-draw wrapper preserves borrowed receiver, arguments and return identity',()=>{
 const f=fixture({clockStep:0}),gl=f.G.renderer.getContext(),receiver={},arg={},returned={},oldFrame=f.g._frame;let calls=0;
 const native=function(){assert.equal(this,receiver);assert.deepEqual(Array.from(arguments),[23,arg]);calls++;return returned;};
 const descriptor={value:native,writable:true,configurable:true,enumerable:false};Object.defineProperty(gl,'getParameter',descriptor);
 f.g._frame=dt=>{assert.equal(gl.getParameter.call(receiver,23,arg),returned);return oldFrame(dt);};
 f.run(undefined,{token:'test',nonDrawGL:true});assert.equal(calls,240);assert.deepEqual(Object.getOwnPropertyDescriptor(gl,'getParameter'),descriptor);f.g._frame=oldFrame;f.restored();
});
test('diagnostic opt-in reaches only the existing synchronous callback; default arguments remain unchanged',async()=>{
 for(const enabled of [false,true]){
  const f=nonDrawFixture(),p=createResultsProgress('test');let calls=0;
  const page={on(){},off(){},evaluate(fn,args){calls++;assert.equal(fn,measureResultsWork);assert.deepEqual(args,enabled?{token:'test',nonDrawGL:true}:{token:'test'});return Promise.resolve(f.run(fn.toString(),args));}};
  await runResultsWorkDiagnostic(page,p,enabled?{nonDrawGL:true}:{});assert.equal(calls,1);assert.equal(f.frames.length,240);f.verifyRestored();
 }
 const f=fixture();assert.throws(()=>f.run(undefined,{token:'test',nonDrawGL:'yes'}),/Invalid results progress/);
});
test('cross-category double-count negative control is detected without altering native240-frame workload',()=>{
 const source=measureResultsWork.toString(),mutant=source.replace('nonDrawDepth++===0&&drawDepth===0','(nonDrawDepth++,drawDepth===0)');assert.notEqual(mutant,source);
 const f=nonDrawFixture({nested:true,delays:{'gl.drawArrays':4}});f.run(mutant,{token:'test',nonDrawGL:true});assert.equal(f.frames.length,240);
 for(const e of diagnosticSamples(f)){assert.notEqual(e.timing.nonDrawGL.outerCalls,720);assert.notEqual(e.timing.nonDrawGL.wallMs,4200);}f.verifyRestored();
});
test('borrowed native forwarding negative control fails the actual receiver assertion',()=>{
 const source=measureResultsWork.toString(),mutant=source.replace('return old.apply(this,arguments);','return old.call(gl);');assert.notEqual(mutant,source);
 const f=fixture({clockStep:0}),gl=f.G.renderer.getContext(),receiver={},oldFrame=f.g._frame;gl.getParameter=function(){assert.equal(this,receiver,'native receiver preserved');};f.g._frame=dt=>{gl.getParameter.call(receiver,1);return oldFrame(dt);};
 assert.throws(()=>f.run(mutant,{token:'test',nonDrawGL:true}),/native receiver preserved/);f.g._frame=oldFrame;f.restored();
});

test('sample selection preserves exact exit records while retaining every progress message',()=>{
 const f=nonDrawFixture();f.run(undefined,{token:'test',nonDrawGL:true});
 const before=f.messages.slice(),original=f.messages.map(text=>JSON.parse(text.slice(text.indexOf('{')))).filter(e=>e.producer==='sample'&&e.edge==='exit');
 assert.equal(original.length,2);assert.deepEqual(diagnosticSamples(f),original);assert.deepEqual(f.messages,before);f.verifyRestored();
});
for(const kind of ['readonly-data','accessor','inherited-readonly'])test('non-draw wrapper preserves '+kind+' descriptors without invoking setters',()=>{
 const f=fixture({clockStep:0}),gl=f.G.renderer.getContext(),originalRender=f.G.renderer.render;let calls=0,setters=0;
 const native=function(a,b){assert.strictEqual(this,gl);assert.equal(a,1);assert.equal(b,2);calls++;return 17;};
 let prototype;
 if(kind==='inherited-readonly'){prototype=Object.create(Object.getPrototypeOf(gl));Object.defineProperty(prototype,'bufferData',{value:native,writable:false,enumerable:true,configurable:false});Object.setPrototypeOf(gl,prototype);}
 else if(kind==='accessor')Object.defineProperty(gl,'bufferData',{get:()=>native,set:()=>{setters++;throw Error('setter must not run');},enumerable:true,configurable:true});
 else Object.defineProperty(gl,'bufferData',{value:native,writable:false,enumerable:true,configurable:true});
 const before=Object.getOwnPropertyDescriptor(gl,'bufferData'),inherited=prototype&&Object.getOwnPropertyDescriptor(prototype,'bufferData');
 const render=function(...args){assert.equal(gl.bufferData(1,2),17);return originalRender.apply(this,args);};f.G.renderer.render=render;
 f.run(measureResultsWork.toString(),{token:'test',nonDrawGL:true});assert.equal(calls,240);assert.equal(setters,0);
 const samples=diagnosticSamples(f);assert.equal(samples.length,2);
 for(const e of samples){assert.equal(e.timing.nonDrawGL.groups.upload.calls,120);assert.equal(e.timing.nonDrawGL.groups.upload.outerCalls,120);}
 assert.deepEqual(Object.getOwnPropertyDescriptor(gl,'bufferData'),before);if(prototype)assert.deepEqual(Object.getOwnPropertyDescriptor(prototype,'bufferData'),inherited);assert.strictEqual(f.G.renderer.render,render);f.G.renderer.render=originalRender;f.restored();
});
test('unreplaceable non-draw descriptor fails setup and restores previously installed wrappers',()=>{
 const f=fixture(),gl=f.G.renderer.getContext(),first=function(){},blocked=function(){};
 Object.defineProperty(gl,'createProgram',{value:first,writable:false,enumerable:false,configurable:true});Object.defineProperty(gl,'bufferData',{value:blocked,writable:false,enumerable:true,configurable:false});
 const beforeFirst=Object.getOwnPropertyDescriptor(gl,'createProgram'),beforeBlocked=Object.getOwnPropertyDescriptor(gl,'bufferData');let failed=false;
 try{f.run(measureResultsWork.toString(),{token:'test',nonDrawGL:true});}catch(error){failed=true;assert.equal(error.name,'TypeError');}
 assert(failed);assert.equal(f.frames.length,0);assert.deepEqual(Object.getOwnPropertyDescriptor(gl,'createProgram'),beforeFirst);assert.deepEqual(Object.getOwnPropertyDescriptor(gl,'bufferData'),beforeBlocked);f.restored();
});
for(const kind of ['readonly-data','accessor'])test('assignment installation negative control is rejected for '+kind,()=>{
 const source=measureResultsWork.toString();
 const installation="Object.defineProperty(gl,key,descriptor?('value' in descriptor?{...descriptor,value:wrapped}:{configurable:descriptor.configurable,enumerable:descriptor.enumerable,writable:true,value:wrapped}):{configurable:true,enumerable:false,writable:true,value:wrapped});";
 assert.equal(source.split(installation).length,2);
 const mutant=source.replace(installation,'gl[key]=wrapped;'),f=fixture({clockStep:0}),gl=f.G.renderer.getContext(),originalRender=f.G.renderer.render;
 const native=function(){return 17;};
 if(kind==='accessor')Object.defineProperty(gl,'bufferData',{get:()=>native,set:()=>{throw Error('setter must not run');},configurable:true});
 else Object.defineProperty(gl,'bufferData',{value:native,writable:false,configurable:true});
 const before=Object.getOwnPropertyDescriptor(gl,'bufferData');
 f.G.renderer.render=function(){assert.equal(gl.bufferData(),17);return originalRender.apply(this,arguments);};
 if(kind==='accessor')assert.throws(()=>f.run(mutant,{token:'test',nonDrawGL:true}),/setter must not run/);
 else{
  f.run(mutant,{token:'test',nonDrawGL:true});assert.equal(f.frames.length,240);
  const samples=diagnosticSamples(f);assert.equal(samples.length,2);
  for(const e of samples)assert.throws(()=>assert.equal(e.timing.nonDrawGL.groups.upload.calls,120,'instrumentation must observe native uploads'),/instrumentation must observe native uploads/);
 }
 assert.deepEqual(Object.getOwnPropertyDescriptor(gl,'bufferData'),before);f.G.renderer.render=originalRender;f.restored();
});
