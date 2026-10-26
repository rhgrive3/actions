import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {observeColdEnvironment,inspectColdBoot,retireDesktopForCold,launchColdMobileBrowser,closeProbeOwner,serveIdleArtifact} from '../check-inkwave-idle-resources.mjs';
let sequence=0;
async function rig(run){
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window={};globalThis.document={readyState:'loading',visibilityState:'visible',hasFocus:()=>false,querySelector:()=>null};
 const url='data:text/javascript,'+encodeURIComponent(`export const G={env:null,game:null,settings:{quality:'high'},mobile:{touch:true}}; // ${++sequence}`);
 const {G}=await import(url);
 try{await run(G,url);}finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
}
const environment=()=>({_marina:true,_cloudRT:{width:1024,height:320,texture:{uuid:'cloud'}},_farRT:{width:256,texture:{uuid:'far'}}});
test('cold allocation observer still captures before Game and restores the original property owner',()=>rig(async(G,url)=>{
 const original=Object.getOwnPropertyDescriptor(G,'env');await observeColdEnvironment(url);assert.equal(inspectColdBoot().observerPhase,'observing-environment');
 G.env=environment();assert.equal(window.__coldEnvironment.gamePublishedAtAllocation,false);assert.deepEqual(window.__coldEnvironment.cloud,[1024,320]);assert.equal(window.__coldEnvironment.farSize,256);
 const descriptor=Object.getOwnPropertyDescriptor(G,'env');assert.equal(descriptor.get,undefined);assert.equal(descriptor.writable,original.writable);assert.equal(descriptor.enumerable,original.enumerable);assert.equal(descriptor.configurable,original.configurable);
 G.game={};window.__G=G;const after=inspectColdBoot();assert.equal(after.hasPublicGame,true);assert.equal(after.context.hasGame,true);assert.equal(after.observerPhase,'captured');
 const first=window.__coldEnvironment;G.env=environment();assert.equal(window.__coldEnvironment,first,'later environment replacement cannot hide the cold allocation');
}));
test('an already allocated Environment is observed only before Game publication; late setup still fails closed',async()=>{
 await rig(async(G,url)=>{G.env=environment();await observeColdEnvironment(url);assert.equal(inspectColdBoot().hasColdEnvironment,true);assert.equal(window.__coldEnvironment.gamePublishedAtAllocation,false);});
 await rig(async(G,url)=>{G.env=environment();G.game={};await assert.rejects(observeColdEnvironment(url),/after Game publication/);assert.equal(inspectColdBoot().context.hasGame,true);assert.equal(inspectColdBoot().hasColdEnvironment,false);});
});
test('failed context imports retain their stage without inventing a cold allocation',()=>rig(async()=>{
 await assert.rejects(observeColdEnvironment('data:text/javascript,throw%20Error(%22context%20failure%22)'));
 const d=inspectColdBoot();assert.equal(d.observerPhase,'importing-context');assert.equal(d.context,null);assert.equal(d.hasColdEnvironment,false);assert.equal(d.visibility,'visible');assert.equal(d.focused,false);
}));

test('completed desktop rendering is retired before the new cold context, without swallowing close failure',async()=>{
 let finish,closed=false;const p={close:()=>new Promise(resolve=>{finish=()=>{closed=true;resolve();};})};let settled=false;
 const done=retireDesktopForCold(p).then(x=>{settled=true;return x;});await Promise.resolve();assert.equal(settled,false);finish();assert.equal(await done,null);assert.equal(closed,true);
 const failure=Error('close failed');await assert.rejects(retireDesktopForCold({close:async()=>{throw failure;}}),e=>e===failure);
 const s=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
 assert.ok(s.indexOf('result.gpu=')<s.indexOf('page=await retireDesktopForCold(page,browser)'));
 assert.ok(s.indexOf('page=await retireDesktopForCold(page,browser)')<s.indexOf('await launchColdMobileBrowser('));
 assert.match(s,/timeout:180000/);
});
test('existing startup profiler phases and stage milestones are bounded and observation-only',()=>rig(async(G,url)=>{
 await observeColdEnvironment(url);G.level={};G.paint={};G.nav={};G.scene={children:[{},{}]};G.renderer={info:{programs:[{}]}};
 const report={marks:Object.fromEntries(Array.from({length:100},(_,i)=>['m'+i,i])),phases:Array.from({length:100},(_,i)=>({name:i===99?'boot/stage-build':'done',end:i===99?null:i})),longTasks:Array.from({length:60},(_,i)=>({duration:i})),errors:Array(30).fill('test'),dropped:2};
 window.__inkwaveStartup={snapshot:()=>report};const got=inspectColdBoot();
 assert.deepEqual([got.context.hasLevel,got.context.hasPaint,got.context.hasNav,got.context.sceneChildren,got.context.programs],[true,true,true,2,1]);
 assert.deepEqual([Object.keys(got.startup.marks).length,got.startup.phases.length,got.startup.longTasks.length,got.startup.errors.length],[64,64,32,20]);
 assert.deepEqual(got.startup.phases.at(-1),{name:'boot/stage-build',end:null});assert.equal(report.phases.length,100);assert.equal(got.hasColdEnvironment,false);
}));
test('actual cold route tracks bounded unresolved requests and retires every completed request',async t=>{
 const s=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8'),start=s.indexOf("await coldPage.route(address+'**',"),end=s.indexOf("\n   await coldPage.goto",start);
 assert.ok(start>=0&&end>start);const callback=s.slice(start+"await coldPage.route(address+'**',".length,end).trim().replace(/\);$/,'');
 const site=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'idle-cold-routes-'))),manifest={artifacts:{}};
 t.after(()=>fs.rmSync(site,{recursive:true,force:true}));
 const body=Buffer.from('export const fixture=1;'),digest=crypto.createHash('sha256').update(body).digest('hex');
 const context={URL,Date,site,manifest,serveIdleArtifact,coldLoaded:new Set(),coldPending:new Map(),pendingSerial:0,pendingDropped:0,errors:[],hooked:true,mainReleased:false};
 const routeHandler=vm.runInNewContext('('+callback+')',context),resolvers=[],work=[];let fulfilled=0;
 for(let i=0;i<258;i++){
  const key='test-'+i+'.js',url='http://localhost/'+key;fs.writeFileSync(path.join(site,key),body);manifest.artifacts[key]=digest;
  work.push(routeHandler({request:()=>({url:()=>url,method:()=> 'GET',resourceType:()=> 'script'}),
   fetch:()=>assert.fail('listed immutable bytes must not use HTTP'),continue:()=>assert.fail('listed immutable bytes must not bypass verification'),
   fulfill:async response=>{assert.equal(response.status,200);assert.deepEqual(response.body,body);await new Promise(resolve=>resolvers.push(resolve));fulfilled++;},
   abort:async()=>assert.fail('unexpected abort')}));
 }
 assert.equal(context.coldPending.size,256);assert.equal(context.pendingDropped,2);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(resolvers.length,258,'all verified replies remain pending until their actual fulfill completes');
 for(const resolve of resolvers)resolve();await Promise.all(work);
 assert.equal(context.coldPending.size,0);assert.equal(context.coldLoaded.size,258);assert.equal(fulfilled,258);assert.deepEqual(context.errors,[]);
 let aborted=0;
 await routeHandler({request:()=>({url:()=> 'http://localhost/fail.js',method:()=> 'GET',resourceType:()=> 'script'}),
  fetch:()=>assert.fail('unlisted requests must use their original HTTP route'),continue:async()=>{throw Error('network failure');},abort:async()=>{aborted++;}});
 assert.equal(context.coldPending.size,0);assert.match(context.errors[0],/network failure/);
 manifest.artifacts['changed.js']=digest;fs.writeFileSync(path.join(site,'changed.js'),'changed');
 await routeHandler({request:()=>({url:()=> 'http://localhost/changed.js',method:()=> 'GET',resourceType:()=> 'script'}),
  fetch:()=>assert.fail('immutable hash failures must not retry HTTP'),fulfill:()=>assert.fail('changed bytes must not be released'),abort:async()=>{aborted++;}});
 assert.equal(aborted,2);assert.equal(context.coldPending.size,0);assert.equal(context.coldLoaded.has('changed.js'),false);assert.match(context.errors[1],/Loaded byte mismatch/);
});


