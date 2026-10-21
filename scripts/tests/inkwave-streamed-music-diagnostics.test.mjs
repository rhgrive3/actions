import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { observeStreamedMusic } from '../lib/inkwave-streamed-music-diagnostics.mjs';
const assetURL='http://127.0.0.1:9999/_versions/rev/assets/audio/Jet_Arrow.mp3';
async function fixture({ fail=false, ownerGlobal='__G' }={}) {
 const events=new Map(), calls=[], receipt={};
 const media={currentSrc:assetURL,currentTime:1,duration:120,paused:false,ended:false,seeking:false,readyState:4,networkState:1,error:null,getAttribute:()=>assetURL};
 const player={id:'battle',disposed:false,failed:false,element:media};
 const window={__G:{music:{track:'battle',_desiredTrack:'battle',current:player,players:[player],ctx:{state:'running',currentTime:10}},match:{state:'playing'}}};
 const cdp={on:(name,fn)=>events.set(name,fn),send:async name=>calls.push(name)};
 const emit=(name,data)=>events.get(name)?.(data);
 const page={evaluate:async (fn,arg)=>vm.runInNewContext('('+fn.toString()+')(arg)', {window,arg})};
 const context={newCDPSession:async()=>{if(fail)throw Error('unsupported');return cdp;},close:async()=>{
  calls.push('close');emit('Network.loadingFailed',{requestId:'jet',timestamp:12,errorText:'net::ERR_ABORTED',canceled:true,type:'Media'});return 'closed';}};
 const observer=await observeStreamedMusic({context,page,assetURL,receipt,ownerGlobal});
 const request=(id,url=assetURL)=>emit('Network.requestWillBeSent',{requestId:id,timestamp:1,wallTime:2,type:'Media',request:{url,method:'GET',headers:{Range:'bytes=0-'}}});
 return {emit,calls,receipt,media,player,page,context,observer,request,window};
}
test('records only exact Jet request IDs and preserves HTTP/range evidence',async()=>{
 const f=await fixture();f.request('other',assetURL.replace('Jet_Arrow','other'));f.request('query',assetURL+'?x=1');f.request('jet');
 f.emit('Network.responseReceived',{requestId:'jet',timestamp:2,type:'Media',response:{url:assetURL,status:206,mimeType:'audio/mpeg',headers:{'Content-Range':'bytes 0-9/10'}}});
 f.emit('Network.loadingFinished',{requestId:'other',encodedDataLength:10});f.emit('Network.loadingFinished',{requestId:'jet',encodedDataLength:10});
 assert.deepEqual(f.calls,['Network.enable','Media.enable']);assert.deepEqual(f.receipt.network.map(x=>x.event),['request','response','finished']);assert.equal(f.receipt.network[0].range,'bytes=0-');assert.equal(f.receipt.network[1].status,206);
});
test('expected context-close cancel is distinguished but never automatically accepted',async()=>{
 const f=await fixture();f.request('jet');await f.observer.snapshot('playing');f.media.currentTime=5;
 assert.equal(await f.observer.close(),'closed');const row=f.receipt.network.at(-1);assert.equal(row.phase,'context-close');assert.equal(row.cancellationObserved,true);assert.equal(row.autoAccepted,false);
 assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);assert.equal(f.receipt.snapshots[1].state.current.element.currentTime,5);assert.equal(f.calls.at(-1),'close');
});
test('real transport failure and MediaError stay explicit during capture',async()=>{
 const f=await fixture();f.request('jet');f.emit('Network.loadingFailed',{requestId:'jet',errorText:'net::ERR_CONNECTION_RESET',canceled:false,type:'Media'});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});f.emit('Media.playerErrorsRaised',{playerId:'p',errors:[{errorType:'PipelineError',code:2}]});
 f.media.error={code:2,message:'network failure'};await f.observer.snapshot('failed');assert.equal(f.receipt.network.at(-1).phase,'capture');assert.equal(f.receipt.network.at(-1).cancellationObserved,false);assert.equal(f.receipt.media.at(-1).event,'playerErrorsRaised');assert.equal(f.receipt.snapshots[0].state.current.element.error.code,2);
});
test('observes only Jet players including bounded pre-URL history',async()=>{
 const f=await fixture();f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kPlay'})}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'other',properties:[{name:'kURL',value:'https://example.org/other.mp3'}]});assert.equal(f.receipt.media.length,0);
 f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kLoad',url:assetURL})}]});
 assert.equal(f.receipt.media.length,2);assert.ok(f.receipt.media.every(x=>x.data.playerId==='p'));
});
test('event volume, unknown player histories, and huge values are bounded',async()=>{
 const f=await fixture();for(let i=0;i<10000;i++)f.emit('Media.playerEventsAdded',{playerId:'unknown'+i,events:[{value:'x'.repeat(20000)}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});for(let i=0;i<1000;i++)f.emit('Media.playerMessagesLogged',{playerId:'p',messages:[{message:'x'.repeat(20000)}]});
 for(let i=0;i<1000;i++)f.request('jet'+i);assert.ok(f.receipt.media.length<=256);assert.ok(f.receipt.network.length<=128);assert.ok(f.receipt.dropped.media>0);assert.ok(f.receipt.dropped.network>0);assert.ok(JSON.stringify(f.receipt).length<600000);
});
test('unavailable CDP and closed-page snapshots remain diagnostic failures',async()=>{
 const f=await fixture({fail:true});assert.equal(f.receipt.enabled,false);assert.match(f.receipt.diagnostics[0].error,/unsupported/);f.page.evaluate=async()=>{throw Error('page closed');};await f.observer.close();assert.match(f.receipt.snapshots[0].error,/page closed/);assert.equal(f.calls.at(-1),'close');
});
test('observer does not call playback, seek, network mutation, or schedule timers',async()=>{
 const f=await fixture();Object.defineProperty(f.media,'currentTime',{get:()=>1,set:()=>assert.fail('seek')});f.media.play=()=>assert.fail('play');f.media.pause=()=>assert.fail('pause');f.media.load=()=>assert.fail('load');await f.observer.snapshot('observe');assert.deepEqual(f.calls,['Network.enable','Media.enable']);
});
test('runner keeps historical workload and failure gates after reviewed capture updates',()=>{
 const runner=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
 const gate="page.on('requestfailed', r => mimeErrors.push(`request failed ${r.url()}: ${r.failure()?.errorText || 'unknown'}`));";
 assert.ok(runner.includes(gate));assert.ok(runner.includes("report.status = report.errors.length ? 'failed' : 'passed';"));
 let restored=runner;
 const revert=(current,prior)=>{assert.equal(restored.split(current).length,2);restored=restored.replace(current,prior);};
 // Reviewed capture updates since adc983c3: checkout identity, HTTP file serving,
 // atomic admission/intro and bounded failure diagnostics. Restore only these
 // explicit hunks before the unchanged historical workload/failure-gate hash.
 revert("// fixtures used by the numeric weapon tests.\nimport fs from 'node:fs';\nimport { captureSourceIdentity } from './lib/inkwave-capture-source-identity.mjs';\nimport { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\nimport {installAudioTimingObserver} from './lib/inkwave-audio-timing-observer.mjs';","// fixtures used by the numeric weapon tests.\nimport fs from 'node:fs';\nimport { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\nimport {installAudioTimingObserver} from './lib/inkwave-audio-timing-observer.mjs';");
 revert("\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\nconst sourceIdentity = captureSourceIdentity({ cwd: ROOT });\nconst option = (name, fallback) => {\n  const i = process.argv.indexOf(name);","\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\nconst option = (name, fallback) => {\n  const i = process.argv.indexOf(name);");
 revert("  if (!fs.existsSync(built) || hash(fs.readFileSync(built)) !== expected) throw new Error('Built artifact checksum mismatch: ' + file);\n}\nconst { serveProjectileCaptureFile } = await import('./lib/inkwave-projectile-http-file.mjs');\nconst mime = {\n  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',","  if (!fs.existsSync(built) || hash(fs.readFileSync(built)) !== expected) throw new Error('Built artifact checksum mismatch: ' + file);\n}\nconst mime = {\n  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',");
 revert("    if (file !== site && !file.startsWith(site + path.sep)) throw new Error('Path outside build');\n    if (!fs.statSync(file).isFile()) throw new Error('Not a file');\n    serveProjectileCaptureFile(req, res, file, mime);\n  } catch {\n    res.writeHead(404); res.end('Not found');","    if (file !== site && !file.startsWith(site + path.sep)) throw new Error('Path outside build');\n    if (!fs.statSync(file).isFile()) throw new Error('Not a file');\n    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });\n    fs.createReadStream(file).pipe(res);\n  } catch {\n    res.writeHead(404); res.end('Not found');");
 revert("  try {\n  const audioNetwork = [], audioSnapshots = [];\n  const audioReceipt = { ...sourceIdentity,\n    build: audioBuildManifestReceipt(site), network: audioNetwork, snapshots: audioSnapshots };\n  report.audioReadiness ||= [];","  try {\n  const audioNetwork = [], audioSnapshots = [];\n  const audioReceipt = { checkoutSha: process.env.GITHUB_SHA || null,\n    build: audioBuildManifestReceipt(site), network: audioNetwork, snapshots: audioSnapshots };\n  report.audioReadiness ||= [];");
 revert("        G.projectiles && G.renderer);\n    };\n    const playingReady = () => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;","        G.projectiles && G.renderer);\n    };\n    // SwiftShader may finish the transition between timer ticks. Probe once\n    // synchronously first, then retain the identical strict timed gate.\n    phaseMark('admission','begin');\n    await requireNativePhase(admissionReady, 'native Turf actor/controller admission');\n    phaseMark('admission','end');\n    const playingReady = () => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;");
 revert("        !m.attract && m.local?.isLocal && m.controller && G.projectiles && G.renderer);\n    };\n    // Admission and intro share one browser task: no redundant queued hop\n    // after admission succeeds. Incomplete admission polls without frame steps.\n    phaseMark('admission','begin');\n    phaseMark('intro','begin');\n    phaseMark('playing','begin');\n    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,playingReady,admissionReady),deadline,{receipt:phaseReceipt.atomicIntro={}});\n    phaseMark('admission','end');\n    phaseMark('intro','end');\n    phaseMark('playing','end');","        !m.attract && m.local?.isLocal && m.controller && G.projectiles && G.renderer);\n    };\n    phaseMark('intro','begin');\n    phaseMark('playing','begin');\n    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,playingReady),deadline);\n    phaseMark('intro','end');\n    phaseMark('playing','end');");
 revert("  } catch (error) {\n    const failedAt=Date.now();phaseReceipt.events.push({phase:'failure',event:'caught',atMs:failedAt,elapsedMs:failedAt-phaseReceipt.startedAtMs,remainingMs:Math.max(0,phaseReceipt.deadlineAtMs-failedAt)});\n    phaseReceipt.failureSnapshotRequestedAtMs=Date.now();\n    try {\n    const observed = await page.evaluate(() => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;\n      return { observedAtMs:Date.now(),atomicIntro:window.__iwProjectileAtomicIntroReceipt??null,\n        mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n        matchIdentity: m === G?.match, local: m?.local?.isLocal, controller: !!m?.controller, debug: !!g?.debug,\n        projectiles: !!G?.projectiles,","  } catch (error) {\n    const failedAt=Date.now();phaseReceipt.events.push({phase:'failure',event:'caught',atMs:failedAt,elapsedMs:failedAt-phaseReceipt.startedAtMs,remainingMs:Math.max(0,phaseReceipt.deadlineAtMs-failedAt)});\n    const observed = await page.evaluate(() => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;\n      return { mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n        matchIdentity: m === G?.match, local: m?.local?.isLocal, controller: !!m?.controller, debug: !!g?.debug,\n        projectiles: !!G?.projectiles,");
 revert("        bootError: document.querySelector('#boot-error')?.textContent };\n    }).catch(error => ({ snapshotFailure: error.message }));\n    phaseReceipt.failureSnapshotReturnedAtMs=Date.now();\n    await snapshotAudio('native-startup-timeout');\n    report.browserDiagnostics.push({ event: 'native-startup-timeout', mobile, observed });\n    } catch (diagnosticError) {\n      report.browserDiagnostics.push({event:'native-startup-diagnostics-failed',mobile,error:String(diagnosticError?.message||diagnosticError).slice(0,500)});\n    }\n    throw error;\n  }","        bootError: document.querySelector('#boot-error')?.textContent };\n    }).catch(error => ({ snapshotFailure: error.message }));\n    await snapshotAudio('native-startup-timeout');\n    report.browserDiagnostics.push({ event: 'native-startup-timeout', mobile, observed });\n    throw error;\n  }");
  revert('  const serverClosed = new Promise(resolve => server.close(resolve));', '  await new Promise(resolve => server.close(resolve));');
  revert('  await serverClosed;\n', '');
  revert(`    let visualFailed = false;
    try { await runVisuals(visual.page); }
    catch (error) { visualFailed = true; throw error; }
    finally {
      try { await visual.close(); }
      catch (cleanupError) {
        if (!visualFailed) throw cleanupError;
        report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'visual',
          error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
      }
    }`, '    try { await runVisuals(visual.page); } finally { await visual.close(); }');
  revert(`  try { await browser.close(); }
  catch (cleanupError) {
    report.browserDiagnostics.push({ event: 'browser-cleanup-failed',
      error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    if (report.status !== 'failed') {
      report.status = 'failed';
      report.error = String(cleanupError?.stack || cleanupError).slice(0, 4000);
    }
  }`, '  await browser.close();');
  // Remove the exception-safe cleanup hunks first; the original exact-byte
  // assertion below still protects every workload and failure-gate statement.
  revert('  try {\n  const audioNetwork = [], audioSnapshots = [];', '  const audioNetwork = [], audioSnapshots = [];');
  revert(`  return { context, page, close: streamedMusic.close };
  } catch (error) {
    try { await streamedMusic.close(); }
    catch (cleanupError) {
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'open', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
    throw error;
  }
}`, '  return { context, page, close: streamedMusic.close };\n}');
  revert('  let performanceFailed = false;\n  try {\n', '');
  revert(`  return record;
  } catch (error) {
    performanceFailed = true;
    throw error;
  } finally {
    try { await close(); }
    catch (cleanupError) {
      if (!performanceFailed) throw cleanupError;
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'performance', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
  }
}`, '  await close();\n  return record;\n}');
 revert("import { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\n",'');
 revert(`  const streamedMusicReceipt = { mobile };
  (report.streamedMusicDiagnostics ||= []).push(streamedMusicReceipt);
  const streamedMusic = await observeStreamedMusic({ context, page,
    assetURL: new URL(\`_versions/\${manifest.build.revision}/assets/audio/Jet_Arrow.mp3\`, address).href,
    receipt: streamedMusicReceipt });\n`,'');
 revert("  await streamedMusic.snapshot('native-playing-capture-ready');\n  return { context, page, close: streamedMusic.close };",'  return { context, page };');
 revert('  const { context, page, close } = await openGameContext({ mobile });','  const { context, page } = await openGameContext({ mobile });');
 revert('  await close();\n  return record;','  await context.close();\n  return record;');
 revert('finally { await visual.close(); }','finally { await visual.context.close(); }');
 assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),'1fc5fa3f71f92e5b267b3db306ae0112900f255231791780a01ecd4fd941f9d3','Removing observation-only hunks restores the exact 67db runner, including workload and error gate');
 assert.equal(runner.match(/await close\(\);/g).length,1);assert.equal(runner.match(/await visual.close\(\);/g).length,1);
});

