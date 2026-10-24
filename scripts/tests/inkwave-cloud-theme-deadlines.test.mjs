// Source/component supervision and resource contracts, not GPU acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {refreshEnvironmentBudget} from '../../patches/local-quality/idle-resources.mjs';
import {IDLE_OPERATION_TIMEOUT_MS,CLOUD_SEQUENCE_TIMEOUT_MS,CLOUD_THEMES,runCloudThemeSequence,measureCloudTheme,runIdleProbe,idleFailureReporter,closeIdleResources,primaryIdleFailure,validateIdleResult} from '../check-inkwave-idle-resources.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
const retainStart=source.indexOf('   (row,index,checkOverall)=>{'),retainEnd=source.indexOf('\n   },\n   {phase:',retainStart);
assert(retainStart>=0&&retainEnd>retainStart);
const actualRetention=source.slice(retainStart,retainEnd+5).trim();
const flush=async()=>{for(let i=0;i<48;i++)await Promise.resolve();};
const observe=promise=>{const state={settled:false};state.done=promise.then(value=>Object.assign(state,{settled:true,value}),error=>Object.assign(state,{settled:true,error}));return state;};
const row=theme=>({theme,high:'AA==',low:'AQ=='});
function clock(){let time=0,serial=0;const pending=new Map();return {pending,now:()=>time,setTimeout(fn,ms){const id=++serial;pending.set(id,{fn,due:time+ms});return id;},clearTimeout(id){pending.delete(id);},tick(ms){time+=ms;for(const [id,t]of [...pending].sort((a,b)=>a[1].due-b[1].due))if(t.due<=time&&pending.delete(id))t.fn();}};}
function rig(t,options={}){
 const c=clock(),output=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-themes-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const result={clouds:[],cloudSequence:{}},calls=[],pending=[],statuses=[],order=[];let currentPhase='clouds',screenshots=0;
 const publish=receipt=>{statuses.push(receipt.status);fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt));if(receipt.status==='failed')order.push('failed-receipt');};
 const retentionFs=options.retentionError?{...fs,writeFileSync(file,bytes){if(file.endsWith('-low.png'))throw options.retentionError;fs.writeFileSync(file,bytes);}}:fs;
 const retain=vm.runInNewContext('('+actualRetention+')',{result,fs:retentionFs,path,Buffer,output});
 const measure=options.measure??(({theme,index})=>{calls.push({theme,index,start:c.now()});return new Promise((resolve,reject)=>{pending[index]={resolve,reject};});});
 const diagnose=idleFailureReporter({publish,snapshot:()=>({phase:currentPhase,result}),page:()=>({screenshot:async()=>{screenshots++;}}),screenshotPath:'unused'});
 const work=observe(runIdleProbe(()=>runCloudThemeSequence(measure,(value,index,check)=>{retain(value,index,check);options.afterRetain?.(c,index);},{timers:c,now:c.now,trace:result.cloudSequence,phase:value=>{currentPhase=value;},checkpoint:()=>{publish({status:'running',result});options.checkpoint?.();}}),{
  diagnose,cleanup:error=>closeIdleResources({close:async()=>{order.push('owner-close');if(options.closeError)throw options.closeError;}},{close:done=>{order.push('server-close');done();}},error)
 }).then(value=>{publish({status:'passed',scope:'source-component-only',isGPUAcceptance:false,result});return value;}));
 return {c,output,result,calls,pending,statuses,order,work,screenshots:()=>screenshots,receipt:()=>JSON.parse(fs.readFileSync(path.join(output,'receipt.json')))};
}

