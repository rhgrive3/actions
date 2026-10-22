import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {transform} from 'esbuild';
import {recordNativeModuleWorkerCreation as create,observeNativeModuleWorker as observe,bindNativeModuleWorkers as bind,verifyNativeModuleWorkerRows as verify} from '../lib/inkwave-native-module-worker.mjs';
const origin='http://127.0.0.1:1234',hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(name,{minify=false,mutate=s=>s,revision='test'}={}){
 let source=mutate(fs.readFileSync(new URL('../../patches/splatoon3/runtime/audio/'+name+'-prewarm.mjs',import.meta.url),'utf8'));if(minify)source=(await transform(source,{minify:true,format:'esm',target:'es2022'})).code;
 const prefix='_versions/'+revision+'/patches/splatoon3/runtime/audio/',path=prefix+name+'-worker.mjs',owner=prefix+name+'-prewarm.mjs',lines=source.split('\n'),line=lines.findIndex(l=>l.includes('new Worker('));assert(line>=0);const column=lines[line].indexOf('new Worker(')+1;
 const payload={kind:'native-module',url:origin+'/'+path,workerOptions:{type:'module',name:'inkwave-'+name},workerStack:`Error\n at construct (<anonymous>:1:1)\n at native (${origin}/${owner}:${line+1}:${column})`};
 const body=fs.readFileSync(new URL('../../patches/splatoon3/runtime/audio/'+name+'-worker.mjs',import.meta.url),'utf8');
 return{payload,e:{owners:[{url:origin+'/'+owner,body:source}]},loaded:{[owner]:{sha256:hash(source),bytes:Buffer.byteLength(source)},[path]:{sha256:hash(body),bytes:Buffer.byteLength(body)}},manifest:{build:{revision:'test'},artifacts:{[owner]:hash(source),[path]:hash(body)}},path,owner};
}
function accept(f){create(f.e,f.payload,origin);observe(f.e,f.payload.url,origin);bind(f.e,f.loaded,f.manifest);verify(f.loaded,f.manifest);}
for(const name of ['grain','reverb'])for(const minify of [false,true])test(`${name} exact native source/calls/manifest bind, minified=${minify}`,async()=>{const f=await fixture(name,{minify});accept(f);for(const mutate of [g=>delete g.loaded[g.path].nativeWorkerProvenance,g=>g.loaded[g.owner].sha256='0'.repeat(64),g=>g.loaded[g.path].nativeWorkerProvenance.creator.column=1,g=>g.loaded[g.path].sha256='1'.repeat(64)]){const g=structuredClone(f);mutate(g);assert.throws(()=>verify(g.loaded,g.manifest));}});
test('unknown targets, options, missing observations/responses and foreign revisions reject',async()=>{
 for(const mutate of [f=>f.payload.url='data:text/javascript,1',f=>f.payload.url='blob:'+origin+'/x',f=>f.payload.url=origin+'/unbound-worker.mjs',f=>f.payload.url=f.payload.url.replace(origin,'https://foreign.invalid'),f=>f.payload.workerOptions.type='classic',f=>f.payload.workerOptions.credentials='include',f=>f.payload.workerStack=f.payload.workerStack.replace('grain-prewarm.mjs','other.mjs')]){const f=await fixture('grain');mutate(f);assert.throws(()=>accept(f));}
 const f=await fixture('grain');create(f.e,f.payload,origin);assert.throws(()=>bind(f.e,f.loaded,f.manifest),/denominator/);observe(f.e,f.payload.url,origin);delete f.loaded[f.path];assert.throws(()=>bind(f.e,f.loaded,f.manifest),/response missing/);
 const g=await fixture('reverb',{revision:'foreign'});assert.throws(()=>accept(g),/revision/);
});
test('source substitutions, shadowed globals and callsite forgery reject despite fresh source hashes',async()=>{
 for(const mutate of [s=>s.replace("'./grain-worker.mjs'","'./other-worker.mjs'"),s=>'const Worker=globalThis.Worker;\n'+s,s=>s.replace("type: 'module'","type: 'classic'")]){const f=await fixture('grain',{mutate});assert.throws(()=>accept(f));}
 const f=await fixture('grain');f.payload.workerStack=f.payload.workerStack.replace(/:\d+:\d+\)$/,':1:1)');assert.throws(()=>accept(f),/callsite/);
});
