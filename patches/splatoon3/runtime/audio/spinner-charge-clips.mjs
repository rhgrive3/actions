import {audioLoadScope} from './load-deadline.mjs';
import {readEncodedAudioResponse} from './encoded-response.mjs';
import { hasFiniteAudioBufferPCM } from './finite-pcm.mjs';
// Markers belong to the existing Drive audition mixes, not the retail engine.
// Each premix is bounded at both cues so slow/paused charging cannot play ahead.
const CLIPS=Object.freeze({
  's3-spinner-quick':{url:new URL('./spinner-charge-clips/mini.mp3',import.meta.url),first:.406061,full:.633333},
  splatling:{url:new URL('./spinner-charge-clips/heavy.mp3',import.meta.url),first:.916667,full:1.383333},
  's3-spinner-hypershort':{url:new URL('./spinner-charge-clips/examiner.mp3',import.meta.url),first:1,full:2},
  rise:{url:new URL('./spinner-charge-clips/rise.mp3',import.meta.url),first:0,full:.528},
});
const IDS=new Set(['splatling','s3-spinner-quick','s3-spinner-hyper','s3-spinner-downpour','s3-spinner-serein','s3-spinner-hypershort']);
export const spinnerAudioIds=Object.freeze({has:id=>IDS.has(id),get size(){return IDS.size;},[Symbol.iterator]:()=>IDS.values()});
export const spinnerUsesPremix=id=>id!=='rise'&&Object.hasOwn(CLIPS,id);
export const spinnerClipKey=id=>spinnerUsesPremix(id)?id:IDS.has(id)?'rise':null;
export const spinnerClipFull=id=>CLIPS[spinnerClipKey(id)]?.full??0;
export const spinnerClipMarkers=id=>CLIPS[spinnerClipKey(id)]||null;
export const SPINNER_CACHE_LIMIT=3*1024*1024;
const MAX_MP3_BYTES=256*1024,contexts=new WeakMap();
function state(ctx){let s=contexts.get(ctx);if(!s){s={buffers:new Map(),jobs:new Map(),retry:new Map(),size:0,dead:false};contexts.set(ctx,s);}return s;}
export function spinnerCached(engine,id){
  const key=spinnerClipKey(id),s=engine?.ctx&&contexts.get(engine.ctx),row=s?.buffers.get(key);
  if(!row)return null;
  if(s.last!==key){s.buffers.delete(key);s.buffers.set(key,row);s.last=key;}
  return row.buffer;
}
function windowFor(buffer,meta,phase,rise){
  const sr=buffer.sampleRate||48000;
  const end=rise?Math.min(.45,buffer.duration-.045):phase===0?meta.first:phase===1?meta.full:buffer.duration-.045;
  const start=rise?.095:phase===0?Math.max(0,end-.08):phase===1?Math.max(meta.first+.03,end-.08):Math.min(meta.full+.30,end-.105);
  const from=Math.round(start*sr),to=Math.round(end*sr),n=Math.round(Math.min(.015,(end-start)*.1)*sr);
  return {from,to,n,start:(from+n)/sr,end:to/sr};
}
function repairSeams(buffer,meta,rise){
  if(typeof buffer.getChannelData!=='function'||!Number.isFinite(buffer.sampleRate))return;
  for(const phase of rise?[2]:[0,1,2]){
    const {from,to,n}=windowFor(buffer,meta,phase,rise);
    if(n<2||from+n+1>=to-n||to>=buffer.length)throw Error('Invalid Spinner loop interval');
    for(let ch=0;ch<buffer.numberOfChannels;ch++){
      const data=buffer.getChannelData(ch);
      for(let i=0;i<n;i++){const alpha=(i+1)/n,at=to-n+i;data[at]=data[at]*(1-alpha)+data[from+i+1]*alpha;}
    }
  }
}
export function spinnerPreload(engine,id,{fetcher=globalThis.fetch?.bind(globalThis),timeout=8000}={}){
  const key=spinnerClipKey(id),ctx=engine?.ctx,meta=CLIPS[key];
  if(!meta||!ctx||ctx.state==='closed')return Promise.resolve(null);
  const cached=spinnerCached(engine,id);if(cached)return Promise.resolve(cached);
  const s=state(ctx),old=s.jobs.get(key);if(old)return old.promise;
  if(Date.now()<(s.retry.get(key)||0))return Promise.resolve(null);
  const scope=audioLoadScope(timeout,'Spinner charge sample load timed out');
  const current=()=>!s.dead&&contexts.get(ctx)===s&&engine.ctx===ctx&&ctx.state!=='closed';
  const job={scope,promise:null};
  job.promise=(async()=>{
    try{
      const res=await scope.run(()=>fetcher(meta.url,{cache:'force-cache',signal:scope.signal}));
      if(!res?.ok)throw Error('Spinner charge '+key+' HTTP '+res?.status);
      const data=await scope.run(()=>readEncodedAudioResponse(res,MAX_MP3_BYTES,{scope}));
      const decoded=await scope.run(()=>ctx.decodeAudioData(data));
      if(!current())return null;
      const bytes=decoded.length*decoded.numberOfChannels*4;
      if(!Number.isFinite(decoded.duration)||decoded.duration<(key==='rise'?.46:meta.full+.05)||
        decoded.duration>5||!Number.isSafeInteger(bytes)||bytes<=0||bytes>SPINNER_CACHE_LIMIT)
        throw Error('Invalid or oversized decoded Spinner recording');
      if(!hasFiniteAudioBufferPCM(decoded))throw Error('Spinner charge PCM invalid: '+key);
      repairSeams(decoded,meta,key==='rise');
      while(s.size+bytes>SPINNER_CACHE_LIMIT&&s.buffers.size){const [k,row]=s.buffers.entries().next().value;s.buffers.delete(k);s.size-=row.bytes;}
      s.buffers.set(key,{buffer:decoded,bytes});s.size+=bytes;s.last=key;s.retry.delete(key);
      return decoded;
    }catch(error){if(current()){s.retry.set(key,Date.now()+4000);throw error;}return null;}
    finally{scope.finish();if(s.jobs.get(key)===job)s.jobs.delete(key);}
  })();
  s.jobs.set(key,job);return job.promise;
}
export function spinnerClipDefinition(engine,id){
  const key=spinnerClipKey(id),buffer=spinnerCached(engine,id),meta=CLIPS[key];
  if(!buffer||!meta)return null;
  const rise=key==='rise';
  return {progressControlled:true,gain:rise?.13:.31,jitter:0,reverb:.025,priority:82,
    loop(v,p,opts={}){
      const phase=Number.isInteger(opts.phase)?Math.max(0,Math.min(2,opts.phase)):2;
      const w=windowFor(buffer,meta,phase,rise),src=v.ctx.createBufferSource();
      src.buffer=buffer;src.loop=true;src.loopStart=w.start;src.loopEnd=w.end;
      src.playbackRate.value=Number.isFinite(p)?Math.max(0,Math.min(4,p)):1;
      src.connect(v.out);src.start(v.t,Math.max(0,Math.min(w.end-1/(buffer.sampleRate||48000),Number(opts.offset)||0)));
      src._end=Infinity;v.srcs.push(src);v.nodes.push(src);v.endless=true;
      return {pitch(value,now){if(Number.isFinite(value))src.playbackRate.setTargetAtTime(Math.max(0,Math.min(4,value)),now,.015);}};
    }};
}
export function spinnerReleaseCache(engine){
  const ctx=engine?.ctx,s=ctx&&contexts.get(ctx);if(!s)return;
  s.dead=true;contexts.delete(ctx);for(const job of s.jobs.values())job.scope.cancel();
  s.jobs.clear();s.buffers.clear();s.retry.clear();s.size=0;
}
export function spinnerCacheStats(engine){const s=engine?.ctx&&contexts.get(engine.ctx);return {bytes:s?.size||0,limit:SPINNER_CACHE_LIMIT,entries:s?.buffers.size||0,pending:s?.jobs.size||0};}
