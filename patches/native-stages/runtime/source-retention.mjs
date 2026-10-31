// Extra stages fit only inside the largest two observed source-body sizes.
// The quota budget also reserves one largest-stage body as free headroom.
// No asset bytes or URLs from accounting can bypass source integrity checks.
const STAMP='https://inkwave.invalid/native-cache-stamp',META='https://inkwave.invalid/native-source-accounting-v1';
const POLICY='inkwave-native-source-retention-v1',KEY='https://inkwave.invalid/native-source-policy-v1';
const sizeOf=files=>Object.values(files).reduce((n,v)=>n+v,0);
const seal=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),n=>n.toString(16).padStart(2,'0')).join('');
const envelope=async(files,pending=false)=>new Response(JSON.stringify({schema:1,pending,files,seal:await seal(files)}));
async function readRow(name){
 const cache=await caches.open(name),stamp=await cache.match(STAMP),time=stamp?Number(await stamp.text()):0;
 let files=null;try{const meta=await (await cache.match(META)).json(),keys=(await cache.keys()).map(r=>r.url).filter(url=>url!==META&&url!==STAMP);
  if(meta.schema!==1||meta.pending!==false||!meta.files||typeof meta.files!=='object'||Array.isArray(meta.files)||keys.length!==Object.keys(meta.files).length)throw Error('unknown');
  for(const url of keys)if(!Object.hasOwn(meta.files,url)||!Number.isSafeInteger(meta.files[url])||meta.files[url]<0)throw Error('unknown');
  const bytes=sizeOf(meta.files);if(!Number.isSafeInteger(bytes)||meta.seal!==await seal(meta.files))throw Error('unknown');files=meta.files;
 }catch{}
 return {name,cache,time:Number.isFinite(time)?time:0,files,bytes:files?sizeOf(files):0};
}
const observe=(state,row)=>{state.stages[row.name]={time:row.time,bytes:row.bytes,known:!!row.files};if(row.files)state.high[row.name]=Math.max(state.high[row.name]||0,row.bytes);};
async function save(state,pending=false){const body={stages:state.stages,high:state.high};await (await caches.open(POLICY)).put(KEY,new Response(JSON.stringify({schema:1,pending,...body,seal:await seal(body)})));}
async function stateFor(prefix,checkNames=false){
 const policy=await caches.open(POLICY);let state;
 try{
  state=await (await policy.match(KEY)).json();const body={stages:state.stages,high:state.high};
  if(state.schema!==1||state.pending!==false||!state.stages||typeof state.stages!=='object'||Array.isArray(state.stages)||!state.high||typeof state.high!=='object'||Array.isArray(state.high)||state.seal!==await seal(body))throw Error('unknown');
  for(const [name,row]of Object.entries(state.stages))if(!name.startsWith(prefix)||!Number.isFinite(row.time)||!Number.isSafeInteger(row.bytes)||row.bytes<0||typeof row.known!=='boolean')throw Error('unknown');
  for(const [name,bytes]of Object.entries(state.high))if(!name.startsWith(prefix)||!Number.isSafeInteger(bytes)||bytes<0)throw Error('unknown');
  if(checkNames){const names=(await caches.keys()).filter(n=>n.startsWith(prefix)).sort();for(const name of Object.keys(state.stages))if(!names.includes(name))delete state.stages[name];for(const name of names)observe(state,await readRow(name));}
  return state;
 }catch{}
 // Recover an interrupted ledger from stage records; pending/unknown stages
 // cannot enable extra retention. This is not repeated for every PNG.
 state={stages:{},high:{}};for(const name of (await caches.keys()).filter(n=>n.startsWith(prefix)))observe(state,await readRow(name));return state;
}
async function remove(state,name){await caches.delete(name);delete state.stages[name];}
async function trim(state,active){
 const all=Object.entries(state.stages),cold=all.filter(([name])=>name!==active).sort((a,b)=>b[1].time-a[1].time);let budget=null;
 if(all.every(([,row])=>row.known))try{
  const {usage,quota}=await navigator.storage.estimate(),largest=Object.values(state.high).sort((a,b)=>b-a),total=all.reduce((n,[,r])=>n+r.bytes,0);
  if(Number.isFinite(usage)&&usage>=0&&Number.isFinite(quota)&&quota>=usage)budget=Math.max(0,Math.min((largest[0]||0)+(largest[1]||0),total+quota-usage-(largest[0]||0)));
 }catch{}
 if(budget===null){for(const [name]of cold.slice(1))await remove(state,name);return;}
 let total=all.reduce((n,[,r])=>n+r.bytes,0);for(const [name,row]of cold.reverse()){if(total<=budget)break;await remove(state,name);total-=row.bytes;}
}
export async function managedSourceSlot(id,prefix){
 const lock=run=>navigator.locks.request('inkwave-native-source-retention-v1',run),name=prefix+id;
 await lock(async()=>{
  const cache=await caches.open(name),keys=await cache.keys();
  if(keys.every(r=>r.url===STAMP||r.url===META))await cache.put(META,await envelope({}));
  await cache.put(STAMP,new Response(String(Date.now())));
  const state=await stateFor(prefix,true);if(!Object.hasOwn(state.stages,name))observe(state,await readRow(name));await save(state,true);await trim(state,name);await save(state);
 });
 let cache=await caches.open(name);
 // Admit at most four concurrently verified files (2MiB unless one file is
 // itself larger) while this lock is preparing its fresh ledger snapshot.
 // The first file requests the lock immediately: no timers or added wait.
 let admission=null;
 const writeGroup=group=>lock(async()=>{
  const state=await stateFor(prefix),row=await readRow(name);cache=row.cache;
  group.accepting=false;
  observe(state,row);await save(state,true);
  // Even an unknown old record must remain uncertain if bodies reappear with
  // the same keys; an old sealed byte count must never become valid again.
  await cache.put(META,await envelope(row.files||{},true));
  for(const {url,bytes} of group.entries){
   try{await cache.put(url,new Response(bytes));}
   catch(error){
    if(error?.name!=='QuotaExceededError')throw error;
    const cold=Object.entries(state.stages).filter(([n])=>n!==name).sort((a,b)=>a[1].time-b[1].time);let written=false;
    for(const [other]of cold){await remove(state,other);try{await cache.put(url,new Response(bytes));written=true;break;}catch(next){if(next?.name!=='QuotaExceededError')throw next;}}
    if(!written)throw error;
   }
   if(row.files){row.files={...row.files,[url]:bytes.byteLength};row.bytes=sizeOf(row.files);}
   // Preserve the historical maximum even when later replacements shrink the
   // final group size. No accounting state is reused across lock ownership.
   observe(state,row);
  }
  if(row.files)await cache.put(META,await envelope(row.files));
  await trim(state,name);await save(state);
 });
 const putBytes=(url,bytes)=>new Promise((resolve,reject)=>{
  let group=admission,created=false;
  if(!group?.accepting||group.entries.length>=4||group.bytes+bytes.byteLength>2*1024*1024){group=admission={accepting:true,entries:[],bytes:0};created=true;}
  group.entries.push({url:String(url),bytes,resolve,reject});group.bytes+=bytes.byteLength;
  if(created)writeGroup(group).then(()=>{for(const entry of group.entries)entry.resolve();},error=>{for(const entry of group.entries)entry.reject(error);}).finally(()=>{group.entries.length=0;if(admission===group)admission=null;});
 });
 return {match:url=>cache.match(url),delete:url=>{if(admission)admission.accepting=false;return lock(async()=>{
  const state=await stateFor(prefix),row=await readRow(name);cache=row.cache;
  await save(state,true);await cache.put(META,await envelope(row.files||{},true));
  const removed=await cache.delete(url);
  if(row.files){delete row.files[String(url)];row.bytes=sizeOf(row.files);await cache.put(META,await envelope(row.files));}
  observe(state,row);await trim(state,name);await save(state);return removed;
 });},put:async(url,response)=>putBytes(url,await response.arrayBuffer()),_nativePut:putBytes};
}
