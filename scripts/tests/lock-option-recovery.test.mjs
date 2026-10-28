// Source-bound VM regression. Run serially with --expose-gc --experimental-vm-modules.
// INKWAVE_TEST_ROOT selects a source checkout; INKWAVE_TEST_ADAPTER is for pre-commit review only.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
// Independent VM contexts are memory-heavy: execute bounded serial batches.
if (!Object.hasOwn(process.env,'TEST_FROM')) {
 const errors=[],seen=new Set();let total=null;
 for(let n=0;n<40;n+=5){
  const r=spawnSync(process.execPath,['--expose-gc','--experimental-vm-modules',fileURLToPath(import.meta.url)],{env:{...process.env,TEST_FROM:String(n),TEST_TO:String(n+5)},encoding:'utf8',maxBuffer:4*1024*1024});
  if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
  if(r.error||r.status!==0){errors.push(`batch ${n} exited ${r.status}: ${r.error||r.signal||'failure'}`);continue;}
  try{
   const report=JSON.parse(r.stdout.trim());
   if(!Number.isInteger(report.ordinalCount)||report.ordinalCount<38||report.ordinalCount>40)throw Error('case count outside audited bounds');
   if(total!==null&&total!==report.ordinalCount)throw Error('case count changed across batches');total=report.ordinalCount;
   if(report.candidateOverride!==false||report.sourceRoot!==path.resolve(process.cwd())||report.site!==(process.env.INKWAVE_POINTER_LOCK_SITE||null))throw Error('fixture source or site override mismatch');
   const expected=Math.max(0,Math.min(5,total-n));if(report.results.length!==expected)throw Error('incomplete batch');
   for(let i=0;i<expected;i++){const row=report.results[i];if(row.ordinal!==n+i||row.passed!==true||typeof row.name!=='string'||seen.has(row.name))throw Error('failed, missing, out-of-order or duplicate case');seen.add(row.name);}
  }catch(error){errors.push(`batch ${n}: ${String(error)}`);}
 }
 if(total===null||seen.size!==total)errors.push('incomplete total case coverage');
 if(errors.length){console.error('Pointer-lock batch verification failed: '+errors.join(' | '));process.exit(1);}
 process.exit(0);
}
const ROOT = path.resolve(process.env.INKWAVE_TEST_ROOT || fileURLToPath(new URL('../../',import.meta.url)));
const {adaptBuildSource} = await import(pathToFileURL(path.join(ROOT,'scripts/inkwave-source-composition.mjs')));
const {fixture} = await import(pathToFileURL(path.join(ROOT,'patches/splatoon3/tests/source-fixture.mjs')));
const {adoptCanvasTouch:sourceAdopt,continueCanvasTouch:sourceContinue} = await import(pathToFileURL(path.join(ROOT,'patches/local-quality/first-touch-adapter.mjs')));
const esbuild = process.env.TEST_EMITTED === '1' ? await import(pathToFileURL(process.env.INKWAVE_ESBUILD_MODULE || path.join(ROOT,'node_modules/esbuild/lib/main.js'))) : null;
const {compactModuleStrings} = process.env.TEST_EMITTED === '1' ? await import(pathToFileURL(path.join(ROOT,'scripts/lib/inkwave-source-compaction.mjs'))) : {};
const recoveryOverride = process.env.INKWAVE_TEST_ADAPTER ? (await import(pathToFileURL(process.env.INKWAVE_TEST_ADAPTER))).adaptLockOptionRecovery : null;
const RAW = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const SITE=process.env.INKWAVE_POINTER_LOCK_SITE;
const UPSTREAM=SITE||RAW;
const {adoptCanvasTouch,continueCanvasTouch}=SITE?await import(path.join(SITE,'patches/local-quality/first-touch-adapter.mjs')):{adoptCanvasTouch:sourceAdopt,continueCanvasTouch:sourceContinue};
const IDS = ['jump', 'squid', 'fire', 'sub', 'special'];
const read = rel => fs.readFileSync(path.join(RAW, rel), 'utf8');
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });

