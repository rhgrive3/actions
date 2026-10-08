import test from 'node:test';
import assert from 'node:assert/strict';
import {normalJumpHoldState, validJumpHoldProfile, installNormalJumpHold} from '../runtime/normal-jump-hold.mjs';

const makeHarness=profile=>{
  class Actor {
    constructor(){this.s3JumpSerial=0;this.vel={y:0};this.alive=true;this.grounded=true;
      this.form='kid';this.climbing=false;this.superJumpState=null;this.specialActive=null;
      this.intent={jump:false};this.launch=false;}
    update(dt){
      if(this.launch){this.s3JumpSerial++;this.vel.y=8.4;this.grounded=false;this.launch=false;}
      else if(!this.grounded)this.vel.y-=25*dt;
    }
    reset(){this.grounded=true;this.vel.y=0;}
  }
  installNormalJumpHold({Actor},profile);
  return Actor;
};
test('#890 no unsourced profile leaves native jump trajectory unchanged',()=>{
  const Actor=makeHarness({}),a=new Actor();
  a.intent.jump=true;a.launch=true;a.update(1/60);
  assert.equal(normalJumpHoldState(a).serial,1);
  const nativeBefore=a.vel.y;a.intent.jump=false;a.update(1/60);
  assert.ok(Math.abs(a.vel.y-(nativeBefore-25/60))<1e-10);
  const state=normalJumpHoldState(a);
  assert.equal(state.released,true);assert.equal(state.applied,false);
  a.reset();assert.equal(normalJumpHoldState(a),null);
});

test('#890 optional verified profile distinguishes 1F release from sustained hold',()=>{
  const tuning={normalJumpHold:{enabled:true,provenance:'verified',holdFrames:6,releaseRate:.7}};
  assert.equal(validJumpHoldProfile(tuning.normalJumpHold),true);
  const Actor=makeHarness(tuning),early=new Actor(),held=new Actor();
  for(const a of [early,held]){a.intent.jump=true;a.launch=true;a.update(1/60);}
  early.intent.jump=false;
  early.update(1/60);
  for(let i=0;i<8;i++)held.update(1/60);
  held.intent.jump=false;const before=held.vel.y;held.update(1/60);
  assert.ok(Math.abs(early.vel.y-(8.4*.7-25/60))<1e-10);
  assert.ok(Math.abs(held.vel.y-(before-25/60))<1e-10,'release past hold window leaves ascent alone');
  assert.equal(normalJumpHoldState(early).applied,true);
  assert.equal(normalJumpHoldState(held).applied,false);
});
test('#890 malformed or guessed parameters do not activate authoritative jump physics',()=>{
  for(const hold of [
    {enabled:true,provenance:'calibration',holdFrames:6,releaseRate:.7},
    {enabled:true,provenance:'verified',holdFrames:0,releaseRate:.7},
    {enabled:true,provenance:'verified',holdFrames:6,releaseRate:1},
  ])assert.equal(validJumpHoldProfile(hold),false);
});
