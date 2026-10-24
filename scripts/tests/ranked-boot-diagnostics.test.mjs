import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {publicBuildIdentity,verifyPublishedSource,verifyPublicResponse} from '../lib/inkwave-public-boot-evidence.mjs';
import {criticalBootRequest,rankedBootState,observeRankedBoot,rankedHttpFailureDetails} from '../lib/ranked-boot-diagnostics.mjs';
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
test('dedicated ranked CI runs diagnostics and tracks both new paths',()=>{const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-ranked.yml',import.meta.url),'utf8');assert(w.includes('run: node --test scripts/tests/ranked-boot-diagnostics.test.mjs'));for(const p of ['scripts/lib/ranked-boot-diagnostics.mjs','scripts/tests/ranked-boot-diagnostics.test.mjs'])assert.equal(w.split("- '"+p+"'").length-1,2);assert(w.includes('timeout-minutes: 25'));assert(w.includes('contents: read'));});

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
