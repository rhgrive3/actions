import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {chargerRiseBuffer,chargerRecordedStatus,playChargerRise,RECORDED_CHARGER_FIRST} from '../runtime/audio/charger-charge-rise.mjs';
import {adaptWeaponAudio} from '../audio-adapter.mjs';

const file=new URL('../../../inkwave-public/assets/audio/charger-first-splatune2-reference.mp3',import.meta.url);
function mock({duration=1.82857}={}){
 const sources=[],connections=[],decoded=[],fetches=[];
 const ctx={
   sampleRate:44100,currentTime:2,
   async decodeAudioData(bytes){decoded.push(bytes.byteLength);const length=Math.round(duration*44100);return{duration,sampleRate:44100,numberOfChannels:2,length,getChannelData:()=>new Float32Array(length)};},
   createBufferSource(){
     const x={playbackRate:{value:0},loop:true,connect:to=>connections.push(['source',to]),
       start(when,offset,span){x.started={when,offset,span};},
       stop(when){x.stopped=when;},
       disconnect(){x.disconnected=true;}};
     sources.push(x);return x;
   },
   createGain(){
     const gain={value:0,history:[],
       setValueAtTime(value,time){this.value=value;this.history.push(['set',value,time]);},
       linearRampToValueAtTime(value,time){this.value=value;this.history.push(['ramp',value,time]);},
       cancelScheduledValues(t){this.history.push(['cancel',t]);}};
     return{gain,connect:to=>connections.push(['gain',to]),disconnect(){}};
   },
 };
 const fetcher=async(url)=>{fetches.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(36571)};};
 return{ctx,fetcher,fetches,sources,decoded,connections};
}
test('bundled user-provided recorded MP3 is exact source frames, not synthesized PCM',()=>{
 const bytes=fs.readFileSync(file);
 assert.equal(bytes.length,36571,'no unneeded full CD sound effects were committed');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
   '4ccd52136e6240c788b68c4def7b7f46642b8b9cfc70b97772b1dce4c10e6a1d');
 assert.equal(bytes[0],0xff);
 assert.equal(bytes[1],0xfb);
 assert.equal(RECORDED_CHARGER_FIRST.startSeconds,.4591);
 assert.equal(RECORDED_CHARGER_FIRST.playSeconds,1.215);
 assert.equal(RECORDED_CHARGER_FIRST.nominalFrameSeconds,70*1152/44100);
});
test('one fetch and decode per context, all presses reuse same real AudioBuffer',async()=>{
 const a=mock();assert.equal(chargerRecordedStatus(a.ctx).ready,false);
 const [b1,b2]=await Promise.all([
   chargerRiseBuffer(a.ctx,{fetcher:a.fetcher}),chargerRiseBuffer(a.ctx,{fetcher:a.fetcher})
 ]);
 assert.equal(b1,b2);assert.equal(a.fetches.length,1);assert.deepEqual(a.decoded,[36571]);
 assert.equal(chargerRecordedStatus(a.ctx).ready,true);
 const b3=await chargerRiseBuffer(a.ctx,{fetcher:a.fetcher});
 assert.equal(b3,b1);assert.equal(a.fetches.length,1);
});
test('playback is EXACT source offset/duration at normal speed, no new oscillators',async()=>{
 const {ctx,fetcher,sources,connections}=mock(),out={kind:'SFX'};
 await chargerRiseBuffer(ctx,{fetcher});
 const handle=playChargerRise({ctx,sfxIn:out},{volume:.55});
 assert.ok(handle?.playing);
 assert.equal(sources.length,1);
 assert.equal(sources[0].loop,false);
 assert.equal(sources[0].playbackRate.value,1);
 assert.deepEqual(sources[0].started,{when:2,offset:.4591,span:1.215});
 assert.ok(connections.some(([key,dst])=>key==='gain'&&dst===out));
 handle.stop(.04);
 assert.equal(handle.playing,false);
 assert.equal(sources[0].stopped,2.04);
 handle.stop(.04);
 assert.equal(sources[0].stopped,2.04,'end/release is idempotent');
 sources[0].onended();assert.equal(sources[0].disconnected,true);
});
test('remote recorded Charger plays through 3D panner and cleans it up',async()=>{
 const {ctx,fetcher,sources,connections}=mock();await chargerRiseBuffer(ctx,{fetcher});
 const out={kind:'SFX'},panner={connect:to=>connections.push(['panner',to]),disconnect(){this.closed=true;}};
 const pos={x:4,y:2,z:-5};
 const audio={ctx,sfxIn:out,_panner(p,d){assert.equal(p,pos);assert.equal(d,3);return panner;}};
 const h=playChargerRise(audio,{volume:.3,pos});
 assert.ok(h?.playing);
 assert.ok(connections.some(([key,dst])=>key==='gain'&&dst===panner));
 assert.ok(connections.some(([key,dst])=>key==='panner'&&dst===out));
 sources[0].onended();
 assert.equal(panner.closed,true);assert.equal(h.playing,false);
});
test('missing file and malformed/truncated decode fail closed to the ordinary source click',async()=>{
 const rejected=mock();
 const fail=await chargerRiseBuffer(rejected.ctx,{fetcher:async()=>({ok:false,status:404})});
 assert.equal(fail,null);
 assert.match(chargerRecordedStatus(rejected.ctx).error,/unavailable/);
 assert.equal(playChargerRise({ctx:rejected.ctx,sfxIn:{}},{volume:.5}),null);
 const bad=mock({duration:.2});
 assert.equal(await chargerRiseBuffer(bad.ctx,{fetcher:bad.fetcher}),null);
 assert.match(chargerRecordedStatus(bad.ctx).error,/duration/);
});
test('production adapters add no manual uploader and native + remote old charge loops stay absent',()=>{
 const native=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const adapted=adaptWeaponAudio('src/game/weapons.js',native);
 assert.ok(adapted.includes('this.chargeLoop = null;'));
 assert.ok(!adapted.includes('this.chargeLoop = G.audio?.loopWeapon?.'));
 const remote=fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8');
 const network=adaptWeaponAudio('src/net/netmatch.js',remote);
 assert.ok(network.includes('playChargerChargeRise'));
 assert.ok(!network.includes("this._voiceLoop(a, near, 'charge', wr.charging"));
 const menu=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
 assert.equal(adaptWeaponAudio('src/ui/menus.js',menu),menu);
});

