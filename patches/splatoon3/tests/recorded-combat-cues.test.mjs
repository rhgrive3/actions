import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {COMBAT_RECORDINGS,installRecordedCombatCues,recordedHitCue} from '../runtime/audio/recorded-combat-cues.mjs';
import {withBlasterSplashHit} from '../runtime/audio/blaster-hit.mjs';

const directory=new URL('../runtime/audio/s3-real/',import.meta.url);
const bytes=new Map();
for(const [id,row] of Object.entries(COMBAT_RECORDINGS)){
  const raw=fs.readFileSync(new URL(row.file,directory));
  assert.equal(createHash('sha256').update(raw).digest('hex'),row.sha256,id+' authentic bytes sha');
  bytes.set(row.file,raw);
}
const ctx={
  state:'running',currentTime:1, sampleRate:48000,
  createBufferSource(){return {connect(){},start(t){this.started=t;},playbackRate:{value:1}};},
  async decodeAudioData(buffer){
    return {duration:.4,numberOfChannels:1,length:19200, sampleRate:48000, data:buffer};
  }
};
class Engine{
  constructor(){this.ctx=ctx;this.played=[];}
  init(){return this;}
  _def(){return null;}
  play(name,opts={}){
    const def=this._def(name);
    if(!def)return null;
    const v={ctx:this.ctx,t:this.ctx.currentTime,out:{},nodes:[],srcs:[],end:0};
    def.build(v);this.played.push({name,def,opts,v});
    return def;
  }
  disposeWeaponAudio(){}
}
installRecordedCombatCues(Engine);

test('recorded 2022 combat sources match pinned SHA and contain no synthesized substitutes',()=>{
  assert.deepEqual(Object.keys(COMBAT_RECORDINGS),['hit','critical','splat','bubble']);
  assert.equal(bytes.get('HitEf_CriticalHit_00.mp3').length,16344);
  assert.equal(bytes.get('HitEf_Damage_00.mp3').length,3805);
  assert.equal(bytes.get('Pl_DeadSplash_00.mp3').length,55841);
});

test('Charger high-damage direct, partial, other attacks, and Blaster direct vs blast choose distinct recorded events',()=>{
  const c={weapon:{kind:'charger',id:'charger'}};
  assert.equal(recordedHitCue({attacker:c,weaponId:'charger',damage:160,killed:true}),'critical');
  assert.equal(recordedHitCue({attacker:c,weaponId:'charger-01',damage:110,killed:false}),'critical');
  assert.equal(recordedHitCue({attacker:c,weaponId:'s3-charger-long',damage:160}),'critical');
  assert.equal(recordedHitCue({attacker:c,weaponId:'s3-charger-light',damage:85}),'hit');
  assert.equal(recordedHitCue({attacker:c,weaponId:'shooter',damage:100,killed:true}),'hit');
  const b={weapon:{kind:'blaster',id:'blaster'}};
  assert.equal(recordedHitCue({attacker:b,weaponId:'blaster',damage:125}),'critical');
  assert.equal(withBlasterSplashHit(b,()=>recordedHitCue({attacker:b,weaponId:'blaster',damage:75})),'hit');
});

test('Safari-like Window receiver loads, checks SHA and decodes each recorded cue once',async()=>{
  const save=globalThis.fetch,requests=[];
  globalThis.fetch=function(url){
    if(this!==globalThis)throw Error('Can only call Window.fetch on instances of Window');
    const file=String(url).split('/').at(-1),raw=bytes.get(file);
    requests.push(file);
    if(!raw)return Promise.resolve({ok:false,status:404});
    return Promise.resolve({ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length)});
  };
  try{
    const audio=new Engine();
    const [a,b]=await Promise.all([audio.prepareRecordedCombatCues(),audio.prepareRecordedCombatCues()]);
    assert.equal(a,b);
    assert.equal(requests.length,4,'one fetch/decode per cue even with concurrent preloads');
    assert.equal(a.buffers.size,4);
    assert.ok(audio.playRecordedCombat('critical',{volume:.9}));
    assert.ok(audio.playRecordedCombat('hit'));
    assert.ok(audio.playRecordedCombat('splat'));
    assert.ok(audio.playRecordedCombat('bubble'));
    assert.equal(audio.played.length,4);
    assert.ok(audio.played.every(x=>x.v.srcs[0].started===1));
    assert.ok(audio.played.every(x=>x.v.srcs[0].buffer===a.buffers.get(x.name.slice('combat:'.length))));
    assert.equal(audio.playRecordedCombat('not-a-recording'),null);
    await audio.prepareRecordedCombatCues();
    assert.equal(requests.length,4,'resident assets reuse their decoded AudioBuffers');
    audio.disposeWeaponAudio();
    assert.equal(audio.playRecordedCombat('hit'),null,'disposed data is not revived');
  }finally{globalThis.fetch=save;}
});

test('normal gameplay hit/splatted events play original recording and never the procedural hit/splat cues',()=>{
  const source=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const adapted=adaptBuildSource('src/main.js',source);
  assert.match(adapted,/recordedCueForHit\?\.\(\{attacker,weaponId,damage,killed\}\)/);
  assert.match(adapted,/playRecordedCombat\?\.\('splat'/);
  assert.doesNotMatch(adapted,/G\.audio\?\.play\('hit_marker'/);
  assert.doesNotMatch(adapted,/G\.audio\?\.play\('splat_enemy'/);
  const a=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
  const patched=adaptBuildSource('src/audio/audio.js',a);
  assert.match(patched,/installRecordedCombatCues\(AudioEngine\)/);
});
