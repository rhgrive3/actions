import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {renderTexturePCM} from '../runtime/audio/grain-texture.mjs';
import {renderGuidedSample} from '../runtime/audio/source-guided-render.mjs';
import {renderSound} from '../runtime/audio/render.mjs';
import {WEAPON_AUDIO} from '../runtime/audio/weapon-recipes.mjs';
import {s3CuePlan,S3_STRUCTURED_ACTORS} from '../runtime/audio/s3-articulation.mjs';
import {chargerRiseBuffer,disposeChargerRise} from '../runtime/audio/charger-charge-rise.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/drive-audio-pcm-7f863ea2.json',import.meta.url),'utf8'));
const hash=pcm=>crypto.createHash('sha256').update(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength)).digest('hex');
test('all five grain textures preserve every Float32 PCM byte at 8/44.1/48/96 kHz',()=>{
 for(const row of fixture.grain)assert.equal(hash(renderTexturePCM(row.sr,row.kind)),row.hash,`${row.kind}@${row.sr}`);
});
test('guided envelope, spectral routing and FFT twiddles preserve all 87 reference articulations',()=>{
 for(const row of fixture.guided)assert.equal(hash(renderGuidedSample(WEAPON_AUDIO[row.id],row.event,row.variant,row.sr)),row.hash,`${row.id}:${row.event}:${row.variant}`);
});
test('126 complete weapon renders and fallback normalizer preserve recorded baseline PCM hashes',()=>{
 for(const row of fixture.render)assert.equal(hash(renderSound(WEAPON_AUDIO[row.id],row.event,row.variant,row.sr)),row.hash,`${row.id}:${row.event}@${row.sr}`);
 for(const row of fixture.fallback)assert.equal(hash(renderSound(fixture.fallbackRecipe,row.event,1,row.sr)),row.hash,`${row.event}@${row.sr}`);
});
test('bounded articulation cache shares deeply frozen plans across variants without accepting inherited actor keys',()=>{
 for(const actor of S3_STRUCTURED_ACTORS)for(const event of ['fire','fire_full','charge','ready','roll','spin','open','close']){
  const a=s3CuePlan(actor,event,0),b=s3CuePlan(actor,event,2);assert.equal(a,b);assert.ok(Object.isFrozen(a));
  for(const row of a)assert.ok(Object.isFrozen(row));
 }
 assert.equal(s3CuePlan('unregistered','fire',0),null);
});
test('default recorded Charger fetch retains the browser receiver and injected fetchers remain callable',async()=>{
 const original=globalThis.fetch;let calls=0;
 const ctx={state:'running',decodeAudioData:async()=>({duration:2,sampleRate:44100,numberOfChannels:1,length:88200,getChannelData:()=>new Float32Array(88200)})};
 globalThis.fetch=async function(){assert.equal(this,globalThis);calls++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(20000)};};
 try{assert.ok(await chargerRiseBuffer(ctx));assert.equal(calls,1);disposeChargerRise(ctx);
  assert.ok(await chargerRiseBuffer(ctx,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(20000)})}));assert.equal(calls,1);
 }finally{disposeChargerRise(ctx);globalThis.fetch=original;}
});