async function boot({exit='async',request='immediate'}={}) {
 const f=await fixture(),listeners=new Map(),docListeners=new Map(),modules=new Map();let exits=0,requests=0,unlocks=0,resolvePendingLock,rejectPendingLock;const requestOptions=[];const deferred=[];const activation={isActive:true};
 const add=(map,name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);};
 const doc={hidden:false,documentElement:{classList:classList()},addEventListener:(n,fn)=>add(docListeners,n,fn),querySelector:()=>null,pointerLockElement:null};
 const fireDoc=()=>{for(const fn of docListeners.get('pointerlockchange')||[])fn();};
 const canvas={ownerDocument:doc,closest:()=>null,requestPointerLock(...args){requests++;requestOptions.push(args);if(request==='pending')return new Promise((resolve,reject)=>{resolvePendingLock=resolve;rejectPendingLock=reject;deferred.push({resolve,reject});});}};
 const overlayTarget=(kind)=>({closest:(sel)=>{if(kind==='editor')return sel.includes('.iwm-edit')?{}:null;return (sel.includes('.iwm-look')||sel.includes('.iwm-movezone')||sel.includes('.iwm-b'))?{}:null;}});
 doc.exitPointerLock=()=>{exits++;if(exit==='throw')throw Error('fixture exit unavailable');if(exit==='sync'){doc.pointerLockElement=null;fireDoc();}};
 const context=vm.createContext({console,performance,AbortController,setTimeout,clearTimeout,
  screen:{width:1000,height:700,orientation:{angle:0}},innerWidth:1000,innerHeight:700,
  localStorage:{getItem:()=>null},navigator:{userAgent:'hybrid pointer fixture',maxTouchPoints:0,getGamepads:()=>[],userActivation:activation},
  window:{addEventListener:(n,fn)=>add(listeners,n,fn)},document:doc});
 function synthetic(file,values){return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:file});}
 function load(file){if(modules.has(file))return modules.get(file);const rel=path.relative(UPSTREAM,file);let mod;
  if(['src/core/ctx.js','src/config.js','src/game/physics.js'].includes(rel))mod=synthetic(file,f);
  else if(file==='three')mod=synthetic(file,f.THREE);
  else {const raw=fs.readFileSync(file,'utf8');const built=!SITE&&file.startsWith(UPSTREAM+path.sep)?adaptBuildSource(rel,raw):raw;let code=recoveryOverride?recoveryOverride(rel,built):built;if(esbuild&&rel==='src/core/input.js'){assert.equal(esbuild.version,'0.28.2');code=compactModuleStrings(esbuild.transformSync(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel}).code).code;}mod=new vm.SourceTextModule(code,{context,identifier:file});}
  modules.set(file,mod);return mod;}
 const entry=new vm.SourceTextModule("export {Input} from './src/core/input.js';",{context,identifier:path.join(UPSTREAM,'pointer-lock-fixture.js')});
 await entry.link((spec,from)=>{if(spec==='three')return load('three');let file=path.resolve(path.dirname(from.identifier),spec);if(!SITE&&file.startsWith(path.join(UPSTREAM,'patches')+path.sep))file=path.join(ROOT,path.relative(UPSTREAM,file));return load(file);});await entry.evaluate();
 Object.assign(f.G,{mode:'match',match:{state:'playing',paused:false,attract:false},game:{menus:{current:null}}});
 const input=new entry.namespace.Input(canvas),mobile=input.mobile;
 Object.assign(mobile,{active:true,visible:true,root:{classList:classList(),querySelectorAll:()=>[],setPointerCapture(){}},els:Object.fromEntries([...IDS,'map'].map(id=>[id,{classList:classList()}])),_abort:new AbortController(),_stickHome:{x:100,y:500,d:120},_stickR:60});mobile._drawStick=()=>{};
 input.onUnlock=()=>{unlocks++;};input.lastDevice='kbm';doc.pointerLockElement=canvas;fireDoc();
 const event=(name,e)=>{for(const fn of listeners.get(name)||[])fn(e);};
 const touch=(kind,id=1)=>{mobile._hitButton=()=>kind==='fire'?'fire':null;const e={pointerType:'touch',pointerId:id,target:canvas,clientX:kind==='stick'?100:700,clientY:kind==='stick'?500:250,type:'pointerdown',preventDefault(){},stopPropagation(){}};event('pointerdown',e);const once=adoptCanvasTouch(mobile,e);assert.equal(once,true);assert.equal(adoptCanvasTouch(mobile,e),false);return e;};
 return {G:f.G,input,mobile,doc,canvas,event,touch,activation,exits:()=>exits,requests:()=>requests,requestOptions:()=>requestOptions,unlocks:()=>unlocks,
  release(e){continueCanvasTouch(mobile,{...e,type:'pointerup'},true);},
  mouse(target=canvas){event('pointerdown',{pointerType:'mouse',target});},move(){event('mousemove',{movementX:1,movementY:2});},
  overlay:(kind='look')=>overlayTarget(kind),
  completePendingLock(){assert.equal(typeof resolvePendingLock,'function');doc.pointerLockElement=canvas;fireDoc();resolvePendingLock();},
  simulateLockChange(){doc.pointerLockElement=canvas;fireDoc();},
  rejectAt(index,e){assert.ok(deferred[index]);deferred[index].reject(e);},
  async completePromiseBeforeEvent(){assert.equal(typeof resolvePendingLock,'function');doc.pointerLockElement=canvas;resolvePendingLock();await Promise.resolve();await Promise.resolve();fireDoc();},
  rejectPendingLock(e=Error('unadjusted movement unavailable')){assert.equal(typeof rejectPendingLock,'function');rejectPendingLock(e);},
  // Model the native error event separately from the Promise rejection. The
  // retry gate must observe both for the same still-pending request.
  rejectWithLockError(e){this.lockError();this.rejectPendingLock(e);},
  lockError(){const ticket=input._pointerLockPending;for(const fn of docListeners.get('pointerlockerror')||[])fn();if(ticket)assert.equal(ticket.errorObserved,true,'native error event observed by pending ticket');},
  unlocked(){doc.pointerLockElement=null;fireDoc();},locked(){doc.pointerLockElement=canvas;fireDoc();},listenerCount:()=>[...listeners.values(),...docListeners.values()].reduce((n,a)=>n+a.length,0)};
}




