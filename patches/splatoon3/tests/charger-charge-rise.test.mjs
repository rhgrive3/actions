import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chargerRiseBuffer,playChargerRise,RISE_REFERENCE,synthesizeChargerRise} from '../runtime/audio/charger-charge-rise.mjs';
import {adaptWeaponAudio} from '../audio-adapter.mjs';

function makeAudioContext(rate=22050){
 const created=[],connections=[];
 const ctx={sampleRate:rate,currentTime:2,
   createBuffer(channels,length,sr){
     const data=Array.from({length:channels},()=>new Float32Array(length));
     return {length,duration:length/sr,sampleRate:sr,numberOfChannels:channels,
       getChannelData:i=>data[i]};
   },
   createBufferSource(){
     const source={buffer:null,loop:null,playbackRate:{value:0},
       connect:dest=>connections.push(['source',dest]),
       start:t=>{source.startTime=t;},stop:t=>{source.stopTime=t;},
       disconnect:()=>{source.disconnected=true;}};
     created.push(source);return source;
   },
   createGain(){
     const p={value:0,setValueAtTime(v,t){this.value=v;},
       linearRampToValueAtTime(v,t){this.value=v;},
       cancelScheduledValues(){}};
     return {gain:p,connect:dest=>connections.push(['gain',dest]),disconnect(){}};
   }
 };
 return {ctx,created,connections};
}
function strongestFrequency(samples,sr,time){
 const start=Math.round((time-.025)*sr),n=Math.round(.05*sr);
 let found=0,amp=-1;
 for(let hz=700;hz<=7500;hz+=100){
   let re=0,im=0;
   for(let i=0;i<n;i++){
     const weight=.5-.5*Math.cos(2*Math.PI*i/(n-1));
     const a=2*Math.PI*hz*i/sr;
     const x=samples[start+i]*weight;
     re+=x*Math.cos(a);im-=x*Math.sin(a);
   }
   const v=re*re+im*im;
   if(v>amp){amp=v;found=hz;}
 }
 return found;
}
test('measured Charger reference ridge becomes a rising original procedural sound, not copied audio',()=>{
 const {ctx}=makeAudioContext(),b=synthesizeChargerRise(ctx,1.18),xs=b.getChannelData(0);
 assert.ok(b.duration>=1.17&&b.duration<=1.19);
 assert.equal(xs.length,b.length);
 assert.ok([...xs].every(Number.isFinite));
 assert.ok(Math.max(...xs)<.48&&Math.min(...xs)>-.48,'no clipping');
 const early=strongestFrequency(xs,ctx.sampleRate,.26),
   middle=strongestFrequency(xs,ctx.sampleRate,.60),
   late=strongestFrequency(xs,ctx.sampleRate,.88);
 assert.ok(early>750&&early<2500,'first ridge near 1kHz; got '+early);
 assert.ok(middle>early+600,'middle ridge rises: '+early+' / '+middle);
 assert.ok(late>middle+800,'late ridge rises: '+middle+' / '+late);
 assert.equal(xs.at(-1),0);assert.equal(xs.at(-2),0);
 assert.equal(RISE_REFERENCE.startHz,1017);
 assert.equal(RISE_REFERENCE.endHz,6967);
});
test('six bounded duration buckets are memoized without per-frame allocations',()=>{
 const {ctx}=makeAudioContext();
 assert.strictEqual(chargerRiseBuffer(ctx,1.18),chargerRiseBuffer(ctx,1.18));
 assert.notStrictEqual(chargerRiseBuffer(ctx,.6),chargerRiseBuffer(ctx,1.18));
 assert.ok(chargerRiseBuffer(ctx,Infinity).duration>=1.1);
});
test('Charger rise is a single normal-sfx-bus voice, pitch natural and cancellable',()=>{
 const {ctx,created,connections}=makeAudioContext(),bus={kind:'game SFX'};
 const handle=playChargerRise({ctx,sfxIn:bus},{volume:.6,duration:1.0});
 assert.equal(handle.playing,true);
 assert.equal(created.length,1);
 assert.equal(created[0].loop,false);
 assert.equal(created[0].playbackRate.value,1);
 assert.equal(created[0].startTime,2);
 assert.ok(created[0].buffer.duration>=.98&&created[0].buffer.duration<=1.02);
 assert.ok(connections.some(([k,v])=>k==='gain'&&v===bus));
 handle.stop(.04);
 assert.equal(handle.playing,false);
 assert.ok(created[0].stopTime>2);
 handle.stop();assert.equal(created[0].stopTime,2.04,'idempotent cancellation');
});
test('nearby remote charge has a spatial source and cleans up its panner',()=>{
 const {ctx,created,connections}=makeAudioContext();
 const panner={kind:'HRTF',connect:dest=>connections.push(['panner',dest]),disconnect(){this.closed=true;}};
 const bus={kind:'game SFX'};
 const audio={ctx,sfxIn:bus,_panner:(position,distance)=>{
   assert.deepEqual(position,{x:3,y:1,z:-8});assert.equal(distance,3);return panner;
 }};
 const h=playChargerRise(audio,{pos:{x:3,y:1,z:-8},duration:.7,volume:.28});
 assert.equal(created.length,1);
 assert.ok(connections.some(([k,v])=>k==='gain'&&v===panner));
 assert.ok(connections.some(([k,v])=>k==='panner'&&v===bus));
 created[0].onended();
 assert.equal(panner.closed,true);
 assert.equal(h.playing,false);
});

test('production adapter has no local imports or private settings UI and retains native Charger onset',()=>{
 const native=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const adapted=adaptWeaponAudio('src/game/weapons.js',native);
 assert.ok(adapted.includes('this.chargeLoop = null;'));
 assert.ok(!adapted.includes('this.chargeLoop = G.audio?.loopWeapon?.'));
 const menu=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
 assert.strictEqual(adaptWeaponAudio('src/ui/menus.js',menu),menu);
});
