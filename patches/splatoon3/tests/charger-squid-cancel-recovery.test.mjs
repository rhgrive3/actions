import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ROOT} from '../../../scripts/weapons-fixture.mjs';
import {STEP} from '../runtime/clock.mjs';

async function setup(frames = 14) {
  const f = await fixture({site:`${ROOT}.charger-squid-cancel-six-frames`,fidelity:true});
  const a = f.make('charger'), r = a.weaponRunner;
  f.G.actors = [a];
  f.G.paint.sample = () => 1;
  const step = (fire = false, squid = false) => {
    a.intent.fire = fire; a.intent.squid = squid;
    f.G.time += STEP; a.update(STEP);
  };
  for(let i=0;i<frames;i++) step(true,false);
  return {...f,a,r,step};
}

test('partial charge ZL cancel cannot grant ordinary squid until the sixth recovery frame',async()=>{
  const h=await setup();
  assert.equal(h.r.charging,true);
  assert(h.r.charge>0 && h.r.charge<.999);
  const paid=h.a.ink;
  h.step(true,true);
  assert.equal(h.a.form,'kid');
  assert.equal(h.r.charging,false);
  assert(h.r.s3ChargerCancelSwimRemaining>0);
  for(let i=1;i<=5;i++){
    h.step(true,true);
    assert.equal(h.a.form,'kid',`early swim at recovery frame ${i}`);
    assert(h.r.s3ChargerCancelSwimRemaining>0);
  }
  h.step(true,true);
  assert.equal(h.r.s3ChargerCancelSwimRemaining,0);
  assert.equal(h.a.form,'squid');
  assert.equal(h.projectiles._fidelityChargerFlights?.length||0,0);
  assert(h.a.ink>=paid-1e-8,'partial cancel must not spend a fresh shot');
});

test('full-charge storage is not classified as partial-charge recovery',async()=>{
  const h=await setup(80);
  assert(h.r.charge>=.999);
  h.step(true,true);
  assert.equal(h.r.s3ChargerCancelSwimRemaining||0,0);
});

test('death/reset and explicit input cancellation clear the six-frame gate',async()=>{
  for(const action of ['reset','input']){
    const h=await setup();
    h.step(true,true);
    assert(h.r.s3ChargerCancelSwimRemaining>0);
    if(action==='reset')h.r.reset();
    else h.r.cancelPendingInput();
    assert.equal(h.r.s3ChargerCancelSwimRemaining||0,0);
  }
});
