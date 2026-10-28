import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

test('accepted special interrupts a charging phrase before Actor skips weapon updates', async () => {
  const f = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';"});
  const rises=[];
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.audio={ctx:{},prepareWeapon(){},prewarmChargerChargeRise(){},duck(){},play(){},playWeapon(){},
    playChargerChargeRise(){const h={playing:true,stops:0,stop(){this.playing=false;this.stops++;}};rises.push(h);return h;},
    loopWeapon(){return {playing:true,set(){},stop(){this.playing=false;}};},
    loop(){return {playing:true,set(){},stop(){this.playing=false;}};}};
  f.installWeaponAudioRuntime(f.installedRuntime);
  for(const id of ['charger','s3-charger-quick']) for(const hz of [30,60,120]) {
    const a=f.make(id);a._resolve=()=>{};a.isLocal=true;a.form='kid';a.ink=100;a.intent.fire=true;
    const step=()=>{f.G.time+=1/hz;a.update(1/hz);};
    const before=rises.length;for(let i=0;i<hz&&rises.length===before;i++)step();
    const rise=rises.at(-1);assert.ok(rises.length===before+1&&rise?.playing,`${id} ${hz}: start`);
    a.weapon={...a.weapon,special:'slam'};a.special=a.specialCost();a.intent.special=true;
    step();assert.ok(a.specialActive,`${id} ${hz}: accepted special`);
    assert.equal(rise.playing,false,`${id} ${hz}: rise stops at activation`);
    assert.equal(rise.stops,1,`${id} ${hz}: one stop`);
    a.intent.special=false;step();assert.equal(rise.stops,1);
    a.specialActive=null;a.weaponRunner.reset();
    const prior=rises.length;for(let i=0;i<hz&&rises.length===prior;i++)step();
    assert.equal(rises.length,prior+1,`${id} ${hz}: next admitted hold starts once`);
    a.intent.fire=false;for(let i=0;i<hz/2;i++)step();
    assert.equal(rises.at(-1).playing,false,`${id} ${hz}: release stops new phrase`);
    a.weaponRunner.reset();f.G.actors.length=0;f.G.projectiles.clear();
  }
});
