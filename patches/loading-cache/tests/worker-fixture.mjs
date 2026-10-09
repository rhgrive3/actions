// Event/CacheStorage/network contract fixture. This is NOT a native Service Worker implementation.
import vm from 'node:vm';import crypto from 'node:crypto';import fs from 'node:fs';
export const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export const template = fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
export const REV_A='a'.repeat(64), REV_B='b'.repeat(64), REV_C='c'.repeat(64);
export function makeBuild(revision=REV_A, bodies={'src/main.js':'export const v=1;','profile.json':'{"v":1}'}) {
 const index=Buffer.from(`<!doctype html><head><base href="./_versions/${revision}/"></head><body>INKWAVE</body>`);
 const assets=Object.fromEntries(Object.entries(bodies).map(([key,value])=>[key,[Buffer.byteLength(value),sha(value)]]));
 return {config:{schema:1,revision,index:{bytes:index.length,sha256:sha(index)},declaredBytes:index.length+Object.values(assets).reduce((n,x)=>n+x[0],0),precache:Object.keys(assets),assets},index,bodies};
}
export class World {
 constructor(scope='https://fixture.invalid/actions/') {
  this.scope=scope;this.maps=new Map();this.routes=new Map();this.fetches=[];this.puts=[];this.deletes=[];this.failPut=null;this.failOpen=false;this.offline=false;this.fetchDelay=0;
  const world=this;
  this.Request=class extends Request { constructor(input,init){super(typeof input==='string'?new URL(input,world.scope):input,init);} };
  this.caches={
   open:async name=>{
    if(world.failOpen)throw new Error('SecurityError');
    if(!world.maps.has(name))world.maps.set(name,new Map());
    const store=world.maps.get(name);
    return {
     match:async request=>{const row=store.get(world.url(request));return row?world.response(row,world.url(request)):undefined;},
     put:async(request,response)=>{
      const url=world.url(request);
      if(world.failPut?.(name,url,response))throw new Error('QuotaExceededError');
      if(response.status===206||response.headers.get('vary')==='*')throw new TypeError('Uncacheable Response');
      if(response.bodyUsed)throw new TypeError('Body already consumed: '+url);
      const bytes=Buffer.from(await response.arrayBuffer());
      world.puts.push({cache:name,url,bytes:bytes.length});store.set(url,{body:bytes,status:response.status,headers:Object.fromEntries(response.headers),type:response.type,redirected:response.redirected});
     },
     keys:async()=>[...store.keys()].map(url=>new world.Request(url)),
     delete:async req=>store.delete(world.url(req)),
     add:async req=>{const url=world.url(req);const response=await world.fetch(new world.Request(url));const cache=await world.caches.open(name);if(!response.ok)throw new Error('add failed');await cache.put(url,response);}
    };
   },
   keys:async()=>[...world.maps.keys()],
   delete:async name=>{world.deletes.push(name);return world.maps.delete(name);},
   match:async request=>{for(const name of world.maps.keys()){const hit=await(await world.caches.open(name)).match(request);if(hit)return hit;}}
  };
 }
 url(request){return new URL(typeof request==='string'?request:request.url,this.scope).href;}
 response(row,url){
  const response=new Response(row.body,{status:row.status||200,headers:row.headers||{'Content-Type':'application/javascript'}});
  Object.defineProperties(response,{url:{value:url},redirected:{value:row.redirected||false},type:{value:row.type||'basic'}});return response;
 }
 route(url,body,status=200,headers){this.routes.set(this.url(url),{body:Buffer.from(body),status,headers});}
 serve(build){
  this.route('index.html',build.index,200,{'Content-Type':'text/html'});this.route('./',build.index,200,{'Content-Type':'text/html'});
  for(const [rel,body]of Object.entries(build.bodies))this.route(`_versions/${build.config.revision}/${rel}`,body);
 }
 fetch=async(input,options={})=>{
  const url=this.url(input);this.fetches.push({url,cache:typeof input==='object'?input.cache:options.cache,mode:typeof input==='object'?input.mode:undefined});
  if(this.offline)throw new TypeError('Network offline');
  if(this.fetchDelay)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,this.fetchDelay);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
  const row=this.routes.get(url);return this.response(row||{body:'Not found',status:404},url);
 };
 resetStats(){this.fetches=[];this.puts=[];this.deletes=[];}
 worker(build,source=template) {
  const handlers={};const counts={claims:0,skipWaiting:0};const world=this;
  const self={registration:{scope:this.scope},location:new URL('sw.js',this.scope),clients:{claim:async()=>{counts.claims++;}},skipWaiting:async()=>{counts.skipWaiting++;},addEventListener:(name,handler)=>handlers[name]=handler};
  const context=vm.createContext({self,caches:this.caches,fetch:this.fetch,Request:this.Request,Response,Headers,URL,AbortController,crypto:crypto.webcrypto,console,setTimeout:(fn,ms)=>setTimeout(fn,ms>=4000?30:ms),clearTimeout,TextEncoder,Uint8Array,ArrayBuffer,Date,Promise});
  vm.runInContext(source.replace('/*__INKWAVE_CACHE_BUILD__*/ null',JSON.stringify(build.config)),context,{filename:'worker-under-test.js'});
  async function event(type,extras={}) {
   const waits=[];let response;let dispatched=false;let synchronousWaits=0;
   const e={...extras,waitUntil(p){if(!dispatched)synchronousWaits++;waits.push(Promise.resolve(p));},respondWith(p){response=Promise.resolve(p);}};
   handlers[type]?.(e);dispatched=true;
   const done=async()=>{for(let i=0;i<waits.length;i++)await waits[i];};
   return {response,done,synchronousWaits};
  }
  return {counts,context,handlers,
   install:async()=>{const e=await event('install');await e.done();},
   activate:async()=>{const e=await event('activate');await e.done();},
   request:async(path,{destination='',mode='cors',method='GET',headers={}}={})=>{
    const request=new world.Request(world.url(path),{method,headers});Object.defineProperties(request,{destination:{value:destination},mode:{value:mode}});
    const e=await event('fetch',{request});const handled=!!e.response;
    const response=await(e.response||world.fetch(request));await e.done();return {response,handled,synchronousWaits:e.synchronousWaits};
   },
   status:async()=>{let result;const e=await event('message',{data:{type:'INKWAVE_CACHE_STATUS'},ports:[{postMessage:value=>result=value}]});await e.done();return result;}
  };
 }
}
