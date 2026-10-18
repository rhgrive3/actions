import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installAudioPlatform } from '../platform-audio.mjs';
import { adaptWeaponAudio } from '../../splatoon3/audio-adapter.mjs';
import { WeaponSoundBank } from '../../splatoon3/runtime/audio/bank.mjs';

function target(){
  const listeners=new Map();
  return {
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    send(name){for(const fn of [...(listeners.get(name)||[])])fn({type:name,isTrusted:true});},
    count(name){return listeners.get(name)?.size||0;},
  };
}
test('iPad trusted touch/click retries a still-pending Safari resume without navigator.userActivation',async()=>{
  const document=Object.assign(target(),{hidden:false,hasFocus:()=>true});
  const env=Object.assign(target(),{document,navigator:{},screen:{orientation:target()}});
  class AudioEngine {constructor(ctx){this.ctx=ctx;this.offline=false;}}
  installAudioPlatform(AudioEngine,env);
  const never=new Promise(()=>{}),calls=[];
  const ctx={state:'suspended',resume(){
    calls.push('resume');
    if(calls.length===1)return never; // The original Safari call never settles.
    this.state='running';return Promise.resolve();
  },suspend(){this.state='suspended';return Promise.resolve();}};
  const audio=new AudioEngine(ctx);
  audio.resume();
  assert.equal(calls.length,1);
  assert.equal(audio._platformAudio.pending!==null,true);
  assert.equal(env.navigator.userActivation,undefined);
  env.send('touchend');
  assert.equal(calls.length,2,'the trusted tap can retry a pending resume');
  assert.equal(ctx.state,'running','AudioContext can make actual audible progress');
  env.send('click');assert.equal(calls.length,2,'a duplicate click does not schedule another resume');
  document.hidden=true;document.send('visibilitychange');
  await Promise.resolve();await Promise.resolve();
  const before=calls.length;
  env.send('touchend');assert.equal(calls.length,before,'hidden page never unlocks audio');
  audio.disposePlatform();
  assert.equal(env.count('touchend'),0);
  assert.equal(env.count('click'),0);
});
test('normal resolved AudioContext has no unnecessary second resume on the next iPad tap',async()=>{
  const document=Object.assign(target(),{hidden:false,hasFocus:()=>true});
  const env=Object.assign(target(),{document,navigator:{},screen:{orientation:target()}});
  class Audio {constructor(){this.offline=false;this.ctx={state:'suspended',resume:()=>{++this.attempts;this.ctx.state='running';return Promise.resolve();}};this.attempts=0;}}
  installAudioPlatform(Audio,env);
  const a=new Audio();a.resume();await Promise.resolve();await Promise.resolve();
  env.send('pointerdown');env.send('touchend');env.send('click');
  assert.equal(a.attempts,1);
  a.disposePlatform();
});
test('real START touch initializes the configured music/SFX bus before the deferred wipe',()=>{
  const src=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const patched=adaptWeaponAudio('src/main.js',src);
  assert.match(patched,/prepareMatch: \(\) => \{ G\.audio\?\.init\?\.\(\); self\._applyAudioVolumes\(\); G\.audio\?\.prepareWeapon\?\.\(self\.profile\.weapon\|\|'shooter',\{urgent:true\}\); self\._prepareGyro\(\); \}/);
  assert.match(patched,/self\.profile\.weapon = weapon; saveJSON\('inkwave\.profile', self\.profile\); G\.audio\?\.prepareWeapon\?\.\(weapon,\{urgent:true\}\);/,'loadout begins recorded-shot prefetch during selection');
  assert.match(src,/prepareMatch: \(\) => self\._prepareGyro\(\)/,'negative control: main does not unlock in START callback');
  assert.match(src,/async startMatch\(o = \{\}\)/,'normal match constructor remains intact');
});
test('the real-only audio bank is still strict unless deployed local-main fallback is enabled',()=>{
  const ctx={sampleRate:48000,createBuffer(ch,n,sr){const pcm=new Float32Array(n);return{length:n,duration:n/sr,getChannelData(){return pcm;}};}};
  const strict=new WeaponSoundBank(ctx,{realOnly:true});
  assert.equal(strict.resolve('main:shooter:fire'),null);
  assert.throws(()=>strict.get('shooter','fire'),/Procedural/);
  const patched=new WeaponSoundBank(ctx,{realOnly:true,audibleShotFallback:true});
  assert.ok(patched.resolve('main:shooter:fire'));
  assert.equal(patched.resolve('main:special:inkjet:fire'),null);
  assert.equal(patched.resolve('main:sub:bomb:fire'),null);
  assert.equal(patched.resolve('main:shooter:impact'),null);
  assert.ok(patched.get('shooter','fire').length>500,'original distinct main PCM can be cached');
  assert.equal(strict.stats().realOnly,true);
  assert.equal(patched.stats().audibleShotFallback,true);
  strict.dispose();patched.dispose();
});
