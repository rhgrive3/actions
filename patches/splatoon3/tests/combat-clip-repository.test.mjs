import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { installRecordedCombatCues,recordedCombatCueSource } from '../runtime/audio/source-combat-cues.mjs';

const root=new URL('../../../inkwave-public/assets/audio/combat/',import.meta.url);
const tags=['direct','chargerDirect'];
const bytesOf=type=>fs.readFileSync(new URL(recordedCombatCueSource(type).file,root));
const validBuffer={numberOfChannels:2,length:30000,duration:.625,sampleRate:48000};
const sources=[];
const ctx={
  state:'running',sampleRate:48000,
  createBufferSource(){const s={connect(){},start(time){this.startTime=time;},buffer:null};sources.push(s);return s;},
  async decodeAudioData(bytes){assert.ok(bytes.byteLength>1000);return validBuffer;}
};
class Audio{
  constructor(){this.ctx=ctx;this.offline=false;this.traces=[];}
  init(){return this;}
  _def(){return null;}
  play(name,options){const definition=this._def(name);if(!definition)return null;
    const voice={ctx:this.ctx,t:10,out:{},srcs:[],nodes:[],end:0};
    definition.build(voice,options?.pitch||1,options||{});
    this.traces.push({name,voice,options});
    return definition;
  }
}
installRecordedCombatCues(Audio);

test('repository contains both real SHA-pinned MP3 files, not metadata-only stubs',()=>{
  for(const type of tags){
    const row=recordedCombatCueSource(type);
    const bytes=bytesOf(type);
    assert.equal(bytes.length,row.bytes,type+' exact binary size');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,type+' downloaded source checksum');
    assert.ok(bytes[0]===0x49||bytes[0]===0xff,type+' real MP3 frame/ID3');
  }
  const provenance=JSON.parse(fs.readFileSync(new URL('PROVENANCE.json',root),'utf8'));
  assert.equal(provenance.sources.length,2);
  assert.match(provenance.note,/NOT verified/);
});

test('both battle events play decoded repository MP3s without generating an authored fallback',async()=>{
  const real=globalThis.fetch,requests=[];
  globalThis.fetch=function(url){
    assert.equal(this,globalThis,'Safari Window.fetch receiver must be bound');
    const path=new URL(String(url)),name=path.pathname.split('/').at(-1);
    const type=tags.find(t=>recordedCombatCueSource(t).file===name);
    assert.ok(type,'no unexpected remote/Drive URL');
    const bytes=bytesOf(type);requests.push(name);
    return Promise.resolve({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  };
  try{
    const audio=new Audio();
    assert.equal(audio.playRecordedCombatCue('direct'),null,'a cold clip is never replaced with procedural PCM');
    await Promise.all(tags.map(name=>audio.prepareCombatCue(name)));
    assert.deepEqual(audio.combatCueStats().loaded.sort(),tags.slice().sort());
    assert.ok(audio.playRecordedCombatCue('direct',{volume:.9}));
    assert.ok(audio.playRecordedCombatCue('chargerDirect',{volume:.6}));
    assert.equal(audio.traces.length,2);
    assert.deepEqual(audio.traces.map(x=>x.name),['combat:direct','combat:chargerDirect']);
    assert.equal(audio.traces.every(x=>x.voice.srcs.length===1&&x.voice.srcs[0].buffer===validBuffer),true);
    assert.deepEqual(requests.sort(),tags.map(t=>recordedCombatCueSource(t).file).sort());
    // Resident AudioBuffer is shared rather than fetched/decompressed per hit.
    audio.playRecordedCombatCue('chargerDirect');
    assert.equal(requests.length,2);
  }finally{globalThis.fetch=real;}
});

test('corrupt MP3 never triggers a fake substitute, even for a kill',async()=>{
  const real=globalThis.fetch;
  globalThis.fetch=function(){return Promise.resolve({ok:true,arrayBuffer:async()=>new Uint8Array(11136).buffer});};
  try{
    const audio=new Audio();
    await assert.rejects(audio.prepareCombatCue('direct'),/SHA mismatch/);
    assert.equal(audio.playRecordedCombatCue('direct'),null);
    assert.equal(audio.traces.length,0,'no synthesized kill-confirm substitute');
    assert.ok(audio.combatCueStats().errors.some(e=>e.cue==='direct'));
  }finally{globalThis.fetch=real;}
});

test('actual production HUD handlers select distinct charge-hit and splat confirmation MP3s',()=>{
  const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const built=adaptBuildSource('src/main.js',src);
  assert.ok(built.includes("?'chargerDirect'")||built.includes("? 'chargerDirect'"),
    'Charger hit is an independent source');
  assert.match(built,/playRecordedCombatCue\?\.\('direct', \{ volume: 0\.9 \}\)/,
    'a local enemy splat uses the embedded direct comparison reference');
  assert.ok(!built.includes("G.audio?.play('splat_enemy'"),'no older synthesized notification remains on that path');
});