test('transient failures retry only after explicit prewarm and backoff, sharing concurrent requests',async()=>{
 const a=mock();let clock=0,calls=0;
 const options={now:()=>clock,fetcher:async()=>{calls++;return calls===1?{ok:false,status:503}:a.fetcher();}};
 assert.equal(await chargerRiseBuffer(a.ctx,options),null);
 clock=5000;
 assert.equal(await chargerRiseBuffer(a.ctx,options),null);
 assert.equal(calls,1,'ordinary frames never retry');
 clock=3999;assert.equal(await chargerRiseBuffer(a.ctx,{...options,retry:true}),null);
 assert.equal(calls,1);
 clock=4000;
 const values=await Promise.all(Array.from({length:10},()=>chargerRiseBuffer(a.ctx,{...options,retry:true})));
 assert.ok(values[0]);assert.ok(values.every(x=>x===values[0]));assert.equal(calls,2);assert.equal(a.decoded.length,1);
 assert.equal(chargerRecordedStatus(a.ctx).error,null);
});

test('permanent HTTP/decode/payload failures and exhausted attempts never retry',async()=>{
 for(const fail of [async()=>({ok:false,status:404}),async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(3)})]){
  const a=mock();let calls=0;
  const options={fetcher:()=>{calls++;return fail();},now:()=>10000*calls,retry:true};
  for(let i=0;i<5;i++)assert.equal(await chargerRiseBuffer(a.ctx,options),null);
  assert.equal(calls,1);
 }
 const a=mock();let calls=0,clock=0;
 const options={fetcher:async()=>{calls++;throw new TypeError('offline');},now:()=>clock,retry:true};
 for(let i=0;i<8;i++){await chargerRiseBuffer(a.ctx,options);clock+=4000;}
 assert.equal(calls,3);
});

test('stalled fetch, body and decode time out; late results cannot replace retry buffers',async()=>{
 for(const phase of ['fetch','body','decode']){
  const a=mock();let resolve;
  const stalled=new Promise(r=>{resolve=r;});
  const fetcher=phase==='fetch'?()=>stalled:async()=>({ok:true,arrayBuffer:phase==='body'?()=>stalled:async()=>new ArrayBuffer(36571)});
  const original=a.ctx.decodeAudioData;
  if(phase==='decode')a.ctx.decodeAudioData=()=>stalled;
  assert.equal(await chargerRiseBuffer(a.ctx,{fetcher,timeoutMs:5,now:()=>0}),null);
  assert.equal(chargerRecordedStatus(a.ctx).loading,false);
  a.ctx.decodeAudioData=original;
  const ready=await chargerRiseBuffer(a.ctx,{fetcher:a.fetcher,retry:true,now:()=>4000});
  assert.ok(ready);
  resolve(phase==='fetch'?await a.fetcher():phase==='body'?new ArrayBuffer(36571):{duration:2,sampleRate:44100,numberOfChannels:1});
  await new Promise(r=>setImmediate(r));
  assert.equal(await chargerRiseBuffer(a.ctx),ready);
  assert.equal(a.decoded.length,1,'expired fetch/body work cannot trigger a second decode');
 }
});

test('disposed and closed contexts never admit outstanding decode results',async()=>{
 const {disposeChargerRise}=await import('../runtime/audio/charger-charge-rise.mjs');
 const a=mock();let finish;
 a.ctx.decodeAudioData=()=>new Promise(r=>{finish=r;});
 const pending=chargerRiseBuffer(a.ctx,{fetcher:a.fetcher});
 await new Promise(r=>setImmediate(r));disposeChargerRise(a.ctx);
 finish({duration:2,sampleRate:44100,numberOfChannels:2});
 assert.equal(await pending,null);assert.equal(chargerRecordedStatus(a.ctx).ready,false);
 a.ctx.state='closed';assert.equal(await chargerRiseBuffer(a.ctx,{fetcher:a.fetcher}),null);
});
