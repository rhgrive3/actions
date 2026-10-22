import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {NATIVE_MUSIC_TIMER_SOURCE as SOURCE,hashBytes,recordLoadedModuleResponse,verifyLoadedModules,
 createBlobWorkerEvidence,recordBlobWorkerCreation,observeGeneratedWorker,bindBlobWorkerEvidence,installBlobWorkerObserver} from '../lib/inkwave-roller-uuid-comparison.mjs';
const ORIGIN='http://127.0.0.1:1234';
const creatorPath='src/audio/music.js';
const creatorCode=`class Music{_startTimer(){const src=${JSON.stringify(SOURCE)};const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return new Worker(url);}}`;
const response=(url,body,type='script',mime='text/javascript')=>({url:()=>url,request:()=>({resourceType:()=>type}),headers:()=>({'content-type':mime}),ok:()=>true,body:async()=>Buffer.from(body)});
function payload(url,origin=ORIGIN,path=creatorPath,code=creatorCode){return {url,mime:'text/javascript',size:Buffer.byteLength(SOURCE),bytes:Array.from(Buffer.from(SOURCE)),workerOptions:'default',creationStack:`Error\n    at URL.createObjectURL (<anonymous>:10:20)\n    at Music._startTimer (${origin}/${path}:1:${code.indexOf('URL.createObjectURL')+1})`,workerStack:`Error\n    at new ObservedWorker (<anonymous>:20:20)\n    at Music._startTimer (${origin}/${path}:1:${code.indexOf('new Worker')+1})`};}
async function fixture(origin=ORIGIN,code=creatorCode,path=creatorPath){
 const loaded={},manifest={artifacts:{},build:{revision:'pinned-revision'}},evidence=createBlobWorkerEvidence();
 for(let i=0;i<101;i++){const rel=`src/native-${i}.js`,body=`export const n=${i};`;manifest.artifacts[rel]=hashBytes(body);loaded[rel]={sha256:hashBytes(body),bytes:Buffer.byteLength(body)};}
 manifest.artifacts[path]=hashBytes(code);await recordLoadedModuleResponse(response(origin+'/'+path,code),origin,loaded,evidence);
 return {loaded,manifest,evidence,origin,path,code};
}
function creation(f,url,p=payload(url,f.origin)){return recordBlobWorkerCreation(f.evidence,p,f.origin,{mainFrame:true,frameUrl:f.origin+'/index.html'});}
async function native(f,url='blob:'+f.origin+'/native-uuid'){
 creation(f,url,payload(url,f.origin,f.path,f.code));observeGeneratedWorker(f.evidence,url,f.origin);await recordLoadedModuleResponse(response(url,SOURCE,'other'),f.origin,f.loaded,f.evidence);
 bindBlobWorkerEvidence(f.evidence,f.loaded,f.manifest);return verifyLoadedModules(f.loaded,f.manifest);
}
test('exact native worker response binds to actually loaded manifest-pinned creator and stable provenance',async()=>{
 const f=await fixture(),identity=await native(f);assert.equal(identity.moduleCount,103);
 const row=identity.modules['@generated/native-music-timer-worker'];assert.equal(row.sha256,hashBytes(SOURCE));assert.equal(row.provenance.creatorSha256,f.manifest.artifacts[creatorPath]);
 assert.equal(row.provenance.creator.path,creatorPath);assert.equal(row.provenance.creator.method,'_startTimer');assert.equal(row.provenance.operation,'URL.createObjectURL+Worker');
 assert.deepEqual(verifyLoadedModules(identity.modules,f.manifest),identity,'offline receipt verification rechecks generated proof');
 const changed=structuredClone(identity.modules);changed[creatorPath].generatedTimerSource.calls.create.start.column++;assert.throws(()=>verifyLoadedModules(changed,f.manifest),/not derived from pinned creator/);
 const sourceChanged=structuredClone(identity.modules);sourceChanged[creatorPath].generatedTimerSource.creatorSourceUtf8+=';';assert.throws(()=>verifyLoadedModules(sourceChanged,f.manifest),/not the actually loaded/);
 const g=await fixture('http://127.0.0.1:5432'),other=await native(g,'blob:'+g.origin+'/different-uuid');assert.deepEqual(other,identity,'ephemeral port/UUID cannot break same-build A/A identity');
 const versioned=await fixture(ORIGIN,creatorCode,'_versions/pinned-revision/'+creatorPath);await native(versioned);
});
test('unobserved, foreign, data, mutated and missing worker executables fail closed',async()=>{
 const f=await fixture(),url='blob:'+ORIGIN+'/unobserved';await recordLoadedModuleResponse(response(url,SOURCE,'other'),ORIGIN,f.loaded,f.evidence);
 assert.throws(()=>bindBlobWorkerEvidence(f.evidence,f.loaded,f.manifest),/Unobserved Blob worker creation/);
 await assert.rejects(recordLoadedModuleResponse(response('blob:https://foreign.invalid/worker',SOURCE,'other'),ORIGIN,f.loaded,f.evidence),/Unexpected script origin/);
 await assert.rejects(recordLoadedModuleResponse(response('data:text/javascript,postMessage(1)',SOURCE),ORIGIN,f.loaded,f.evidence),/Unexpected script origin/);
 const mutated=await fixture();creation(mutated,url);observeGeneratedWorker(mutated.evidence,url,ORIGIN);
 await recordLoadedModuleResponse(response(url,SOURCE+';postMessage(1)','other'),ORIGIN,mutated.loaded,mutated.evidence);
 assert.throws(()=>bindBlobWorkerEvidence(mutated.evidence,mutated.loaded,mutated.manifest),/response differs/);
 const missing=await fixture();creation(missing,url);observeGeneratedWorker(missing.evidence,url,ORIGIN);assert.throws(()=>bindBlobWorkerEvidence(missing.evidence,missing.loaded,missing.manifest),/response missing/);
 await assert.rejects(recordLoadedModuleResponse(response(url,SOURCE,'other'),ORIGIN,{}),/lacks creation provenance/);
});
test('minified native timer keeps lexical URL identity across callback name reuse',async()=>{
 const {transform}=await import('esbuild');
 const fs=await import('node:fs');
 const source=fs.readFileSync(new URL('../../inkwave-public/src/audio/music.js',import.meta.url),'utf8');
 const {code}=await transform(source,{minify:true,format:'esm',target:'es2022'});
 const f=await fixture(ORIGIN,code);await native(f);
 const nested=creatorCode.replace('return new Worker(url);','const onerror=()=>{const url=this.worker;return url;};return new Worker(url);');
 await native(await fixture(ORIGIN,nested));
 for(const code of [
  creatorCode.replace('return new Worker(url);','url=this.other;return new Worker(url);'),
  creatorCode.replace('return new Worker(url);','return (()=>new Worker(url))();'),
 ])await assert.rejects(native(await fixture(ORIGIN,code)));
});
test('native timer bindings respect try-block scope and reject shadowed or reassigned URL authority',async()=>{
 const scoped=`class Music{_startTimer(){const t=()=>this._tick();try{const t=${JSON.stringify(SOURCE)};const url=URL.createObjectURL(new Blob([t],{type:'text/javascript'}));this.worker=new Worker(url);}catch(e){this.worker=null;}}}`;
 await native(await fixture(ORIGIN,scoped));
 const separate=scoped.replace('this.worker=new Worker(url);','{let url=this.other;url=this.third;}this.worker=new Worker(url);');
 await native(await fixture(ORIGIN,separate));
 for(const code of [
  scoped.replace('this.worker=new Worker(url);','url=this.other;this.worker=new Worker(url);'),
  scoped.replace('this.worker=new Worker(url);','{const url=this.other;this.worker=new Worker(url);}'),
  creatorCode.replace('const src=', 'const URL=this.other;const src='),
  creatorCode.replace('const src=', 'const Worker=this.other;const src='),
 ])await assert.rejects(native(await fixture(ORIGIN,code)));
});
test('historical native idle cleanup capture returns the exact created URL and cannot substitute another value',async()=>{
 const legacy=creatorCode.replace('_startTimer(){','_startTimer(){let workerUrl=null;').replace('const url=URL.createObjectURL','const url=workerUrl=URL.createObjectURL');
 await native(await fixture(ORIGIN,legacy));
 const {transform}=await import('esbuild');await native(await fixture(ORIGIN,(await transform(legacy,{minify:true,format:'esm',target:'es2022'})).code));
 for(const code of [
  legacy.replace('workerUrl=URL.createObjectURL','workerUrl+=URL.createObjectURL'),
  legacy.replace("const url=workerUrl=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));","const url=(workerUrl=URL.createObjectURL(new Blob([src],{type:'text/javascript'})),this.other);"),
  legacy.replace('let workerUrl=null;',''),
  legacy.replace('return new Worker(url);','url=this.other;return new Worker(url);'),
 ])await assert.rejects(native(await fixture(ORIGIN,code)));
});
test('known byte literal alone never grants trust without loaded creator, native call sites and actual Worker observation',async()=>{
 const url='blob:'+ORIGIN+'/known';
 for(const change of [p=>p.creationStack=p.creationStack.replace('_startTimer','otherMethod'),p=>p.workerStack=p.workerStack.replace('_startTimer','otherMethod'),p=>p.workerOptions='explicit',p=>p.mime='application/javascript',p=>p.bytes.push(32)]){
  const f=await fixture(),p=payload(url);change(p);assert.throws(()=>creation(f,url,p));
 }
 const foreign=await fixture();assert.throws(()=>recordBlobWorkerCreation(foreign.evidence,payload(url),ORIGIN,{mainFrame:false,frameUrl:ORIGIN+'/index.html'}),/captured main frame/);
 for(const [code,path,mutate] of [
  [creatorCode,creatorPath,f=>delete f.loaded[creatorPath]],
  [creatorCode,creatorPath,f=>f.loaded[creatorPath].sha256=hashBytes('changed')],
  ['class Music{_startTimer(){}}',creatorPath,()=>{}],
  [creatorCode,'_versions/unpinned/'+creatorPath,()=>{}],
  [creatorCode,'src/audio/other.js',()=>{}],
 ]){
  const f=await fixture(ORIGIN,code,path);mutate(f);creation(f,url,payload(url,ORIGIN,path));observeGeneratedWorker(f.evidence,url,ORIGIN);await recordLoadedModuleResponse(response(url,SOURCE,'other'),ORIGIN,f.loaded,f.evidence);assert.throws(()=>bindBlobWorkerEvidence(f.evidence,f.loaded,f.manifest));
 }
 const wrongSite=await fixture();const wrongPayload=payload(url);wrongPayload.creationStack=wrongPayload.creationStack.replace(/:\d+\)$/ ,':1)');creation(wrongSite,url,wrongPayload);observeGeneratedWorker(wrongSite.evidence,url,ORIGIN);await recordLoadedModuleResponse(response(url,SOURCE,'other'),ORIGIN,wrongSite.loaded,wrongSite.evidence);assert.throws(()=>bindBlobWorkerEvidence(wrongSite.evidence,wrongSite.loaded,wrongSite.manifest),/outside the pinned native callsite/);
 const notWorker=await fixture();creation(notWorker,url);await recordLoadedModuleResponse(response(url,SOURCE,'other'),ORIGIN,notWorker.loaded,notWorker.evidence);assert.throws(()=>bindBlobWorkerEvidence(notWorker.evidence,notWorker.loaded,notWorker.manifest),/not observed as a Worker/);
 assert.throws(()=>observeGeneratedWorker(createBlobWorkerEvidence(),'data:text/javascript,0',ORIGIN),/data Worker/);
 assert.throws(()=>observeGeneratedWorker(createBlobWorkerEvidence(),'blob:https://foreign.invalid/x',ORIGIN),/Foreign Blob Worker/);
});
test('observer records immutable Blob bytes and both actual call stacks while preserving Worker construction',async()=>{
 let id=0;class BrowserURL extends URL{}BrowserURL.createObjectURL=()=>`blob:${ORIGIN}/${++id}`;
 class NativeWorker{constructor(url){this.url=String(url);}}
 const events=[],context=vm.createContext({URL:BrowserURL,Worker:NativeWorker,Blob,location:{href:ORIGIN+'/index.html'},report:async p=>events.push(p)});
 vm.runInContext(`(${installBlobWorkerObserver.toString()})({bindingName:'report'})`,context);
 vm.runInContext(creatorCode+';globalThis.worker=(new Music())._startTimer();',context,{filename:ORIGIN+'/'+creatorPath});
 await vm.runInContext('__inkwaveBlobWorkerAudit.flush()',context);assert.equal(events.length,1);
 assert.equal(events[0].workerOptions,'default');assert.equal(Buffer.from(events[0].bytes).toString(),SOURCE);
 assert.equal(vm.runInContext('worker instanceof Worker',context),true);
 const evidence=createBlobWorkerEvidence();recordBlobWorkerCreation(evidence,events[0],ORIGIN,{mainFrame:true,frameUrl:ORIGIN+'/index.html'});
 assert.equal(evidence.creations[events[0].url].creator.path,creatorPath);
 vm.runInContext(`new Worker('blob:${ORIGIN}/not-created-here')`,context,{filename:ORIGIN+'/'+creatorPath});
 await vm.runInContext('__inkwaveBlobWorkerAudit.flush()',context);assert.match(events[1].error,/Unknown/);
});
test('QA wrapper records provenance before page entry and binds all generated responses before acceptance',async()=>{
 const fs=await import('node:fs');const code=fs.readFileSync(new URL('../check-inkwave-roller-scale-range.mjs',import.meta.url),'utf8');
 assert(code.indexOf('page.addInitScript(installBlobWorkerObserver')<code.indexOf('receipt.entry=await enterRangeFromMenu'));
 assert(code.includes("page.on('worker',worker=>"));assert(code.includes('recordLoadedModuleResponse(response,captureOrigin,loadedModules,blobWorkerEvidence)'));
 assert(code.indexOf('bindBlobWorkerEvidence(blobWorkerEvidence,loadedModules,buildManifest)')<code.indexOf('receipt.runtimeIdentity=verifyLoadedModules'));
 assert(code.includes('await page.evaluate(()=>{\n    if(!globalThis.__inkwaveBlobWorkerAudit)'));
});
