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

test('E-liter and E-liter Scope use the separately extracted Heavy Charger source recording',()=>{
  const installed=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
  const planned=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-samples.json',import.meta.url),'utf8'));
  const file='Wp_Charger_HoldNoise_Heavy_00.mp3',source=new URL('../runtime/audio/s3-real/'+file,import.meta.url);
  const expected='bf195dee1f2ef39e02a2c5f6ae179258008e81157059e10521d1c3bc96f5d655';
  assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'),expected);
  for(const m of [installed,planned]){
    for(const id of ['s3-charger-long','s3-charger-longscope']){
      const row=m.clips.find(x=>x.id===id&&x.event==='charge');
      assert.equal(row.sourceName,file,id+' uses actual Heavy texture');
      assert.equal(row.sha256,expected,id+' is pinned to Heavy source');
      assert.equal(row.durationSeconds,.417959);
    }
    for(const id of ['charger','s3-charger-normalscope','s3-charger-quick']){
      const row=m.clips.find(x=>x.id===id&&x.event==='charge');
      assert.equal(row.sourceName,'Wp_Charger_HoldNoise_00.mp3','normal/Squiffer unchanged');
    }
  }
});

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
  assert.equal(recordedHitCue({attacker:c,weaponId:'charger',damage:160,charge:.35}),'hit',
    'actual partial-charge hit never becomes critical from numeric damage alone');
  assert.equal(recordedHitCue({attacker:c,weaponId:'charger',damage:160,charge:1}),'critical');
  assert.equal(recordedHitCue({attacker:c,weaponId:'s3-charger-long',damage:140,charge:.9}),'hit');
  assert.equal(recordedHitCue({attacker:c,weaponId:'s3-charger-long',damage:140,charge:1}),'critical');
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
  assert.match(adapted,/recordedCueForHit\?\.\(\{attacker,weaponId,damage,killed,charge\}\)/);
  assert.match(adapted,/on\('hit', \(\{ attacker, victim, damage, killed, weaponId, charge \}\)/);
  const weapons=adaptBuildSource('src/game/weapons.js',
    fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8'));
  assert.match(weapons,/applyHit\(attacker, victim, dmg, weaponId, slosherVolleyId, shotCharge = null\)/);
  assert.match(weapons,/this\.applyHit\(a, victim\.e, dmg, 'charger', undefined, charge\)/);
  assert.match(weapons,/nm\.sendHit\(attacker, victim, dmg, weaponId, slosherVolleyId\)/,
    'replication must retain Slosher volley identity in fifth slot');
  const catalog=adaptBuildSource('patches/splatoon3/runtime/main-weapon-catalog.mjs',
    fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8'));
  assert.match(catalog,/this\.applyHit\(p\.owner,target,amount,p\.wid,undefined,p\.catalog\?\.descriptor\?\.charge\)/,
    'the native collision owner must pass the actual original projectile charge, not current runner state');
  assert.match(adapted,/playRecordedCombat\?\.\('splat'/);
  assert.doesNotMatch(adapted,/G\.audio\?\.play\('hit_marker'/);
  assert.doesNotMatch(adapted,/G\.audio\?\.play\('splat_enemy'/);
  const a=fs.readFileSync(new URL('../../../inkwave-public/src/audio/audio.js',import.meta.url),'utf8');
  const patched=adaptBuildSource('src/audio/audio.js',a);
  assert.match(patched,/installRecordedCombatCues\(AudioEngine\)/);
});
