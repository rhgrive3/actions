// Private browser-cache slots with conservative byte-based optional retention.
// Nothing is uploaded or added to the PWA
// revision/precache. Failures/quota restrictions fall back to ordinary loading.
const PREFIX='inkwave-native-source-v2-',DB='inkwave-native-derived-v2';
// BEGIN GENERATED PINNED SOURCE INVENTORIES
const PINNED_SOURCE_TREES=Object.freeze({
 "c5e8f6e5aa14b97a87210ad5df1c91c05b1ab451": "db840173ec13d9000de43130767aa435a4caac55c22ec184b67fd31d3bb3dccc",
 "96fbd9ec8b6eb57996236fa56bb7511009ebc0c5": "02bb28f49bd24cfe8a4fda6a1e2886f641a37573a6430c1b0917dde787deea85",
 "ffa36b9ffb6e80907594776996b94d00b0cbacde": "4b29dc24d9f36b2e6f35d74fed1af527b59eed21a6ea84bf3e77374906dc790e",
 "eac91de4a0c7d5d55c52dbf7d09a9c4f7d94a011": "a49814b315ee8e2d3b2b4f1b0e77ec7aecd947d8e696f40425877fcc67b1e0a8",
 "1b814a810bc1012c7cf16f469f81ee532e860bfd": "50556902c0b3f36fbb932ad20920643c0ab1d56da8b0df1858b236f2ad1cd89a",
 "084a4ee4442823e237d9ef39b18b689484317cf9": "7b73a40e47e8b27ed65027208ceffee59495edde24be54a6521717a8d382cf6d",
 "c7d87b908c565e698fade2f7bbe4c9353f200435": "9b4ba04b1de8f4f0882a7b59203f60ec98e47c77806ee6ed06bbddcd3968d0d1",
 "e5d7d0f5097921f536b1dc3830ad4ae81e7da7d0": "e6a9502f477b7e033f6e0d45f8c1cbbe0fbbcf48b0c0d3cda28171fff737de87",
 "76fb75d5a7ad6edcfb8640df6894cb5687bc127d": "bf0da320c27f2db6fc5a7a6147c1a8f48cee2fff3a0c5bf26728fad776be1d2c",
 "a9c61480637edfe4a2482a9d3e2e189294867f60": "ae7630822d35aa6482fb1ad2ac09848cfad293fa19b4f019b856abd07b5da938",
 "dd181a9d2772d8858f7c73245716639bee97f932": "88361adc7b6138da01efcb6c8ed7b0cb6423bfbc4b5f6200aae82fdac4074a19",
 "6b9bb90548f56bfb23321f849b6da64e894cbc04": "224dd11eed6f632b6e1ab4aede835822f5d0926e600885eb66df96fc2565550c",
 "70167a0b036081b63638e7eacce7654057f8131c": "f6e224f2469f330665b825807ffc8581ea0aa47124c5b0e9a5182a2d71094dac",
 "5e08b4fb4825f7bfdd138ad13139a3d1af6d29dc": "092bf33fe4cf7847b641d0b8ad8dd6ad9958e718fb96a5eda1a5bc4c9748a89a",
 "257212ff6a22efaf9773c55568f165c86fce967a": "d9f0be1335d6c774857f619089dce214a0dd43a4bac7595c0c6126b4d1be1863",
 "777211951cc54e036f9770990476f968bf5a1a33": "ead47fc1bc713d17b71e3986b832a46d48c586289b5fa1a00064d858f830e5f1",
 "53a94ccb7abc115382c208b540ac45728ba914d9": "509bc4d51559a3c449cc030a200123e8a94645ce79732c31b2439efb435afdbf",
 "d1b59d640b885fee46b3cb93c6dab4b38ba32019": "3dcd4e7112a61c1d4a0c7f999dbd7085cc66a534e0df9a5c705c05969048a502",
 "fd3bcfd8eb89378b4f1764d3947e5132febf3295": "d9110bf2bf6fe63ca1771c1709dfd991d5cd5f2a1a4942aa18d216638ae83a1b",
 "232d0e5ba4b69b74a7fa044da5b7c15c8ee273f5": "3f2d20c3010559c2550bcc9ce412542a7c4eed8273df2cc81f85fa8fe43141f9",
 "4f42953ce879e1e65a44342239eccfa728f8fa8f": "b62bbdebd7d6a23238afbdfcd45b9276fb6aff40974221317c1b8248d192a2af",
 "3ea9e36f296ab6f6b9c636abc1cc401ce1768f07": "ef416c58749f19eab5a9b514f24ac01789f0f52751d80c6b533da130eab1177e",
 "5513701317c1a0d67800ffa4abac093eacbc87ea": "e8f454602aed1559fdf1b79f0d77a9d4dcea37dd57404d6a0759bb9d723514ed"
});
// END GENERATED PINNED SOURCE INVENTORIES
let activeSlot=null;
async function slots(id){
 const now=Date.now();if(activeSlot?.id===id&&(activeSlot.pending||now-activeSlot.time<5000))return activeSlot.promise;
 const entry={id,time:now,pending:true,promise:null};activeSlot=entry;
 entry.promise=openSlots(id).then(value=>{entry.pending=false;entry.time=Date.now();return value;}).catch(error=>{if(activeSlot===entry)activeSlot=null;throw error;});
 return entry.promise;
}
async function openSlots(id){
 if(!globalThis.caches)return null;
 if(globalThis.navigator?.storage?.estimate&&navigator.locks?.request){
  const {managedSourceSlot}=await import('./source-retention.mjs');
  try{return await managedSourceSlot(id,PREFIX);}catch{}
 }
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
 if(onProgress&&r.body){
  // Only authenticated per-asset metadata may size the allocation. An HTTP
  // header controls the displayed total, never an unbounded upfront buffer.
  const pinned=Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&expected.bytes<=256*1024*1024;
  const result=pinned?new Uint8Array(expected.bytes):null,chunks=result?null:[];
  const reader=r.body.getReader();let count=0,last=0,total=Number(r.headers.get('content-length'))||expected.bytes||0,complete=false;
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    if(result){if(value.byteLength>result.length-count)throw Error('Source asset byte count mismatch');result.set(value,count);}
    else chunks.push(value);
    count+=value.byteLength;if(performance.now()-last>150){onProgress({bytes:count,total});last=performance.now();}
   }
   if(result){if(count!==result.length)throw Error('Source asset byte count mismatch');bytes=result.buffer;}
   else{const joined=new Uint8Array(count);let at=0;for(const c of chunks){joined.set(c,at);at+=c.length;}bytes=joined.buffer;}
   complete=true;
  }finally{
   if(!complete)try{await reader.cancel();}catch{}
   try{reader.releaseLock?.();}catch{}
  }
 }else bytes=await r.arrayBuffer();
 await verifySourceBytes(bytes,expected);try{if(cache?._nativePut)await cache._nativePut(url,bytes);else await cache?.put(url,new Response(bytes));}catch{}
 return bytes;
}
// File-list metadata shares the existing raw-source cache slots. It does
// not read or retain derived geometry and is independent of IndexedDB schema.
function checkedSourceTree(tree,pinned){
 if(!tree||tree.sha!==pinned||tree.truncated!==false||!Array.isArray(tree.tree))throw Error('Unpinned source file list');
 for(const f of tree.tree)if(f.type==='blob'){
  if(typeof f.path!=='string'||f.path.startsWith('/')||f.path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe source path');
  if(!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{40}$/.test(f.sha))throw Error('Invalid source file metadata');
 }
 return tree;
}
export async function sourceTree(id,pinned,signal){
 if(!/^[a-f0-9]{40}$/.test(pinned))throw Error('Unpinned source tree');
 const digest=PINNED_SOURCE_TREES[pinned];
 if(digest){const {loadPinnedSourceTree}=await import('./source-inventory.mjs');return loadPinnedSourceTree(pinned,digest,new URL('../source-inventories/'+pinned+'.json',import.meta.url),signal);}
 const key='https://inkwave.invalid/native-source-tree/'+pinned,encoder=new TextEncoder();let cache;
 try{
  cache=await slots(id);const old=await cache?.match(key);
  if(old)try{
   const saved=await old.json();
   if(saved.schema!==1||saved.tree!==pinned||typeof saved.body!=='string'||!/^[a-f0-9]{64}$/.test(saved.sha256)||!Number.isSafeInteger(saved.bytes)||saved.bytes<0)throw Error('Invalid source metadata envelope');
   await verifySourceBytes(encoder.encode(saved.body),{sha256:saved.sha256,bytes:saved.bytes});
   return checkedSourceTree(JSON.parse(saved.body),pinned);
  }catch{await cache.delete(key);}
 }catch{}
 const r=await fetch('https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/'+pinned+'?recursive=1',{signal,credentials:'omit',mode:'cors',referrerPolicy:'no-referrer'});
 if(!r.ok)throw Error('Source file list unavailable ('+r.status+')');
 const body=await r.text(),tree=checkedSourceTree(JSON.parse(body),pinned),bytes=encoder.encode(body);
 try{if(cache){const sha256=hex(await crypto.subtle.digest('SHA-256',bytes));await cache.put(key,new Response(JSON.stringify({schema:1,tree:pinned,bytes:bytes.byteLength,sha256,body})));}}catch{}
 return tree;
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
async function seal(data){
 const keys=data.faceTriangles?[...arrays,'faceTriangles']:arrays;
 const hashes=[];
 // WebCrypto snapshots each BufferSource when digest is called. Avoid
 // retaining a second entire stage in outstanding native hash jobs. Small
 // columns still overlap in pairs; a large column is authenticated alone.
 for(let at=0;at<keys.length;){
  const first=data[keys[at++]],wave=[crypto.subtle.digest('SHA-256',first)];
  if(at<keys.length&&first.byteLength+data[keys[at]].byteLength<=8*1024*1024)
   wave.push(crypto.subtle.digest('SHA-256',data[keys[at++]]));
  hashes.push(...await Promise.all(wave));
 }
 // Packed IDs are already hashed as bytes. Serialize each shared view's exact
 // range instead of expanding hundreds of thousands of numeric object keys.
 const manifest=JSON.stringify(data.manifest,(_key,value)=>data.faceTriangles&&value instanceof Uint32Array&&value.buffer===data.faceTriangles.buffer
  ?{packedTriangleOffset:value.byteOffset-data.faceTriangles.byteOffset,packedTriangleLength:value.length}:value);
 hashes.push(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifest)));return hashes.map(hex).join('/');
}
export async function readDerived(key){
 let db;try{db=await openDB();const row=await transact(db,'readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});if(!row||await seal(row.data)!==row.seal)return null;
  // Refresh only the small eviction row after successful verification. A
  // concurrent replacement must not acquire this older read's timestamp.
  try{await new Promise((resolve,reject)=>{
   const t=db.transaction('stage-times','readwrite'),s=t.objectStore('stage-times'),r=s.get(key);
   r.onsuccess=()=>{const current=r.result;if(current&&(current.seal===row.seal||(!current.seal&&Object.is(current.time,row.time))))s.put({key,time:Date.now(),seal:row.seal});};
   t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error);
  });}catch{}
  return row.data;}catch{return null;}finally{db?.close();}
}
// Resolve once IDB has synchronously serialized put(data), before its disk
// commit. The owner may then transfer the original buffers, but must keep the
// worker alive until completion settles. No extra application-level clone.
export async function beginDerivedWrite(key,data){
 let db;
 try{
  const signature=await seal(data);db=await openDB();
  let publish,complete,settled=false,published=false;
  const staged=new Promise(resolve=>{publish=resolve;}),completion=new Promise(resolve=>{complete=resolve;});
  const t=db.transaction(['stages','stage-times'],'readwrite'),s=t.objectStore('stages'),times=t.objectStore('stage-times');
  const finish=ok=>{if(settled)return;settled=true;if(!published)publish(null);complete(ok);db.close();};
  t.oncomplete=()=>finish(true);t.onerror=t.onabort=()=>finish(false);
  const r=times.getAll(),keys=s.getAllKeys();let rows,stageKeys;
  const update=()=>{
   if(!rows||!stageKeys)return;
   try{
    if(rows.length!==stageKeys.length||rows.some((row,i)=>indexedDB.cmp(row.key,stageKeys[i])!==0)){t.abort();return;}
    const other=rows.filter(v=>v.key!==key).sort((a,b)=>b.time-a.time);
    for(const row of other.slice(1)){s.delete(row.key);times.delete(row.key);}
    const time=Date.now();s.put({key,time,seal:signature,data});times.put({key,time,seal:signature});
    published=true;publish({completion});
   }catch{try{t.abort();}catch{finish(false);}}
  };
  r.onsuccess=()=>{rows=r.result;update();};keys.onsuccess=()=>{stageKeys=keys.result;update();};
  return await staged;
 }catch{db?.close();return null;}
}
export async function writeDerived(key,data){
 const pending=await beginDerivedWrite(key,data);if(pending)await pending.completion;
}
