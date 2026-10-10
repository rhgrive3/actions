import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World,makeBuild,REV_A,REV_B,REV_C } from './worker-fixture.mjs';
const prefix='inkwave-startup-v2:/actions/:';
const asset=(revision,path='src/main.js')=>`_versions/${revision}/${path}`;
const get=async(w,path,opts)=> (await w.request(path,opts)).response;
async function installed(build=makeBuild(),world=new World()) {world.serve(build);const worker=world.worker(build);await worker.install();await worker.activate();return {world,worker,build};}

test('complete snapshot commits last, claims only on activation, never skipWaiting',async()=>{
 const world=new World(),build=makeBuild();world.serve(build);const worker=world.worker(build);await worker.install();
 assert.equal(worker.counts.claims,0);assert.equal(worker.counts.skipWaiting,0);
 assert(world.puts.at(-1).url.endsWith('__inkwave_cache_complete__'));
 await worker.activate();assert.equal(worker.counts.claims,1);assert.equal((await worker.status()).offlineReady,true);
});
test('warm script and empty-destination JSON are zero-fetch zero-write hits',async()=>{
 const {world,worker}=await installed();world.resetStats();
 assert.equal(await(await get(worker,asset(REV_A),{destination:'script'})).text(),'export const v=1;');
 assert.equal(await(await get(worker,asset(REV_A,'profile.json'))).text(),'{"v":1}');
 assert.equal(world.fetches.length,0);assert.equal(world.puts.length,0);
 const result=await worker.request(asset(REV_A));assert(result.synchronousWaits>0);
});
test('offline first visit after complete install gets matching HTML and all core files',async()=>{
 const {world,worker,build}=await installed();world.offline=true;
 assert.equal(await(await get(worker,'./',{mode:'navigate'})).text(),build.index.toString());
 for(const [rel,body]of Object.entries(build.bodies))assert.equal(await(await get(worker,asset(REV_A,rel))).text(),body);
});
test('online new HTML never overwrites old offline snapshot',async()=>{
 const {world,worker,build}=await installed();const newer=makeBuild(REV_B);world.serve(newer);world.resetStats();
 assert.equal(await(await get(worker,'./',{mode:'navigate'})).text(),newer.index.toString());
 assert.equal(world.puts.length,0);world.offline=true;
 assert.equal(await(await get(worker,'./',{mode:'navigate'})).text(),build.index.toString());
});
test('same-origin query navigation falls back to coherent root snapshot, deep route does not',async()=>{
 const {world,worker}=await installed();
 const unknown=await worker.request('not-a-route',{mode:'navigate'});assert.equal(unknown.handled,false);assert.equal(unknown.response.status,404);
 world.offline=true;assert((await(await get(worker,'./?skipTitle&map=tidewater',{mode:'navigate'})).text()).includes(REV_A));
});
test('network 5xx and navigation deadline fall back without automatic reload',async()=>{
 const {world,worker}=await installed();world.route('./','Server error',503);
 assert.equal((await get(worker,'./',{mode:'navigate'})).status,200);
 world.fetchDelay=100;assert.equal((await get(worker,'./',{mode:'navigate'})).status,200);
});
test('no caches / quota-denied storage gives offline recovery document instead of rejection',async()=>{
 const world=new World();const worker=world.worker(makeBuild());world.offline=true;world.failOpen=true;
 const response=await get(worker,'./',{mode:'navigate'});assert.equal(response.status,503);const html=await response.text();
 assert(html.includes('オフライン'));assert(!html.includes('setTimeout'));assert(!html.includes('location.reload'));
 assert.equal((await worker.status()).offlineReady,false);
});
test('partial eviction invalidates readiness marker and emits recovery fallback',async()=>{
 const {world,worker}=await installed();world.maps.get(prefix+REV_A).delete(world.url(asset(REV_A,'profile.json')));
 assert.equal((await worker.status()).offlineReady,false);world.offline=true;
 assert.equal((await get(worker,'./',{mode:'navigate'})).status,503);
});
test('worker restart uses existing cache and persisted metadata',async()=>{
 const {world,build}=await installed();const restarted=world.worker(build);world.offline=true;world.resetStats();
 assert.equal(await(await get(restarted,asset(REV_A))).text(),'export const v=1;');assert.equal(world.fetches.length,0);
 assert.equal((await restarted.status()).offlineReady,true);
});
test('new deploy reuses verified unchanged bytes under new revision keys',async()=>{
 const {world}=await installed();const b=makeBuild(REV_B,{'src/main.js':'export const v=2;','profile.json':'{"v":1}'});world.serve(b);world.resetStats();
 const next=world.worker(b);await next.install();
 assert.equal(world.fetches.length,2); // new HTML + changed JS only
 assert(!world.fetches.some(x=>x.url===world.url(asset(REV_B,'profile.json'))));
 assert(world.maps.get(prefix+REV_B).has(world.url(asset(REV_B,'profile.json'))));
 await next.activate();world.resetStats();assert.equal(await(await get(next,asset(REV_B))).text(),'export const v=2;');assert.equal(world.fetches.length,0);
});
test('new deploy never reuses mismatching content',async()=>{
 const {world}=await installed();world.maps.get(prefix+REV_A).get(world.url(asset(REV_A,'profile.json'))).body=Buffer.from('{"corrupt":true}');
 const b=makeBuild(REV_B);world.serve(b);world.resetStats();const next=world.worker(b);await next.install();
 assert(world.fetches.some(x=>x.url===world.url(asset(REV_B,'profile.json'))));
});
test('partial install missing dependency never destroys active offline snapshot',async()=>{
 const {world,worker,build}=await installed();const b=makeBuild(REV_B,{'src/main.js':'export const v=2;','missing.json':'{}'});world.serve(b);world.routes.delete(world.url(asset(REV_B,'missing.json')));
 await assert.rejects(world.worker(b).install(),/Uncacheable/);assert(!world.maps.has(prefix+REV_B));assert(world.maps.has(prefix+REV_A));
 world.offline=true;assert.equal(await(await get(worker,'./',{mode:'navigate'})).text(),build.index.toString());
});
test('candidate HTML mismatch fails before precache; old active preserved',async()=>{
 const {world}=await installed();const b=makeBuild(REV_B);world.serve(b);world.route('index.html','<!doctype html>other build');world.resetStats();
 await assert.rejects(world.worker(b).install(),/integrity/);assert.equal(world.fetches.length,1);assert(!world.maps.has(prefix+REV_B));assert(world.maps.has(prefix+REV_A));
});
test('candidate quota failure / complete-marker failure rollback',async()=>{
 for(const when of ['any','marker']){
  const {world}=await installed();const b=makeBuild(REV_B);world.serve(b);world.failPut=(cache,url)=>cache===prefix+REV_B&&(when==='any'||url.endsWith('__inkwave_cache_complete__'));
  await assert.rejects(world.worker(b).install(),/Quota/);assert(!world.maps.has(prefix+REV_B));assert(world.maps.has(prefix+REV_A));
 }
});
test('many waiting deployments keep at most active and newest candidate',async()=>{
 const {world}=await installed();
 for(const revision of [REV_B,REV_C,'d'.repeat(64),'e'.repeat(64)]){
  const build=makeBuild(revision);world.serve(build);await world.worker(build).install();
  assert.equal([...world.maps.keys()].filter(k=>/^inkwave-startup-v2:\/actions\/:\w{64}$/.test(k)).length,2);assert(world.maps.has(prefix+REV_A));assert(world.maps.has(prefix+revision));
 }
});
test('activated revision can fall back to complete previous snapshot after eviction',async()=>{
 const {world}=await installed();const b=makeBuild(REV_B);world.serve(b);const next=world.worker(b);await next.install();await next.activate();
 world.maps.delete(prefix+REV_B);world.offline=true;const response=await get(next,'./',{mode:'navigate'});assert((await response.text()).includes(REV_A));
 assert.equal(await(await get(next,asset(REV_A))).text(),'export const v=1;');
});
test('runtime miss is de-duplicated and cloned before consumers read it',async()=>{
 const {world,worker}=await installed();world.maps.get(prefix+REV_A).delete(world.url(asset(REV_A)));world.resetStats();world.fetchDelay=10;
 const responses=await Promise.all(Array.from({length:12},()=>get(worker,asset(REV_A))));
 assert.equal(world.fetches.length,1);assert.equal(world.puts.length,1);
 assert((await Promise.all(responses.map(r=>r.text()))).every(t=>t==='export const v=1;'));
});
test('runtime quota failure still returns verified online response',async()=>{
 const {world,worker}=await installed();world.maps.get(prefix+REV_A).delete(world.url(asset(REV_A)));world.failPut=()=>true;
 assert.equal(await(await get(worker,asset(REV_A))).text(),'export const v=1;');
});
test('runtime poisoned 200 fails closed, while 404 is not cached',async()=>{
 const {world,worker}=await installed();world.maps.get(prefix+REV_A).delete(world.url(asset(REV_A)));world.route(asset(REV_A),'poison');
 await assert.rejects(get(worker,asset(REV_A)),/integrity/);assert(!world.maps.get(prefix+REV_A).has(world.url(asset(REV_A))));
 world.route(asset(REV_A),'missing',404);assert.equal((await get(worker,asset(REV_A))).status,404);assert(!world.maps.get(prefix+REV_A).has(world.url(asset(REV_A))));
});
test('storage denial leaves online requests functional',async()=>{
 const world=new World(),build=makeBuild();world.serve(build);world.failOpen=true;const worker=world.worker(build);
 assert.equal(await(await get(worker,asset(REV_A))).text(),'export const v=1;');await assert.rejects(worker.install(),/SecurityError/);
});
test('mutable root, query, range, POST, cross-origin and unknown assets bypass cache policy',async()=>{
 const {world,worker}=await installed();world.resetStats();
 for(const [url,options] of [ ['src/main.js',{}],[asset(REV_A)+'?x=1',{}],[asset(REV_A),{headers:{Range:'bytes=0-3'}}],[asset(REV_A),{method:'POST'}],['https://other.invalid/file.js',{}],[asset(REV_A,'unknown.js'),{}]]){
  const result=await worker.request(url,options);assert.equal(result.handled,false,url);
 }
 assert.equal(world.puts.length,0);
});
test('unknown future revision never creates cache or substitutes current content',async()=>{
 const {world,worker}=await installed();const b=makeBuild(REV_B,{'src/main.js':'export const v=2;'});world.serve(b);const before=[...world.maps.keys()];
 assert.equal(await(await get(worker,asset(REV_B))).text(),'export const v=2;');assert.deepEqual([...world.maps.keys()],before);
});
test('legacy cleanup is scoped and preserves another app and unrelated caches',async()=>{
 const world=new World();const legacy=await world.caches.open('inkwave-shell-v1');await legacy.put(world.url('old.js'),new Response('old'));await legacy.put('https://fixture.invalid/neighbor/file.js',new Response('neighbor'));
 await world.caches.open('other-application-cache');await installed(makeBuild(),world);
 assert.equal(await(await legacy.match('https://fixture.invalid/neighbor/file.js')).text(),'neighbor');assert.equal(await legacy.match(world.url('old.js')),undefined);assert(world.maps.has('other-application-cache'));
});
test('uncacheable Vary star fails candidate, not previous snapshot',async()=>{
 const {world}=await installed();const b=makeBuild(REV_B,{'src/main.js':'export const v=2;'});world.serve(b);world.route(asset(REV_B),b.bodies['src/main.js'],200,{Vary:'*'});
 await assert.rejects(world.worker(b).install(),/Uncacheable/);assert(world.maps.has(prefix+REV_A));assert(!world.maps.has(prefix+REV_B));
});
test('budget checks reject oversize revisions before network or storage writes',async()=>{
 const world=new World(),b=makeBuild();b.config.declaredBytes=16*1024*1024+1;await assert.rejects(world.worker(b).install(),/budget/);assert.equal(world.fetches.length,0);assert.equal(world.puts.length,0);
});
test('old worker fixture really refetches/rewrites warm scripts and bypasses JSON',{skip:!process.env.INKWAVE_BASELINE_SITE},async()=>{
 const oldPath=process.env.INKWAVE_BASELINE_SITE;if(!oldPath)return;
 const world=new World(),build=makeBuild();world.serve(build);const old=world.worker(build,fs.readFileSync(oldPath+'/sw.js','utf8'));await old.install();await old.activate();
 await get(old,asset(REV_A),{destination:'script'});world.resetStats();await get(old,asset(REV_A),{destination:'script'});
 assert.equal(world.fetches.length,1);assert.equal(world.puts.length,1);
 const result=await old.request(asset(REV_A,'profile.json'));assert.equal(result.handled,false);
});


test('mutable navigation revalidates HTTP cache rather than trusting a fresh old index',async()=>{
 const {world,worker}=await installed();world.resetStats();await get(worker,'./',{mode:'navigate'});
 assert.equal(world.fetches.length,1);assert.equal(world.fetches[0].cache,'no-cache');
});
test('state read failure during update cannot prune the active snapshot',async()=>{
 const {world}=await installed();const b=makeBuild(REV_B);world.serve(b);world.failOpen=true;
 await assert.rejects(world.worker(b).install(),/SecurityError/);assert(world.maps.has(prefix+REV_A));
});
test('lost metadata is repaired only by active navigation before update retries',async()=>{
 const {world,worker}=await installed();world.maps.delete(prefix+'state');const b=makeBuild(REV_B);world.serve(b);
 await assert.rejects(world.worker(b).install(),/state missing/);assert(world.maps.has(prefix+REV_A));
 await get(worker,'./',{mode:'navigate'});const newer=world.worker(b);await newer.install();await newer.activate();
 assert(world.maps.has(prefix+REV_A));assert(world.maps.has(prefix+REV_B));assert.equal((await newer.status()).offlineReady,true);
});
