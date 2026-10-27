// Production worker logic and real Node HTTP transport, with the existing
// event/CacheStorage contract fixture. NOT native browser Service Worker QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { World, makeBuild, REV_A, REV_B } from './worker-fixture.mjs';
const until=async fn=>{const end=Date.now()+2000;while(!fn()){if(Date.now()>end)throw Error('transport condition timed out');await new Promise(r=>setTimeout(r,5));}};
async function setup(t){
 let world,oversize=false,corrupt=false;const stats={requests:[],chunks:0,cancelled:0};
 const server=http.createServer((req,res)=>{
  stats.requests.push(req.url);const url=world.url(req.url),row=world.routes.get(url);
  if(oversize&&req.url.endsWith('/late.bin')){
   res.writeHead(200,{'Content-Type':'application/octet-stream'});let n=0;
   const timer=setInterval(()=>{n++;stats.chunks++;res.write(Buffer.alloc(4096));if(n===100){clearInterval(timer);res.end();}},5);
   res.once('close',()=>{clearInterval(timer);if(n<100)stats.cancelled++;});return;
  }
  if(!row){res.writeHead(404);return res.end('missing');}
  res.writeHead(row.status,row.headers||{'Content-Type':'application/javascript'});
  res.end(corrupt&&req.url.includes(REV_B)&&req.url.endsWith('/src/main.js')?'corrupted':row.body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 world=new World(`http://127.0.0.1:${server.address().port}/actions/`);
 world.fetch=async(input,options={})=>{
  if(world.offline)throw new TypeError('Test transport offline');
  const url=world.url(input);world.fetches.push({url,cache:input.cache});return fetch(input,options);
 };
 const build=makeBuild(REV_A,{'src/main.js':'export const v=1;','profile.json':'{"v":1}','late.bin':'safe'});
 build.config.precache=build.config.precache.filter(x=>x!=='late.bin');world.serve(build);
 const worker=world.worker(build);worker.context.setTimeout=setTimeout;worker.context.clearTimeout=clearTimeout;
 await worker.install();await worker.activate();
 return{world,build,worker,stats,setOversize(){oversize=true;},setCorrupt(){corrupt=true;},restoreTimers(w){w.context.setTimeout=setTimeout;w.context.clearTimeout=clearTimeout;}};
}
test('real HTTP worker verification aborts both oversized attempts before full transfer', {timeout:5000},async t=>{
 const f=await setup(t);f.setOversize();
 await assert.rejects(f.worker.request(`_versions/${REV_A}/late.bin`),/integrity/);
 await until(()=>f.stats.cancelled===2);
 assert(f.stats.chunks<20,`received ${f.stats.chunks} of 200 possible chunks`);
 assert.equal(f.stats.requests.filter(url=>url.endsWith('/late.bin')).length,2);
 assert.equal((await f.worker.status()).offlineReady,true);
 t.diagnostic(JSON.stringify({possibleChunks:200,sentChunks:f.stats.chunks,cancelledStreams:f.stats.cancelled,attempts:f.stats.requests.filter(url=>url.endsWith('/late.bin')).length}));
});
test('real HTTP worker uses exact-revision assets and warm offline requests perform no network work',async t=>{
 const f=await setup(t);const url=`_versions/${REV_A}/late.bin`;
 assert.equal(await(await f.worker.request(url)).response.text(),'safe');
 const requests=f.stats.requests.length;f.world.offline=true;
 assert.equal(await(await f.worker.request(url)).response.text(),'safe');
 assert.equal(f.stats.requests.length,requests);
 assert.equal((await f.worker.status()).revision,REV_A);
});
test('real HTTP corrupt update never replaces the completed offline revision',async t=>{
 const f=await setup(t),candidate=makeBuild(REV_B,{'src/main.js':'export const v=2;'});f.world.serve(candidate);f.setCorrupt();
 const next=f.world.worker(candidate);f.restoreTimers(next);await assert.rejects(next.install(),/integrity/);
 f.world.offline=true;
 const page=await f.worker.request('./',{mode:'navigate'});assert.equal(page.response.status,200);assert((await page.response.text()).includes(REV_A));
 assert.equal((await f.worker.status()).revision,REV_A);assert.equal((await f.worker.status()).offlineReady,true);
});
