import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptWeaponAudio } from '../audio-adapter.mjs';
import { withBlasterSplashHit, blasterHitCueKind, blasterHitCuePitch, BLASTER_HIT_PITCH } from '../runtime/audio/blaster-hit.mjs';
import { specialActionAudioEvent } from '../runtime/audio/kit-runtime.mjs';
import { installWeaponAudioRuntime } from '../runtime/audio/runtime.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
const clip=(id,event)=>manifest.clips.some(c=>c.id===id&&c.event===event);

test('Blaster direct and indirect body-hit cues remain different without altering damage data',()=>{
  const a={weapon:{id:'blaster',kind:'blaster'}};
  const other={weapon:{id:'shooter',kind:'shooter'}};
  assert.equal(blasterHitCueKind(a,'blaster'),'direct');
  assert.equal(blasterHitCuePitch(a,'blaster'),BLASTER_HIT_PITCH.direct);
  assert.equal(blasterHitCuePitch(other,'shooter'),1);
  assert.equal(blasterHitCuePitch(a,'storm'),1,'special is never misclassified');
  assert.equal(blasterHitCuePitch(a,'s3-blaster-light'),BLASTER_HIT_PITCH.direct);
  const sample={damage:57,killed:false,weaponId:'blaster'};
  withBlasterSplashHit(a,()=>{
    assert.equal(blasterHitCueKind(a,sample.weaponId),'indirect');
    assert.equal(blasterHitCuePitch(a,sample.weaponId),BLASTER_HIT_PITCH.indirect);
    withBlasterSplashHit(a,()=>assert.equal(blasterHitCueKind(a,'blaster'),'indirect'));
    assert.equal(blasterHitCueKind(other,'shooter'),null,'other actor is isolated');
    assert.deepEqual(sample,{damage:57,killed:false,weaponId:'blaster'},'contact metadata is audio-only');
  });
  assert.equal(blasterHitCueKind(a,'blaster'),'direct');
  assert.throws(()=>withBlasterSplashHit(a,()=>{throw Error('contact rejected');}),/contact rejected/);
  assert.equal(blasterHitCueKind(a,'blaster'),'direct','exception restores scope');
  const catalog={weapon:{id:'s3-blaster-lightshort',kind:'catalog',catalogRecord:{family:'blaster'}}};
  withBlasterSplashHit(catalog,()=>assert.equal(blasterHitCueKind(catalog,'s3-blaster-lightshort'),'indirect'));
  assert.equal(blasterHitCueKind(catalog,'s3-blaster-lightshort'),'direct');
});

test('actual final native burst wrapper scopes only splash damage, never ghosts',()=>{
  const listeners=new Map(),heard=[];
  const on=(name,fn)=>{const a=listeners.get(name)||[];a.push(fn);listeners.set(name,a);return ()=>{};};
  const emit=(name,data)=>{for(const fn of listeners.get(name)||[])fn(data);};
  class Projectiles {
    throwBomb(){return null;}
    _push(p){return p;}
    _blastBurst(p){emit('hit',{attacker:p.owner,weaponId:p.wid});return 'burst handled';}
  }
  class WeaponRunner {reset(){}update(){}}
  class Actor {setWeapon(){} _startSpecial(){} _updateSpecial(){}}
  const G={audio:{ctx:{state:'running'},play:()=>null,prepareWeapon(){},playWeapon(){},_realS3Loader:null},time:0};
  const api={G,on,Actor,WeaponRunner,Projectiles};
  on('hit',e=>heard.push(blasterHitCuePitch(e.attacker,e.weaponId)));
  installWeaponAudioRuntime(api);
  const a={weapon:{id:'blaster',kind:'blaster'}},b={weapon:{id:'blaster',kind:'blaster'}};
  const P=new Projectiles();
  emit('hit',{attacker:a,weaponId:'blaster'});
  assert.equal(P._blastBurst({owner:a,wid:'blaster',type:'blast',ghost:false}), 'burst handled');
  P._blastBurst({owner:b,wid:'blaster',type:'blast',ghost:true});
  emit('hit',{attacker:a,weaponId:'blaster'});
  assert.deepEqual(heard,[BLASTER_HIT_PITCH.direct,BLASTER_HIT_PITCH.indirect,BLASTER_HIT_PITCH.direct,BLASTER_HIT_PITCH.direct]);
});

test('real AudioEngine prototype owns the hit-cue even when Game assigns G.audio after patch install',()=>{
  class Engine { _def(){return null;} }
  installWeaponAudioEngine(Engine);
  const G={audio:null};
  G.audio=new Engine();
  const blaster={weapon:{kind:'blaster',id:'blaster'}};
  assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.direct);
  withBlasterSplashHit(blaster,()=>{
    assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.indirect);
  });
  assert.equal(G.audio.blasterHitCuePitch(blaster,'blaster'),BLASTER_HIT_PITCH.direct);
});

test('production HUD keeps one hit marker; damage/death/kill sounds remain connected',()=>{
  const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const built=adaptWeaponAudio('src/main.js',src);
  assert.match(built,/G\.audio\?\.blasterHitCuePitch\?\.\(attacker, weaponId\)/);
  assert.match(built,/on\('hit', \(\{ attacker, victim, damage, killed, weaponId \}\)/);
  assert.equal((built.match(/hit_marker', \{ volume: 0\.6, pitch: G\.audio\?\.blasterHitCuePitch/g)||[]).length,1);
  for(const cue of ['splat_enemy','splatted_self','ally_splatted','hurt'])
    assert.ok(src.includes("'"+cue+"'"),'retained combat cue '+cue);
});

test('catalogue Blaster radius hits carry a scoped audio flag and explosion weapon identity',()=>{
  const src=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
  assert.match(src,/withBlasterSplashHit\(p\.owner,\(\)=>system\.applyHit/);
  assert.match(src,/emit\('weapon:impact',\{actor:p\.owner,weapon:p\.wid,/);
  assert.ok(clip('blaster','explosion'),'original middle Blaster explosion MP3 available');
  assert.ok(clip('s3-blaster-short','explosion'),'short Blaster explosion MP3 available');
});

test('special phase owners select real installed MP3 events, not nonexistent dodge/ready variants',()=>{
  for(const [id,action,event] of [
    ['zipcaster','zip','fire'],
    ['ultraStamp','swing','fire'],
    ['ultraStamp','jumpSwing','impact'],
    ['tripleInkstrike','marker','fire'],
    ['crabTank','cannon','fire_alt'],
    ['waveBreaker','pulse','impact'],
    ['killerWail','laser','fire'],
    ['reefslider','impact','explosion'],
  ]){
    assert.equal(specialActionAudioEvent(id,action),event,id+':'+action);
    assert.ok(clip('special:'+id,event),'installed real MP3: '+id+'/'+event);
  }
  assert.equal(specialActionAudioEvent('inkVac','unknown-action'),null);
  assert.equal(specialActionAudioEvent('zipcaster','activate'),'open');
});