test('snapshot cap is explicit and close failures keep their original rejection',async()=>{
 const f=await fixture();for(let i=0;i<20;i++)await f.observer.snapshot('bounded');assert.equal(f.receipt.snapshots.length,8);assert.equal(f.receipt.dropped.snapshots,12);
 f.context.close=async()=>{throw Error('close failed');};await assert.rejects(f.observer.close(),/close failed/);assert.ok(f.receipt.closeStartedAt);assert.ok(f.receipt.closeFinishedAt);
});

test('both harnesses explicitly resolve their actual game global and report missing bindings',async()=>{
 for(const ownerGlobal of ['__G','s3ProbeG']) {
  const f=await fixture({ownerGlobal});if(ownerGlobal==='s3ProbeG'){f.window.s3ProbeG=f.window.__G;delete f.window.__G;}
  await f.observer.snapshot('bound');assert.equal(f.receipt.snapshots[0].state.ownerGlobal,ownerGlobal);assert.equal(f.receipt.snapshots[0].state.ownerPresent,true);assert.equal(f.receipt.snapshots[0].state.musicPresent,true);assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);
  delete f.window[ownerGlobal];await f.observer.snapshot('unbound');assert.equal(f.receipt.snapshots[1].state.ownerPresent,false);assert.equal(f.receipt.snapshots[1].state.musicPresent,false);
 }
});

