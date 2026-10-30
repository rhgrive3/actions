import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spinnerFirstStage,spinnerChargePitch,syncCatalogSpinnerCharge} from '../runtime/audio/spinner-charge-layer.mjs';
import {adaptWeaponAudio} from '../audio-adapter.mjs';

function motor() {
  return {
    playing:true,updates:[],stops:[],
    set(update){this.updates.push({...update});},
    stop(fade){this.stops.push(fade);this.playing=false;},
  };
}
function weapon(first,full,id='s3-spinner-standard'){
  return {id, catalogRecord:{family:'splatling',parameters:{WeaponParam:{ChargeFrame_First:first,ChargeFrame_Second:full}}}};
}

test('all six source first stages drive the charge sound rather than a 50% guess',()=>{
  for(const [first,full] of [[18,27],[48,72],[120,150],[1,100],[38,76],[60,120]]){
    assert.equal(spinnerFirstStage(weapon(first,full)),first/full);
  }
  assert.equal(spinnerFirstStage({id:'splatling'}),2/3);
  assert.equal(spinnerChargePitch(-10),.88);
  assert.ok(Math.abs(spinnerChargePitch(1)-1.2)<1e-12);
  assert.equal(spinnerChargePitch(10),spinnerChargePitch(1));
});

test('S3 local catalog charge and stream own one loop at a time with cleanup',()=>{
  const calls=[],actor={isLocal:true,alive:true,form:'kid',remote:false,weapon:weapon(18,27),pos:{x:1,y:2,z:3}};
  const runner={a:actor,charging:true,streaming:false,charge:.4,aimingSub:false};
  const engine={
    ctx:{currentTime:10},
    loopWeapon(id,event,options){const handle=motor();calls.push({id,event,options,handle});return handle;},
  };
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls.length,1);assert.equal(calls[0].event,'charge');
  assert.equal(calls[0].handle.updates[0].progress,.4);
  runner.charge=1;
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls.length,1,'stable charge never reallocates a second audio loop');
  runner.charging=false;runner.streaming=true;
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls[0].handle.playing,false,'charge stops before MotorFire');
  assert.equal(calls[1].event,'spin');
  runner.streaming=false;
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls[1].handle.playing,false,'stream end releases recorded motor');
  runner.charging=true;runner.charge=.1;
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls[2].event,'charge','next charge starts new audio session');
  actor.remote=true;
  syncCatalogSpinnerCharge(engine,runner);
  assert.equal(calls[2].handle.playing,false,'host migration must release local motor');
});

test('production source adapter wires local and remote progress without duplicate Ready',()=>{
  const weapons=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
  const local=adaptWeaponAudio('src/game/weapons.js',weapons);
  assert.match(local,/this\.spinLoop\?\.set\(\{ progress:this\.charge, pos \}\)/);
  assert.ok(!local.includes("G.audio?.play('splatling_ready'"));
  assert.ok(local.includes('Full-charge Ready is fired once'));
  const network=fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8');
  const remote=adaptWeaponAudio('src/net/netmatch.js',network);
  assert.match(remote,/progress: wr\.charge/);
  const bank=fs.readFileSync(new URL('../runtime/audio/bank.mjs',import.meta.url),'utf8');
  assert.ok(bank.includes('recordedSpinnerMotor'),'the original recording remains locked to speed 1');
  assert.ok(!fs.readFileSync(new URL('../runtime/audio/spinner-charge-layer.mjs',import.meta.url),'utf8').includes('createOscillator'));
});
