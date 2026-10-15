// Two private browser-cache slots. Nothing is uploaded or added to the PWA
// revision/precache. Failures/quota restrictions fall back to ordinary loading.
const PREFIX='inkwave-native-source-v2-',DB='inkwave-native-derived-v2';
async function slots(id){
 if(!globalThis.caches)return null;
 const names=(await caches.keys()).filter(n=>n.startsWith(PREFIX));
 const name=PREFIX+id;
 // Cache names are stable per pinned stage; touch by updating a small marker.
 const dated=await Promise.all(names.filter(n=>n!==name).map(async n=>{const c=await caches.open(n),r=await c.match('https://inkwave.invalid/native-cache-stamp');return {name:n,time:r?Number(await r.text()):0};}));
 dated.sort((a,b)=>b.time-a.time);
 for(const s of dated.slice(1))await caches.delete(s.name);
 const cache=await caches.open(name);await cache.put('https://inkwave.invalid/native-cache-stamp',new Response(String(Date.now())));return cache;
}
const hex=a=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('');
export async function verifySourceBytes(bytes,expected){
 if(expected.bytes!==undefined&&bytes.byteLength!==expected.bytes)throw Error('Source asset byte count mismatch');
 let value;
 if(expected.sha256)value=hex(await crypto.subtle.digest('SHA-256',bytes));
 else if(expected.gitSha1){const header=new TextEncoder().encode('blob '+bytes.byteLength+'\0'),blob=new Uint8Array(header.length+bytes.byteLength);blob.set(header);blob.set(new Uint8Array(bytes),header.length);value=hex(await crypto.subtle.digest('SHA-1',blob));}
 else throw Error('Unpinned source asset');
 if(value!==(expected.sha256||expected.gitSha1))throw Error('Source asset integrity mismatch');
 return bytes;
}
export async function sourceBytes(id,url,expected,signal,onProgress){
 let cache;try{cache=await slots(id);const old=await cache?.match(url);if(old){try{return await verifySourceBytes(await old.arrayBuffer(),expected);}catch{await cache.delete(url);}}}catch{}
 const r=await fetch(url,{signal,credentials:'omit',mode:'cors',referrerPolicy:'no-referrer'});
 if(!r.ok)throw Error('Source download failed ('+r.status+')');
 let bytes;
 if(onProgress&&r.body){const reader=r.body.getReader(),chunks=[];let count=0,last=0,total=Number(r.headers.get('content-length'))||expected.bytes||0;
  while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);count+=value.byteLength;if(performance.now()-last>150){onProgress({bytes:count,total});last=performance.now();}}
  const result=new Uint8Array(count);let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}bytes=result.buffer;
 }else bytes=await r.arrayBuffer();
 await verifySourceBytes(bytes,expected);try{await cache?.put(url,new Response(bytes));}catch{}
 return bytes;
}
function openDB(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open(DB,2);let blocked=false;
 request.onblocked=()=>{blocked=true;reject(Error('Derived cache upgrade blocked'));};
 request.onupgradeneeded=()=>{
  if(blocked){request.transaction.abort();return;}
  const db=request.result,s=db.objectStoreNames.contains('stages')?request.transaction.objectStore('stages'):db.createObjectStore('stages',{keyPath:'key'});
  const times=db.createObjectStore('stage-times',{keyPath:'key'}),r=s.openCursor();
  // Copy only eviction metadata once. Later writes never read stage payloads.
  r.onsuccess=()=>{const c=r.result;if(c){times.put({key:c.primaryKey,time:c.value.time});c.continue();}};
 };
 request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
 request.onerror=()=>reject(request.error);
});}
function transact(db,mode,run){return new Promise((resolve,reject)=>{const t=db.transaction(mode==='readwrite'?['stages','stage-times']:'stages',mode),s=t.objectStore('stages');let result;run(s,value=>{result=value;},t);t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
const arrays=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
async function seal(data){const hashes=await Promise.all(arrays.map(k=>crypto.subtle.digest('SHA-256',data[k])));hashes.push(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.manifest))));return hashes.map(hex).join('/');}
export async function readDerived(key){
 let db;try{db=await openDB();const row=await transact(db,'readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});if(!row||await seal(row.data)!==row.seal)return null;return row.data;}catch{return null;}finally{db?.close();}
}
export async function writeDerived(key,data){
 let db;try{const signature=await seal(data);db=await openDB();await transact(db,'readwrite',(s,_done,t)=>{
  const times=t.objectStore('stage-times'),r=times.getAll(),keys=s.getAllKeys();let rows,stageKeys;
  const update=()=>{
   if(!rows||!stageKeys)return;
   if(rows.length!==stageKeys.length||rows.some((row,i)=>indexedDB.cmp(row.key,stageKeys[i])!==0)){t.abort();return;}
   const other=rows.filter(v=>v.key!==key).sort((a,b)=>b.time-a.time);for(const row of other.slice(1)){s.delete(row.key);times.delete(row.key);}const time=Date.now();s.put({key,time,seal:signature,data});times.put({key,time});
  };
  r.onsuccess=()=>{rows=r.result;update();};keys.onsuccess=()=>{stageKeys=keys.result;update();};
 });}catch{}finally{db?.close();}
}
