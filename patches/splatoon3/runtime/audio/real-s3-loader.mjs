import { audioLoadScope } from './load-deadline.mjs';
/**
 * Optional 2022 Splatoon 3 MP3 source bank. No game-owned MP3 is bundled here.
 * The user installs an authorized `s3-real` directory alongside this module.
 * Fetches only sounds for the selected/active weapon or kit. In real-only
 * deployment, a missing or late MP3 stays silent rather than synthesizing.
 */
import { validateAuthorizedManifest } from './authorized-samples.mjs';

const directory = new URL('./',import.meta.url);
export const FILE_MANIFEST = new URL('./real-s3-installed.json',import.meta.url);
export const AUDIO_CACHE_BYTES=40*1024*1024;
// WebKit requires Window.fetch's receiver. Detached references throw
// "Can only call Window.fetch on instances of Window" even for HTTP 200 assets.
export function sameModuleFetch(relative,fetcher=globalThis.fetch?.bind(globalThis),options){
  if(typeof relative!=='string'||!/^\.\/s3-real\/[A-Za-z0-9_.+()\-]+\.mp3$/i.test(relative))
    throw new TypeError('Invalid local real-S3 sound path');
  const url=new URL(relative,directory);
  return options===undefined?fetcher(url):fetcher(url,options);
}