// Execute the verbatim runner functions with bounded Playwright API doubles.
// These test cleanup ownership, not browser playback or native game behavior.
const runnerSource=fs.readFileSync(process.env.INKWAVE_MEDIA_RUNNER_TEST_SOURCE || new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const functionText=(from,to)=>{
 const start=runnerSource.indexOf(from), end=runnerSource.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'runner function boundaries exist');return runnerSource.slice(start,end).trim();
};
const openText=functionText('async function openGameContext(', 'async function setCamera(');
const performanceText=functionText('async function runFiringPerformance(', '\ntry {\n  if (capture');
const summaryText=functionText('function summary(', 'async function runFiringPerformance(');
async function lifecycleFixture({failAt=null,closeFailure=false}={}) {
 const calls=[],events=new Map(), primary=new Error('injected '+failAt), cleanup=new Error('injected close');
 const report={browserDiagnostics:[],provenance:{},performanceWarmups:[],performanceFailures:[]};
 const state={__G:{music:{track:'battle',players:[]},match:{state:'playing'}}};
 const observed={nativeFrames:3,frameSamples:3,rafSamples:3,renderSamples:3,fireCalls:1,nonemptyProjectileUpdates:1,end:{inputMouseLeft:true,actorIntentFire:true}};
 const measured={elapsedMs:200,simulatedSeconds:.2,rAF:[16,16],nativeLoopTimestamps:[0,16,32],frameCpuMs:[1,1,1],projectileCpuMs:[1],renderCpuMs:[1,1,1],
  visualGeometryCpuMs:[0],visualBodies:[1],visualVertices:[3],visualOwnerCounts:[],nonemptyVisualRenders:3,visualBackend:'legacy-native',renderCalls:[1],triangles:[1],
  gpuRenderMs:[],gpuTimer:'unavailable',gpuDisjoint:false,maxProjectiles:1,projectileUpdates:3,nonemptyProjectileUpdates:3,fireCalls:1,renderer:{},game:{state:'playing'},browser:{viewport:[1280,720],dpr:1}};
 const cdp={on:(n,fn)=>events.set(n,fn),off:n=>events.delete(n),send:async name=>{
  calls.push(name);if(failAt==='performance-enable'&&name==='Performance.enable')throw primary;
  if(name==='Network.enable')events.get('Network.requestWillBeSent')?.({requestId:'jet',request:{url:assetURL,method:'GET',headers:{}},type:'Media'});
  if(name==='Tracing.end')events.get('Tracing.tracingComplete')?.({});return {metrics:[]};
 }};
 const page={on:()=>{},setDefaultTimeout:()=>{},isClosed:()=>false,bringToFront:async()=>{},
  addInitScript:async()=>{if(failAt==='open-init')throw primary;},goto:async()=>{if(failAt==='open-goto')throw primary;},
  waitForFunction:async()=>{if(failAt==='performance-warmup')throw primary;},evaluate:async(fn,arg)=>{
   if(arg?.ownerGlobal){calls.push('snapshot');return vm.runInNewContext('('+fn.toString()+')(arg)',{window:state,arg});}
   const text=fn.toString();
   if(text.includes('g.R.setDynamicScale')&&failAt==='open-placement')throw primary;
   if(text.includes('const G = window.__G, g = window.__inkwave, perf = window.__inkwavePerf, w = perf.warmup'))return observed;
   if(text.includes('window.__inkwavePerfDone'))return {status:failAt==='performance-window'?'failed':'passed'};
   if(text.includes('windowStatus: perf.windowStatus'))return measured;
   if(text==='() => navigator.userAgent')return 'bounded-double';
   return {};
  }};
 const context={newPage:async()=>page,newCDPSession:async()=>cdp,close:async()=>{
  calls.push('context-close');events.get('Network.loadingFailed')?.({requestId:'jet',errorText:'net::ERR_ABORTED',canceled:true});if(closeFailure)throw cleanup;
 }};
 const realm={browser:{newContext:async()=>context},report,observeStreamedMusic,sourceIdentity:{checkoutSha:'a'.repeat(40),eventSha:null,checkoutIdentityStatus:'verified-git-head'},manifest:{build:{revision:'rev'}},address:'http://127.0.0.1:9999/',
  URL,Date,setTimeout,clearTimeout,process:{env:{}},quality:'low',BOOT_SEED:1,NATIVE_BOOT_TIMEOUT_MS:50,MIN_PERFORMANCE_FRAMES:3,PERFORMANCE_TIMEOUT_MS:200,durationMs:50,
  installAudioTimingObserver(){},audioBuildManifestReceipt:()=>({}),audioDiagnosticURL:x=>x,audioReceiptSha256:()=>'',site:'/site',mimeErrors:[],
  startProjectileThroughMenu:async()=>{if(failAt==='open-menu')throw primary;},completeNativeTurfIntro(){},atomicIntroFunction(){},
  requireAtomicIntro:async()=>({intro:{},readiness:{},playingReady:true}),installProjectileCaptureRoster(){}};
 vm.createContext(realm);vm.runInContext(summaryText+'\n'+openText+'\n'+performanceText,realm);
 return {realm,report,calls,primary,cleanup,context,page};
}
const assertClosed=(f)=>{
 assert.equal(f.calls.filter(x=>x==='context-close').length,1,'one observed context close');
 const receipt=f.report.streamedMusicDiagnostics[0];assert.ok(receipt.closeStartedAt);assert.ok(receipt.closeFinishedAt);
 assert.equal(receipt.snapshots.at(-1).reason,'before-context-close');
 assert.equal(receipt.network.at(-1).phase,'context-close');assert.equal(receipt.network.at(-1).autoAccepted,false);
 assert.ok(f.calls.lastIndexOf('snapshot')<f.calls.indexOf('context-close'),'snapshot precedes context close');
};
for(const failAt of ['open-init','open-goto','open-menu','open-placement'])test('open route closes observed context after '+failAt+' and preserves the error',async()=>{
 const f=await lifecycleFixture({failAt});await assert.rejects(f.realm.openGameContext(),e=>e===f.primary);assertClosed(f);
});
for(const failAt of ['performance-enable','performance-warmup','performance-window'])test('performance route closes observed context after '+failAt,async()=>{
 const f=await lifecycleFixture({failAt});await assert.rejects(f.realm.runFiringPerformance(),e=>failAt==='performance-enable'?e===f.primary:/warmup|performance window/.test(e.message));assertClosed(f);
 if(failAt==='performance-warmup')assert.equal(f.report.performanceWarmups[0].admitted,false);
 if(failAt==='performance-window')assert.equal(f.report.performanceFailures.length,1);
});
test('successful opening transfers cleanup ownership and successful performance closes exactly once',async()=>{
 const f=await lifecycleFixture();const opened=await f.realm.openGameContext();assert.equal(f.calls.includes('context-close'),false);await opened.close();assertClosed(f);
 const p=await lifecycleFixture();const result=await p.realm.runFiringPerformance();assert.equal(result.scenario,'desktop-long-fire');assert.equal(result.warmup.admitted,true);assertClosed(p);
});
for(const failAt of ['open-goto','performance-enable'])test('secondary close error cannot replace '+failAt+' error',async()=>{
 const f=await lifecycleFixture({failAt,closeFailure:true});await assert.rejects(f.realm[failAt.startsWith('open')?'openGameContext':'runFiringPerformance'](),e=>e===f.primary);assertClosed(f);
 assert.equal(f.report.browserDiagnostics.at(-1).event,'streamed-music-cleanup-failed');assert.equal(f.report.browserDiagnostics.at(-1).error,f.cleanup.message);
});
test('normal performance close rejection remains a failure and is not retried',async()=>{
 const f=await lifecycleFixture({closeFailure:true});await assert.rejects(f.realm.runFiringPerformance(),e=>e===f.cleanup);assertClosed(f);
});

