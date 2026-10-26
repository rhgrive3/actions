import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createIdleGpuTrace,runIdleGpuContextDiagnostic,closeIdleFailureResources} from '../lib/idle-gpu-diagnostic.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
const begin=source.indexOf('export function verifyIdleGpuContext('),end=source.indexOf('\nconst boundedPages=',begin);
assert(begin>=0&&end>begin);
const instrumentedVerifyIdleGpuContext=vm.runInNewContext('('+source.slice(begin,end).replace('export ','').trim()+')');
const original=`function verifyIdleGpuContext(){const probe=window.__idleGpuIdentity;if(!probe)throw Error('Idle GPU identity was not captured');try{if(__G.renderer.getContext()!==probe.gl||probe.lost||probe.gl.isContextLost())throw Error('Idle GPU context lost or replaced during workload');return probe.gpu;}finally{probe.gl.canvas.removeEventListener('webglcontextlost',probe.onLoss);delete window.__idleGpuIdentity;}}`;
function fixture(kind,fn=instrumentedVerifyIdleGpuContext){
 const messages=[],listeners=new Set();let lost=kind==='lost',gl={canvas:{removeEventListener(type,listener){assert.equal(type,'webglcontextlost');listeners.delete(listener);}},isContextLost(){if(kind==='native-throw')throw Error('native loss check');return lost;}};
 const probe={gl,gpu:{webgl:'WebGL 2.0 fake',renderer:'fake'},lost:kind==='event-lost',onLoss(){}};listeners.add(probe.onLoss);
 const window=kind==='missing'?{}:{__idleGpuIdentity:probe};
 const ctx=vm.createContext({window,__G:{renderer:{getContext:()=>kind==='replaced'?{}:gl}},console:{info:s=>{messages.push(s);if(kind==='console-throw')throw Error('observer only');}}});
 let value,error;try{value=vm.runInContext('('+fn.toString()+')({token:"test-token"})',ctx);}catch(e){error=e;}
 return {value,error,messages,listeners,window};
}
test('instrumented callback preserves original returns, errors and cleanup across context states',()=>{
 const originalFn=vm.runInNewContext('('+original.replace('function verifyIdleGpuContext','function')+')');
 for(const kind of ['healthy','lost','event-lost','replaced','missing','native-throw','console-throw']){
  const a=fixture(kind,originalFn),b=fixture(kind);
  assert.equal(b.error?.message,a.error?.message,kind);assert.deepEqual(b.value,a.value,kind);
  assert.equal(b.listeners.size,a.listeners.size,kind);assert.equal('__idleGpuIdentity' in b.window,'__idleGpuIdentity' in a.window,kind);
 }
});
test('successful stages identify native loss check and callback exit without extra native operations',()=>{
 const f=fixture('healthy');assert.deepEqual(f.messages.map(s=>s.split(' ').at(-1)),['enter','probe-read','context-read','loss-read','cleanup-enter','cleanup-exit','exit']);
 const replaced=fixture('replaced');assert(!replaced.messages.some(s=>s.endsWith(' loss-read')));assert(!replaced.messages.some(s=>s.endsWith(' exit')));
});
test('trace rejects malformed/foreign markers, bounds memory and seals late events',()=>{
 const trace=createIdleGpuTrace('test-token',{emit(){throw Error('stderr unavailable');}});
 for(const s of ['INKWAVE_IDLE_GPU_CONTEXT other enter','INKWAVE_IDLE_GPU_CONTEXT test-token invented','INKWAVE_IDLE_GPU_CONTEXT test-token '+('x'.repeat(4096))])assert.equal(trace.accept(s),false);
 for(let i=0;i<30;i++)trace.accept('INKWAVE_IDLE_GPU_CONTEXT test-token enter');
 assert.equal(trace.snapshot().events.length,16);assert.equal(trace.snapshot().dropped,14);
 trace.seal();trace.host('evaluate-resolved');assert.equal(trace.snapshot().dropped,14);
});
test('host requested without browser entry is explicitly inconclusive; failure identity retained',async()=>{
 const failure=Object.assign(Error('existing timeout'),{code:'INKWAVE_IDLE_EVALUATION_TIMEOUT'}),page=new EventEmitter(),trace=createIdleGpuTrace('test-token');
 page.evaluate=async()=>{throw failure;};page.mainFrame=()=>null;
 await assert.rejects(runIdleGpuContextDiagnostic(page,trace,instrumentedVerifyIdleGpuContext),e=>e===failure);
 assert.deepEqual(trace.snapshot().events.map(e=>e.stage),['evaluate-requested','evaluate-rejected']);
 assert.match(trace.snapshot().dispatchScope,/not proof of CDP dispatch/);assert.equal(page.eventNames().length,0);
});
test('browser exit without evaluate resolution and page lifecycle remain in failure trace',async()=>{
 const page=new EventEmitter(),frame={},failure=Error('existing timeout'),trace=createIdleGpuTrace('test-token');page.mainFrame=()=>frame;
 page.evaluate=async()=>{for(const stage of ['enter','exit'])page.emit('console',{text:()=>`INKWAVE_IDLE_GPU_CONTEXT test-token ${stage}`});page.emit('framenavigated',{});page.emit('framenavigated',frame);page.emit('crash');throw failure;};
 await assert.rejects(runIdleGpuContextDiagnostic(page,trace,instrumentedVerifyIdleGpuContext),e=>e===failure);
 assert.deepEqual(trace.snapshot().events.map(e=>e.stage),['evaluate-requested','enter','exit','main-frame-navigation','page-crash','evaluate-rejected']);
});
test('diagnostic listener cleanup cannot replace original failure',async()=>{
 const failure=Error('existing timeout'),cleanup=Error('off failed'),page=new EventEmitter(),trace=createIdleGpuTrace('test-token');page.mainFrame=()=>null;page.evaluate=async()=>{throw failure;};page.off=()=>{throw cleanup;};
 await assert.rejects(runIdleGpuContextDiagnostic(page,trace,instrumentedVerifyIdleGpuContext),e=>e instanceof AggregateError&&e.cause===failure&&e.errors.includes(cleanup));
 assert.equal(trace.snapshot().sealed,true);
});
function clock(){let now=0,serial=0;const pending=new Map();return {pending,setTimeout(fn,ms){pending.set(++serial,{fn,due:now+ms});return serial;},clearTimeout(id){pending.delete(id);},tick(ms){now+=ms;for(const[id,t]of [...pending])if(t.due<=now&&pending.delete(id))t.fn();}};}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('stalled failure cleanup has finite deadline, preserves timeout and reaches server cleanup',async()=>{
 const timers=clock(),primary=Object.assign(Error('existing GPU timeout'),{code:'INKWAVE_IDLE_EVALUATION_TIMEOUT'});let serverClosed=false,caught;
 const done=closeIdleFailureResources({close:()=>new Promise(()=>{})},{close(fn){serverClosed=true;fn();}},primary,{timers}).catch(e=>{caught=e;});
 await flush();timers.tick(4999);await flush();assert.equal(serverClosed,false);timers.tick(1);await done;
 assert.equal(caught.cause,primary);assert.equal(caught.errors[0],primary);assert.equal(caught.errors[1].code,'INKWAVE_IDLE_CLEANUP_TIMEOUT');assert.equal(serverClosed,true);assert.equal(timers.pending.size,0);
});
test('normal failure cleanup preserves primary unchanged and late owner completion cannot overwrite it',async()=>{
 const primary=Error('existing timeout'),timers=clock();let resolve,called=false;
 const result=closeIdleFailureResources({close:()=>new Promise(r=>resolve=r)},null,primary,{timers}).catch(e=>e);await flush();timers.tick(5000);const failure=await result;resolve();await flush();assert.equal(failure.cause,primary);assert.equal(timers.pending.size,0);
 await closeIdleFailureResources({close:async()=>{called=true;}},null,primary,{timers});assert.equal(called,true);
});
test('existing acceptance, timeout and 240-frame loop remain unchanged in repository',()=>{
 assert.match(source,/export const IDLE_OPERATION_TIMEOUT_MS=120000;/);assert.match(source,/export const RESULTS_WORK_TIMEOUT_MS=480000;/);
 // The async-fence owner delegates both 120-frame states through the generator.
 assert.match(source,/const sample=function\*\(next\)/);
 assert.match(source,/const playing=yield\* sample\('playing'\),results=yield\* sample\('results'\);/);
 assert.match(source,/return \{frames:120,playing,results,/);assert.match(source,/for\(let i=0;i<120;i\+\+\)/);
 assert.match(source,/g\._frame\(1\/60\)/);
 assert.match(source,/if\(r.errors\?\.length\|\|!r.gpu\?\.webgl\?\.startsWith\('WebGL 2.0'\)\|\|!r.gpu.renderer\)throw Error\('Browser\/GPU errors'\)/);
});

test('main checkpoints GPU trace before awaiting and bounds only failure cleanup',()=>{assert.match(source,/gpuContextTrace:gpuTrace\?\.snapshot\(\)/);assert(source.indexOf('idle-gpu-context-trace.json')<source.indexOf('await runIdleGpuContextDiagnostic(page,gpuTrace,verifyIdleGpuContext)'));assert.match(source,/cleanup:\(error,failed\)=>failed\?closeIdleFailureResources/);assert.match(source,/await cleanup\(failure,failed\)/);});

test('actual runIdleProbe forwards failed flag for falsy causes and rejects healthy cleanup failure',async()=>{
 const a=source.indexOf('export function primaryIdleFailure('),b=source.indexOf('// Fixed vocabulary',a);
 const run=vm.runInNewContext(source.slice(a,b).replaceAll('export ','')+';runIdleProbe',{AggregateError});
 for(const primary of [0,false,undefined,null,'']){
  let observed,diagnosed=false,outcome;
  await run(()=>{throw primary;},{diagnose:e=>{assert.equal(e,primary);diagnosed=true;},cleanup:(e,failed)=>{observed=[e,failed];}}).then(()=>{outcome={passed:true};},error=>{outcome={error};});
  assert.equal(outcome.passed,undefined);assert.equal(outcome.error,primary);assert.equal(diagnosed,true);assert.deepEqual(Array.from(observed),[primary,true]);
 }
 const closeError=Error('healthy cleanup failed');let flag;
 await assert.rejects(run(()=>({accepted:true}),{diagnose:e=>assert.equal(e,closeError),cleanup:(_e,failed)=>{flag=failed;throw closeError;}}),e=>e===closeError);
 assert.equal(flag,false);
});
test('listener cleanup failure after evaluate success still rejects, never returns accepted value',async()=>{
 const page=new EventEmitter(),trace=createIdleGpuTrace('test-token'),cleanup=Error('listener off failed');
 page.mainFrame=()=>null;page.evaluate=async()=>({gpu:'accepted fake'});page.off=()=>{throw cleanup;};
 await assert.rejects(runIdleGpuContextDiagnostic(page,trace,instrumentedVerifyIdleGpuContext),e=>e instanceof AggregateError&&e.errors.includes(cleanup));
 assert.equal(trace.snapshot().sealed,true);
});
