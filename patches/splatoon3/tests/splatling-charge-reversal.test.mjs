import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// The control clears only the source parameter read by the provisional model.
// This also exercises the copied/minified emitted runtime without rewriting it.
async function makePair() {
  const [model, native] = await Promise.all([
    fixture({productionComposition:true}), fixture({productionComposition:true})
  ]);
  const param=native.profile.weaponsFidelityCompletion.weapons.splatling.WeaponParam;
  assert.equal(param.VelGnd_DownRt_Charge,.05);
  param.VelGnd_DownRt_Charge=0;
  return [model, native].map(f => {
    const a=f.make('splatling'); a.weaponRunner.charging=true;
    a.weaponRunner.charge=.4; a.vel.set(0,0,5.76);
    return {f,a};
  });
}
const velocity=a=>[a.vel.x,a.vel.z];
function near(a,b,label) {
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9, `${label}: model ${a}, ground solver ${b}`);
}

test('the control removes the model on aligned charge entry', async () => {
  const pair=await makePair();
  for(const {a} of pair){a.intent.move.set(0,0,1);a._horizontal(1/60,false,false);}
  assert.ok(Math.abs(pair[0].a.vel.z-pair[1].a.vel.z)>.1,'control must exercise a different slowdown');
});

test('charge model preserves the ground solver when reversing, including weak input', async () => {
  const pair=await makePair();
  for (const magnitude of [.25,1]) {
    for (const {a} of pair) {a.vel.set(0,0,5.76);a.intent.move.set(0,0,-magnitude);}
    for (let tick=0;tick<12;tick++) {
      for (const {a} of pair) a._horizontal(1/60,false,false);
      near(...pair.map(({a})=>velocity(a)), `input ${magnitude}, tick ${tick}`);
    }
    assert.ok(pair[0].a.vel.z<0,'reversal reaches requested direction');
  }
});

test('orthogonal and backward-diagonal charge inputs preserve the ground solver', async () => {
  const pair=await makePair();
  for(const [x,z] of [[1,0],[.5,-Math.sqrt(.75)],[-.5,-Math.sqrt(.75)]]) {
    for(const {a} of pair){a.vel.set(0,0,5.76);a.intent.move.set(x,0,z);a._horizontal(1/60,false,false);}
    near(...pair.map(({a})=>velocity(a)), `input ${x},${z}`);
  }
});

test('charge reversal has the same fixed-tick trajectory at 30, 60 and 120 Hz render rates', async () => {
  const pair=await makePair(), paths=[];
  for(const hz of [30,60,120]){
    const {a}=pair[0],clock=new FixedClock(),path=[];
    a.vel.set(0,0,5.76);a.intent.move.set(0,0,-1);
    while(clock.ticks<24)clock.advance(1/hz,dt=>{a._horizontal(dt,false,false);path.push(velocity(a));});
    paths.push(path);
  }
  assert.deepEqual(paths[0],paths[1]);assert.deepEqual(paths[1],paths[2]);
});