test('performance opening failure leaves cleanup with the opener and does not close twice',async()=>{
 const f=await lifecycleFixture({failAt:'open-goto'});await assert.rejects(f.realm.runFiringPerformance(),e=>e===f.primary);assertClosed(f);
});

const outerText=runnerSource.slice(runnerSource.indexOf("\ntry {\n  if (capture !== 'performance')"));
async function outerFixture({visualFailure=false,contextFailure=false,browserFailure=false,performanceFailure=false,requestFailure=false,longCleanup=false,serverPending=false}={}) {
 const primary=new Error('first capture failure'), secondary=new Error(longCleanup?'secondary context '+ 'x'.repeat(12000):'secondary context close'),
  tertiary=new Error(longCleanup?'secondary browser '+ 'x'.repeat(12000):'secondary browser close');
 let finishServer, persistedWhileServerPending=false;
 const writes=[],calls=[],report={errors:[],performance:[],screenshots:[],visualScenarios:[],browserDiagnostics:[]};
 const realm={capture:performanceFailure?'performance':'visuals',device:'desktop',mode:'diagnostic',report,
  mimeErrors:requestFailure?['request failed Jet_Arrow.mp3: net::ERR_ABORTED']:[],NATIVE_BOOT_TIMEOUT_MS:180000,evidence:'/evidence',process:{},
  path:{join:(...args)=>args.join('/')},console:{log(){}},fs:{writeFileSync:(p,b)=>writes.push({path:p,body:b})},
  browser:{close:async()=>{calls.push('browser-close');if(browserFailure)throw tertiary;}},server:{close:done=>{calls.push('server-close');if(serverPending)finishServer=done;else done();}},
  openGameContext:async()=>({page:{},close:async()=>{calls.push('context-close');if(contextFailure)throw secondary;}}),
  runVisuals:async()=>{calls.push('visual');if(visualFailure)throw primary;},
  runFiringPerformance:async()=>{calls.push('performance');if(performanceFailure)throw primary;return {};}};
 vm.createContext(realm);const completing=vm.runInContext('(async()=>{'+outerText+'})()',realm);
 if(serverPending){
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(typeof finishServer,'function','server close was initiated');
  persistedWhileServerPending=writes.some(x=>x.path.endsWith('/projectile-visuals-result.json'));
  finishServer();
 }
 await completing;
 const saved=writes.find(x=>x.path.endsWith('/projectile-visuals-result.json'));
 assert.ok(saved,'bounded result is persisted even on cleanup rejection');
 assert.equal(writes.length,2);assert.equal(calls.filter(x=>x==='browser-close').length,1);assert.equal(calls.at(-1),'server-close');
 return {report:JSON.parse(saved.body),primary,secondary,tertiary,calls,exitCode:realm.process.exitCode,persistedWhileServerPending};
}
for(const options of [
 {name:'normal',expected:'passed'},
 {name:'visual failure',visualFailure:true},
 {name:'visual and context close failure',visualFailure:true,contextFailure:true},
 {name:'visual and browser close failure',visualFailure:true,browserFailure:true},
 {name:'visual and both cleanup failures',visualFailure:true,contextFailure:true,browserFailure:true},
 {name:'performance and browser close failure',performanceFailure:true,browserFailure:true},
 {name:'normal capture then context close failure',contextFailure:true},
 {name:'normal capture then browser close failure',browserFailure:true},
 {name:'failed request then browser close failure',requestFailure:true,browserFailure:true},
])test('outer report preserves first failure and writes result: '+options.name,async()=>{
 const f=await outerFixture(options);assert.equal(f.report.status,options.expected||'failed');
 assert.equal(f.exitCode,options.expected==='passed'?undefined:1);
 if(options.visualFailure||options.performanceFailure)assert.equal(f.report.error,f.primary.stack);
 else if(options.contextFailure)assert.equal(f.report.error,f.secondary.stack);
 else if(options.browserFailure&&!options.requestFailure)assert.equal(f.report.error,f.tertiary.stack);
 if(options.requestFailure){assert.deepEqual(f.report.errors,['request failed Jet_Arrow.mp3: net::ERR_ABORTED']);assert.equal(f.report.error,undefined);}
 const cleanup=f.report.browserDiagnostics.filter(x=>x.event.endsWith('cleanup-failed'));
 assert.equal(cleanup.length,Number(!!(options.visualFailure&&options.contextFailure))+Number(!!options.browserFailure));
 if(options.visualFailure&&options.contextFailure)assert.equal(cleanup[0].route,'visual');
});
test('cleanup-only diagnostics are bounded and do not truncate an existing primary error',async()=>{
 const f=await outerFixture({visualFailure:true,contextFailure:true,browserFailure:true,longCleanup:true});
 assert.equal(f.report.error,f.primary.stack);assert.equal(f.report.browserDiagnostics.length,2);
 for(const row of f.report.browserDiagnostics)assert.equal(row.error.length,1000);
 const g=await outerFixture({browserFailure:true,longCleanup:true});assert.equal(g.report.status,'failed');assert.equal(g.report.error.length,4000);
});

test('browser close rejection persists result before a delayed server close callback',async()=>{
 const f=await outerFixture({browserFailure:true,serverPending:true});assert.equal(f.persistedWhileServerPending,true);
 assert.equal(f.report.status,'failed');assert.equal(f.exitCode,1);assert.equal(f.report.error,f.tertiary.stack);
});