test('cold process starts only after the completed desktop process closes, with isolated storage and identical mobile conditions',async()=>{
 const order=[],page={close:async()=>{order.push('desktop-page');}},coldPage={},context={pages:()=>[coldPage],close:async()=>{order.push('cold-close');}};
 let finish;const desktop={close:()=>new Promise(resolve=>{finish=()=>{order.push('desktop-process');resolve();};})};
 const chromium={launchPersistentContext:async(profile,options)=>{order.push('cold-launch');assert.equal(profile,'/persist/idle/cold-mobile');assert.deepEqual(options.viewport,{width:844,height:390});assert.equal(options.hasTouch,true);assert.equal(options.isMobile,true);assert.equal(options.headless,true);assert.deepEqual(options.args,['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']);return context;}};
 const work=(async()=>{await retireDesktopForCold(page,desktop);return launchColdMobileBrowser(chromium,'/persist/idle');})();
 await Promise.resolve();await Promise.resolve();assert.deepEqual(order,['desktop-page']);finish();const got=await work;assert.equal(got.page,coldPage);assert.equal(got.context,context);await closeProbeOwner(got.context);assert.deepEqual(order,['desktop-page','desktop-process','cold-launch','cold-close']);
});
test('failed desktop retirement prevents cold launch; failed new-page setup retires the new process and preserves both errors',async()=>{
 const original=Error('desktop close failed');let launches=0;
 await assert.rejects((async()=>{await retireDesktopForCold({close:async()=>{}},{close:async()=>{throw original;}});launches++;})(),e=>e===original);assert.equal(launches,0);
 const pageError=Error('new page failed'),closeError=Error('cold close failed');let closes=0;
 const context={pages:()=>[],newPage:async()=>{throw pageError;},close:async()=>{closes++;throw closeError;}};
 await assert.rejects(launchColdMobileBrowser({launchPersistentContext:async()=>context},'/persist/idle'),e=>e instanceof AggregateError&&e.cause===pageError&&e.errors[0]===pageError&&e.errors[1]===closeError);assert.equal(closes,1);
});
test('cold boot diagnostics precede process cleanup and cleanup cannot erase the primary timeout',async()=>{
 const timeout=Error('cold timeout'),closeError=Error('process close failed');let closed=0;
 await closeProbeOwner({close:async()=>{closed++;}},timeout);assert.equal(closed,1);
 await assert.rejects(closeProbeOwner({close:async()=>{throw closeError;}},timeout),e=>e instanceof AggregateError&&e.cause===timeout&&e.errors[0]===timeout&&e.errors[1]===closeError);
 await assert.rejects(closeProbeOwner({close:async()=>{throw closeError;}}),e=>e===closeError);
 const s=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
 assert(s.indexOf('diagnostic.page=')<s.indexOf('await closeProbeOwner(coldContext,coldError)'));
 assert(s.indexOf("cold-boot-failure.png")<s.indexOf('await closeProbeOwner(coldContext,coldError)'));
 assert(!s.includes('browser.browser().newContext'));assert(!s.includes('window.requestAnimationFrame='));assert.match(s,/timeout:180000/);
});
