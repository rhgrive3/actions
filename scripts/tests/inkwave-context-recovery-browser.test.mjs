import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { nativeContextRecoveryProof, validateContextRecoveryReceipt, validateContextStartupReceipt, recoveryInputPath, contextMenuControlForPhase, installAudioRequestTrace, classifyContextRequestFailures, installContextMediaTrace, correlateContextMediaRequests } from '../check-inkwave-context-recovery-browser.mjs';
import { audioLoadScope } from '../../patches/splatoon3/runtime/audio/load-deadline.mjs';
import { readEncodedAudioResponse, EncodedAudioResponseError } from '../../patches/splatoon3/runtime/audio/encoded-response.mjs';
import { AuthorizedSamplePack } from '../../patches/splatoon3/runtime/audio/authorized-samples.mjs';
import { RealS3SampleLoader } from '../../patches/splatoon3/runtime/audio/real-s3-loader.mjs';
const proof = () => {
  const state = { time: 170, gameTime: 10, ticks: 600, frame: 602, paused: true, paintVersion: 7, counts: [20, 30], gridLength: 100, gridHash: 42, actors: [{ nid: 1, pos: [0, 0, 0], hp: 100, alive: true, respawnTimer: 0 }] };
  return { stages: ['paint-seeded', 'ordinary-pause-resume', 'context-lost', 'context-restored', 'terminal-restart-rejected'].map(stage => ({ stage })), realGPUEvents: true,
    lostEvent: { type: 'webglcontextlost', trusted: true }, restoredEvent: { type: 'webglcontextrestored', trusted: true }, seed: { area: 1 },
    lost: state, afterResumeAttempts: { ...state, counts: [...state.counts], actors: structuredClone(state.actors) },
    identities: { match: true, paint: true, grid: true, counts: true, overlay: true, everyGridByte: true },
    dialog: { count: 1, role: 'alertdialog', connected: true, buttons: 1 },
    terminal: { contextLost: true, glRestored: true, frozen: false, startResult: false, attractResult: false, observedRAF: 120, directFrames: 60 },
    ordinary: { before: { time: 171, gameTime: 9 }, paused: { time: 171, gameTime: 9, paused: true }, resumed: { time: 170, gameTime: 10, paused: false } } };
};
test('complete native receipt accepts ordinary progression and terminal stasis', () => assert.doesNotThrow(() => validateContextRecoveryReceipt(proof())));
test('real RAF proof retains 120 callbacks and allows software renderer scheduling latency', () => {
  const body=nativeContextRecoveryProof.toString();
  assert.match(body,/observation\.callbacks === 120/);
  assert.match(body,/\}, 45000\)/);
});
for (const key of ['time', 'gameTime', 'ticks', 'frame', 'paintVersion', 'gridLength', 'gridHash']) test(`receipt rejects terminal drift in ${key}`, () => {
  const r = proof(); r.afterResumeAttempts[key]++; assert.throws(() => validateContextRecoveryReceipt(r));
});
for (const key of ['match', 'paint', 'grid', 'counts', 'overlay', 'everyGridByte']) test(`receipt rejects replaced or changed ${key}`, () => {
  const r = proof(); r.identities[key] = false; assert.throws(() => validateContextRecoveryReceipt(r));
});
test('receipt rejects synthetic event, missing restoration, duplicate UI and frozen-only false pass', () => {
  for (const mutate of [r => r.lostEvent.trusted = false, r => r.restoredEvent.trusted = false, r => r.terminal.glRestored = false,
    r => r.dialog.count = 2, r => r.dialog.connected = false, r => r.terminal.frozen = true, r => r.stages.pop(),
    r => r.ordinary.resumed.time++, r => r.afterResumeAttempts.counts[0]++, r => r.terminal.startResult = true,
    r => r.terminal.observedRAF = 119, r => r.seed.area = 0, r => r.afterResumeAttempts.actors[0].pos[0] = 1]) {
    const r = proof(); mutate(r); assert.throws(() => validateContextRecoveryReceipt(r));
  }
});
test('source identity namespaces fail closed and keep exact required input mapping', () => {
  assert.equal(recoveryInputPath('upstream/src/main.js'), 'inkwave-public/src/main.js');
  assert.equal(recoveryInputPath('patch/runtime/clock.mjs'), 'patches/splatoon3/runtime/clock.mjs');
  assert.equal(recoveryInputPath('native-stages/runtime/engine.mjs'), 'patches/native-stages/runtime/engine.mjs');
  assert.throws(() => recoveryInputPath('unknown/test')); assert.throws(() => recoveryInputPath('patch/../test'));
});
test('native lane calls actual extension and emitted namespace, without synthesizing events or retrying', () => {
  const body = nativeContextRecoveryProof.toString();
  assert.match(body, /import\(new URL\('src\/core\/ctx.js', document.baseURI\)/);
  assert.match(body, /getExtension\('WEBGL_lose_context'\)/); assert.match(body, /extension\.loseContext\(\)/); assert.match(body, /extension\.restoreContext\(\)/);
  assert.doesNotMatch(body, /dispatchEvent|new Event\(/);
  assert.match(body, /g\.api\.startMatch/); assert.match(body, /pressStart\(\); g\.resume\(\)/);
  const script = fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /route\.fetch|retries\s*:|retry\(/);
  assert.match(script, /startupDeadline = Date.now\(\) \+ 180000/); assert.match(script, /timeout: 30000/);
});

test('startup requires one trusted native START and actual recorded audio admission', () => {
  const startup = () => ({ route: 'native-menu-start', gestures: [{ type: 'click', trusted: true, selector: '.iw-setup [data-id="start"].iw-btn--start' }],
    events: [{ event: 'native-start-clicked', attempt: 1 }], admission: { mode: 'match', state: 'playing', attract: false, local: true, sameMatch: true, audioState: 'running', recordedShooterFire: true } });
  assert.doesNotThrow(() => validateContextStartupReceipt(startup()));
  for (const change of [r => r.gestures[0].trusted = false, r => r.gestures.push(r.gestures[0]), r => r.events[0].attempt = 2,
    r => r.admission.state = 'intro', r => r.admission.audioState = 'suspended', r => r.admission.recordedShooterFire = false,
    r => r.admission.sameMatch = false, r => r.admission.attract = true]) {
    const r = startup(); change(r); assert.throws(() => validateContextStartupReceipt(r));
  }
});
test('startup uses shipped trusted menu helper, not a direct match/audio bypass', () => {
  const script = fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs', import.meta.url), 'utf8');
  const startup = script.slice(script.indexOf("await page.goto('http"), script.indexOf('const proof = await page.evaluate(nativeContextRecoveryProof)'));
  assert.match(startup, /startProjectileThroughMenu\(page/); assert.match(startup, /rangeMenuControlReady/);
  assert.match(startup, /trusted: event\.isTrusted/); assert.match(startup, /recordedShooterFire:/);
  assert.doesNotMatch(startup, /\.startMatch\(|requireRecordedMainShot\(|\.resume\(|\.init\(|wipe\.cancel/);
});

test('shared menu phases retain strict context-recovery control admission and reject unknown labels', () => {
  const expected = {
    'native main menu readiness': { selector: '.iw-main [data-id="play"]', menu: 'main' },
    'native mode menu': { selector: '.iw-modesel [data-id="mode-turf"]', menu: 'mode' },
    'native turf pointer readiness': { selector: '.iw-modesel [data-id="mode-turf"]', menu: 'mode' },
    'native setup menu': { selector: '.iw-setup [data-id="map-tidewater"]', menu: 'setup' },
  };
  for (const [label, control] of Object.entries(expected)) assert.deepEqual(contextMenuControlForPhase(label), control);
  for (const bad of ['unknown', 'toString', '__proto__', '']) assert.throws(() => contextMenuControlForPhase(bad), /Unknown native menu phase/);
  const script=fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs',import.meta.url),'utf8');
  assert.match(script,/const control = contextMenuControlForPhase\(label\)/);
  assert.match(script,/page\.waitForFunction\(rangeMenuControlReady, control, \{ timeout: remainingMs\(\) \}\)/);
});

test('actual context loss waits for bounded audio-network quiet without suppressing failures', () => {
  const script=fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs',import.meta.url),'utf8');
  const proof=nativeContextRecoveryProof.toString();
  assert.match(proof,/const audioIdle = globalThis\.__awaitContextRecoveryAudioIdle;/);
  assert.match(proof,/check\(typeof audioIdle === 'function'/);
  assert.match(proof,/await audioIdle\(\);/);
  assert(proof.indexOf('await audioIdle();') < proof.indexOf("extension.loseContext()"), 'audio must settle before intentional GL loss');
  for(const contract of [
    "page.on('request', r => { if (audioRequest(r)) pendingAudio.add(r); })",
    "page.on('requestfinished', r => pendingAudio.delete(r))",
    "page.on('requestfailed', r => { pendingAudio.delete(r);",
    "await page.exposeFunction('__awaitContextRecoveryAudioIdle'",
    'const deadline = Date.now() + 30000',
    'if (now - quietSince >= 750) break',
    "assert.deepEqual(requestClassification.unexpected, [], 'Audio startup produced unexplained failed network requests')",
    "assert.deepEqual(httpFailures, [], 'Audio startup returned HTTP errors')",
    "assert.deepEqual(errors, []); assert.deepEqual(requestClassification.unexpected, []); assert.deepEqual(httpFailures, []); assert.deepEqual(events, [])"
  ]) assert(script.includes(contract),'missing network/lifecycle guard: '+contract);
  assert.doesNotMatch(script,/ignore(?:RequestFailure|NetworkError)|(?:net::)?ERR_ABORTED\s*\)?\s*continue/);
});


test('audio trace preserves fetch/read results while exposing exact owner cancellation and bounded records', async()=>{
  const env=globalThis,stream=ReadableStream.prototype,reader=ReadableStreamDefaultReader.prototype,controller=AbortController.prototype;
  const old={fetch:env.fetch,getReader:stream.getReader,streamCancel:stream.cancel,read:reader.read,readerCancel:reader.cancel,release:reader.releaseLock,body:Object.getOwnPropertyDescriptor(Response.prototype,'body'),abort:controller.abort,RG:env.RG,trace:env.__audioRequestTrace,snapshot:env.__contextAudioOwnerSnapshot};
  let current,throwFetch=false,lastRead,dispatcher=null;const nativeThrow=new Error('native fetch throw');
  env.fetch=(...args)=>{if(throwFetch)throw nativeThrow;return dispatcher?dispatcher(...args):current;};
  // Record the exact native promise before the observer wraps read().
  reader.read=function(...args){return lastRead=Reflect.apply(old.read,this,args);};
  const makeResponse=(chunks,never=false,href='https://example.test/runtime/audio/s3-real/test.mp3')=>{let i=0;const response=new Response(new ReadableStream({pull(c){if(i<chunks.length)c.enqueue(chunks[i++]);else if(!never)c.close();}}),{status:200});Object.defineProperty(response,'url',{value:href});return response;};
  const url=new URL('https://example.test/runtime/audio/s3-real/test.mp3');
  try{
    installAudioRequestTrace();const trace=env.__audioRequestTrace,events=()=>trace.map(row=>row.event);
    let scope=audioLoadScope(1000),response=makeResponse([new Uint8Array([1,2,3])]);current=Promise.resolve(response);
    assert.equal(env.fetch(url,{signal:scope.signal}),current,'native URL-object fetch promise identity');
    await current;const body=await readEncodedAudioResponse(response,8,{scope});
    assert.deepEqual([...new Uint8Array(body)],[1,2,3]);assert(events().includes('body'));assert(events().includes('get-reader'));assert(events().includes('read-call'));assert(trace.some(row=>row.event==='reader-release'&&row.encodedBodyCompleted));assert(!events().some(name=>/abort|cancel/.test(name)));scope.finish();
    trace.length=0;scope=audioLoadScope(1000);response=makeResponse([new Uint8Array(9)]);current=Promise.resolve(response);await env.fetch(url,{signal:scope.signal});
    await assert.rejects(readEncodedAudioResponse(response,8,{scope}),EncodedAudioResponseError);
    assert(events().includes('reader-cancel'));assert(events().includes('controller-abort'));assert(events().includes('signal-abort'));assert(trace.find(x=>x.event==='reader-cancel').stack.includes('encoded-response.mjs'));scope.finish();
    trace.length=0;scope=audioLoadScope(1000);response=makeResponse([],true);current=Promise.resolve(response);await env.fetch(url,{signal:scope.signal});
    const r=response.body.getReader(),nativePending=r.read();assert.equal(nativePending,lastRead,'read promise remains exactly native');
    const reason=new Error('fixture owner retired');scope.cancel(reason);await r.cancel(reason);await nativePending;
    assert(events().includes('controller-abort'));assert(events().includes('signal-abort'));assert.equal(trace.find(x=>x.event==='reader-cancel').reason.message,'fixture owner retired');scope.finish();
    trace.length=0;const readFailure=new Error('native stream rejection');response=new Response(new ReadableStream({start(c){c.error(readFailure);}}));Object.defineProperty(response,'url',{value:url.href});current=Promise.resolve(response);await env.fetch(url);
    const rejectedReader=response.body.getReader(),rejectedRead=rejectedReader.read();assert.equal(rejectedRead,lastRead);await assert.rejects(rejectedRead,error=>error===readFailure);assert(events().includes('read-call'));assert(!events().some(name=>/abort|cancel/.test(name)));rejectedReader.releaseLock();
    trace.length=0;const rejected=new Error('native fetch rejection');current=Promise.reject(rejected);assert.equal(env.fetch(url),current);await assert.rejects(current,error=>error===rejected);
    throwFetch=true;assert.throws(()=>env.fetch(url),error=>error===nativeThrow);throwFetch=false;
    trace.length=0;response=makeResponse([new Uint8Array([5])]);current=Promise.resolve(response);assert.equal(env.fetch('https://example.test/other'),current);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[5]);assert.equal(trace.length,0);
    // Actual loader passes URL objects through sameModuleFetch, not string paths.
    trace.length=0;const realContext={state:'running',sampleRate:8000,decodeAudioData:async()=>({duration:.01,length:80,numberOfChannels:1,sampleRate:8000})};
    const pack=new AuthorizedSamplePack(realContext),realBank={ctx:realContext,authorized:pack,disposed:false};
    const fakeManifest={schema:1,usageRights:'Synthetic fixture only',clips:[{id:'combat:damage',event:'fire',variant:0,file:'s3-real/fixture.mp3'}]};
    dispatcher=input=>Promise.resolve(String(input).endsWith('real-s3-installed.json')?new Response(JSON.stringify(fakeManifest)):makeResponse([new Uint8Array([1,2,3])],false,String(input)));
    const realLoader=new RealS3SampleLoader(realBank,{fetcher:env.fetch});const loaded=await realLoader.ensure('combat:damage','fire');
    assert.equal(loaded.loaded,1);assert.equal(pack.byEvent.has('combat:damage:fire'),true);
    assert(trace.some(row=>row.event==='fetch-start' && row.url.endsWith('/s3-real/fixture.mp3')),'actual URL-object loader is observed');
    assert(trace.some(row=>row.event==='reader-release'&&row.encodedBodyCompleted),'actual encoded reader completed');dispatcher=null;pack.clear();

    const context={state:'running'},bank={ctx:context,authorized:{generation:3,pending:0,loaded:new Map([['one',{id:'combat:damage',event:'fire',variant:0,file:'a.mp3',sha256:'abc'}],['two',{id:'combat:damage',event:'fire',variant:1,file:'b.mp3'}]])}},loader={bank,status:'ready',inFlight:new Map(),errors:[],declares:()=>true};
    env.RG={audio:{ctx:context,_weaponBank:bank,_realS3Loader:loader}};const first=env.__contextAudioOwnerSnapshot(),second=env.__contextAudioOwnerSnapshot();
    assert.equal(first.context,second.context);assert.equal(first.bank,second.bank);assert.equal(first.loader,second.loader);assert.deepEqual(first.cues.find(c=>c.id==='combat:damage').variants.map(v=>v.variant),[0,1]);env.RG.audio.ctx={state:'running'};assert.notEqual(env.__contextAudioOwnerSnapshot().context,first.context);
    trace.length=0;for(let i=0;i<700;i++){current=Promise.resolve(new Response(null));await env.fetch(url);}assert.equal(trace.length,512,'diagnostic event array is bounded');
  }finally{
    env.fetch=old.fetch;stream.getReader=old.getReader;stream.cancel=old.streamCancel;reader.read=old.read;reader.cancel=old.readerCancel;reader.releaseLock=old.release;Object.defineProperty(Response.prototype,'body',old.body);controller.abort=old.abort;
    if(old.RG===undefined)delete env.RG;else env.RG=old.RG;
    if(old.trace===undefined)delete env.__audioRequestTrace;else env.__audioRequestTrace=old.trace;
    if(old.snapshot===undefined)delete env.__contextAudioOwnerSnapshot;else env.__contextAudioOwnerSnapshot=old.snapshot;
  }
});


test('audio trace cannot suppress native unhandled fetch or read rejections',()=>{
  const harness=new URL('../check-inkwave-context-recovery-browser.mjs',import.meta.url).href;
  const program=`import {installAudioRequestTrace} from ${JSON.stringify(harness)};
    const events=[];process.on('unhandledRejection',e=>events.push(e.message));
    const url='https://example.test/runtime/audio/s3-real/unhandled.mp3';
    globalThis.fetch=()=>Promise.reject(new Error('native fetch unhandled'));installAudioRequestTrace();fetch(url);
    const response=new Response(new ReadableStream({start(c){c.error(new Error('native read unhandled'));}}));
    Object.defineProperty(response,'url',{value:url});response.body.getReader().read();
    setTimeout(()=>console.log(JSON.stringify(events)),25);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout.trim()).sort(),['native fetch unhandled','native read unhandled']);
});

// Actual run remains failed. This fixture verifies only its newly observed
// expected retirement, never retroactively changes CI or proves GL recovery.
const retirementFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/context-media-retirement-5a1c-41158474432.json',import.meta.url),'utf8'));
const classifyFixture=f=>classifyContextRequestFailures({requests:f.requests,ledger:f.audioRequestLedger,diagnostics:f.requestDiagnostics,mediaTrace:f.mediaTrace,expectedMenuURL:f.expectedMenuURL});
const editEvent=(f,name,edit,ordinal=0)=>{const events=f.mediaTrace.records.filter(e=>e.element===1&&e.event===name);assert(events[ordinal],name);edit(events[ordinal]);};
test('actual complete request623/element1/owner2 normal fade retirement is classified without discarding raw failure',()=>{
 const before=structuredClone(retirementFixture),r=classifyFixture(retirementFixture);assert.deepEqual(retirementFixture,before);assert.equal(retirementFixture.provenance.actualResultOK,false);
 assert.deepEqual(r.unexpected,[]);assert.equal(r.expectedRetirements.length,1);assert.equal(r.expectedRetirements[0].id,623);assert.equal(r.expectedRetirements[0].element,1);assert.equal(r.expectedRetirements[0].owner,2);assert.equal(retirementFixture.requests.length,1);
});
const retirementNegatives={
 'snapshot diagnostic error':f=>f.mediaTrace.diagnosticError='snapshot collection failed',
 'initial different media source':f=>editEvent(f,'src-set-after',e=>e.src='https://example.test/other.mp3'),
 'unavailable trace':f=>f.mediaTrace.available=false,
 'incomplete hooks':f=>f.mediaTrace.hooks.load=false,
 'missing hook receipt':f=>delete f.mediaTrace.hooks,
 'incomplete trace':f=>f.mediaTrace.evidenceComplete=false,
 'dropped media records':f=>f.mediaTrace.dropped=1,
 'dropped ledger rows':f=>f.mediaTrace.ledgerDropped=1,
 'raw collector cap':f=>{while(f.requests.length<32)f.requests.push(structuredClone(f.requests[0]));},
 'diagnostic collector cap':f=>{while(f.requestDiagnostics.length<64)f.requestDiagnostics.push({event:'other'});},
 'ledger collector cap':f=>{while(f.audioRequestLedger.length<512)f.audioRequestLedger.push({terminal:'finished'});},
 'media collector cap':f=>{while(f.mediaTrace.records.length<512)f.mediaTrace.records.push({element:99});},
 'connection reset':f=>f.requests[0].error='net::ERR_CONNECTION_RESET',
 'generic failed request':f=>f.requests[0].error='net::ERR_FAILED',
 'different URL':f=>f.requests[0].url+='?different',
 'no expected menu identity':f=>f.expectedMenuURL=null,
 'fetch is not HTML media':f=>f.audioRequestLedger[0].resourceType='fetch',
 'context loss cancellation':f=>f.audioRequestLedger[0].phase='context-proof',
 'duplicate ledger request identity':f=>f.audioRequestLedger.push({...f.audioRequestLedger[1],id:623}),
 'request id mismatch':f=>f.audioRequestLedger[0].id=999,
 'request error mismatch':f=>f.audioRequestLedger[0].error='net::ERR_FAILED',
 'request failure before retire':f=>f.audioRequestLedger[0].endedAt-=10000,
 'failed diagnostic id mismatch':f=>f.requestDiagnostics[0].id=999,
 'failed diagnostic URL mismatch':f=>f.requestDiagnostics[0].url+='?other',
 'failed diagnostic error mismatch':f=>f.requestDiagnostics[0].failure='net::ERR_FAILED',
 'same URL second element':f=>{const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1));e.element=99;e.src=f.expectedMenuURL;f.mediaTrace.records.push(e);},
 'same element different owner':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].owner=99),
 'same owner different engine':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].engine=99),
 'failed owner cleanup':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].failed=true),
 'active current owner':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].current=true),
 'preload cancellation':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].preloaded=true),
 'no track transition':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].desiredTrack='menu'),
 'no completed fade':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].pausedAfterFade=false),
 'different fade receipt':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].stopAt+=1),
 'no scheduled fade':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].stopAt=null),
 'not disposed':f=>editEvent(f,'removeAttribute-before',e=>e.owners[0].disposed=false),
 'native media error':f=>editEvent(f,'media-canplay',e=>{e.mediaError={code:2,message:'network failure'};}),
 'other active element media error':f=>{const e=structuredClone(f.mediaTrace.records.find(e=>e.element===4));e.event='media-error';e.mediaError={code:3,message:'battle decode failure'};f.mediaTrace.records.push(e);},
 'native error event':f=>{const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1));e.event='media-error';f.mediaTrace.records.push(e);},
 'abort before normal chain':f=>{const i=f.mediaTrace.records.findIndex(e=>e.element===1&&e.event==='pause-before');const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1&&e.event==='media-abort'));e.wall=f.mediaTrace.records[i].wall;e.mono=f.mediaTrace.records[i].mono;f.mediaTrace.records.splice(i,0,e);},
 'abort after normal chain':f=>{const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1&&e.event==='media-abort'));f.mediaTrace.records.push(e);},
 'manual pause instead of native fade timer':f=>editEvent(f,'pause-before',e=>e.stack='unrelatedManualPause'),
 'negative stop clock':f=>{for(const e of f.mediaTrace.records)for(const o of e.owners||[])if(o.stopAt!==null)o.stopAt=-1;},
 'source switched before disposal':f=>{const i=f.mediaTrace.records.findIndex(e=>e.element===1&&e.event==='pause-before');const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1&&e.event==='src-set-after'));e.wall=f.mediaTrace.records[i].wall;e.mono=f.mediaTrace.records[i].mono;e.src='https://example.test/other.mp3';f.mediaTrace.records.splice(i,0,e);},
 'canplay after fade pause':f=>{const i=f.mediaTrace.records.findIndex(e=>e.element===1&&e.event==='pause-after');const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1&&e.event==='media-canplay'));e.wall=f.mediaTrace.records[i].wall;e.mono=f.mediaTrace.records[i].mono;f.mediaTrace.records.splice(i+1,0,e);},
 'missing fade pause':f=>{const i=f.mediaTrace.records.findIndex(e=>e.element===1&&e.event==='pause-before');f.mediaTrace.records.splice(i,1);},
 'missing src remove':f=>{f.mediaTrace.records=f.mediaTrace.records.filter(e=>e.event!=='removeAttribute-before');},
 'missing unload':f=>{f.mediaTrace.records=f.mediaTrace.records.filter(e=>!(e.element===1&&e.event==='load-before'));},
 'missing native abort':f=>{f.mediaTrace.records=f.mediaTrace.records.filter(e=>e.event!=='media-abort');},
 'missing native emptied':f=>{f.mediaTrace.records=f.mediaTrace.records.filter(e=>!(e.element===1&&e.event==='media-emptied'));},
 'native cancellation without normal retire stack':f=>editEvent(f,'load-before',e=>e.stack='unrelated caller'),
 'src still attached':f=>editEvent(f,'removeAttribute-after',e=>e.src=f.expectedMenuURL),
 'src reselected after retire':f=>{const e=structuredClone(f.mediaTrace.records.find(e=>e.element===1&&e.event==='media-abort'));e.event='src-set-after';e.src=f.expectedMenuURL;f.mediaTrace.records.push(e);},
 'time reverse':f=>editEvent(f,'load-before',e=>e.wall-=10000),
 'monotonic clock reverse':f=>editEvent(f,'load-before',e=>e.mono-=10000),
 'same URL parallel requests':f=>editEvent(f,'load-before',e=>{e.inflightRequestIDs.push(999);e.requestCorrelation='ambiguous';}),
 'wrong correlated request':f=>editEvent(f,'load-before',e=>e.inflightRequestIDs=[999]),
 'duplicate raw failure':f=>f.requests.push(structuredClone(f.requests[0])),
 'ledger failure without raw failure':f=>f.audioRequestLedger.push({...f.audioRequestLedger[0],id:999,url:'https://example.test/unrecorded.mp3'}),
 'raw failure without ledger':f=>f.requests.push({url:'https://example.test/unrecorded.mp3',error:'net::ERR_ABORTED'}),
};
for(const [name,mutate]of Object.entries(retirementNegatives))test('retirement classification remains fail-closed: '+name,()=>{
 const f=structuredClone(retirementFixture);mutate(f);const r=classifyFixture(f);assert.ok(r.unexpected.length>0,name+' must retain failure');
});
test('no failure remains the original empty acceptance; raw and ledger disagreement cannot pass',()=>{
 assert.deepEqual(classifyContextRequestFailures({requests:[]}).unexpected,[]);
 const f=structuredClone(retirementFixture);f.requests=[];assert.ok(classifyFixture(f).unexpected.length>0);
});
test('both browser guards classify fresh evidence while raw failures and HTTP/pageerror/crash guards remain recorded',()=>{
 const script=fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs',import.meta.url),'utf8');
 assert(script.includes('requestClassification=classifyObservedRequests(preLossMedia)'));
 assert(script.includes('requestClassification=classifyObservedRequests(finalMedia)'));
 assert(script.includes('errors, requests, requestDiagnostics, httpFailures'));
 assert(script.includes("assert.deepEqual(httpFailures, [], 'Audio startup returned HTTP errors')"));
 assert(script.includes('assert.deepEqual(errors, []); assert.deepEqual(requestClassification.unexpected, []); assert.deepEqual(httpFailures, []); assert.deepEqual(events, [])'));
});

test('native media error remains a failure even when no requestfailed row exists',()=>{const f=structuredClone(retirementFixture);f.requests=[];f.audioRequestLedger=[];f.requestDiagnostics=[];f.mediaTrace.records.push({event:'media-error',element:4,mediaError:{code:3,message:'decode'}});assert.ok(classifyFixture(f).unexpected.length>0);});

for(const fading of [false,true])test('same-owner healthy canplay repetition before fade pause is a harmless readiness transition '+fading,()=>{
 const f=structuredClone(retirementFixture),events=f.mediaTrace.records,i=events.findIndex(e=>e.element===1&&e.event==='pause-before'),e=structuredClone(events.find(e=>e.element===1&&e.event==='media-canplay'));
 e.wall=events[i].wall-1;e.mono=events[i].mono-.1;
 if(fading){e.owners[0].current=false;e.owners[0].desiredTrack=null;e.owners[0].stopAt=events[i].owners[0].stopAt;}
 events.splice(i,0,e);const r=classifyFixture(f);assert.deepEqual(r.unexpected,[]);assert.equal(r.expectedRetirements.length,1);
});


test('same observer resolves projectile __G music ownership without a separate weaker trace',()=>{
 const source=installContextMediaTrace.toString(),c=vm.createContext({});
 vm.runInContext(`class Element{removeAttribute(){}}class HTMLMediaElement extends Element{constructor(){super();this.listeners=[];this._src='';}addEventListener(){}pause(){}load(){}get src(){return this._src;}set src(v){this._src=v;}}globalThis.Element=Element;globalThis.HTMLMediaElement=HTMLMediaElement;globalThis.element=new HTMLMediaElement();globalThis.__G={music:{players:[{element,id:'menu',disposed:false,failed:false}],current:null}};(${source})();element.src='https://example.test/menu.mp3';`,c);
 const r=vm.runInContext('__contextMediaTraceSnapshot()',c);assert.equal(r.records.at(-1).owners.length,1);assert.equal(r.records.at(-1).owners[0].track,'menu');
});
const projectileSource=()=>fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
async function projectileMediaMock({priorErrors=[],snapshot=structuredClone(retirementFixture.mediaTrace),failure='net::ERR_ABORTED'}={}){
 const source=projectileSource(),a=source.indexOf('  const mediaRequestIDs='),b=source.indexOf('  await page.addInitScript(installContextMediaTrace);',a);
 assert(a>=0&&b>a);let body=source.slice(a,b);
 // Only metadata disk I/O is replaced; actual listener/observer/binding bodies run.
 body=body.replace(/helperSha256:hash\(fs\.readFileSync\(new URL\('\.\/check-inkwave-context-recovery-browser\.mjs',import\.meta\.url\)\)\)/,'helperSha256:"mock-only"');
 assert(!body.includes('import.meta'));
 const page=new EventEmitter(),errors=priorErrors.slice(),indices=new Map(),report={browserDiagnostics:[]};let closes=0;
 page.evaluate=async()=>snapshot;
 const url=retirementFixture.expectedMenuURL,origin=new URL(url).origin,revision=new URL(url).pathname.split('/')[2];
 const context=vm.createContext({page,mimeErrors:errors,mediaRetirementErrorIndices:indices,report,mobile:false,address:origin+'/',manifest:{build:{revision},artifacts:{}},URL,
  classifyContextRequestFailures,correlateContextMediaRequests,streamedMusic:{close(){closes++;return 'closed';}},clock:retirementFixture.audioRequestLedger[0].startedAt});
 context.Date=class extends Date{static now(){return context.clock;}};
 vm.runInContext('let closeObservedMedia=streamedMusic.close;'+body+';globalThis.controls={close:closeObservedMedia,observe:observeMediaRetirements,bindings:mediaErrorBindings,ledger:mediaLedger,receipt:mediaReceipt,setPhase(v){mediaPhase=v;}};',context);
 const request={url:()=>url,resourceType:()=> 'media',failure:()=>({errorText:failure})};
 page.emit('request',request);context.clock=retirementFixture.audioRequestLedger[0].endedAt;page.emit('requestfailed',request);
 return {errors,indices,page,request,controls:context.controls,async close(){const result=await context.controls.close();return {result,closes};},unexplained:()=>errors.filter((error,index)=>!indices.has(index)||indices.get(index)!==error)};
}
test('projectile uses the exact shared exports and retains its original strict requestfailed body',()=>{
 const s=projectileSource(),before=fs.readFileSync(new URL('./fixtures/projectile-media-listener-before5a1c.mjs.txt',import.meta.url),'utf8');
 assert(s.includes(before));assert(s.includes("import {installContextMediaTrace,correlateContextMediaRequests,classifyContextRequestFailures} from './check-inkwave-context-recovery-browser.mjs'"));
 assert(s.includes('await page.addInitScript(installContextMediaTrace)'));assert(s.includes('report.rawBrowserErrors=mimeErrors.slice()'));
 assert(s.includes('mimeErrors.filter((error,index)=>!mediaRetirementErrorIndices.has(index)||mediaRetirementErrorIndices.get(index)!==error)'));
 assert(s.includes('for(const error of unexplainedBrowserErrors())if(!report.errors.includes(error))report.errors.push(error)'));
});
test('projectile binds only the exact original error index; equal earlier URL/error remains fatal',async()=>{
 const message=`request failed ${retirementFixture.expectedMenuURL}: net::ERR_ABORTED`,f=await projectileMediaMock({priorErrors:[message]});
 assert.equal(f.errors.length,2);const c=await f.close();assert.equal(c.result,'closed');assert.equal(c.closes,1);assert.equal(f.indices.size,1);assert.equal(f.indices.has(0),false);assert.equal(f.indices.has(1),true);assert.equal(f.unexplained().length,1);assert.equal(f.errors.length,2);
});
test('projectile without a prior error classifies its sole observed retire while preserving raw data',async()=>{
 const f=await projectileMediaMock();await f.close();assert.equal(f.errors.length,1);assert.equal(f.unexplained().length,0);assert.equal(f.controls.receipt.classification.expectedRetirements.length,1);assert.equal(f.controls.receipt.rawFailures.length,1);
});
test('projectile incomplete/ambiguous snapshots, missing binding, changed error and genuine failure remain fatal',async()=>{
 for(const mutate of [s=>s.dropped=1,s=>s.hooks.load=false,s=>s.records.find(e=>e.event==='load-before'&&e.element===1).owners[0].failed=true]){
  const snapshot=structuredClone(retirementFixture.mediaTrace);mutate(snapshot);const f=await projectileMediaMock({snapshot});await f.close();assert.ok(f.unexplained().length>0);
 }
 const missing=await projectileMediaMock();missing.controls.bindings.length=0;await missing.close();assert.ok(missing.unexplained().length>0);
 const changed=await projectileMediaMock();changed.errors[0]='different actual error';await changed.close();assert.ok(changed.unexplained().length>0);
 const network=await projectileMediaMock({failure:'net::ERR_CONNECTION_RESET'});await network.close();assert.ok(network.unexplained().length>0);
});

test('projectile fresh incomplete observation revokes its own earlier index receipt',async()=>{
 const snapshot=structuredClone(retirementFixture.mediaTrace),f=await projectileMediaMock({snapshot});await f.close();assert.equal(f.unexplained().length,0);
 snapshot.dropped=1;await f.controls.observe('contradictory-later-snapshot');assert.equal(f.indices.size,0);assert.equal(f.unexplained().length,1);assert.equal(f.errors.length,1);
});

test('projectile stale concurrent snapshot cannot revive a revoked index receipt',async()=>{
 const snapshot=structuredClone(retirementFixture.mediaTrace),f=await projectileMediaMock({snapshot});await f.close();assert.equal(f.unexplained().length,0);
 let release;f.page.evaluate=()=>new Promise(resolve=>{release=resolve;});const old=f.controls.observe('older-pending');
 f.page.evaluate=async()=>({...snapshot,dropped:1});await f.controls.observe('newer-incomplete');release(snapshot);await old;
 assert.equal(f.indices.size,0);assert.equal(f.unexplained().length,1);assert.equal(f.controls.receipt.label,'newer-incomplete');
});

test('projectile inconsistent extra ledger failure cannot be hidden by a separate known menu receipt',async()=>{
 const f=await projectileMediaMock();f.controls.ledger.push({...f.controls.ledger[0],id:999,url:'https://example.test/unmatched.mp3'});await f.close();
 assert.ok(f.controls.receipt.classification.unexpected.length>0);assert.equal(f.indices.size,0);assert.equal(f.unexplained().length,1);
});
