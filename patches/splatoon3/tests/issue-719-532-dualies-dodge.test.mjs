import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { dodgeIntervalDistance } from '../runtime/movement-physics.mjs';

const trial=async ({fire=true, move=1, rolls=2, ink=100, airborne=true}={})=>{
  const f=await fixture({composeProductionAdapters:true}),a=f.make('dualies');
  a.grounded=!airborne;a.coyote=0;a.vel.y=4;
  a.ink=ink;a.weaponRunner.rollsLeft=rolls;
  a.intent.move.set(move,0,0);a.intent.fire=fire;a.intent.jump=true;
  const before=a.ink;f.tick(a);
  return {f,a,r:a.weaponRunner,before};
};

test('#719 airborne Dualies jump+fire enters one native roll, pays once, descends',async()=>{
  const {a,r,before}=await trial();
  assert.ok(r.dodge,'real airborne roll admitted');
  assert.equal(r.dodge.airborne,true);
  assert.equal(r.rollsLeft,1);
  assert.ok(Math.abs(before-a.ink-a.weapon.rollInk)<1e-8);
  assert.ok(a.vel.y<0,'authentic gravity-based descending impulse, no invented S3 vertical constant');
  assert.equal(a.jumpBuffer,0);
  for(let n=0;n<4;n++)a.update(1/60);
  assert.equal(r.rollsLeft,1,'jump held does not consume a second roll');
});

test('#719 airborne ordinary jump cannot roll without firing/direction/roll/ink',async()=>{
  for(const opts of [{fire:false},{move:0},{rolls:0},{ink:0}]){
    const {a,r,before}=await trial(opts);
    assert.equal(r.dodge,null,JSON.stringify(opts));
    // Rejected rolls cost no ink. At zero ink, normal fixed-tick kid-form
    // regeneration remains legal and must not be mistaken for a roll charge.
    if (opts.ink === 0) {
      assert.ok(a.ink >= before && a.ink <= before + f.PLAYER.inkRefillKid / 60 + 1e-8, JSON.stringify(opts));
    } else assert.equal(a.ink,before,JSON.stringify(opts));
  }
  const {r}=await trial({airborne:false});assert.ok(r.dodge,'ground dodge unchanged');
});

test('#532 real S3 Dualies 12F dodge has 5DU distance budget, cardinal invariant',async()=>{
  const {a}=await trial({airborne:false}),w=a.weapon;
  assert.equal(w.rollDist,5);
  assert.ok(Math.abs(w.rollTime-12/60)<1e-12);
  const dts=Array.from({length:12},(_,i)=>dodgeIntervalDistance(w.rollDist,w.rollTime,i/60,1/60));
  const total=dts.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(total-5)<1e-8);
  for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const dx=dts.reduce((s,d)=>s+d*x,0),dz=dts.reduce((s,d)=>s+d*z,0);
    assert.ok(Math.abs(Math.hypot(dx,dz)-5)<1e-8);
  }
  assert.ok(dts[0]>dts[11],'existing front-loaded roll curve preserved');
});