export class RealS3SampleLoader {
  constructor(bank,{fetcher=globalThis.fetch?.bind(globalThis),manifestURL=FILE_MANIFEST,assetFetcher}={}){
    this.bank=bank;this.fetcher=fetcher;this.assetFetcher=assetFetcher||((url,options)=>sameModuleFetch(url,fetcher,options));
    this.manifestURL=manifestURL;this.manifestPromise=null;this.queue=Promise.resolve();this.inFlight=new Map();
    this.loaded=new Set();this.notMapped=new Set();this.retryAfter=new Map();this.status='uninitialized';this.errors=[];this.totalErrorCount=0;this.declaredEvents=null;this.clipsById=null;this.clipsByEvent=null;
    this.manifestRetryAt=0;this.pendingJobs=[];this.draining=false;
    this.bank.authorized.fetcher=this.assetFetcher;
    this.bank.authorized.maxBytes=Math.max(this.bank.authorized.maxBytes,AUDIO_CACHE_BYTES);
  }
  _current(){return !this.bank.disposed && this.bank.ctx?.state!=='closed';}
  getManifest(){
    if(!this._current())return Promise.resolve(null);
    if(!this.manifestPromise){
      const scope=audioLoadScope(),scopes=this.bank.authorized._loadScopes||(this.bank.authorized._loadScopes=new Set());
      scopes.add(scope);
      this.manifestPromise=(async()=>{
      try{
        const r=await scope.run(()=>this.fetcher(this.manifestURL,scope.signal?{signal:scope.signal}:undefined));
        scope.check();
        if(!this._current())return null;
        if(!r?.ok)throw new Error('Real-S3 pack manifest unavailable ('+(r?.status||'fetch failed')+')');
        scope.renew();
        const data=await scope.run(()=>r.json());
        scope.check();
        if(!this._current())return null;
        const clips=validateAuthorizedManifest(data);
        // Never fetch arbitrary sourceDrive URLs: only same-origin local assets.
        for(const c of clips)if(!/^s3-real\/[A-Za-z0-9_.+()\-]+\.mp3$/i.test(c.file))throw new Error('Unsafe real-S3 asset path');
        this.declaredEvents=new Set();this.clipsById=new Map();this.clipsByEvent=new Map();
        for(const c of clips){
          const key=`${c.id}:${c.event}`;this.declaredEvents.add(key);
          if(!this.clipsById.has(c.id))this.clipsById.set(c.id,[]);
          if(!this.clipsByEvent.has(key))this.clipsByEvent.set(key,[]);
          this.clipsById.get(c.id).push(c);this.clipsByEvent.get(key).push(c);
        }
        this.status='ready';return {...data,clips};
      }catch(error){if(!this._current())return null;this.status='unavailable';this.declaredEvents=null;this.clipsById=null;this.clipsByEvent=null;this.manifestRetryAt=Date.now()+4000;
        this._error(error?.message||error);return null;}
      finally{scope.finish();scopes.delete(scope);}
    })();}
    return this.manifestPromise;
  }
  // null means the index is still unavailable. Only an explicit false means
  // an event is absent: never synthesize over a declared but not-yet-decoded MP3.
  declares(id,event){return this.status==='ready'&&this.declaredEvents?this.declaredEvents.has(`${id}:${event}`):null;}
  // Several required cues share one bounded import transaction. Independent
  // AuthorizedSamplePack.load calls cannot overlap: each owns a generation.
  ensureMany(requests,{priority=false}={}){
    if(!this._current())return Promise.resolve({loaded:0,cancelled:true,results:[]});
    if(this.status==='unavailable'){
      if(Date.now()<this.manifestRetryAt)return Promise.resolve({loaded:0,unavailable:true,results:[]});
      this.status='uninitialized';this.manifestPromise=null;this.notMapped.clear();
    }
    const entries=[],waits=[],seen=new Set();
    for(const request of requests){
      const id=request?.id,event=request?.event??'fire';if(!id)continue;
      const key=id+':'+(event||'*');if(seen.has(key))continue;seen.add(key);
      if(this.inFlight.has(key)){
        if(priority){const at=this.pendingJobs.findIndex(row=>row.key===key||row.keys?.includes(key));if(at>0)this.pendingJobs.unshift(this.pendingJobs.splice(at,1)[0]);}
        waits.push(this.inFlight.get(key));continue;
      }
      if(this.notMapped.has(key)){waits.push(Promise.resolve({loaded:0,missing:true}));continue;}
      const selected=this._select(id,event);
      if(this.status==='ready'&&this.clipsById){
        if(!selected.length){this.notMapped.add(key);waits.push(Promise.resolve({loaded:0,missing:true}));continue;}
        if(selected.every(c=>this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant)))){
          this.loaded.add(id);waits.push(Promise.resolve({loaded:0,cached:true}));continue;
        }
      }
      if(Date.now()<(this.retryAfter.get(key)||0)){waits.push(Promise.resolve({loaded:0,throttled:true}));continue;}
      entries.push({id,event,key});
    }
    if(entries.length){
      const work=async()=>{
        const results=new Map();
        const finish=common=>{for(const e of entries)results.set(e.key,common);return results;};
        if(!this._current())return finish({loaded:0,cancelled:true});
        const data=await this.getManifest();
        if(!this._current())return finish({loaded:0,cancelled:true});
        if(!data)return finish({loaded:0,unavailable:true});
        const unique=new Map(),plans=[];
        for(const e of entries){
          const selected=this._select(e.id,e.event);
          if(!selected.length){this.notMapped.add(e.key);results.set(e.key,{loaded:0,missing:true});continue;}
          const missing=selected.filter(c=>!this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant)));
          if(!missing.length){this.loaded.add(e.id);results.set(e.key,{loaded:0,cached:true});continue;}
          if(Date.now()<(this.retryAfter.get(e.key)||0)){results.set(e.key,{loaded:0,throttled:true});continue;}
          plans.push({...e,missing});
          for(const clip of missing)unique.set(this.bank.authorized.key(clip.id,clip.event,clip.variant),clip);
        }
        if(!unique.size)return results;
        const imported=await this.bank.authorized.load({...data,clips:[...unique.values()]},{baseURL:'./',replace:false,concurrency:2});
        for(const plan of plans){
          const errors=(imported.errors||[]).filter(e=>e.id===plan.id&&(!plan.event||e.event===plan.event));
          if(errors.length){
            for(const error of errors)this._error(plan.id+': '+error.error);
            const permanent=errors.every(e=>/^HTTP (?:404|410)(?:\b|$)/.test(String(e.error)));
            this.retryAfter.set(plan.key,Date.now()+(permanent?60000:4000));
          }
          const cancelled=!this._current()||imported.cancelled;
          const loaded=cancelled?0:plan.missing.filter(c=>this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant))).length;
          if(loaded)this.loaded.add(plan.id);
          results.set(plan.key,{loaded,rejected:errors.length,errors,cancelled,bytes:this.bank.authorized.bytes});
        }
        return results;
      };
      const job=this._schedule(work,entries[0].key,priority,entries.map(e=>e.key));
      for(const entry of entries){
        const tracked=job.then(results=>results.get(entry.key)).finally(()=>{if(this.inFlight.get(entry.key)===tracked)this.inFlight.delete(entry.key);});
        this.inFlight.set(entry.key,tracked);waits.push(tracked);
      }
    }
    const combined=Promise.all(waits).then(results=>({loaded:results.reduce((n,r)=>n+(r?.loaded||0),0),errors:results.flatMap(r=>r?.errors||[]),results}));
    this.queue=combined.catch(()=>{});return combined;
  }
  // Event-aware demand paging. A previous v10 `loaded` bit stayed true even
  // after a 40 MiB LRU eviction, permanently skipping future real-file loads.
  // Re-check the actual decoded resident events instead of that stale bit.
  ensure(id,event=null,{priority=false}={}){
    if(!this._current())return Promise.resolve({loaded:0,cancelled:true});
    if(!id)return Promise.resolve({loaded:0,unavailable:false});
    // A 503 at startup must not permanently disable audio for the entire
    // session: make a bounded manifest retry after network/storage recovery.
    if(this.status==='unavailable'){
      if(Date.now()<this.manifestRetryAt)return Promise.resolve({loaded:0,unavailable:true});
      this.status='uninitialized';this.manifestPromise=null;this.notMapped.clear();
    }
    const key=id+':'+(event||'*');
    if(this.notMapped.has(key))return Promise.resolve({loaded:0,missing:true});
    if(this.inFlight.has(key)){
      if(priority){const at=this.pendingJobs.findIndex(row=>row.key===key||row.keys?.includes(key));if(at>0)this.pendingJobs.unshift(this.pendingJobs.splice(at,1)[0]);}
      return this.inFlight.get(key);
    }
    const resident=this._select(id,event);
    if(this.status==='ready'&&this.clipsById){
      if(!resident.length){this.notMapped.add(key);return Promise.resolve({loaded:0,missing:true});}
      if(resident.every(c=>this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant)))){this.loaded.add(id);return Promise.resolve({loaded:0,cached:true});}
    }
    // Keep resident and in-flight checks ahead of backoff: partial successful
    // loads remain immediately usable and priority callers share queued work.
    if(Date.now()<(this.retryAfter.get(key)||0))return Promise.resolve({loaded:0,throttled:true});
    const work=async()=>{
      if(!this._current())return {loaded:0,cancelled:true};
      const data=await this.getManifest();
      if(!this._current())return {loaded:0,cancelled:true};
      if(!data)return {loaded:0,unavailable:true};
      const selected=this._select(id,event);
      if(!selected.length){this.notMapped.add(key);return {loaded:0,missing:true};}
      const missing=selected.filter(c=>!this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant)));
      if(!missing.length){this.loaded.add(id);return {loaded:0,cached:true};}
      if(Date.now()<(this.retryAfter.get(key)||0))return {loaded:0,throttled:true};
      // The source bank's transactional generation means loads must be serialized;
      // load ONLY the missing clips to avoid fetching intact LRU entries again.
      const result=await this.bank.authorized.load({...data,clips:missing},
        {baseURL:'./',replace:false,concurrency:2});
      if(!this._current())return {...result,loaded:0,cancelled:true};
      if(result?.errors?.length){for(const error of result.errors)this._error(id+': '+error.error);
        // Only permanent missing-file responses deserve the longer bounded retry.
        // Network failures and 5xx retain the short recovery path.
        const permanentlyMissing=result.errors.every(e=>/^HTTP (?:404|410)(?:\b|$)/.test(String(e.error)));
        this.retryAfter.set(key,Date.now()+(permanentlyMissing?60000:4000));}
      if(result?.loaded>0)this.loaded.add(id);
      return result;
    };
    const job=this._schedule(work,key,priority);
    // Cleanup belongs to the same promise returned to callers. Otherwise
    // an immediate second START can observe the previous failed, already-
    // fulfilled job and never actually retry the 2022 MP3.
    const tracked=job.finally(()=>{if(this.inFlight.get(key)===tracked)this.inFlight.delete(key);});
    this.inFlight.set(key,tracked);
    this.queue=tracked.catch(()=>{});
    return tracked;
  }
  _schedule(work,key,priority,keys=null){
    const job=new Promise((resolve,reject)=>{
      const row={work,key,resolve,reject,keys};
      if(priority)this.pendingJobs.unshift(row);else this.pendingJobs.push(row);
    });
    if(!this.draining){this.draining=true;Promise.resolve().then(()=>this._drain());}
    return job;
  }
  async _drain(){
    try{while(this.pendingJobs.length){const row=this.pendingJobs.shift();try{row.resolve(await row.work());}catch(error){row.reject(error);}}}
    finally{this.draining=false;}
  }
  _select(id,event){return event ? this.clipsByEvent?.get(`${id}:${event}`) || [] : this.clipsById?.get(id) || []; }
  _error(message){this.errors.push(String(message));this.totalErrorCount++;if(this.errors.length>64)this.errors.splice(0,this.errors.length-64);}
  stats(){return {status:this.status,loadedKinds:this.loaded.size,pendingKinds:this.inFlight.size,
    errors:this.errors.slice(-6),unmappedEvents:this.notMapped.size,manifestURL:String(this.manifestURL),cacheBytes:this.bank.authorized.bytes};}
}
