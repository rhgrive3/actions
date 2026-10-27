import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {publicBuildIdentity,verifyPublishedSource,verifyPublicResponse} from '../lib/inkwave-public-boot-evidence.mjs';
import {criticalBootRequest,rankedBootState,observeRankedBoot,rankedHttpFailureDetails} from '../lib/ranked-boot-diagnostics.mjs';
import {stepRollingVelocity} from '../../patches/splatoon3/runtime/movement-physics.mjs';
import {rollerDrumSupport} from '../../patches/splatoon3/runtime/roller.mjs';
import {FixedClock,STEP} from '../../patches/splatoon3/runtime/clock.mjs';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import * as THREE from '../../inkwave-public/vendor/three/build/three.module.js';
import {PLAYER as BASE_PLAYER} from '../../inkwave-public/src/config.js';
import {PATTERN,C,B,R} from '../../inkwave-public/src/world/mapkit.js';
import {on as onNativeEvent,emit as emitNativeEvent} from '../../inkwave-public/src/core/ctx.js';
const url='https://rhgrive3.github.io/actions/?relay=x';
const moduleUrl='https://rhgrive3.github.io/actions/_versions/abc/patches/splatoon3/runtime/audio/weapon-recipes.mjs';
function page(state={ready:true}) {const p=new EventEmitter();p.waitForFunction=async(fn,arg,options)=>{assert.equal(fn,rankedBootState);assert.equal(options.timeout,180000);assert.equal(options.polling,250,'must not depend on a renderer requestAnimationFrame');return {jsonValue:async()=>state,dispose:async()=>{p.disposed=true;}};};return p;}
const response=(status,u=moduleUrl,type='script')=>({status:()=>status,url:()=>u,request:()=>({resourceType:()=>type})});
for(const status of [503,404])test(`critical ${status} fails before unresolved boot; preserves first cause`,async()=>{
 const p=page(),r={};await assert.rejects(observeRankedBoot(p,url,r,async()=>{p.emit('response',response(status));p.emit('requestfailed',{url:()=>moduleUrl,resourceType:()=> 'script',failure:()=>({errorText:'net::ERR_ABORTED'})});await new Promise(()=>{});}),new RegExp('critical-http: '+status));assert.equal(r.status,'failed');assert.equal(r.failures[0].status,status);assert.equal(p.listenerCount('response'),0);
});
test('optional audio/image and external failures do not reject successful boot',async()=>{const p=page(),r={};await observeRankedBoot(p,url,r,async()=>{for(const [u,t]of [['https://rhgrive3.github.io/actions/audio/shot.mp3','media'],['https://rhgrive3.github.io/actions/icon.png','image'],['https://other.example/a.js','script']])p.emit('response',response(503,u,t));});assert.equal(r.status,'ready');assert.deepEqual(r.failures,[]);assert(p.disposed);});
test('explicit loader failure cannot become ready',async()=>{const p=page({failed:'ゲームの読み込みに失敗しました。'}),r={};await assert.rejects(observeRankedBoot(p,url,r,async()=>{}),/loader-error/);assert.equal(r.failures[0].kind,'loader-error');});
test('JS exception and critical request abort fail without retry',async()=>{for(const event of ['pageerror','requestfailed']){const p=page(),r={};let starts=0;await assert.rejects(observeRankedBoot(p,url,r,async()=>{starts++;p.emit(event,event==='pageerror'?new Error('syntax'): {url:()=>moduleUrl,resourceType:()=> 'script',failure:()=>({errorText:'aborted'})});}));assert.equal(starts,1);assert.equal(r.status,'failed');}});
test('readiness keeps original predicate and loader error takes priority',()=>{const oldDoc=globalThis.document,oldRG=globalThis.RG;let visible=false;globalThis.document={getElementById:id=>id==='inkwave-startup-status'?{textContent:'failure'}:{hidden:!visible}};try{globalThis.RG={game:{menus:{}},s3:{installed:true},mode:'menu'};assert.deepEqual(rankedBootState(),{ready:true});for(const missing of ['menus','installed','boot']){const g=globalThis.RG;g.game.menus=missing==='menus'?null:{};g.s3.installed=missing!=='installed';g.mode=missing==='boot'?'boot':'menu';assert.equal(rankedBootState(),false);}visible=true;assert.deepEqual(rankedBootState(),{failed:'failure'});}finally{globalThis.document=oldDoc;globalThis.RG=oldRG;}});
test('scope does not treat neighboring path or media as critical script',()=>{assert(criticalBootRequest(moduleUrl,'script',url));assert(!criticalBootRequest(moduleUrl.replace('/actions/','/actions-else/'),'script',url));assert(!criticalBootRequest(moduleUrl.replace('.mjs','.mp3'),'media',url));});
test('harness retains strict identity, failure result before image and final trace; no reload',()=>{const s=fs.readFileSync(new URL('../check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');for(const term of ['assert.equal(manifest.inputHash,build.inputHash)','assert.equal(manifest.contentHash,build.contentHash)','assert.equal(manifest.build.revision,build.build.revision)','assert.equal(errors.length,0','c.tracing.stop','results,errors,bootAttempts','prepareRainmakerProofTarget'])assert(s.includes(term),term);assert(s.indexOf("status:'failed'")<s.indexOf("'failure-'+i+'.png'"));assert(!s.includes('.reload('));});
test('early failure does not enqueue readiness after delayed start resolves',async()=>{const p=page(),r={};let resume,waits=0;p.waitForFunction=()=>{waits++;throw Error('late readiness');};const run=observeRankedBoot(p,url,r,()=>new Promise(resolve=>{resume=resolve;}));p.emit('response',response(503));await assert.rejects(run,/503/);resume();await new Promise(resolve=>setImmediate(resolve));assert.equal(waits,0);assert.match(r.failures[0].observedAt,/^\d{4}-/);});
test('existing readiness rejection after context closes stays handled',async()=>{const p=page(),r={};let close;p.waitForFunction=()=>new Promise((_,reject)=>{close=()=>reject(Error('Target page, context or browser has been closed'));});const unhandled=[];const listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);try{const run=observeRankedBoot(p,url,r,async()=>{});await new Promise(resolve=>setImmediate(resolve));p.emit('response',response(404));await assert.rejects(run,/404/);assert.equal(p.listenerCount('response'),0);close();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);}finally{process.off('unhandledRejection',listener);}});
test('boot receipts retain exact build identity even for document failure',()=>{const s=fs.readFileSync(new URL('../check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');assert.match(s,/const receipt=\{context:contexts.length-1,inputHash:build.inputHash,revision:build.build.revision/);});
test('dedicated ranked CI runs diagnostics and tracks diagnostic and native-clock paths',()=>{const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-ranked.yml',import.meta.url),'utf8');assert(w.includes('run: node --test scripts/tests/ranked-boot-diagnostics.test.mjs'));for(const p of ['scripts/lib/ranked-boot-diagnostics.mjs','scripts/tests/ranked-boot-diagnostics.test.mjs','scripts/lib/ranked-roller-audio.mjs','scripts/tests/ranked-roller-audio.test.mjs'])assert.equal(w.split("- '"+p+"'").length-1,2);assert(w.includes('timeout-minutes: 25'));assert(w.includes('contents: read'));});

// A graphics-heavy or stalled RAF must not be part of the readiness polling
// contract. The 180s upper bound and exact game-ready predicate remain strict.
test('ranked browser readiness uses fixed timer polling rather than animation frames',async()=>{
 const p=page({ready:true}),r={};
 p.waitForFunction=async(fn,arg,options)=>{
   assert.equal(fn,rankedBootState);
   assert.equal(options.polling,250);
   assert.equal(options.timeout,180000);
   return {jsonValue:async()=>({ready:true}),dispose:async()=>{p.disposed=true;}};
 };
 await observeRankedBoot(p,url,r,async()=>{});
 assert.equal(r.status,'ready');
 assert.equal(p.disposed,true);
});

test('browser crashes and premature closes fail fast and release event observers',async()=>{
 for (const [event,kind] of [['crash','browser-crash'],['close','page-close']]){
  const p=page(),receipt={};let resume;
  const operation=observeRankedBoot(p,url,receipt,()=>new Promise(resolve=>{resume=resolve;}));
  p.emit(event);
  await assert.rejects(operation,new RegExp(kind));
  assert.equal(receipt.status,'failed');
  assert.equal(receipt.failures[0].kind,kind);
  assert.equal(p.listenerCount('crash'),0);
  assert.equal(p.listenerCount('close'),0);
  resume();
 }
});

test('public boot rejects source drift even when published artifact bytes are unchanged',()=>{
 const parent=new URL('../../.ci-scratch/',import.meta.url);fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(new URL('public-boot-source-',parent).pathname);
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
 const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 try{
  fs.mkdirSync(path.join(dir,'inkwave-public/src'),{recursive:true});fs.mkdirSync(path.join(dir,'scripts'));
  fs.writeFileSync(path.join(dir,'inkwave-public/src/entry.js'),'export const value=1;\n');
  fs.writeFileSync(path.join(dir,'scripts/build-inkwave.mjs'),'// original builder\n');
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial');
  const original=git('rev-parse','HEAD'),files={'upstream/src/entry.js':hash('export const value=1;\n')},artifacts={'index.html':hash('<p>same emitted bytes</p>')};
  const manifest={files,artifacts,inputHash:hash(JSON.stringify(files)),contentHash:hash(JSON.stringify(artifacts)),build:{revision:'a'.repeat(64),script:hash('// original builder\n')}};
  assert.equal(verifyPublishedSource(manifest,dir,original).checkedInputs,2);
  fs.writeFileSync(path.join(dir,'inkwave-public/src/entry.js'),'export const value=2;\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','changed source');
  assert.throws(()=>verifyPublishedSource(manifest,dir,git('rev-parse','HEAD')),/differs from source SHA/);
  assert.equal(verifyPublishedSource(manifest,dir,original).sourceSha,original,'working-tree changes cannot silently replace the pinned source epoch');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('public deployment identity rejects changed inputs, artifact hashes and escaping paths',()=>{
 const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 const files={'upstream/src/entry.js':'a'.repeat(64)},artifacts={'index.html':'b'.repeat(64)};
 const manifest={files,artifacts,inputHash:hash(JSON.stringify(files)),contentHash:hash(JSON.stringify(artifacts)),build:{revision:'c'.repeat(64)}};
 assert.deepEqual(publicBuildIdentity(manifest),{inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:'c'.repeat(64)});
 for(const key of ['files','artifacts']){
  const m=structuredClone(manifest);m[key][Object.keys(m[key])[0]]='d'.repeat(64);
  assert.throws(()=>publicBuildIdentity(m),/identity/);
 }
 const bad=structuredClone(manifest);bad.artifacts={'../outside.js':'b'.repeat(64)};bad.contentHash=hash(JSON.stringify(bad.artifacts));
 assert.throws(()=>publicBuildIdentity(bad),/path/);
});

test('public boot verifies fetched module bytes and separates neighboring deployment paths',()=>{
 const bytes=Buffer.from('export const installed=true;'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const manifest={artifacts:{'_versions/pinned/src/main.js':hash}};
 const u='https://rhgrive3.github.io/actions/_versions/pinned/src/main.js';
 assert.equal(verifyPublicResponse(u+'?cache=1',bytes,manifest,url).sha256,hash);
 assert.throws(()=>verifyPublicResponse(u,Buffer.from('different'),manifest,url),/byte mismatch/);
 assert.equal(verifyPublicResponse(u.replace('/actions/','/actions-else/'),bytes,manifest,url),null);
 assert.equal(verifyPublicResponse(u.replace('rhgrive3.github.io','example.invalid'),bytes,manifest,url),null);
});


test('critical HTTP failures retain immutable expected hash, safe edge headers and request timing',async()=>{
 const file='_versions/abc/patches/splatoon3/runtime/audio/weapon-recipes.mjs',sha='a'.repeat(64);
 const r={status:()=>503,url:()=>moduleUrl,headers:()=>({'Content-Type':'text/html','X-Cache':'MISS','X-GitHub-Request-ID':'edge1','Set-Cookie':'private','Authorization':'private'}),request:()=>({resourceType:()=> 'script',timing:()=>({startTime:12,responseStart:30,responseEnd:31})})};
 const details=rankedHttpFailureDetails(r,url,{[file]:sha});
 assert.deepEqual(details.expectedArtifact,{file,sha256:sha});assert.deepEqual(details.responseHeaders,{'content-type':'text/html','x-cache':'MISS','x-github-request-id':'edge1'});assert.equal(details.requestTiming.responseEnd,31);
 const p=page(),receipt={};const boot=observeRankedBoot(p,url,receipt,()=>new Promise(()=>{}),{artifacts:{[file]:sha}});p.emit('response',r);await assert.rejects(boot,/503/);assert.deepEqual(receipt.failures[0].expectedArtifact,{file,sha256:sha});assert.equal(receipt.status,'failed');
});


// Execute the checker's exact recovery/catch fragments without launching a
// browser. These tests establish sequencing and fail-closed diagnostics only;
// real two-context WebAudio recovery still requires the ranked browser gate.
const rankedCheckerSource=fs.readFileSync(new URL('../check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');
function checkerInitializer(name){
 const found=[];const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name===name)found.push(n.init);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);};
 visit(parse(rankedCheckerSource,{ecmaVersion:'latest',sourceType:'module'}));assert.equal(found.length,1,name);return rankedCheckerSource.slice(found[0].start,found[0].end);
}
function pulseHarness({own=false,frameError=null}={}){
 const keys=new Set(),timers=new Map(),state={},events=[],calls=[];let nextTimer=1;
 const RG={input:{keys,mouse:{left:false},down:key=>keys.has(key)}};
 const frame=function(...args){assert(keys.has('KeyW'));assert.equal(RG.game._frame,frame);calls.push({receiver:this,args});if(frameError)throw frameError;return args[1];};
 RG.game=Object.create({_frame:frame});if(own)Object.defineProperty(RG.game,'_frame',{value:frame,writable:true,configurable:true,enumerable:false});
 const descriptor=Object.getOwnPropertyDescriptor(RG.game,'_frame');
 const window={dispatchEvent:event=>{events.push(event);if(event.type==='keydown')keys.add(event.code);else keys.delete(event.code);}};
 const KeyboardEvent=class{constructor(type,{code}){this.type=type;this.code=code;}};
 const setTimer=(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;},clearTimer=id=>timers.delete(id);
 const setInput=new Function('RG','__rankedReplication','window','KeyboardEvent','setTimeout','clearTimeout','return ('+checkerInitializer('setInput')+');')(RG,state,window,KeyboardEvent,setTimer,clearTimer);
 const run=(fire=true,input=['KeyW'])=>setInput({evaluate:(fn,arg)=>fn(arg)},fire,input);
 const expire=ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert(entry,ms);timers.delete(entry[0]);entry[1].fn();};
 return {RG,state,keys,timers,events,calls,frame,descriptor,run,expire};
}
function dodgeWitnessHarness(){
 const state={},runner={_rollToken:0,dodge:null},actor={nid:7,weaponRunner:runner},G={time:10,game:{_frameN:3}};
 const build=name=>new Function('state','a','dodgeRunner','G','return ('+checkerInitializer(name)+');')(state,actor,runner,G);
 const arm=build('armDodgeWitness'),observe=build('observeDodgeWitness'),off=onNativeEvent('weapon:dodge',observe);
 const cleanupSource=rankedCheckerSource.match(/s\.offDodge\?\.\(\);/);assert(cleanupSource);
 const cleanup=()=>new Function('s',cleanupSource[0])({offDodge:off});
 return {state,runner,actor,G,arm,cleanup,emit:payload=>emitNativeEvent('weapon:dodge',payload)};
}
const recoveryStart=rankedCheckerSource.indexOf('  // Recovery must re-admit native contact');
const recoveryEnd=rankedCheckerSource.indexOf("  phase('recovered-real-audio'",recoveryStart);
assert(recoveryStart>=0&&recoveryEnd>recoveryStart);
const executeRecovery=new Function('host','guest','place','setInput','lane','timeout','identities','snapshot','proveRankedRollAudio','phase',`return (async()=>{${rankedCheckerSource.slice(recoveryStart,recoveryEnd)};return recovered;})();`);
function recoveryHarness({rejectAdmission=false}={}){
 const calls=[],waits=[],pending={};
 const host={waitForFunction:async(fn,arg,options)=>{assert.equal(options.timeout,30000);calls.push('owner-admitted');}};
 const guest={waitForFunction:(predicate,nid,options)=>{
  assert.equal(nid,7);assert.equal(options.timeout,30000);waits.push(predicate);
  assert.equal(waits.length,1,'readiness is admitted once before the native-clock proof');
  calls.push('remote-readiness');return new Promise((resolve,reject)=>{pending.resolve=resolve;pending.reject=reject;if(rejectAdmission)reject(Error('recovery admission timeout'));});
 }};
 const run=()=>executeRecovery(host,guest,async(_page,position,yaw)=>{assert.deepEqual(position,[1,2,3]);assert.equal(yaw,Math.PI);calls.push('place');},async(_page,fire,keys=[])=>{assert.equal(fire,true);if(keys.length)assert.deepEqual(keys,['KeyW']);calls.push(keys.length?'pulse':'held-at-rest');}, {supported:[1,2,3],yaw:0,travelYaw:Math.PI},{timeout:30000},[{nid:7}],async p=>p,async(_host,_guest,nid,_input,_save,key)=>{assert.equal(nid,7);assert.equal(key,'KeyW');calls.push('positive-audio');return {remote:'positive-real-audio'};},()=>{});
 return {calls,waits,pending,run};
}
function withRankedRead(state,fn){const previous=globalThis.__rankedReplication;globalThis.__rankedReplication={read:nid=>{assert.equal(nid,7);return state;}};try{return fn();}finally{globalThis.__rankedReplication=previous;}}
const recoveredAtRest={held:true,grounded:true,suspended:false,f:17,near:true,rollLoop:true,audioState:'running',realRollLoops:[{playing:true,registered:true,volume:0}]};
test('ranked recovery waits for native and real remote loop admission before its bounded movement pulse',async()=>{
 const h=recoveryHarness(),run=h.run();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.calls,['place','held-at-rest','owner-admitted','remote-readiness']);
 assert(!h.calls.includes('pulse'),'relay delay cannot consume movement before readiness');
 assert.equal(withRankedRead(recoveredAtRest,()=>h.waits[0](7)),true,'a registered playing loop may be ready at zero volume');
 h.pending.resolve();assert.deepEqual(await run,{remote:'positive-real-audio'});
 assert.deepEqual(h.calls,['place','held-at-rest','owner-admitted','remote-readiness','positive-audio']);
 assert.ok(rankedCheckerSource.includes("if(keys.includes('KeyW')&&!RG.game.frozen)state.motionTimer=setTimeout(()=>RG.input.keys.delete('KeyW'),250)"),'live forward movement retains the original wall-clock bound');
});
test('ranked movement pulse starts at the next actual native frame and retains the 250ms timer and exact frame ownership',async()=>{
 for(const own of [false,true]){
  const h=pulseHarness({own}),pending=h.run(),marker={};
  assert.equal(h.keys.has('KeyW'),false);assert.equal(h.calls.length,0);assert.deepEqual([...h.timers.values()].map(t=>t.ms),[30000]);
  assert.equal(h.RG.game._frame(.25,marker),marker);await pending;
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].receiver,h.RG.game);assert.deepEqual(h.calls[0].args,[.25,marker]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.RG.game,'_frame'),h.descriptor);assert.equal(h.state.cancelMotionStart,null);
  assert.deepEqual(h.events.map(e=>[e.type,e.code]),[['keydown','KeyW']]);assert.deepEqual([...h.timers.values()].map(t=>t.ms),[250]);
  h.expire(250);assert.equal(h.keys.has('KeyW'),false);
 }
});
test('explicit frozen ranked owner primes the same native input without a wall-clock race',async()=>{
 const h=pulseHarness();h.RG.game.frozen=true;
 await h.run(true,['KeyW']);
 assert.equal(h.keys.has('KeyW'),true,'frozen native owner admits the key for its own bounded step');
 assert.deepEqual([...h.timers.values()],[],'no wall timer may expire before an explicitly stepped frame');
 await h.run(false,[]);
 assert.equal(h.keys.has('KeyW'),false,'cleanup still retires the key on release');
});
test('ranked pending native input fails closed on timeout, cancellation or a native frame exception',async()=>{
 const timeout=pulseHarness(),a=timeout.run(),ar=assert.rejects(a,/within 30000ms/);timeout.expire(30000);await ar;
 assert.equal(timeout.RG.game._frame,timeout.frame);assert.equal(timeout.calls.length,0);assert.equal(timeout.keys.size,0);assert.equal(timeout.state.cancelMotionStart,null);
 const cancel=pulseHarness({own:true}),b=cancel.run(),br=assert.rejects(b,/superseded/);await cancel.run(false,[]);await br;
 assert.deepEqual(Object.getOwnPropertyDescriptor(cancel.RG.game,'_frame'),cancel.descriptor);assert.equal(cancel.keys.size,0);assert.equal(cancel.calls.length,0);
 const error=new Error('actual frame failed'),thrown=pulseHarness({frameError:error}),c=thrown.run(),cr=assert.rejects(c,e=>e===error);
 assert.throws(()=>thrown.RG.game._frame(.25),e=>e===error);await cr;assert.equal(thrown.RG.game._frame,thrown.frame);thrown.expire(250);assert.equal(thrown.keys.size,0);
});
test('ranked Dodge witness requires the exact armed actor, runner, live state and fresh native token; cleanup preserves other listeners',()=>{
 const h=dodgeWitnessHarness();let otherCalls=0;const otherOff=onNativeEvent('weapon:dodge',()=>otherCalls++);
 try{
  h.runner._rollToken=1;h.runner.dodge={token:1};h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,undefined);
  h.arm();h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null,'an old token cannot satisfy a new input');
  h.runner._rollToken=2;h.runner.dodge={token:2};h.emit({actor:{nid:h.actor.nid,weaponRunner:h.runner}});assert.equal(h.state.dodgeReceipt,null);
  h.actor.weaponRunner={};h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null);h.actor.weaponRunner=h.runner;
  h.runner.dodge=null;h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null);
  h.runner.dodge={token:1};h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null);
  h.runner.dodge={token:3};h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null,'event/live token must match the producer token');
  h.runner.dodge={token:2};h.emit({actor:h.actor});const receipt=h.state.dodgeReceipt;assert.deepEqual(receipt,{token:2,nativeTime:10,renderFrame:3});assert.equal(h.state.dodgeArm,null);
  h.runner.dodge=null;h.G.time=20;h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,receipt,'only the observation is retained after the real transient ends');
  h.arm();assert.equal(h.state.dodgeReceipt,null);h.cleanup();h.runner._rollToken=3;h.runner.dodge={token:3};const previous=otherCalls;h.emit({actor:h.actor});assert.equal(h.state.dodgeReceipt,null);assert.equal(otherCalls,previous+1);
 }finally{h.cleanup();otherOff();}
});
test('actual FixedClock can finish the calibrated 16-tick Dodge transient before a render poll while its synchronous witness remains',()=>{
 const h=dodgeWitnessHarness(),clock=new FixedClock();let tick=0,admissions=0;
 try{
  h.arm();
  // Real browser diagnostics establish native admission and its 4+12 tick
  // lifetime. This test isolates observer scheduling with the actual clock.
  assert.equal(clock.advance(16*STEP,()=>{
   h.G.time+=STEP;
   if(tick===0){admissions++;h.runner._rollToken=1;h.runner.dodge={token:1};h.emit({actor:h.actor});}
   if(++tick===16)h.runner.dodge=null;
  }),16);
  assert.equal(admissions,1);assert.equal(!!h.runner.dodge,false,'the old render poll misses the completed native-duration transient');
  assert.equal(h.state.dodgeReceipt.token,1);assert.equal(clock.ticks,16);
  assert.match(rankedCheckerSource,/RG\.match\.local\.weaponRunner\.s3Turret===true&&!RG\.match\.local\.weaponRunner\.dodge/,'the independent live turret gate remains mandatory');
 }finally{h.cleanup();}
});
test('ranked positive-control placement faces the corridor and clears only its initial linear/angular motion',async()=>{
 let initializer;
 function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='place')initializer=n.init;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
 visit(parse(rankedCheckerSource,{ecmaVersion:'latest',sourceType:'module'}));assert(initializer);
 const place=new Function('return ('+rankedCheckerSource.slice(initializer.start,initializer.end)+');')();
 const previousRG=globalThis.RG,previousDocument=globalThis.document;
 const runner={rolling:true,s3RollerSuspendedHold:false},actor={pos:new THREE.Vector3(),vel:new THREE.Vector3(3,4,5),yaw:0,aimYaw:0,yawVel:9,_faceTarget:.7,groundN:new THREE.Vector3(),ground:{},weaponRunner:runner};
 const rig={yaw:0,pitch:.3};let probes=0;
 globalThis.RG={match:{local:actor},rig,physics:{groundProbe(x,y,z,a,b,r,out){probes++;assert.deepEqual([x,y,z],[1,2,3]);assert(r>0);return Object.assign(out,{hit:true,y:2,normal:new THREE.Vector3(0,1,0)});}}};
 globalThis.document={baseURI:new URL('../../inkwave-public/',import.meta.url).href};
 try{
  await place({evaluate:(fn,arg)=>fn(arg)},[1,2,3],Math.PI/2);
  assert.deepEqual(actor.pos.toArray(),[1,2,3]);assert.deepEqual(actor.vel.toArray(),[0,0,0]);assert.equal(actor.yaw,Math.PI/2);assert.equal(actor.aimYaw,Math.PI/2);assert.equal(rig.yaw,Math.PI/2);
  assert.equal(actor.yawVel,0);assert.equal(actor._faceTarget,null);assert.equal(actor.weaponRunner,runner);assert.equal(runner.rolling,true);assert.equal(runner.s3RollerSuspendedHold,false);assert.equal(probes,1);
 }finally{globalThis.RG=previousRG;globalThis.document=previousDocument;}
});
test('actual roller motion exposes the old reverse-pulse counterexample and advances inside the forward corridor at 30/60/120 Hz',()=>{
 const edgeYaw=-Math.PI/2,travelYaw=edgeYaw+Math.PI;
 const old={yaw:edgeYaw,vel:{x:0,z:0}};
 // The old KeyS setup requested +X while the drum/body still faced -X.
 // Native movement happens before the facing spring can turn the body.
 stepRollingVelocity(old,1,0,4.4,20,1/60);
 assert(old.vel.x<0,'a reverse stick does not make a roller travel backwards immediately');
 for(const speed of [4.4,6.48,7.92])for(const hz of [30,60,120]){
  const actor={yaw:travelYaw,vel:{x:0,z:0}},dt=1/hz;let distance=0;
  for(let i=0;i<Math.floor(.25*hz);i++){
   stepRollingVelocity(actor,Math.sin(travelYaw),Math.cos(travelYaw),speed,80,dt);
   assert(actor.vel.x>0);assert(Math.abs(actor.vel.z)<1e-12);distance+=actor.vel.x*dt;
  }
  assert(distance>0&&distance<2,'the native forward pulse stays within the unchanged two-metre corridor bound');
 }
});
test('ranked native lane queries reject the real Tidewater cover overlap even when ground and roller drum have support',()=>{
 const source=file=>fs.readFileSync(new URL('../../inkwave-public/src/'+file,import.meta.url),'utf8');
 const initializer=(text,name)=>{
  const found=[];const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name===name)found.push(n.init);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);};
  visit(parse(text,{ecmaVersion:'latest',sourceType:'module'}));assert.equal(found.length,1,name);return text.slice(found[0].start,found[0].end);
 };
 const moduleBody=text=>text.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 const {Physics,GroundHit}=new Function('THREE',moduleBody(source('game/physics.js'))+'\nreturn {Physics,GroundHit};')(THREE);
 const Level=new Function('THREE','PATTERN',moduleBody(source('world/level.js'))+'\nreturn Level;')(THREE,PATTERN);
 const layout=new Function('PATTERN','C','B','R','return ('+initializer(source('world/maps.js'),'TIDEWATER')+');')(PATTERN,C,B,R);
 const profile=JSON.parse(fs.readFileSync(new URL('../../patches/splatoon3/profile.json',import.meta.url),'utf8'));
 const PLAYER={...BASE_PLAYER,...profile.player},level=new Level(layout),physics=new Physics(level),G={level,physics};
 const V=THREE.Vector3,scratch={ids:[],start:new V(),delta:new V(),normalY:0,contactPoint:new V(),wallPoint:new V()};
 const query=new Function('G','PLAYER','V','rollerDrumSupport','scratch','return ('+initializer(rankedCheckerSource,'query')+');')(G,PLAYER,V,rollerDrumSupport,scratch);
 const position=new V(-1.9,2.8,0),yaw=Math.PI/2,radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 const ground=physics.groundProbe(position.x,position.y,position.z,.3,.3,PLAYER.footRadius,new GroundHit(),false);
 assert(ground.hit);assert.equal(ground.y,2.8);assert(rollerDrumSupport({pos:position,yaw,grounded:true},G,scratch).floor,'the old ground/drum-only candidate passed');
 assert.equal(physics.bodyFits(position,radius,PLAYER.stepUp,PLAYER.height,false),false);
 assert.equal(query(position.x,position.y,position.z,yaw),null,'the actual harness query rejects the overlapping candidate');
 const contacts={groundNormal:new V(),wallNormal:new V()},resolved=position.clone();
 physics.collideBody(resolved,radius,PLAYER.stepUp,PLAYER.height,contacts,true,false);
 assert(contacts.wall);assert.equal(contacts.wallBlock,2);assert(Math.abs(resolved.x-(-1.9501))<1e-12,'the real solver reproduces both browser failure positions');
 for(let distance=0;distance<=2;distance+=.25){const at=query(-1.9+distance,2.8,2,yaw);assert(at?.support.floor,'nearby unobstructed native support remains eligible');}
 assert.match(rankedCheckerSource,/if\(corridor.length===17\)/,'all 17 quarter-metre support checks are required across 4m');
});
test('ranked recovery rejects suspended, stale-bit, ungrounded, distant and non-live loops before a pulse',async()=>{
 const h=recoveryHarness(),run=h.run();await new Promise(resolve=>setImmediate(resolve));
 const invalid=[{held:false},{grounded:false},{suspended:true},{f:17|(1<<28)},{near:false},{rollLoop:false},{audioState:'suspended'},
  {realRollLoops:[]},{realRollLoops:[{playing:true,registered:false,volume:1}]},{realRollLoops:[{playing:false,registered:true,volume:1}]}];
 for(const delta of invalid)assert.equal(!!withRankedRead({...recoveredAtRest,...delta},()=>h.waits[0](7)),false,JSON.stringify(delta));
 h.pending.reject(Error('recovery admission timeout'));await assert.rejects(run,/recovery admission timeout/);
 assert(!h.calls.includes('pulse'));assert(!h.calls.includes('positive-audio'));
});
const failureStart=rankedCheckerSource.indexOf(" }catch(error){\n  receipt.status='failed';receipt.error=error?.stack||String(error);");
const failureEnd=rankedCheckerSource.indexOf('\n finally{\n  const cleanupErrors=[];receipt.restoration=[];',failureStart);
assert(failureStart>=0&&failureEnd>failureStart);
const failureBody=rankedCheckerSource.slice(failureStart+15,failureEnd).trim().replace(/}$/, '');
const executeRankedFailure=new Function('receipt','error','pages','identities','save',`return (async()=>{${failureBody}})();`);
test('ranked recovery failure captures observed actor, remote loop and wire state before restoration without passing',async()=>{
 const previousRG=globalThis.RG,previousState=globalThis.__rankedReplication,error=Error('positive recovery audio timeout'),saved=[];
 const remote={...recoveredAtRest,suspended:true,realRollLoops:[{playing:false,registered:false,volume:0}]},wire={f:17|(1<<28)};
 globalThis.RG={match:{local:{nid:7,alive:true,grounded:true,weaponRunner:{rolling:true,s3RollerSuspendedHold:false},pos:{toArray:()=>[1,2,3]},vel:{toArray:()=>[0,0,0]},ink:90}}};
 globalThis.__rankedReplication={read:nid=>{assert.equal(nid,7);return remote;},wire:[wire]};
 const receipt={status:'running',phases:[{name:'suspended-owner-to-remote'}]};
 try{
  await assert.rejects(executeRankedFailure(receipt,error,[{evaluate:async(fn,nid)=>fn(nid)},{evaluate:async()=>{throw Error('page closed');}}],[{nid:7}],r=>saved.push(structuredClone(r))),e=>e===error);
  assert.equal(receipt.status,'failed');assert.equal(receipt.failureAfter,'suspended-owner-to-remote');assert.match(receipt.error,/positive recovery audio timeout/);
  assert.deepEqual(receipt.failureState[0],{context:0,local:{nid:7,alive:true,grounded:true,held:true,suspended:false,position:[1,2,3],velocity:[0,0,0],ink:90},remote,wire});
  assert.deepEqual(receipt.failureState[1],{context:1,diagnosticError:'page closed'});
  assert.equal(saved.length,1);assert.equal(saved[0].status,'failed');assert(!receipt.phases.some(p=>p.name==='recovered-real-audio'));
 }finally{globalThis.RG=previousRG;globalThis.__rankedReplication=previousState;}
});
