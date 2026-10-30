import {audioLoadScope} from './load-deadline.mjs';
import {readEncodedAudioResponse} from './encoded-response.mjs';
// Exact common beep used by the user-selected S1 community reference and by
// the existing Drive premixes. This is NOT Wp_ChargeKeepReady (a keep cue),
// and is not labelled a recovered Splatoon 3 sound-event mapping.
export const CHARGE_CONFIRMATION=Object.freeze({
  name:'charge:confirmation',bytes:8626,
  sha256:'e29e239fa5680641512449bdb168b70dd3d14001cafa4572e2f51c5a8db0fbd3',
  sourceBlob:'e4dc244701e1ae0f3f0005e2dca17d99e5d5cfa3',
  firstPitch:1,fullPitch:1.15,
});
const states=new WeakMap();
export function chargeConfirmationReady(engine){return !!(engine?.ctx&&states.get(engine.ctx)?.buffer);}
export function prepareChargeConfirmation(engine,{fetcher=globalThis.fetch?.bind(globalThis),timeout=8000}={}){
  const ctx=engine?.ctx;
  if(!ctx||ctx.state==='closed'||typeof fetcher!=='function')return Promise.resolve(null);
  let s=states.get(ctx);
  if(!s){s={buffer:null,job:null,scope:null,retry:0};states.set(ctx,s);}
  if(s.buffer)return Promise.resolve(s.buffer);
  if(s.job)return s.job;
  if(Date.now()<s.retry)return Promise.resolve(null);
  const scope=audioLoadScope(timeout,'Charge confirmation load timed out');s.scope=scope;
  const current=()=>states.get(ctx)===s&&engine.ctx===ctx&&ctx.state!=='closed';
  s.job=(async()=>{
    try{
      const url=import.meta.url?new URL('./charge-ready-reference.mp3',import.meta.url):null;
      if(!url)throw Error('Charge confirmation asset URL unavailable');
      const res=await scope.run(()=>fetcher(url,{cache:'force-cache',signal:scope.signal}));
      if(!res?.ok)throw Error('Charge confirmation HTTP '+res?.status);
      const data=await scope.run(()=>readEncodedAudioResponse(res,16384,{scope,minBytes:1000}));
      if(data.byteLength!==CHARGE_CONFIRMATION.bytes)throw Error('Charge confirmation byte length mismatch');
      const buffer=await scope.run(()=>ctx.decodeAudioData(data));
      if(!current())return null;
      const size=buffer?.length*buffer?.numberOfChannels*4;
      if(!Number.isFinite(buffer?.duration)||buffer.duration<.08||buffer.duration>.3||!Number.isFinite(size)||size>256*1024)
        throw Error('Charge confirmation decoded format mismatch');
      s.buffer=buffer;return buffer;
    }catch(error){if(current()){s.retry=Date.now()+4000;throw error;}return null;}
    finally{scope.finish();if(states.get(ctx)===s){s.job=null;s.scope=null;}}
  })();
  return s.job;
}
export function chargeConfirmationDefinition(engine){
  const buffer=engine?.ctx&&states.get(engine.ctx)?.buffer;
  if(!buffer)return null;
  return {gain:.68,max:8,jitter:0,minGap:0,reverb:.025,ref:3,priority:93,
    build(v,p=1){
      const s=v.ctx.createBufferSource();s.buffer=buffer;s.loop=false;
      // Only the authored first/full distinction may alter this cue's pitch.
      const pitch=p===CHARGE_CONFIRMATION.fullPitch?p:CHARGE_CONFIRMATION.firstPitch;
      s.playbackRate.value=pitch;s.connect(v.out);s.start(v.t);
      s._end=v.t+buffer.duration/pitch;v.nodes.push(s);v.srcs.push(s);v.end=Math.max(v.end,s._end);
    }};
}
export function disposeChargeConfirmation(engine){
  const ctx=engine?.ctx,s=ctx&&states.get(ctx);if(!s)return;
  states.delete(ctx);s.scope?.cancel();s.buffer=null;
}
