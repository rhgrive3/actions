import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { nativeContextRecoveryProof, validateContextRecoveryReceipt, validateContextStartupReceipt, recoveryInputPath, contextMenuControlForPhase, installAudioRequestTrace } from '../check-inkwave-context-recovery-browser.mjs';
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
    "const acceptedMenuTrackAbort = request =>",
    "request.error === 'net::ERR_ABORTED'",
    "requests.filter(request=>!acceptedMenuTrackAbort(request))",
    "assert.deepEqual(httpFailures, [], 'Audio startup returned HTTP errors')",
    "assert.deepEqual(errors, []); verifyLiveRequests(); assert.deepEqual(httpFailures, []); assert.deepEqual(events, [])"
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
