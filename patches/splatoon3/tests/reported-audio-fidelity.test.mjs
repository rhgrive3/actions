import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';
import { usesSplatChargerRise } from '../runtime/audio/charger-charge-rise.mjs';

async function scene(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';"});
  const calls=[],rises=[];
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.audio={ctx:{},prepareWeapon(){},prewarmChargerChargeRise(){},duck(){},play(){},
    playWeapon(id,event,o){calls.push({id,event,o,at:f.G.time});},
    playChargerChargeRise(o){const h={o,playing:true,stop(){this.playing=false;}};rises.push(h);return h;},
    loopWeapon(id,event,o){const h={id,event,o,playing:true,set(){},stop(){this.playing=false;}};calls.push(h);return h;}};
  f.installWeaponAudioRuntime(f.installedRuntime);
  return {...f,calls,rises};
}

test('each charger uses its own charge onset and ready edge; only Splat Charger uses its recorded phrase',async()=>{
  const f=await scene();
  for(const r of Object.values(WEAPON_AUDIO).filter(r=>r.family==='charger')){
    f.G.projectiles.clear();f.G.actors.length=0;f.calls.length=0;f.rises.length=0;
    const a=f.make(r.id);a.form='kid';a.isLocal=true;a.ink=100;a.intent.fire=true;
    f.tick(a,150);
    assert.equal(f.rises.length,usesSplatChargerRise(r.id)?1:0,r.id+' must use correct phrase');
    assert.equal(f.calls.filter(c=>c.id===r.id&&c.event==='charge').length,usesSplatChargerRise(r.id)?0:1,r.id+' one onset');
    // Native Splat Charger's ready sound remains native. Catalogue ready is
    // the first actual full-charge edge, independently of MP3 duration.
    if(a.weapon.catalogRecord){
      const ready=f.calls.filter(c=>c.id===r.id&&c.event==='ready');
      assert.equal(ready.length,1,r.id+' one ready edge');
      assert.ok(a.weaponRunner.charge>=1);
    }
    a.intent.fire=false;f.tick(a,3);
    assert.ok(f.rises.every(h=>!h.playing),r.id+' release stops rise');
  }
});

test('Octobrush isolated swings never start the 15.99 second movement recording',async()=>{
  const f=await scene(),a=f.make('s3-brush-normal');a.form='kid';a.isLocal=true;a.ink=100;
  for(let swing=0;swing<5;swing++){
    a.intent.fire=true;f.tick(a);a.intent.fire=false;f.tick(a,40);
  }
  assert.equal(f.calls.filter(c=>c.id===a.weapon.id&&c.event==='windup').length,0);
  assert.ok(f.calls.some(c=>c.id===a.weapon.id&&c.event==='fire'),'actual swing sound retained');
  for(const name of ['real-s3-samples.json','real-s3-installed.json']){
    const {clips}=JSON.parse(fs.readFileSync(new URL('../runtime/audio/'+name,import.meta.url)));
    assert.equal(clips.filter(c=>c.id===a.weapon.id&&c.event==='windup').length,1,
      'immutable source manifest retains recorded motion clip; gameplay must not play it for a swing');
    assert.ok(clips.some(c=>c.id===a.weapon.id&&c.event==='roll'&&c.file.endsWith('Wp_Brush_Move_00.mp3')),
      'contact movement retains its original loop');
    assert.equal(clips.filter(c=>c.id===a.weapon.id&&c.event==='fire').length,4);
  }
});

test('suspended brush pose cannot leave a floor-contact loop running',async()=>{
  const f=await scene(),a=f.make('s3-brush-normal');a.form='kid';a.isLocal=true;a.ink=100;
  a.intent.fire=true;f.tick(a,50);
  a.grounded=false;a.ground.hit=false;a.weaponRunner.s3RollerSuspendedHold=true;f.tick(a,5);
  assert.ok(f.calls.filter(c=>c.event==='roll'&&'playing' in c).every(h=>!h.playing));
  a.intent.fire=false;f.tick(a,2);
  assert.ok(f.calls.filter(c=>'playing' in c).every(h=>!h.playing));
});
