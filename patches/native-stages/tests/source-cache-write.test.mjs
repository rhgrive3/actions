// Controlled DB-open boundary regression; real IndexedDB migration/browser qualification is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const here=new URL('.',import.meta.url),arrays=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
const bytes=value=>arrays.reduce((n,k)=>n+(value?.[k]?.byteLength||0),0);
const data=(id,n=8)=>({...Object.fromEntries(arrays.map((k,i)=>[k,new Uint8Array(n).fill(i+id)])),manifest:{id}});
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function database(){
 const db={stores:new Map([['stages',new Map()],['stage-times',new Map()]]),reads:[],aborts:0,closed:0,failPut:null,close(){this.closed++;}};
 db.transaction=(names,mode)=>{
  names=Array.isArray(names)?names:[names];const work=new Map(names.map(n=>[n,new Map(db.stores.get(n))]));let pending=0,ended=false;
  const t={error:null,abort(){if(ended)return;ended=true;db.aborts++;queueMicrotask(()=>t.onabort?.());},objectStore(name){assert.ok(names.includes(name));const rows=work.get(name);
   const req=fn=>{const r={};pending++;queueMicrotask(()=>{if(ended)return;try{r.result=fn();r.onsuccess?.();}catch(e){t.error=e;t.abort();}finally{pending--;finish();}});return r;};
   return {getAll(){return req(()=>{const out=[...rows.values()].sort((a,b)=>cmp(a.key,b.key));db.reads.push({store:name,op:'getAll',rows:out.length,payloadBytes:out.reduce((n,r)=>n+bytes(r.data),0)});return structuredClone(out);});},getAllKeys(){return req(()=>{db.reads.push({store:name,op:'getAllKeys',payloadBytes:0});return structuredClone([...rows.keys()].sort(cmp));});},get(key){return req(()=>structuredClone(rows.get(key)));},put(row){return req(()=>{if(db.failPut?.(name,row))throw Error('injected put failure');rows.set(row.key,structuredClone(row));return row.key;});},delete(key){return req(()=>rows.delete(key));}};
  }};
  function finish(){setImmediate(()=>{if(ended||pending)return;ended=true;if(mode==='readwrite')for(const [n,rows] of work)db.stores.set(n,rows);t.oncomplete?.();});}
  finish();return t;
 };
 return db;
}
async function load(file){
 const source=fs.readFileSync(new URL(file,here),'utf8');
 // The v1 fixture is the exact pre-migration implementation; the candidate is always the current repository runtime.
 if(file==='fixtures/source-cache-v1.mjs.txt')assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'31a47aeb648147683589e6483831ab5f03c1d9e401cec42f84c5edf3a7633de1');
 else assert.equal(file,'../runtime/source-cache.mjs');
 // Only substitute the DB-opening boundary. The actual exported write/read,
 // transaction scope, metadata validation, eviction, seal and request callbacks run.
 const begin=source.indexOf('function openDB()'),end=source.indexOf('function transact(');
 assert.ok(begin>=0&&end>begin);
 const injected=source.slice(0,begin)+'function openDB(){return Promise.resolve(globalThis.__cacheTestDB);}\n'+source.slice(end);
 return import('data:text/javascript;base64,'+Buffer.from(injected).toString('base64'));
}
const modules={baseline:await load('fixtures/source-cache-v1.mjs.txt'),candidate:await load('../runtime/source-cache.mjs')};
async function use(kind,db,fn){const oldDB=globalThis.__cacheTestDB,oldIDB=globalThis.indexedDB;globalThis.__cacheTestDB=db;globalThis.indexedDB={cmp};try{return await fn(modules[kind]);}finally{globalThis.__cacheTestDB=oldDB;globalThis.indexedDB=oldIDB;}}
async function write(kind,db,key,value,time){const old=Date.now;Date.now=()=>time;try{await use(kind,db,m=>m.writeDerived(key,value));}finally{Date.now=old;}}
const stages=db=>[...db.stores.get('stages').values()].sort((a,b)=>cmp(a.key,b.key));
async function pair(ops){const a=database(),b=database();for(const op of ops){await write('baseline',a,...op);await write('candidate',b,...op);}assert.deepEqual(stages(b),stages(a));return {a,b};}
function consistent(db){const rows=stages(db);assert.deepEqual([...db.stores.get('stage-times').values()].sort((a,b)=>cmp(a.key,b.key)),rows.map(({key,time})=>({key,time})));}
test('fresh, third-key and same-key updates preserve exact rows and seals',async()=>{const {b}=await pair([['a',data(1),10],['b',data(2),20],['c',data(3),30],['b',data(4),40]]);assert.deepEqual(stages(b).map(r=>r.key),['b','c']);consistent(b);});
test('equal timestamps retain ascending primary-key tie order',async()=>{const {b}=await pair([['z',data(1),100],['a',data(2),100],['m',data(3),200]]);assert.deepEqual(stages(b).map(r=>r.key),['a','m']);consistent(b);});
test('missing and nonfinite legacy time values keep the original stable-sort behavior',async()=>{
 for(const times of [[undefined,20,10],[NaN,20,10],[Infinity,20,-Infinity],[10,NaN,20],[20,undefined,10]]){
  const a=database(),b=database();for(let i=0;i<3;i++){const row={key:['a','b','c'][i],time:times[i],data:data(i)};a.stores.get('stages').set(row.key,structuredClone(row));b.stores.get('stages').set(row.key,structuredClone(row));b.stores.get('stage-times').set(row.key,{key:row.key,time:row.time});}
  await write('baseline',a,'new',data(4),30);await write('candidate',b,'new',data(4),30);assert.deepEqual(stages(b),stages(a));consistent(b);
 }
});
test('metadata key mismatch aborts without mutating either store',async()=>{
 for(const mode of ['missing','orphan','same-count-wrong-key']){const db=database();await write('candidate',db,'a',data(1),10);await write('candidate',db,'b',data(2),20);
  if(mode==='missing')db.stores.get('stage-times').delete('a');else if(mode==='orphan')db.stores.get('stage-times').set('x',{key:'x',time:30});else{db.stores.get('stage-times').delete('a');db.stores.get('stage-times').set('x',{key:'x',time:10});}
  const before=structuredClone(db.stores);await write('candidate',db,'c',data(3),40);assert.deepEqual(db.stores,before);assert.equal(db.aborts,1);
 }
});
test('failed metadata put rolls back stage eviction and write; retry stays consistent',async()=>{const db=database();await write('candidate',db,'a',data(1),10);await write('candidate',db,'b',data(2),20);const before=structuredClone(db.stores);db.failPut=(store,row)=>store==='stage-times'&&row.key==='c';await write('candidate',db,'c',data(3),30);assert.deepEqual(db.stores,before);assert.equal(db.aborts,1);db.failPut=null;await write('candidate',db,'c',data(3),30);assert.deepEqual(stages(db).map(r=>r.key),['b','c']);consistent(db);});
test('derived read still checks every buffer seal and rejects altered data',async()=>{const db=database();const value=data(1);await write('candidate',db,'a',value,10);assert.deepEqual(await use('candidate',db,m=>m.readDerived('a')),value);db.stores.get('stages').get('a').data.mask[0]^=1;assert.equal(await use('candidate',db,m=>m.readDerived('a')),null);});
test('steady write requests return zero stage payload bytes without changing cache contents',async()=>{
 const a=database(),b=database(),value=data(1,1048576/10|0);for(const kind of ['baseline','candidate']){const db=kind==='baseline'?a:b;await write(kind,db,'a',value,10);await write(kind,db,'b',value,20);db.reads=[];await write(kind,db,'c',value,30);}
 assert.deepEqual(stages(b),stages(a));const sum=db=>db.reads.reduce((n,r)=>n+r.payloadBytes,0);assert.equal(sum(a),bytes(value)*2);assert.equal(sum(b),0);assert.ok(!b.reads.some(r=>r.store==='stages'&&r.op==='getAll'));consistent(b);
 const report={scope:'Node structured-clone mock at DB-open boundary; not native IDB or RSS',perStagePayloadBytes:bytes(value),baselineReturnedPayloadBytes:sum(a),candidateReturnedPayloadBytes:sum(b),baselineRequests:a.reads,candidateRequests:b.reads};console.log('SOURCE_CACHE_WRITE_MOCK_RECEIPT',JSON.stringify(report));
});