const src=adaptBuildSource('src/main.js',fs.readFileSync(path.join(RAW,'src/main.js'),'utf8'));function section(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
const startup=section(src,'    this.input.requestLock();\n    if (!flow.current()) return;\n    this.menus?.show(null);','    await this._fade(1, 350);');
const gameMethods=section(src,'  pause() {','\n  async quitToMenu() {');
const menuCode=adaptBuildSource('src/ui/menus.js',fs.readFileSync(path.join(RAW,'src/ui/menus.js'),'utf8'));
const menuMethod=section(menuCode,'  _resume() {','\n  /** Live match snapshot');
function error(name){const e=Error(name);e.name=name;return e;}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
async function setup(){const h=await boot({request:'pending',exit:'sync'});h.unlocked();const G=h.G;G.match.actors=[];G.match.controller={enabled:false};G.audio={duck(){}};G.netm=null;const Game=vm.runInNewContext('class Game {'+gameMethods+'}; Game',{G,console});const game=new Game();const Menus=vm.runInNewContext('class Menus {'+menuMethod+'}; Menus',{safeCall:f=>f()});const menus=new Menus();Object.assign(menus,{current:'mode',_sfx(){},api:{resumeMatch:()=>game.resume()},show(v){this.current=v;}});Object.assign(game,{input:h.input,match:G.match,menus});G.game=game;return {h,G,game,menus};}
function startupSource(x){vm.runInNewContext('(function(flow){'+startup+'})',{G:x.G}).call(x.game,{current:()=>true});}
const results=[];let ordinal=0;const from=Number(process.env.TEST_FROM||0),to=Number(process.env.TEST_TO||10000);async function check(name,fn){const n=ordinal++;if(n<from||n>=to)return;try{await fn();results.push({ordinal:n,name,passed:true})}catch(e){results.push({ordinal:n,name,passed:false,error:String(e)});}finally{global.gc?.();}}
await check('startup unsupported alone does not establish preference',async()=>{const x=await setup();startupSource(x);x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.G.match.paused=false;x.menus.current=null;x.game.pause();x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('eligible raw unsupported does exactly one automatic plain fallback',async()=>{
 // A rejection alone, an event before a request, and a late event after the
 // rejected ticket retired must never authorize retry or a cached preference.
 for(const timing of ['absent','before-request','after-rejection']){
  const y=await setup();y.menus.current=null;
  if(timing==='before-request')y.h.lockError();
  y.h.input.requestLock();assert.equal(y.h.input._pointerLockPending.errorObserved,false);
  y.h.rejectPendingLock(error('NotSupportedError'));await settle();
  if(timing==='after-rejection'){y.h.lockError();await settle();}
  assert.equal(y.h.requests(),1,timing);assert.equal(y.h.input._pointerLockPending,null,timing);assert.ok(!y.h.input._pointerLockPlainPreference,timing);
  y.h.input.requestLock();assert.deepEqual(y.h.requestOptions().map(a=>a.length),[1,1],timing);
 }
 const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0]);x.h.rejectWithLockError(error('NotAllowedError'));await settle();assert.equal(x.h.requests(),2);assert.equal(x.h.input._pointerLockPending,null);});
for(const name of ['NotAllowedError','SecurityError','UnknownError'])await check(name+' never auto-fallback or records unsupported',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error(name));await settle();assert.equal(x.h.requests(),1);x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('cancelled stale unsupported is not cached',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.input.exitLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('touch takeover before rejection prevents capability cache and new request',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.input.lastDevice='touch';x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.h.input.lastDevice='kbm';x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('unsupported alone does not establish preference after touch handoff',async()=>{const x=await setup();startupSource(x);x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.input.lastDevice='touch';x.h.input.lastDevice='kbm';x.G.match.paused=false;x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('unsupported alone does not establish preference in another Input',async()=>{const x=await setup();startupSource(x);x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.G.match.paused=false;const second=new x.h.input.constructor(x.h.canvas);second.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('distinct document starts with raw request',async()=>{const one=await setup();startupSource(one);one.h.rejectWithLockError(error('NotSupportedError'));await settle();const two=await setup();two.menus.current=null;two.h.input.requestLock();assert.deepEqual(two.h.requestOptions().map(a=>a.length),[1]);});
await check('one existing rejection handler per request without an added promise reaction',async()=>{const built=adaptBuildSource('src/core/input.js',fs.readFileSync(path.join(RAW,'src/core/input.js'),'utf8'));const code=recoveryOverride?recoveryOverride('src/core/input.js',built):built;assert.equal((code.match(/p\.catch\(/g)||[]).length,2);assert.equal((code.match(/q\.catch\(/g)||[]).length,1);});
await check('realistic startup unsupported alone leaves new match raw-first',async()=>{const x=await setup();x.G.mode='menu';x.G.match.attract=true;const flow={current:()=>true};x.game._matchFlow=flow;vm.runInNewContext('(function(flow){'+startup+'})',{G:x.G}).call(x.game,flow);x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);const next={state:'playing',paused:false,attract:false,actors:[],controller:{enabled:true}};x.G.mode='match';x.G.match=x.game.match=next;x.game.pause();x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('superseded startup flow cannot cache unsupported capability',async()=>{const x=await setup();x.G.mode='menu';x.G.match.attract=true;const flow={current:()=>true};x.game._matchFlow=flow;vm.runInNewContext('(function(flow){'+startup+'})',{G:x.G}).call(x.game,flow);x.game._matchFlow={current:()=>true};x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.G.mode='match';x.G.match=x.game.match={state:'playing',paused:false,attract:false,actors:[]};x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('superseded startup cannot issue fallback in newly playing owner',async()=>{const x=await setup();x.G.mode='menu';x.G.match.attract=true;const flow={current:()=>true};x.game._matchFlow=flow;vm.runInNewContext('(function(flow){'+startup+'})',{G:x.G}).call(x.game,flow);x.game._matchFlow={current:()=>true};x.G.mode='match';x.G.match=x.game.match={state:'playing',paused:false,attract:false,actors:[]};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);});
await check('playing ticket cannot fallback after G.game replacement',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.G.game={menus:{current:null}};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);});
await check('moved canvas never reads cache from original event document',async()=>{const x=await setup();startupSource(x);x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.G.match.paused=false;x.h.canvas.ownerDocument={};x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('moved canvas cannot record or fallback from wrong document',async()=>{const x=await setup();x.menus.current=null;x.h.canvas.ownerDocument={};x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.h.canvas.ownerDocument=x.h.doc;x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('playing ticket cannot fallback or cache after flow replacement with same game and match',async()=>{const x=await setup();x.menus.current=null;x.game._matchFlow={current:()=>true};x.h.input.requestLock();x.game._matchFlow={current:()=>true};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('playing no-flow ticket cannot fallback or cache after a flow appears',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.game._matchFlow={current:()=>true};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,1]);});
await check('pending ticket cannot fallback after canvas changes document',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.canvas.ownerDocument={};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);});
async function successfulPair(x,eventFirst=true){const start=x.h.requests();x.menus.current=null;x.h.activation.isActive=true;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.deepEqual(x.h.requestOptions().slice(start).map(a=>a.length),[1,0]);if(eventFirst)x.h.completePendingLock();else await x.h.completePromiseBeforeEvent();await settle();assert.equal(x.h.input.locked,true);}
await check('event-before-promise successful same-owner pair enables plain on next resume',async()=>{const x=await setup();await successfulPair(x,true);x.game.pause();x.h.activation.isActive=true;x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,0]);});
await check('promise-before-event successful same-owner pair enables plain on next resume',async()=>{const x=await setup();await successfulPair(x,false);x.game.pause();x.h.activation.isActive=true;x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,0]);});
await check('failed plain fallback cannot establish preference',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.rejectWithLockError(error('NotAllowedError'));await settle();x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);});
await check('generic NotSupported plus successful plain is preference only, not capability inference',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,0]);});
await check('next call without user activation retains raw-first behavior',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.h.activation.isActive=false;x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);});
await check('successful pair does not survive owner flow replacement',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.game._matchFlow={current:()=>true};x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);});
await check('same-document new Input does not inherit preference',async()=>{const x=await setup();await successfulPair(x);x.game.pause();const next=new x.h.input.constructor(x.h.canvas);x.G.match.paused=false;next.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);});
await check('normal Range click, delayed raw rejection, successful Resume pair, and next normal weapon click synchronously request plain',async()=>{
 const x=await setup(),G=x.G;let time=0,inGesture=false;const callLog=[];const orig=x.h.canvas.requestPointerLock;x.h.canvas.requestPointerLock=function(...args){callLog.push({time,inGesture,count:args.length});return orig.apply(this,args);};
 const bindCode=section(menuCode,'  _bind(el, opts = {}) {','\n  /** Pointer micro-interactions');const ActualMenus=vm.runInNewContext('class Menus {'+bindCode+menuMethod+'}; Menus',{safeCall:f=>f(),performance});const menus=new ActualMenus();Object.assign(menus,{current:'mode',_binds:new Map(),_sfx(){},_setFocus(){},show(v){this.current=v;},api:{resumeMatch:()=>x.game.resume()}});x.game.menus=menus;G.game=x.game;G.mode='menu';G.match.attract=true;const flow={current:()=>true};x.game._matchFlow=flow;
 let midpoint;menus._runWipe=fn=>{midpoint=fn;};menus.api.prepareMatch=()=>{};menus.api.startMatch=()=>vm.runInNewContext('(function(flow){'+startup+'})',{G}).call(x.game,flow);
 const rangeSrc=fs.readFileSync(path.join(ROOT,'patches/practice-range/runtime/menu.mjs'),'utf8'),startRangeSrc=section(rangeSrc,'function startRange(menus, card) {','\nfunction rangeCard');const startRange=vm.runInNewContext('('+startRangeSrc+')',{safeCall:f=>f(),restartAnim(){},RANGE_ID:'range' });
 function makeButton(){const listeners={};return {tagName:'BUTTON',dataset:{},addEventListener(type,fn){listeners[type]=fn;},listeners,closest(){return null;}};}
 function deliver(button){inGesture=true;try{button.listeners.click({target:button,isTrusted:true});}finally{inGesture=false;}}
 const range=makeButton();menus._bind(range,{id:'mode-range',accept:()=>startRange(menus,range)});deliver(range);assert.equal(x.h.requests(),0);time=405;midpoint();assert.equal(x.h.requests(),1);x.h.activation.isActive=false;time=6666;x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);
 const local={weaponId:'shooter',setWeapon(id){this.weaponId=id;}};const next={state:'playing',paused:false,attract:false,actors:[],controller:{enabled:true},local};G.mode='match';G.match=x.game.match=next;x.game.api={setLoadout(){}};menus.current=null;x.game.pause();
 const resume=makeButton();menus._bind(resume,{id:'resume',accept:()=>menus._resume()});time=7000;x.h.activation.isActive=true;deliver(resume);assert.equal(x.h.requests(),2);x.h.rejectWithLockError(error('NotSupportedError'));time=7001;await settle();assert.equal(x.h.requests(),3);x.h.completePendingLock();await settle();x.game.pause();
 const sessionSrc=fs.readFileSync(path.join(ROOT,'patches/practice-range/runtime/session.mjs'),'utf8'),setWeapon=section(sessionSrc,'  setWeapon(id) {','\n  resetPaint() {');const RangeSession=vm.runInNewContext('class RangeSession {'+setWeapon+'}; RangeSession',{WEAPONS:{charger:{name:'Charger'}},PLAYER:{inkMax:100},G,disposeInkVac(){},L:s=>s});const session=new RangeSession();Object.assign(session,{local,hud:{toast(){}}});
 const actLine=rangeSrc.match(/  const act = \(fn\) => \(\) => \{[^\n]+\};/)?.[0];assert.ok(actLine);const act=vm.runInNewContext('(function(menus){'+actLine+'; return act;})',{safeCall:f=>f()})(menus);const weapon=makeButton();menus._bind(weapon,{id:'w-charger',accept:act(()=>session.setWeapon('charger'))});time=14000;x.h.activation.isActive=true;deliver(weapon);
 assert.equal(local.weaponId,'charger');assert.deepEqual(callLog.map(c=>c.count),[1,1,0,0]);assert.equal(callLog.at(-1).inGesture,true);assert.equal(callLog.at(-1).time,14000);
});
await check('touch handoff retires proven same-owner preference',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.h.input.lastDevice='touch';x.h.input.lastDevice='kbm';x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);});
await check('pending cancellation retires proven preference',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,0]);x.h.input.exitLock();x.h.rejectWithLockError(error('NotAllowedError'));await settle();x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,0,1]);});
await check('detected flow replacement retires preference even if old flow later returns',async()=>{const x=await setup();const old={current:()=>true};x.game._matchFlow=old;await successfulPair(x);x.game.pause();x.game._matchFlow={current:()=>true};x.menus._resume();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);x.h.rejectWithLockError(error('NotAllowedError'));await settle();x.game._matchFlow=old;x.h.input.requestLock();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1,1]);});
await check('old fulfilled callback cannot record after new request generation',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.completePendingLock();x.h.input.exitLock();x.h.input.requestLock();await settle();assert.deepEqual(x.h.requestOptions().map(a=>a.length),[1,0,1]);assert.ok(!x.h.input._pointerLockPlainPreference);});
await check('unsupported plain fallback rejection never causes a third request',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),2);assert.equal(x.h.input._pointerLockPending,null);});
await check('same startup flow with new playing match cannot fallback from old nonplaying ticket',async()=>{const x=await setup();x.G.mode='menu';x.G.match.attract=true;const flow={current:()=>true};x.game._matchFlow=flow;vm.runInNewContext('(function(flow){'+startup+'})',{G:x.G}).call(x.game,flow);x.G.mode='match';x.G.match=x.game.match={state:'playing',paused:false,attract:false,actors:[]};x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);});
await check('stale old plain rejection cannot clear new generation preference',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.simulateLockChange();x.h.input.exitLock();await successfulPair(x);const preferred=x.h.input._pointerLockPlainPreference;assert.ok(preferred);x.h.rejectAt(1,error('NotAllowedError'));await settle();assert.equal(x.h.input._pointerLockPlainPreference,preferred);});
await check('stale old raw rejection cannot clear new generation preference',async()=>{const x=await setup();x.menus.current=null;x.h.input.requestLock();x.h.simulateLockChange();x.h.input.exitLock();x.h.input.requestLock();x.h.rejectWithLockError(error('NotSupportedError'));await settle();x.h.completePendingLock();await settle();const preferred=x.h.input._pointerLockPlainPreference;assert.ok(preferred);x.h.rejectAt(0,error('NotAllowedError'));await settle();assert.equal(x.h.input._pointerLockPlainPreference,preferred);});
await check('synchronous plain fallback throw clears current preference',async()=>{const x=await setup();await successfulPair(x);x.game.pause();x.h.activation.isActive=false;const fn=x.h.canvas.requestPointerLock;x.h.canvas.requestPointerLock=function(...args){if(!args.length)throw Error('synchronous native failure');return fn.apply(this,args);};x.menus._resume();x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.ok(!x.h.input._pointerLockPlainPreference);assert.equal(x.h.input._pointerLockPending,null);});
await check('attract-started ticket never falls back after attract is retired',async()=>{const x=await setup();x.menus.current=null;x.G.match.attract=true;x.h.input.requestLock();x.G.match.attract=false;x.h.rejectWithLockError(error('NotSupportedError'));await settle();assert.equal(x.h.requests(),1);});
console.log(JSON.stringify({candidateOverride:!!recoveryOverride,emitted:!!esbuild,sourceRoot:ROOT,site:SITE||null,ordinalCount:ordinal,results}));if(results.some(x=>!x.passed))process.exitCode=1;
