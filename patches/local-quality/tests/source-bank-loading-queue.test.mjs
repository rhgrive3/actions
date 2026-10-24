import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const root=new URL('../../../inkwave-public/',import.meta.url);
const asset=name=>fs.readFileSync(new URL('assets/source-motion/'+name,root));
const source=fs.readFileSync(new URL('src/game/motion/source-bank.js',root),'utf8');
async function realm({weak=true,mutate=(name,bytes)=>bytes}={}){
 const stats={active:0,max:0,requests:[],signals:[]};
 class TestWeakRef {constructor(value){this.value=value;}deref(){return this.value;}}
 const context=vm.createContext({console,URL,TextEncoder,TextDecoder,crypto,DecompressionStream,AbortController,
  WeakRef:weak?TestWeakRef:undefined,Blob,Response});
 const RealmBuffer=vm.runInContext('ArrayBuffer',context);
 class RealmResponse extends Response {async arrayBuffer(){const bytes=new Uint8Array(await super.arrayBuffer()),out=new RealmBuffer(bytes.length);new Uint8Array(out).set(bytes);return out;}}
 context.Response=RealmResponse;
 context.Blob=function(parts){return new Blob(parts.map(p=>ArrayBuffer.isView(p)?Buffer.from(p.buffer,p.byteOffset,p.byteLength):p));};
 context.fetch=async(url,options={})=>{
  const name=new URL(url).pathname.split('/').pop();stats.requests.push(name);stats.signals.push(options.signal);
  stats.max=Math.max(stats.max,++stats.active);
  try{await new Promise(r=>setTimeout(r,name.endsWith('00')?3:1));
   if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
   const bytes=mutate(name,asset(name));return new RealmResponse(bytes,{status:200});
  }finally{stats.active--;}
 };
 const modules=new Map();
 function load(url){const key=url.href;if(modules.has(key))return modules.get(key);
  let code=key.endsWith('/source-bank.js')?source+'\nexport {inflateParts,bankPromises,bankRefs};':fs.readFileSync(url,'utf8');
  const m=new vm.SourceTextModule(code,{context,identifier:key,initializeImportMeta(meta){meta.url=key;}});modules.set(key,m);return m;}
 const entry=load(new URL('src/game/motion/source-bank.js',root));
 await entry.link((spec,from)=>load(spec==='three'?new URL('vendor/three/build/three.module.js',root):new URL(spec,from.identifier)));
 await entry.evaluate();return {api:entry.namespace,stats};
}
const hash=b=>createHash('sha256').update(b).digest('hex');

test('actual gzip packs stay byte-exact, requests are bounded, active banks reuse identity and idle cache roots are weak',async()=>{
 const {api,stats}=await realm(),manifest=JSON.parse(asset('manifest.json'));
 for(const variant of ['Player00','Player01','Player_Squid']){
  const a=api.loadSourceBank(variant),b=api.loadSourceBank(variant);assert.equal(a,b,'in-flight Promise coalesces');
  const bank=await a,entry=manifest.variants[variant];
  const packed=Buffer.concat(entry.parts.map(asset)),raw=gunzipSync(packed);
  assert.equal(hash(packed),entry.gzipSha256);assert.equal(hash(Buffer.from(bank.data.buffer)),hash(raw));
  assert.equal(await api.loadSourceBank(variant),bank,'live bank is reused');
  assert.equal(api.bankPromises.size,0,'no fulfilled Promise strongly roots decoded banks');
  assert.equal(api.bankRefs.get(variant).deref(),bank);
 }
 assert.equal(stats.max,2,'catalog then one variant at a time; maximum two pending parts');
 assert.equal(stats.requests.length,24,'one manifest, one catalog and 22 parts; no repeated fetches for live banks');
 const first=await api.loadSourceBank('Player00');
 api.bankRefs.get('Player00').value=undefined; // deterministic simulation of a collected weak entry
 const after=await api.loadSourceBank('Player00');
 assert.notEqual(after,first);assert.equal(hash(Buffer.from(after.data.buffer)),hash(Buffer.from(first.data.buffer)));
 assert.equal(await api.loadSourceBank('Player01'),api.bankRefs.get('Player01').deref(),'other active variant survives');
});

test('platforms without WeakRef retain the established bounded successful cache',async()=>{
 const {api,stats}=await realm({weak:false});
 const first=await api.loadSourceBank('Player_Squid'),requests=stats.requests.length;
 assert.equal(await api.loadSourceBank('Player_Squid'),first);assert.equal(stats.requests.length,requests);
 assert.equal(api.bankRefs,null);assert.equal(api.bankPromises.size,1);
 await assert.rejects(api.loadSourceBank('unknown'),/Unknown source variant/);
});

test('truncation, overflow, reordering and corruption fail closed; failed loads can retry',async()=>{
 const manifest=JSON.parse(asset('manifest.json')),entry=manifest.variants.Player00;
 for(const mutation of ['short','long','corrupt','swap']){
  let damage=true;
  const {api,stats}=await realm({mutate(name,bytes){
   if(!damage||!name.startsWith('Player00'))return bytes;
   if(mutation==='swap'&&name.endsWith('00'))return asset(entry.parts[1]);
   if(mutation==='swap'&&name.endsWith('01'))return asset(entry.parts[0]);
   if(!name.endsWith('00'))return bytes;
   if(mutation==='short')return bytes.subarray(1);
   if(mutation==='long')return Buffer.concat([bytes,Buffer.from([0])]);
   if(mutation==='corrupt'){bytes=Buffer.from(bytes);bytes[100]^=1;return bytes;}return bytes;
  }});
  await assert.rejects(api.loadSourceBank('Player00'),/length mismatch|gzip hash mismatch/);
  assert.equal(api.bankPromises.size,0);assert.equal(api.bankRefs.size,0);assert.ok(stats.max<=2);
  assert.ok(stats.signals.slice(1).every(s=>s instanceof AbortSignal));damage=false;
  assert.ok((await api.loadSourceBank('Player00')).data.length>0,'retry validates a fresh complete pack');
 }
 const {api}=await realm();
 const legacy=await api.inflateParts(entry.parts,entry.gzipSha256);
 assert.equal(hash(Buffer.from(legacy)),hash(gunzipSync(Buffer.concat(entry.parts.map(asset)))),'legacy unknown-size multipart catalogs remain supported');
 await assert.rejects(api.inflateParts(['../bad'],null),/Malformed/);
 await assert.rejects(api.inflateParts(entry.parts,null,1),/length mismatch/);
});
