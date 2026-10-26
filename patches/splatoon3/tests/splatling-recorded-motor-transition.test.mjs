import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptWeaponAudio } from '../audio-adapter.mjs';

const OLD_SYNTH = new Set(['splatling_spin', 'splatling_ready', 'splatling_wind', 'shoot_splatling']);

async function scene() {
  const f = await fixture({
    fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: `export { installWeaponAudioRuntime } from './patches/splatoon3/runtime/audio/runtime.mjs';
      export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`,
  });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  const calls=[];
  const handle=(kind,id,event,options)=>{
    const h={playing:true,updates:[],stops:[],
      set(next){this.updates.push({...next});},
      stop(fade){this.stops.push(fade);this.playing=false;}};
    calls.push({kind,id,event,options,handle:h});return h;
  };
  f.G.audio={
    ctx:{state:'running'},
    prepareWeapon(){}, prewarmChargerChargeRise(){}, playChargerChargeRise(){return null;},
    duck(){},
    play(name,options){calls.push({kind:'legacy',name,options});return null;},
    loop(name,options){return handle('legacy-loop',name,'loop',options);},
    playWeapon(id,event,options){calls.push({kind:'recorded-shot',id,event,options});return null;},
    loopWeapon(id,event,options){return handle('recorded-loop',id,event,options);},
  };
  f.installWeaponAudioRuntime(f.installedRuntime);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return {...f,calls};
}
const loops=(calls,event)=>calls.filter(c=>c.kind==='recorded-loop'&&c.event===event);
const noOldSfx=calls=>assert.deepEqual(calls.filter(c=>c.kind==='legacy-loop'||c.kind==='legacy'&&OLD_SYNTH.has(c.name)),[],
  'an old synthesized Spinner/shot sound must not overlap the recorded Motor/shot');

test('native Barrel Splatling transitions Motor to MotorFire once and never plays synthesized motor',async()=>{
  const f=await scene(),a=f.make('splatling');
  a.form='kid';a.kidT=2;a.isLocal=true;a.ink=100;a.intent.fire=true;
  f.tick(a,92); // more than 72-frame full charge
  assert.equal(a.weaponRunner.charging,true);
  assert.equal(loops(f.calls,'charge').length,1,'one recorded Standard Motor during hold');
  assert.equal(loops(f.calls,'spin').length,0,'MotorFire must not run while charging');
  assert.equal(loops(f.calls,'charge')[0].id,'splatling');
  assert.ok(!loops(f.calls,'charge')[0].handle.stops.length,'Motor is held until trigger release');
  noOldSfx(f.calls);
  a.intent.fire=false;
  f.tick(a);
  assert.equal(a.weaponRunner.streaming,true,'real gameplay starts a stream');
  assert.equal(loops(f.calls,'charge').length,1);
  assert.equal(loops(f.calls,'spin').length,1,'one MotorFire after release');
  assert.equal(loops(f.calls,'spin')[0].id,'splatling');
  assert.equal(loops(f.calls,'charge')[0].handle.playing,false,'charge Motor stops on stream transition');
  assert.equal(loops(f.calls,'spin')[0].handle.playing,true,'MotorFire remains active');
  f.tick(a,12);
  assert.ok(f.calls.some(c=>c.kind==='recorded-shot'&&c.id==='splatling'&&c.event==='fire'),
    'per-bullet recorded main shot is retained');
  noOldSfx(f.calls);
  f.tick(a,240);
  assert.equal(a.weaponRunner.streaming,false);
  assert.equal(loops(f.calls,'spin')[0].handle.playing,false,'natural stream end retires MotorFire');
  noOldSfx(f.calls);
});

test('remote Barrel and catalog Spinners switch independent source loop keys without overlapping',async()=>{
  const f=await scene(),net=Object.create(f.NetMatch.prototype);
  net.byNid=new Map();
  for(const id of ['splatling','s3-spinner-quick','s3-spinner-hyper']){
    f.calls.length=0;net.byNid.clear();
    const a=f.make(id);a.remote=true;a.isLocal=false;a.alive=true;
    a._nearCamera=()=>true;a.net||={};a.net.loops||={};net.byNid.set(id,a);
    const r=a.weaponRunner;
    r.charging=true;r.streaming=false;r.charge=.4;
    net._voices(1/60);
    assert.equal(loops(f.calls,'charge').length,1,id+' starts Motor on charge');
    assert.equal(loops(f.calls,'spin').length,0,id+' MotorFire does not start on charge');
    assert.equal(loops(f.calls,'charge')[0].id,id);
    assert.ok(a.net.loops.spinnerCharge);
    r.charging=false;r.streaming=true;r.charge=0;r.burstFrac=1;
    net._voices(1/60);
    assert.equal(loops(f.calls,'charge')[0].handle.playing,false,id+' releases Motor');
    assert.equal(loops(f.calls,'spin').length,1,id+' starts MotorFire once');
    assert.equal(loops(f.calls,'spin')[0].id,id);
    net._voices(1/60);
    assert.equal(loops(f.calls,'spin').length,1,id+' does not duplicate MotorFire each tick');
    r.streaming=false;
    net._voices(1/60);
    assert.equal(loops(f.calls,'spin')[0].handle.playing,false,id+' stops MotorFire on stream end');
    noOldSfx(f.calls);
  }
});

test('source adapters and installed MP3 manifest never substitute the old oscillator',()=>{
  const spinner=fs.readFileSync(new URL('../runtime/splatling.mjs',import.meta.url),'utf8');
  assert.ok(spinner.includes("G.audio?.loopWeapon?.(w.id,'charge'"));
  assert.ok(spinner.includes("G.audio?.loopWeapon?.(w.id,'spin'"));
  assert.ok(!spinner.includes("G.audio?.loop('splatling_spin'"));
  for(const name of ['splatling_ready','splatling_wind'])
    assert.ok(!spinner.includes("G.audio?.play('"+name+"'"),name+' may not synthesize');
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8');
  const network=adaptWeaponAudio('src/net/netmatch.js',raw);
  assert.ok(network.includes("'spinnerCharge'"));
  assert.ok(network.includes("key==='spinnerCharge'?'charge':key==='spin'?'spin':'roll'"));
  assert.ok(network.includes("isSpinner && wr.charging && !wr.streaming"));
  assert.ok(network.includes("isSpinner && wr.streaming"));
  const installed=JSON.parse(fs.readFileSync(new URL('../runtime/audio/real-s3-installed.json',import.meta.url),'utf8'));
  for(const [event,file] of [
    ['charge','Wp_SpinnerStandard_Motor_00.mp3'],
    ['spin','Wp_SpinnerStandard_MotorFire_00.mp3'],
    ['fire','Wp_SpinnerStandard_Shot_00.mp3']
  ])assert.ok(installed.clips.some(c=>c.id==='splatling'&&c.event===event&&c.sourceName===file),
    'source recording is registered '+file);
});