test('three sequential119999ms operations get independent deadlines and report aggregate359997ms',async t=>{
 const f=rig(t);await flush();
 assert.equal(IDLE_OPERATION_TIMEOUT_MS,120000);assert.equal(CLOUD_SEQUENCE_TIMEOUT_MS,360000);
 for(let i=0;i<3;i++){assert.equal(f.calls.length,i+1);f.c.tick(119999);await flush();assert.equal(f.work.settled,false);f.pending[i].resolve(row(CLOUD_THEMES[i]));await flush();}
 await f.work.done;assert.ifError(f.work.error);
 assert.deepEqual(f.calls.map(x=>x.start),[0,119999,239998]);
 assert.deepEqual(f.result.cloudSequence.themes.map(x=>x.elapsedMs),[119999,119999,119999]);
 assert.equal(f.result.cloudSequence.elapsedMs,359997);assert.equal(f.result.cloudSequence.state,'complete');
 assert.equal(f.c.pending.size,0);assert.equal(f.statuses.at(-1),'passed');
 assert.deepEqual(f.order,['owner-close','server-close']);
});
for(let target=0;target<3;target++)test(`${CLOUD_THEMES[target]} remains pending119999ms and fails at120000ms without later operations`,async t=>{
 const f=rig(t);await flush();
 for(let i=0;i<target;i++){f.c.tick(119999);f.pending[i].resolve(row(CLOUD_THEMES[i]));await flush();}
 f.c.tick(119999);await flush();assert.equal(f.work.settled,false);
 f.c.tick(1);await f.work.done;
 assert.equal(f.work.error.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(f.work.error.phase,'clouds:'+CLOUD_THEMES[target]);
 assert.equal(f.work.error.timeoutMs,120000);assert.equal(f.work.error.elapsedMs,120000);
 assert.equal(f.result.cloudSequence.failedTheme.evaluationElapsedMs,120000);
 assert.equal(f.calls.length,target+1);assert.equal(f.result.clouds.length,target);assert.equal(f.result.cloudSequence.state,'failed');
 assert.equal(f.c.pending.size,0);assert(!f.statuses.includes('passed'));assert.equal(f.receipt().status,'failed');assert.equal(f.screenshots(),0);
 const statuses=[...f.statuses];f.pending[target].resolve(row(CLOUD_THEMES[target]));await flush();
 assert.deepEqual(f.statuses,statuses);assert.equal(f.calls.length,target+1);assert.equal(f.result.clouds.length,target);
});
test('second-theme original failure keeps first artifacts, emits failure before cleanup and never retries',async t=>{
 const f=rig(t);await flush();f.c.tick(17);f.pending[0].resolve(row('day'));await flush();
 const high=fs.readFileSync(path.join(f.output,'cloud-day-high.png')),low=fs.readFileSync(path.join(f.output,'cloud-day-low.png'));
 const original=Error('second native readback failed');f.c.tick(43);f.pending[1].reject(original);await f.work.done;
 assert.equal(f.work.error,original);assert.equal(f.calls.length,2);assert.equal(f.result.clouds.length,1);
 assert.deepEqual(fs.readFileSync(path.join(f.output,'cloud-day-high.png')),high);assert.deepEqual(fs.readFileSync(path.join(f.output,'cloud-day-low.png')),low);
 assert.equal(f.receipt().primaryError,original.stack);assert.equal(f.receipt().status,'failed');assert(!f.statuses.includes('passed'));
 assert.equal(f.result.cloudSequence.failedTheme.evaluationElapsedMs,43);assert.equal(f.result.cloudSequence.elapsedMs,60);
 assert.deepEqual(f.order,['failed-receipt','owner-close','server-close']);assert.equal(f.c.pending.size,0);
});
test('aggregate cap stops golden before its own120seconds and preserves both earlier themes',async t=>{
 const f=rig(t,{afterRetain:c=>c.tick(30000)});await flush();
 for(let i=0;i<2;i++){f.c.tick(100000);f.pending[i].resolve(row(CLOUD_THEMES[i]));await flush();}
 assert.deepEqual(f.calls.map(x=>x.start),[0,130000,260000]);
 f.c.tick(99999);await flush();assert.equal(f.work.settled,false);
 f.c.tick(1);await f.work.done;
 assert.equal(f.work.error.code,'INKWAVE_CLOUD_SEQUENCE_TIMEOUT');assert.equal(f.work.error.timeoutMs,360000);
 assert.equal(f.result.cloudSequence.elapsedMs,360000);assert.equal(f.result.clouds.length,2);assert.equal(f.calls.length,3);
 assert.equal(f.result.cloudSequence.failedTheme.evaluationElapsedMs,100000);
 assert.equal(f.receipt().operation.scope,'cloud-sequence');assert.equal(f.screenshots(),0);assert(!f.statuses.includes('passed'));
 const files=fs.readdirSync(f.output).sort(),statuses=[...f.statuses];f.pending[2].resolve(row('golden'));await flush();
 assert.deepEqual(fs.readdirSync(f.output).sort(),files);assert.deepEqual(f.statuses,statuses);assert.equal(f.c.pending.size,0);
});
test('all rows and artifacts cannot become success if synchronous retention reaches the aggregate boundary',async t=>{
 const f=rig(t,{afterRetain:c=>c.tick(20000)});await flush();
 for(let i=0;i<3;i++){f.c.tick(100000);f.pending[i].resolve(row(CLOUD_THEMES[i]));await flush();}
 await f.work.done;assert.equal(f.work.error.code,'INKWAVE_CLOUD_SEQUENCE_TIMEOUT');
 assert.equal(f.result.clouds.length,3);assert.equal(f.result.cloudSequence.state,'failed');assert(!f.statuses.includes('passed'));
 assert.equal(fs.readdirSync(f.output).filter(x=>x.endsWith('.png')).length,6);assert.equal(f.c.pending.size,0);
});
test('cleanup failure preserves a theme failure and never deletes already saved evidence',async t=>{
 const closeError=Error('browser close failed'),f=rig(t,{closeError});await flush();
 f.pending[0].resolve(row('day'));await flush();const original=Error('sunset failure');f.pending[1].reject(original);await f.work.done;
 assert.equal(primaryIdleFailure(f.work.error),original);assert.equal(f.receipt().primaryError,original.stack);
 assert(f.receipt().relatedErrors.includes(closeError.stack));assert.equal(f.receipt().status,'failed');
 assert.equal(fs.readdirSync(f.output).filter(x=>x.endsWith('.png')).length,2);assert(!f.statuses.includes('passed'));
 assert(f.order.includes('server-close'));assert.equal(f.c.pending.size,0);
});
test('an artifact write failure preserves the first image and original error without starting another theme',async t=>{
 const original=Error('second image write failed'),f=rig(t,{retentionError:original});await flush();
 f.pending[0].resolve(row('day'));await f.work.done;
 assert.equal(f.work.error,original);assert.equal(f.calls.length,1);assert.equal(f.receipt().primaryError,original.stack);
 assert.equal(f.result.clouds[0].artifacts.high,'cloud-day-high.png');assert.equal(f.result.clouds[0].artifacts.low,null);
 assert(fs.existsSync(path.join(f.output,'cloud-day-high.png')));assert.equal(fs.existsSync(path.join(f.output,'cloud-day-low.png')),false);
 assert.equal(f.receipt().status,'failed');assert(!f.statuses.includes('passed'));assert.equal(f.c.pending.size,0);
});
test('wrong ordered result fails before retention rather than using a partial-success fallback',async t=>{
 const f=rig(t);await flush();f.pending[0].resolve(row('golden'));await f.work.done;
 assert.match(f.work.error.message,/missing or out of order/);assert.equal(f.calls.length,1);assert.equal(f.result.clouds.length,0);
 assert.equal(f.receipt().status,'failed');assert(!f.statuses.includes('passed'));assert.equal(f.c.pending.size,0);
});

function browserRig(options={}){
 const calls=[],samples=[],budgets=[],resizes=[],resources={targets:0,targetDisposes:0,geometryDisposes:0,materialDisposes:0};let target={},reads=0;
 const originalTarget=target,originalGame={},G={game:originalGame,settings:{quality:options.alreadyHigh?'high':'low'}};
 const env=Object.assign(Object.create({setTheme(theme){calls.push({theme,quality:G.settings.quality,width:this._cloudRT.width,height:this._cloudRT.height});if(options.failTheme===calls.length)throw options.themeError;this.theme=theme;}}),{theme:'day',_cloudRT:{width:options.alreadyHigh?2048:1024,height:options.alreadyHigh?640:320,texture:{uuid:'native-cloud'},setSize(w,h){resizes.push([w,h]);if(options.failResize===resizes.length)throw options.resizeError;if(!options.brokenResize){this.width=w;this.height=h;}}},_cloudMat:{uniforms:{uRes:{value:{set(){}}}}}});G.env=env;
 if(options.ownMethod)Object.defineProperty(env,'setTheme',{value:env.setTheme,writable:true,enumerable:false,configurable:true});
 const originalDescriptor=Object.getOwnPropertyDescriptor(env,'setTheme');
 const originalTheme=env.setTheme,readError=Object.hasOwn(options,'readError')?options.readError:Error('native sample failed');
 G.renderer={getRenderTarget:()=>target,setRenderTarget:value=>{target=value;},render(){},readRenderTargetPixels(_rt,x,y,w,h,a){
  assert.deepEqual([x,y,w,h],[0,0,256,80]);reads++;if(options.failRead===reads)throw readError;
  assert.equal(_rt,target);assert.equal(_rt.width,256);assert.equal(_rt.height,80);
  samples.push({theme:env.theme,quality:G.settings.quality,width:env._cloudRT.width,height:env._cloudRT.height});a.fill(40+20*CLOUD_THEMES.indexOf(env.theme)+(G.settings.quality==='low'?(options.lowDifference??1):0));
  if(options.corruptRepeat&&reads%3===2)a[0]++;
 }};
 class Scene{add(){}}
 class Mesh{constructor(geometry,material){Object.assign(this,{geometry,material});}}
 class Material{constructor(v){Object.assign(this,v);}dispose(){resources.materialDisposes++;}}
 class Geometry{dispose(){resources.geometryDisposes++;}}
 class Target{constructor(width,height,options){assert.equal(width,256);assert.equal(height,80);assert.equal(options.depthBuffer,false);assert.equal(options.stencilBuffer,false);resources.targets++;Object.assign(this,{width,height,texture:{uuid:'one-sample-target'}});}dispose(){resources.targetDisposes++;if(Object.hasOwn(options,'cleanupError'))throw options.cleanupError;}}
 const THREE={Scene,Mesh,MeshBasicMaterial:Material,PlaneGeometry:Geometry,WebGLRenderTarget:Target,OrthographicCamera:class{}};
 const document={baseURI:'http://fixture/',createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8Array(w*h*4)}),putImageData(){}}),toDataURL:()=> 'data:image/png;base64,AA=='})};
 const imports="const THREE=await import('three'),{refreshEnvironmentBudget}=await import(new URL('patches/local-quality/idle-resources.mjs',document.baseURI).href);";
 const text=measureCloudTheme.toString();assert(text.includes(imports));
 const refresh=(...args)=>{budgets.push({quality:G.settings.quality,touch:args[2].touch});return refreshEnvironmentBudget(...args);};
 const context={window:{},__G:G,__rig:{THREE,refreshEnvironmentBudget:refresh},document,Uint8Array,AggregateError,URL};
 const measure=vm.runInNewContext('('+text.replace(imports,'const {THREE,refreshEnvironmentBudget}=__rig;')+')',context);
 return {measure:({theme,index})=>measure({token:'same-sequence',theme,index}),G,env,originalGame,originalTheme,originalDescriptor,originalTarget,calls,samples,budgets,resizes,resources,readError,context,target:()=>target};
}
for(const alreadyHigh of [false,true])test(`actual browser routine retains nine independent native bakes/samples and shared owners; alreadyHigh=${alreadyHigh}`,async()=>{
 const f=browserRig({alreadyHigh}),rows=[];
 for(let i=0;i<3;i++){
  rows.push(await f.measure({theme:CLOUD_THEMES[i],index:i}));
  assert.equal(f.G.game,f.originalGame);assert.equal(f.G.env,f.env);assert.equal(f.env.setTheme,f.originalTheme);assert.equal(Object.hasOwn(f.env,'setTheme'),false);
  assert.equal(f.resources.targets,1);assert.equal(f.resources.targetDisposes,i===2?1:0);
 }
 assert.deepEqual(f.samples,CLOUD_THEMES.flatMap(theme=>['high','high','low'].map(quality=>({theme,quality,width:quality==='high'?2048:1024,height:quality==='high'?640:320}))));
 assert.deepEqual(f.calls,f.samples);assert.equal(f.calls.length,9);assert.deepEqual(rows.map(x=>x.sampleCount),[3,3,3]);assert.deepEqual(rows.map(x=>x.bakeCalls),[3,3,3]);
 assert.deepEqual(f.budgets,CLOUD_THEMES.flatMap(()=>['high','low'].map(quality=>({quality,touch:false}))));assert.equal(f.resizes.length,alreadyHigh?5:6);
 assert(rows.every(x=>x.identity.sampleTexture==='one-sample-target'&&x.identity.cloudTexture==='native-cloud'));
 assert.equal(rows[2].sequenceSamples,9);assert.equal(rows[2].sequenceBakeCalls,9);assert.equal(f.G.settings.quality,'low');assert.equal(f.env.theme,'golden');
 assert.equal(f.target(),f.originalTarget);assert.deepEqual(f.resources,{targets:1,targetDisposes:1,geometryDisposes:1,materialDisposes:1});
 assert.equal(f.context.window.__inkwaveIdleCloudSequence,undefined);
});
test('actual second-theme sample failure preserves the native error and releases shared QA resources once',async()=>{
 const f=browserRig({failRead:4});await f.measure({theme:'day',index:0});
 await assert.rejects(f.measure({theme:'sunset',index:1}),error=>error===f.readError);
 assert.equal(f.resources.targets,1);assert.equal(f.resources.targetDisposes,1);assert.equal(f.env.setTheme,f.originalTheme);assert.equal(Object.hasOwn(f.env,'setTheme'),false);
 assert.equal(f.context.window.__inkwaveIdleCloudSequence,undefined);assert.equal(f.G.game,f.originalGame);assert.equal(f.target(),f.originalTarget);
});
test('a replaced Game is rejected rather than restarted or accepted under the same sequence',async()=>{
 const f=browserRig();await f.measure({theme:'day',index:0});const replacement={};f.G.game=replacement;
 await assert.rejects(f.measure({theme:'sunset',index:1}),/owner or resource identity changed/);
 assert.equal(f.G.game,replacement);assert.equal(f.calls.length,3);assert.equal(f.samples.length,3);assert.equal(f.resources.targetDisposes,1);
});
for(const stage of ['read','resize','theme'])for(const target of [0,2])for(const original of [0,false,null,undefined])for(const cleanupFails of [false,true])test(`actual ${CLOUD_THEMES[target]} ${stage} falsy throw ${String(original)} preserves failure and disposes once${cleanupFails?' with cleanup error':''}`,async t=>{
 const fault=stage==='read'?{failRead:target*3+1,readError:original}:stage==='resize'?{failResize:target*2+1,resizeError:original}:{failTheme:target*3+1,themeError:original};
 const cleanupError=Error('sample target disposal failed'),b=browserRig({...fault,...(cleanupFails?{cleanupError}:{})}),calls=[];
 const f=rig(t,{measure:args=>{calls.push(args.theme);return b.measure(args);}});await f.work.done;
 assert(Object.hasOwn(f.work,'error'));
 if(cleanupFails){assert(f.work.error instanceof AggregateError);assert(Object.hasOwn(f.work.error,'cause'));assert.equal(f.work.error.cause,original);assert.deepEqual(f.work.error.errors,[original,cleanupError]);}
 else assert.equal(f.work.error,original);
 assert.equal(primaryIdleFailure(f.work.error),original);assert.equal(f.receipt().primaryError,String(original));
 assert.equal(f.receipt().status,'failed');assert(!f.statuses.includes('passed'));assert.equal(f.result.cloudSequence.state,'failed');
 assert.deepEqual(calls,CLOUD_THEMES.slice(0,target+1));assert.equal(f.result.clouds.length,target);assert.equal(f.c.pending.size,0);
 assert.equal(fs.readdirSync(f.output).filter(x=>x.endsWith('.png')).length,target*2);
 assert.deepEqual(b.resources,{targets:1,targetDisposes:1,geometryDisposes:1,materialDisposes:1});
 assert.equal(b.context.window.__inkwaveIdleCloudSequence,undefined);assert.equal(b.target(),b.originalTarget);assert.equal(b.G.game,b.originalGame);
 assert.equal(b.env.setTheme,b.originalTheme);assert.equal(Object.hasOwn(b.env,'setTheme'),false);
 assert.deepEqual(f.order,['failed-receipt','owner-close','server-close']);
});
// Exercise the real nested selector without the outer measurement finally
// masking a missed restoration of the counting wrapper's descriptor.
function selectTheme(f,theme){
 const start=source.indexOf('   function setCloudTheme(theme){'),end=source.indexOf('\n   }\n',start)+5;assert(start>=0&&end>start);
 return vm.runInNewContext('('+source.slice(start,end)+')',{env:f.env,G:f.G,refreshEnvironmentBudget,assertOwner:()=>assert.equal(f.G.env,f.env)})(theme);
}
for(const ownMethod of [false,true])for(const alreadyHigh of [false,true]){
 test(`selector performs one native call and restores exact descriptor; own=${ownMethod},high=${alreadyHigh}`,()=>{
  const f=browserRig({ownMethod,alreadyHigh});f.G.settings.quality='high';selectTheme(f,'sunset');
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{theme:'sunset',quality:'high',width:2048,height:640});assert.equal(f.resizes.length,alreadyHigh?0:1);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.env,'setTheme'),f.originalDescriptor);assert.equal(f.env.setTheme,f.originalTheme);
 });
 for(const stage of alreadyHigh?['theme']:['resize','theme'])test(`selector restores exact descriptor after falsy ${stage} exception; own=${ownMethod},high=${alreadyHigh}`,()=>{
  const f=browserRig({ownMethod,alreadyHigh,...(stage==='resize'?{failResize:1,resizeError:0}:{failTheme:1,themeError:0})});f.G.settings.quality='high';let failed=false,value;
  try{selectTheme(f,'sunset');}catch(error){failed=true;value=error;}assert(failed);assert.equal(value,0);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.env,'setTheme'),f.originalDescriptor);assert.equal(f.env.setTheme,f.originalTheme);
 });
}
for(const [name,options]of [['changed repeat',{corruptRepeat:true}],['visible low-quality error',{lowDifference:9}],['wrong allocation dimensions',{brokenResize:true}]])test(`${name} remains observable and fails the unchanged real cloud gate`,async()=>{
 const f=browserRig(options),clouds=[];for(let i=0;i<3;i++)clouds.push(await f.measure({theme:CLOUD_THEMES[i],index:i}));
 assert.equal(f.samples.length,9);const coldBoot={quality:'high',touch:true,gamePublishedAtAllocation:false,marina:true,cloud:[1024,320],farSize:256,sameTargetsAfterBoot:true};
 assert.throws(()=>validateIdleResult({coldBoot,clouds}),/Cloud appearance\/budget gate/);
});
test('actual native setTheme still invokes cloud, PMREM and far paths for all nine bakes',async()=>{
 const text=fs.readFileSync(new URL('../../inkwave-public/src/world/environment.js',import.meta.url),'utf8'),start=text.lastIndexOf('\n  setTheme(name) {'),end=text.indexOf('\n  update(',start);assert(start>=0&&end>start);
 const vector=()=>{const v={};for(const name of ['set','normalize','copy','lerp','multiplyScalar'])v[name]=()=>v;return v;};
 // CPU entry-path doubles only: no shader execution or pixel/GPU acceptance.
 const THEMES=Object.fromEntries(CLOUD_THEMES.map(name=>[name,{sunEl:0,sunAz:0,glow:[0,0,0],haze:[0,0,0],cloud:[0,0,0],night:0}]));
 const native=vm.runInNewContext('({'+text.slice(start,end)+'}).setTheme',{THEMES,DEG:Math.PI/180,lin:vector,THREE:{Color:class{}}});
 const f=browserRig(),work=[],uniforms={},rows=[];Object.getPrototypeOf(f.env).setTheme=native;
 Object.assign(f.G.renderer,{getClearColor:v=>v,getClearAlpha:()=>1,setClearColor(){}});
 Object.assign(f.env,{renderer:f.G.renderer,U:new Proxy(uniforms,{get:(u,k)=>u[k]??(u[k]={value:vector()})}),skyMat:{defines:{}},_stageMarina:()=>false,_marina:false,_applyMarina(){},_fitShadow(){},sun:{color:vector()},hemi:{color:vector(),groundColor:vector()},scene:{},fogColor:vector(),lhBeam:{}});
 for(const stage of ['_bakeClouds','_rebuildEnvMap','_bakeFarReflection'])f.env[stage]=function(){work.push({stage,theme:this.theme,quality:f.G.settings.quality,width:this._cloudRT.width,height:this._cloudRT.height});};
 for(let i=0;i<3;i++)rows.push(await f.measure({theme:CLOUD_THEMES[i],index:i}));
 const expected=CLOUD_THEMES.flatMap(theme=>['high','high','low'].flatMap(quality=>['_bakeClouds','_rebuildEnvMap','_bakeFarReflection'].map(stage=>({stage,theme,quality,width:quality==='high'?2048:1024,height:quality==='high'?640:320}))));
 assert.deepEqual(work,expected);assert.equal(work.length,27);assert.equal(rows[2].sequenceBakeCalls,9);assert.equal(f.samples.length,9);assert.equal(f.env.setTheme,native);
});
