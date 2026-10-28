import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {AuthorizedSamplePack} from '../runtime/audio/authorized-samples.mjs';
import {installWeaponAudioEngine} from '../runtime/audio/engine.mjs';
import {RealS3SampleLoader} from '../runtime/audio/real-s3-loader.mjs';
import {WEAPON_AUDIO} from '../runtime/audio/weapon-recipes.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const bytes=Uint8Array.from({length:64},(_,i)=>i*3).buffer;
const sha=createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const rights='Operator controlled test fixture';
function context(rate=48000){return{sampleRate:rate,state:'running',resumes:0,resume(){this.resumes++;return Promise.resolve();},createBuffer(ch,n,sr){const channels=Array.from({length:ch},()=>new Float32Array(n));return{sampleRate:sr,length:n,numberOfChannels:ch,duration:n/sr,getChannelData:i=>channels[i]};},async decodeAudioData(){this.decodes=(this.decodes||0)+1;const b=this.createBuffer(2,512,this.sampleRate);for(let c=0;c<2;c++)for(let i=0;i<b.length;i++)b.getChannelData(c)[i]=(i%31-15)/20+c/50;return b;}};}
const pcm=b=>Array.from({length:b.numberOfChannels},(_,c)=>Buffer.from(b.getChannelData(c).buffer).toString('hex'));
async function digestSpy(fn){const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let calls=0;Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest(...args){calls++;return webcrypto.subtle.digest(...args);}}}});try{return await fn(()=>calls);}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}}
const clip=(event,extra={})=>({id:'dualies',event,file:'shared.mp3',sha256:sha,...extra});
for(const concurrency of [1,2,3,4])test('one actual-byte digest per batch, concurrency '+concurrency,()=>digestSpy(async count=>{
 const ctx=context();let fetches=0;const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>{fetches++;return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes.slice(0)};}});
 const result=await pack.load({schema:1,usageRights:rights,clips:[clip('fire'),clip('fire_left'),clip('fire',{variant:1})]},{concurrency});
 assert.equal(result.loaded,3);assert.equal(result.rejected,0);assert.equal(fetches,1);assert.equal(ctx.decodes,1);assert.equal(count(),1);
 assert.equal(pack.pick('dualies','fire').buffer,pack.pick('dualies','fire_left').buffer);
 await pack.load({schema:1,usageRights:rights,clips:[clip('fire'),clip('fire_left')]},{concurrency});assert.equal(count(),2,'a new transaction verifies newly fetched bytes');
}));
test('shared digest never skips a distinct declaration or an unsigned row',()=>digestSpy(async count=>{
 const ctx=context();const pack=new AuthorizedSamplePack(ctx,{fetcher:async()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes.slice(0)})});
 const result=await pack.load({schema:1,usageRights:rights,clips:[clip('fire'),clip('fire_left',{sha256:'0'.repeat(64)}),clip('fire',{variant:1,sha256:undefined})]},{concurrency:3});
 assert.equal(result.loaded,2);assert.equal(result.rejected,1);assert.match(result.errors[0].error,/Checksum mismatch/);assert.equal(count(),1);assert.equal(pack.pick('dualies','fire_left'),null);
}));
async function brush(order,{seamlessLoop=true,budget=1e6}={}){const ctx=context();let fetches=0;const pack=new AuthorizedSamplePack(ctx,{maxBytes:budget,fetcher:async()=>{fetches++;return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes.slice(0)};}});const rows={};for(const event of order){const r=await pack.load({schema:1,usageRights:rights,clips:[{id:'s3-brush-normal',event,file:'brush.mp3',sha256:sha,seamlessLoop}]},{replace:false});assert.equal(r.loaded,1);rows[event]=pack.pick('s3-brush-normal',event);if(event==='windup')rows.rawBefore=pcm(rows.windup.buffer);}return{ctx,pack,rows,fetches};}
test('verified raw brush windup repairs an exact separate roll; reverse order still decodes',()=>digestSpy(async count=>{
 const shared=await brush(['windup','roll']),fresh=await brush(['roll']);
 assert.equal(shared.fetches,1);assert.equal(shared.ctx.decodes,1);assert.equal(fresh.fetches,1);
 assert.notEqual(shared.rows.windup.buffer,shared.rows.roll.buffer);assert.deepEqual(pcm(shared.rows.windup.buffer),shared.rows.rawBefore);assert.deepEqual(pcm(shared.rows.roll.buffer),pcm(fresh.rows.roll.buffer));
 const reverse=await brush(['roll','windup']);assert.equal(reverse.fetches,2);assert.equal(reverse.ctx.decodes,2);assert.equal(count(),4);
 const disabled=await brush(['windup','roll'],{seamlessLoop:false});assert.equal(disabled.fetches,2,'explicitly disabled seam behavior retains original fallback');
}));
test('raw reuse respects eviction, declared checksum, loop limits and generation cancellation',()=>digestSpy(async()=>{
 const ctx=context();let fetches=0;const pack=new AuthorizedSamplePack(ctx,{maxBytes:4096,fetcher:async()=>{fetches++;return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes.slice(0)};}});
 const row=event=>({id:'s3-brush-normal',event,file:'brush.mp3',sha256:sha});
 await pack.load({schema:1,usageRights:rights,clips:[row('windup')]});
 const tooLong=await pack.load({schema:1,usageRights:rights,clips:[{...row('roll'),loopStart:0,loopEnd:2}]},{replace:false});assert.equal(tooLong.rejected,1);assert.match(tooLong.errors[0].error,/Loop end/);
 const wrong=await pack.load({schema:1,usageRights:rights,clips:[{...row('roll'),sha256:'0'.repeat(64)}]},{replace:false});assert.equal(wrong.rejected,1);assert.equal(fetches,2);
 pack.clear();await pack.load({schema:1,usageRights:rights,clips:[row('roll')]},{replace:false});assert.equal(fetches,3,'cleared raw PCM cannot authorize a later loop');
 let finish;const pending=new AuthorizedSamplePack(ctx,{fetcher:()=>new Promise(resolve=>finish=resolve)});const load=pending.load({schema:1,usageRights:rights,clips:[clip('fire')]});pending.clear();finish({ok:true,headers:{get:()=>null},arrayBuffer:async()=>bytes.slice(0)});assert.equal((await load).cancelled,true);assert.equal(pending.loaded.size,0);
}));
function noiseModule(source){const allocations=[];class Scratch extends Float32Array{constructor(n){super(n);allocations.push(n);}}const start=source.indexOf('export function mulberry32('),end=source.indexOf('\n// Stereo reverb impulse:',start);assert(start>=0&&end>start);const code=source.slice(start,end).replace(/^export /gm,'');return{noise:vm.runInNewContext(code+'\nnoiseBuffer',{Float32Array:Scratch}),allocations};}
test('full actual noise functions preserve PCM and cache identity at seven rates while removing three scratch buffers',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js',import.meta.url),'utf8');const old=noiseModule(raw),current=noiseModule(adaptBuildSource('src/audio/music.js',raw));let compared=0;
 for(const rate of [8000,11025,22050,44100,47999,48000,96000])for(const kind of ['white','pink','brown','unknown']){const a=context(rate),b=context(rate);const oldCount=old.allocations.length,newCount=current.allocations.length;const before=old.noise(a,kind),after=current.noise(b,kind);assert.deepEqual(pcm(after),pcm(before),rate+'/'+kind);compared+=after.length;assert.equal(current.noise(b,kind),after);assert.equal(current.allocations.length-newCount,kind==='white'?0:1);assert.equal(old.allocations.length-oldCount,kind==='white'?1:2);assert.notEqual(current.noise(context(rate),kind),after,'contexts own independent cached buffers');}
 assert(compared>2_000_000);
});
test('idempotent init resumes audio without replaying historical preparation; a new owner still prepares intents',async()=>{
 class Engine{constructor(){this.ctx=null;this.byName=new Map();}init(){if(!this.ctx)this.ctx=context();this.ctx.resume();return this;}_def(){return null;}stats(){return{};}stopAll(){}}
 installWeaponAudioEngine(Engine);const ensure=RealS3SampleLoader.prototype.ensure,declares=RealS3SampleLoader.prototype.declares;const calls=[];RealS3SampleLoader.prototype.ensure=function(...args){calls.push({owner:this,args});return Promise.resolve({});};RealS3SampleLoader.prototype.declares=function(){return true;};
 try{const e=new Engine();e.init();const ids=Object.values(WEAPON_AUDIO).filter(r=>!['charger','splatling'].includes(r.family)).slice(0,8).map(r=>r.id);for(const id of ids)e.prepareWeapon(id);
 const mains=()=>calls.filter(c=>!c.args[0].startsWith('combat:')).map(c=>c.args[0]);
 assert.deepEqual(mains(),ids,'each selection prepares its recorded main');const firstCalls=calls.length,bank=e._weaponBank;
 for(let i=0;i<10;i++)assert.equal(e.init(),e);assert.equal(calls.length,firstCalls,'repeated init never requeues MP3 sources');assert.equal(e.ctx.resumes,11);
 e.ctx=context(44100);e.init();assert.notEqual(e._weaponBank,bank);assert.deepEqual(mains(),[...ids,ids.at(-1)],'new context prepares the latest selected weapon once');e.disposeWeaponAudio();assert.equal(e._warmPreparedBank,null);assert.equal(e._warmPreparedContext,null);
 const pending=new Engine();pending.prepareWeapon('shooter');const beforeUnlock=calls.length;pending.init();assert.equal(mains().at(-1),'shooter');assert.equal(mains().length,ids.length+2,'one queued selected source warms on context unlock');assert.ok(calls.length>beforeUnlock);pending.disposeWeaponAudio();
 }finally{RealS3SampleLoader.prototype.ensure=ensure;RealS3SampleLoader.prototype.declares=declares;}
});
