// Spinner-only, lazy decoded sound clips. Each file contains an offline
// two-stage charge mix, except 'rise', which is a shared fallback layer.
const CLIPS=Object.freeze({
  's3-spinner-quick':{url:new URL('./spinner-charge-clips/mini.mp3',import.meta.url),full:.633},
  splatling:{url:new URL('./spinner-charge-clips/heavy.mp3',import.meta.url),full:1.383},
  's3-spinner-hypershort':{url:new URL('./spinner-charge-clips/examiner.mp3',import.meta.url),full:2},
  rise:{url:new URL('./spinner-charge-clips/rise.mp3',import.meta.url),full:.528},
});
export const spinnerAudioIds=new Set(['splatling','s3-spinner-quick','s3-spinner-hyper',
  's3-spinner-downpour','s3-spinner-serein','s3-spinner-hypershort']);
export const spinnerUsesPremix=id=>id!=='rise'&&Object.hasOwn(CLIPS,id);
export const spinnerClipKey=id=>spinnerUsesPremix(id)?id:spinnerAudioIds.has(id)?'rise':null;
export const spinnerClipFull=id=>CLIPS[spinnerClipKey(id)]?.full??0;
const MAX_BYTES=3*1024*1024,MAX_MP3_BYTES=256*1024;
const contexts=new WeakMap();
const state=ctx=>{let x=contexts.get(ctx);if(!x){x={buffers:new Map(),jobs:new Map(),size:0};contexts.set(ctx,x);}return x;};
export function spinnerCached(engine,id){
  if(!engine?.ctx)return null;
  const key=spinnerClipKey(id),s=state(engine.ctx),row=s.buffers.get(key);
  if(!row)return null;
  s.buffers.delete(key);s.buffers.set(key,row);
  return row.buffer;
}
export async function spinnerPreload(engine,id){
  const key=spinnerClipKey(id),ctx=engine?.ctx,info=CLIPS[key];
  if(!ctx||!info)return null;
  let b=spinnerCached(engine,id);if(b)return b;
  const s=state(ctx);if(s.jobs.has(key))return s.jobs.get(key);
  const job=(async()=>{
    const res=await fetch(info.url,{cache:'force-cache'});
    if(!res.ok)throw Error('Spinner charge '+key+' HTTP '+res.status);
    const data=await res.arrayBuffer();
    if(!data.byteLength||data.byteLength>MAX_MP3_BYTES)throw Error('Spinner charge MP3 invalid: '+key);
    const decoded=await ctx.decodeAudioData(data);
    if(!Number.isFinite(decoded.duration)||decoded.duration<info.full-.025)
      throw Error('Spinner charge MP3 truncated: '+key);
    if(engine.ctx!==ctx||ctx.state==='closed')return null;
    const bytes=decoded.length*decoded.numberOfChannels*4;
    s.buffers.set(key,{buffer:decoded,bytes});s.size+=bytes;
    for(const [k,v] of s.buffers){if(s.size<=MAX_BYTES||k===key)break;s.buffers.delete(k);s.size-=v.bytes;}
    return decoded;
  })();
  s.jobs.set(key,job);
  job.then(()=>{if(s.jobs.get(key)===job)s.jobs.delete(key);},
    ()=>{if(s.jobs.get(key)===job)s.jobs.delete(key);});
  return job;
}
export function spinnerClipDefinition(engine,id){
  const key=spinnerClipKey(id),buffer=spinnerCached(engine,id),meta=CLIPS[key];
  if(!buffer||!meta)return null;
  const rise=key==='rise';
  const start=rise?.095:Math.min(meta.full+.30,buffer.duration-.15);
  const end=rise?Math.min(.45,buffer.duration-.045):buffer.duration-.045;
  if(end<=start)return null;
  return {gain:rise?.13:.31,jitter:0,reverb:.025,priority:82,
    loop(v,p,opts={}){
      const src=v.ctx.createBufferSource();
      src.buffer=buffer;src.loop=true;src.loopStart=start;src.loopEnd=end;
      src.playbackRate.value=Math.max(.25,Math.min(3,p));
      src.connect(v.out);src.start(v.t,Math.max(0,Math.min(end-.01,opts.offset||0)));
      v.srcs.push(src);v.nodes.push(src);v.endless=true;
      return {pitch(value,now){src.playbackRate.setTargetAtTime(Math.max(.25,Math.min(3,value)),now,.045);}};
    }};
}
export function spinnerReleaseCache(engine){if(engine?.ctx)contexts.delete(engine.ctx);}
