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
export function sameModuleFetch(relative,fetcher=globalThis.fetch){
  if(typeof relative!=='string'||!/^\.\/s3-real\/[A-Za-z0-9_.+()\-]+\.mp3$/i.test(relative))
    throw new TypeError('Invalid local real-S3 sound path');
  return fetcher(new URL(relative,directory));
}

export class RealS3SampleLoader {
  constructor(bank,{fetcher=globalThis.fetch,manifestURL=FILE_MANIFEST,assetFetcher}={}){
    this.bank=bank;this.fetcher=fetcher;this.assetFetcher=assetFetcher||((url)=>sameModuleFetch(url,fetcher));
    this.manifestURL=manifestURL;this.manifestPromise=null;this.queue=Promise.resolve();this.inFlight=new Map();
    this.loaded=new Set();this.notMapped=new Set();this.retryAfter=new Map();this.status='uninitialized';this.errors=[];
    this.manifestRetryAt=0;
    this.bank.authorized.fetcher=this.assetFetcher;
    this.bank.authorized.maxBytes=Math.max(this.bank.authorized.maxBytes,AUDIO_CACHE_BYTES);
  }
  _current(){return !this.bank.disposed && this.bank.ctx?.state!=='closed';}
  getManifest(){
    if(!this._current())return Promise.resolve(null);
    if(!this.manifestPromise)this.manifestPromise=(async()=>{
      try{
        const r=await this.fetcher(this.manifestURL);
        if(!this._current())return null;
        if(!r?.ok)throw new Error('Real-S3 pack manifest unavailable ('+(r?.status||'fetch failed')+')');
        const data=await r.json();
        if(!this._current())return null;
        const clips=validateAuthorizedManifest(data);
        // Never fetch arbitrary sourceDrive URLs: only same-origin local assets.
        for(const c of clips)if(!/^s3-real\/[A-Za-z0-9_.+()\-]+\.mp3$/i.test(c.file))throw new Error('Unsafe real-S3 asset path');
        this.status='ready';return {...data,clips};
      }catch(error){if(!this._current())return null;this.status='unavailable';this.manifestRetryAt=Date.now()+4000;
        this.errors.push(String(error?.message||error));return null;}
    })();
    return this.manifestPromise;
  }
  // Event-aware demand paging. A previous v10 `loaded` bit stayed true even
  // after a 40 MiB LRU eviction, permanently skipping future real-file loads.
  // Re-check the actual decoded resident events instead of that stale bit.
  ensure(id,event=null){
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
    if(this.inFlight.has(key))return this.inFlight.get(key);
    const job=this.queue.catch(()=>{}).then(async()=>{
      if(!this._current())return {loaded:0,cancelled:true};
      const data=await this.getManifest();
      if(!this._current())return {loaded:0,cancelled:true};
      if(!data)return {loaded:0,unavailable:true};
      const selected=data.clips.filter(c=>c.id===id&&(!event||c.event===event));
      if(!selected.length){this.notMapped.add(key);return {loaded:0,missing:true};}
      const missing=selected.filter(c=>!this.bank.authorized.loaded.has(this.bank.authorized.key(c.id,c.event,c.variant)));
      if(!missing.length){this.loaded.add(id);return {loaded:0,cached:true};}
      if(Date.now()<(this.retryAfter.get(key)||0))return {loaded:0,throttled:true};
      // The source bank's transactional generation means loads must be serialized;
      // load ONLY the missing clips to avoid fetching intact LRU entries again.
      const result=await this.bank.authorized.load({...data,clips:missing},
        {baseURL:'./',replace:false,concurrency:2});
      if(!this._current())return {...result,loaded:0,cancelled:true};
      if(result?.errors?.length){this.errors.push(...result.errors.map(e=>id+': '+e.error));
        this.retryAfter.set(key,Date.now()+4000);}
      if(result?.loaded>0)this.loaded.add(id);
      return result;
    });
    this.inFlight.set(key,job);
    this.queue=job.catch(()=>{}).finally(()=>{if(this.inFlight.get(key)===job)this.inFlight.delete(key);});
    return job;
  }
  stats(){return {status:this.status,loadedKinds:this.loaded.size,pendingKinds:this.inFlight.size,
    errors:this.errors.slice(-6),unmappedEvents:this.notMapped.size,manifestURL:String(this.manifestURL),cacheBytes:this.bank.authorized.bytes};}
}
