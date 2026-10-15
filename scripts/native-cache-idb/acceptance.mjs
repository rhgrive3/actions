import {compareResults} from './receipt-gate.mjs';
// Hosted-only real IndexedDB acceptance. No model assets or user origins.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {chromium} from 'playwright';
const [baselinePath,candidatePath,output]=process.argv.slice(2);
assert(baselinePath&&candidatePath&&output,'baseline candidate output required');
const sources=await Promise.all([baselinePath,candidatePath].map(p=>readFile(p)));
const hashes=sources.map(b=>createHash('sha256').update(b).digest('hex'));
assert.equal(hashes[0],process.env.IDB_BASELINE_SHA256,'frozen baseline SHA256 required');assert.equal(hashes[1],process.env.IDB_CANDIDATE_SHA256,'frozen candidate SHA256 required');
const server=http.createServer((req,res)=>{const i=['/baseline.mjs','/candidate.mjs'].indexOf(req.url);if(i>=0){res.writeHead(200,{'content-type':'text/javascript'});res.end(sources[i]);}else if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>isolated IDB acceptance</title>');}else{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];let active=null;
try{
 for(const variant of ['baseline','candidate'])for(const scenario of ['empty','third','same-key','equal-time','migration-read','abort','concurrent','blocked-upgrade','invalid-time','fresh','abort-retry','metadata-mismatch']){
  if(scenario==='metadata-mismatch'&&variant==='baseline')continue;
  active={variant,scenario};const context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin);
  results.push(await page.evaluate(async({variant,scenario})=>{
   const restore=[];for(const proto of [IDBObjectStore.prototype,IDBIndex.prototype])for(const name of ['getAll','get','openCursor','openKeyCursor','put'])restore.push([proto,name,Object.getOwnPropertyDescriptor(proto,name)]);restore.push([indexedDB,'open',Object.getOwnPropertyDescriptor(indexedDB,'open')],[Date,'now',Object.getOwnPropertyDescriptor(Date,'now')]);
   try {
   const DB='inkwave-native-derived-v2',names=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
   const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
   async function seal(data){const hashes=await Promise.all(names.map(k=>crypto.subtle.digest('SHA-256',data[k])));hashes.push(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.manifest))));return hashes.map(hex).join('/');}
   async function record(key,time,tag){const data={manifest:{schema:1,id:key,tag}};for(let i=0;i<names.length;i++){data[names[i]]=new Uint8Array(256*1024);data[names[i]].fill(tag+i);}return {key,time,data,seal:await seal(data)};}
   const a=await record('a',10,1),b=await record('b',20,2),c=await record('c',30,3);
   const initial=['empty','fresh'].includes(scenario)?[]:[a,b];if(scenario==='invalid-time'){delete a.time;b.time=NaN;}if(scenario==='equal-time'){a.time=20;b.time=20;}
   if(scenario!=='fresh')await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('stages',{keyPath:'key'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('stages','readwrite');for(const row of initial)t.objectStore('stages').put(row);t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};});
   let held=null;let blockedObserved=false;let oldVersionRejected=false;let oldClientFallback=null;
   if(scenario==='blocked-upgrade')held=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const originalOpen=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{const r=originalOpen(...args);r.addEventListener('blocked',()=>{blockedObserved=true;held?.close();held=null;});return r;};
   const counts={getAll:0,stageGetAll:0,get:0,openCursor:0,openKeyCursor:0,returnedDataBytes:0,put:0,abortInjected:false};
   const dataBytes=value=>{if(Array.isArray(value))return value.reduce((n,x)=>n+dataBytes(x),0);if(!value?.data)return 0;return names.reduce((n,k)=>n+(value.data[k]?.byteLength||0),0);};
   let observe=true;
   for(const proto of [IDBObjectStore.prototype,IDBIndex.prototype])for(const method of ['getAll','get','openCursor','openKeyCursor']){
    const original=proto[method];if(!original)continue;proto[method]=function(...args){const r=Reflect.apply(original,this,args);if(observe){counts[method]++;if(method==='getAll'&&this.name==='stages')counts.stageGetAll++;r.addEventListener('success',()=>{if(observe)counts.returnedDataBytes+=dataBytes(method==='openCursor'?r.result?.value:r.result);});}return r;};
   }
   const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=Reflect.apply(put,this,args);if(observe){counts.put++;if(['abort','abort-retry'].includes(scenario)&&!counts.abortInjected&&this.name==='stages'){const t=this.transaction;r.addEventListener('success',()=>{counts.abortInjected=true;t.abort();});}}return r;};
   const originalNow=Date.now;Date.now=()=>100;
   const module=await import(`/${variant}.mjs`);let migrationCounts=null;
   if(variant==='candidate'&&!['fresh','migration-read','blocked-upgrade'].includes(scenario)){await module.readDerived('__absent__');migrationCounts={...counts};for(const k of Object.keys(counts))counts[k]=typeof counts[k]==='boolean'?false:0;}
   if(scenario==='metadata-mismatch'){observe=false;await new Promise((resolve,reject)=>{const r=indexedDB.open(DB);r.onsuccess=()=>{const db=r.result,t=db.transaction('stage-times','readwrite');t.objectStore('stage-times').delete('a');t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};r.onerror=()=>reject(r.error);});observe=true;}
   let readSeal=null;
   if(scenario==='migration-read'){const data=await module.readDerived('a');readSeal=data&&await seal(data);}
   else if(scenario==='concurrent')await Promise.all([module.writeDerived('c',c.data),module.writeDerived('d',a.data)]);
   else {const pending=module.writeDerived(scenario==='same-key'?'a':'c',c.data);if(scenario==='blocked-upgrade'&&variant==='baseline'){held.close();held=null;}await pending;}
   if(scenario==='blocked-upgrade'&&variant==='candidate')await module.writeDerived('c',c.data);
   if(scenario==='blocked-upgrade'){oldVersionRejected=await new Promise(resolve=>{const r=originalOpen(DB,1);r.onerror=e=>{e.preventDefault();resolve(r.error.name==='VersionError');};r.onsuccess=()=>{r.result.close();resolve(false);};});}
   if(scenario==='abort-retry')await module.writeDerived('c',c.data);
   Date.now=originalNow;observe=false;if(scenario==='blocked-upgrade'&&variant==='candidate'){const old=await import('/baseline.mjs');oldClientFallback=(await old.readDerived('b'))===null;if(!oldClientFallback)throw Error('Old client fail-open fallback not exercised');}let schema=null;
   const rows=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction(Array.from(db.objectStoreNames),'readonly'),q=t.objectStore('stages').getAll();let rows,indexRows={},metadata=null;if(db.objectStoreNames.contains('stage-times')){const mr=t.objectStore('stage-times').getAll();mr.onsuccess=()=>{metadata=mr.result;};}schema={version:db.version,stores:Array.from(db.objectStoreNames),indexes:Array.from(t.objectStore('stages').indexNames)};for(const name of schema.indexes){const r=t.objectStore('stages').index(name).openKeyCursor();indexRows[name]=[];r.onsuccess=()=>{const c=r.result;if(c){indexRows[name].push({indexKey:c.key,primaryKey:c.primaryKey});c.continue();}};}q.onsuccess=()=>{rows=q.result;};t.oncomplete=()=>{schema.indexRows=indexRows;schema.metadata=metadata;db.close();resolve(rows);};t.onabort=()=>reject(t.error);};});
   const saved=[];for(const r of rows)saved.push({key:r.key,time:r.time,seal:r.seal,actualSeal:await seal(r.data)});
   const expectedKeys={empty:['c'],third:['b','c'],'same-key':['a','b'],'equal-time':['a','c'],'migration-read':['a','b'],abort:['a','b'],concurrent:['c','d'],'blocked-upgrade':['b','c'],'invalid-time':['a','c'],fresh:['c'],'abort-retry':['b','c'],'metadata-mismatch':['a','b']}[scenario];
   if(JSON.stringify(saved.map(r=>r.key))!==JSON.stringify(expectedKeys))throw Error('Wrong eviction '+scenario);
   for(const r of saved){if(r.actualSeal!==r.seal)throw Error('Data mutated');const written=scenario==='concurrent'?['c','d'].includes(r.key):!['abort','migration-read','metadata-mismatch'].includes(scenario)&&r.key===(scenario==='same-key'?'a':'c');const expected=written?(scenario==='concurrent'&&r.key==='d'?a:c):[a,b].find(x=>x.key===r.key);if(r.seal!==expected.seal||!Object.is(r.time,(written?100:expected.time)))throw Error('Wrong saved data/time');}
   if(scenario==='migration-read'&&readSeal!==a.seal)throw Error('Read migration corrupt');
   if(['abort','abort-retry'].includes(scenario)&&!counts.abortInjected)throw Error('Abort not exercised');
   if(scenario==='blocked-upgrade'&&variant==='candidate'&&(!blockedObserved||!oldVersionRejected))throw Error('Upgrade/version controls not exercised');
   if(scenario==='metadata-mismatch'&&(schema.metadata?.length!==1||schema.metadata[0].key!=='b'||schema.metadata[0].time!==20))throw Error('Mismatch transaction partially changed metadata');
   if(variant==='candidate'&&scenario!=='metadata-mismatch'&&(!Array.isArray(schema.metadata)||schema.metadata.length!==rows.length||schema.metadata.some((m,i)=>m.key!==rows[i].key||!Object.hasOwn(m,'time')||!Object.is(m.time,rows[i].time))))throw Error('Metadata/data mismatch');
   const timeKind=v=>v===undefined?'undefined':Number.isNaN(v)?'NaN':v===null?'null':Object.is(v,-0)?'-0':typeof v;for(let i=0;i<saved.length;i++){saved[i].timeOwn=Object.hasOwn(rows[i],'time');saved[i].timeKind=timeKind(rows[i].time);}for(const m of schema.metadata||[])m.timeKind=timeKind(m.time);
   if(variant==='candidate'&&schema.version!==2)throw Error('Candidate schema not upgraded');
   return {variant,scenario,migrationCounts,schema,blockedObserved,oldVersionRejected,oldClientFallback,counts,saved,readSeal,syntheticBytesPerRecord:10*256*1024,restorationVerifiedOnExit:true};
   }finally{for(const [object,key,descriptor] of restore){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}for(const [object,key,descriptor] of restore){const actual=Object.getOwnPropertyDescriptor(object,key);if(actual?.value!==descriptor?.value||actual?.get!==descriptor?.get)throw Error('Instrumentation restoration failed: '+key);}}
  },{variant,scenario}));
  await context.close();
 }
 for(const scenario of ['empty','third','same-key','equal-time','migration-read','abort','concurrent','blocked-upgrade','invalid-time','fresh','abort-retry','metadata-mismatch']){
  if(scenario==='metadata-mismatch'){assert(results.some(x=>x.variant==='candidate'&&x.scenario===scenario));continue;}
  const a=results.find(x=>x.variant==='baseline'&&x.scenario===scenario),b=results.find(x=>x.variant==='candidate'&&x.scenario===scenario);
  compareResults(a,b);
 }
 await writeFile(output,JSON.stringify({status:'passed',sourceSHA256:hashes,browserVersion:browser.version(),scope:'Synthetic real IndexedDB semantics and JS-visible record readback; no process/GPU memory or crash-cause claim',results},null,2));
}catch(error){await writeFile(output,JSON.stringify({status:'failed',sourceSHA256:hashes,active,error:String(error.stack||error),results},null,2));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
