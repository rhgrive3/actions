// Three small real CacheStorage cases; fixture catalogue/converter, actual worker/cache.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {chromium,webkit} from 'playwright';
const engine=process.env.CACHE_ENGINE;assert(['chromium','webkit'].includes(engine));
const output=process.env.IDB_EVIDENCE;assert(output);
const sha=b=>createHash('sha256').update(b).digest('hex'),git=b=>createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
const cache=await readFile(new URL('./source-cache-candidate.mjs',import.meta.url)),worker=await readFile(new URL('./source-worker-candidate.mjs',import.meta.url));
assert.equal(sha(cache),process.env.CACHE_SOURCE_SHA256);assert.equal(sha(worker),process.env.WORKER_SOURCE_SHA256);
const pin='1'.repeat(40),obj='o stage\nv 0 0 0\n',mtl='newmtl stage\n',treeURL='https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/'+pin+'?recursive=1';
const tree=JSON.stringify({sha:pin,truncated:false,tree:[{type:'blob',path:'stage.mtl',size:Buffer.byteLength(mtl),sha:git(mtl)}]});
const files=new Map([['/',{type:'text/html',body:'<!doctype html><title>Isolated source cache test</title>'}],['/source-cache.mjs',{type:'text/javascript',body:cache}],['/source-worker.mjs',{type:'text/javascript',body:worker}],['/stage.obj',{type:'text/plain',body:obj}],['/stage.mtl',{type:'text/plain',body:mtl}],['/source-catalog.mjs',{type:'text/javascript',body:`export const SOURCE_RECIPE='fixture';export const SOURCE_STAGES=[{id:'stage',internal:'stage',tree:'${pin}',sourceSha256:'${sha(obj)}'}];export const sourceURL=(_,path)=>new URL(path,import.meta.url).href;`}],['/source-convert.mjs',{type:'text/javascript',body:`export function convertSource(stage,obj,mtl,files){if(obj!==${JSON.stringify(obj)}||mtl!==${JSON.stringify(mtl)}||files['stage.mtl'].gitSha1!=='${git(mtl)}')throw Error('fixture input mismatch');return Object.fromEntries(${JSON.stringify(['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'])}.map(k=>[k,new Uint8Array([1,2,3])]))}`}]]);
const unknown=[];const server=http.createServer((req,res)=>{const f=files.get(req.url);if(!f){unknown.push(req.url);res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':f.type,'cache-control':'no-store'});res.end(f.body);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await({chromium,webkit}[engine]).launch({headless:true}),results=[];
try{for(const scenario of ['warm-offline','corrupt-envelope','missing-obj']){
 const context=await browser.newContext({serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'});const denied=[];let offline=false,treeRequests=0;
 try{await context.route('**/*',route=>{const url=route.request().url();if(offline)return route.abort('internetdisconnected');if(url===treeURL){treeRequests++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:tree});}if(new URL(url).origin===origin)return route.continue();denied.push(url);return route.abort();});
 const page=await context.newPage();await page.goto(origin);
 await page.evaluate(()=>{window.worker=new Worker('/source-worker.mjs',{type:'module'});window.select=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('worker selection timeout'));},15000);function cleanup(){clearTimeout(timer);worker.removeEventListener('message',onmessage);worker.removeEventListener('error',onerror);}function onmessage(e){if(e.data.result||e.data.error){cleanup();resolve(e.data);}}function onerror(e){cleanup();reject(Error(e.message));}worker.addEventListener('message',onmessage);worker.addEventListener('error',onerror);worker.postMessage({id:'stage',runtimeSha256:'fixed-fixture'});});});
 const first=await page.evaluate(()=>select());assert(first.result,'warm selection failed: '+first.error);assert.equal(first.result.sourceMetrics.cached,false);
 const metadataKey='https://inkwave.invalid/native-source-tree/'+pin;
 const saved=await page.evaluate(async({key,origin})=>{const c=await caches.open('inkwave-native-source-v2-stage');return {tree:!!await c.match(key),obj:!!await c.match(origin+'/stage.obj'),mtl:!!await c.match(origin+'/stage.mtl')};},{key:metadataKey,origin});assert.deepEqual(saved,{tree:true,obj:true,mtl:true});
 if(scenario==='corrupt-envelope')await page.evaluate(async key=>{const c=await caches.open('inkwave-native-source-v2-stage'),e=await(await c.match(key)).json();e.sha256='0'.repeat(64);await c.put(key,new Response(JSON.stringify(e)));},metadataKey);
 if(scenario==='missing-obj')await page.evaluate(async url=>{const c=await caches.open('inkwave-native-source-v2-stage');await c.delete(url);},origin+'/stage.obj');
 offline=true;await context.setOffline(true);
 const second=await page.evaluate(()=>select());
 if(scenario==='warm-offline'){assert(second.result,'offline selection failed: '+second.error);assert.equal(second.result.sourceMetrics.cached,false);for(const field of ['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'])assert.deepEqual(second.result[field],first.result[field]);}else{assert.equal(second.result,undefined);assert.equal(typeof second.error,'string');assert(second.error.length>0);}
 assert.equal(treeRequests,1);assert.deepEqual(denied,[]);results.push({scenario,status:'passed',warmRawCache:saved,offline:true,treeRequests,result:!!second.result,error:second.error||null});
 }finally{await context.close();}
}assert.deepEqual(unknown,[]);await writeFile(output+'/cache-offline-result.json',JSON.stringify({status:'passed',engine,browserVersion:browser.version(),sourceSHA256:{cache:sha(cache),worker:sha(worker)},scope:'Real browser CacheStorage and native Worker; synthetic catalogue/converter and authenticated tiny source fixtures. Same worker remains alive across selection; no full game boot, source geometry, device, or memory measurement.',results},null,2));
}catch(error){await writeFile(output+'/cache-offline-result.json',JSON.stringify({status:'failed',engine,error:String(error.stack||error),results},null,2));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
