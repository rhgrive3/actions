import test from 'node:test';
import assert from 'node:assert/strict';
import {normalJumpHoldState, validJumpHoldProfile, installNormalJumpHold,
  LEGACY_JUMP_SOURCE,LEGACY_JUMP_FEEL} from '../runtime/normal-jump-hold.mjs';

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
test('#890 explicit disable leaves native jump trajectory unchanged',()=>{
  const Actor=makeHarness({normalJumpHold:{enabled:false}}),a=new Actor();
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

test('#890 source-extracted S1 5F+21F+15F clips are separated from unmeasured jump physics',()=>{
  assert.equal(LEGACY_JUMP_SOURCE.game,'Splatoon (Wii U)');
  assert.equal(LEGACY_JUMP_SOURCE.startFrames,5);
  assert.equal(LEGACY_JUMP_SOURCE.bodyFrames,21);
  assert.equal(LEGACY_JUMP_SOURCE.endFrames,15);
  assert.ok(LEGACY_JUMP_SOURCE.clips.includes('Jump_Nrml00'));
  assert.ok(LEGACY_JUMP_SOURCE.clips.includes('Jump_Rllr00'));
  assert.equal(LEGACY_JUMP_SOURCE.physicsExtracted,false);
  assert.equal(LEGACY_JUMP_FEEL.status,'unverified-game-feel-prototype');
  assert.equal(validJumpHoldProfile(LEGACY_JUMP_FEEL),true);
});
test('#890 default S1-inspired tuning gives shorter 1F tap than sustained B hold',()=>{
  const Actor=makeHarness({}),tap=new Actor(),held=new Actor();
  for(const a of [tap,held]){a.intent.jump=true;a.launch=true;a.update(1/60);}
  tap.intent.jump=false;tap.update(1/60);
  for(let k=0;k<8;k++)held.update(1/60);
  held.intent.jump=false;held.update(1/60);
  assert.ok(tap.vel.y<held.vel.y,'tap loses upward speed, high jump keeps the full impulse');
  assert.equal(normalJumpHoldState(tap).applied,true);
  assert.equal(normalJumpHoldState(held).applied,false);
  assert.ok(Math.abs(tap.vel.y-(8.4*0.7-25/60))<1e-10);
});
test('#890 fabricated legacy calibration is rejected without explicit status and source identity',()=>{
  const candidate={...LEGACY_JUMP_FEEL};
  assert.equal(validJumpHoldProfile({...candidate,referenceGame:'Splatoon 3'}),false);
  assert.equal(validJumpHoldProfile({...candidate,status:'verified'}),false);
  assert.equal(validJumpHoldProfile({...candidate,referenceAsset:'other.szs'}),false);
  assert.equal(validJumpHoldProfile({...candidate,releaseRate:Infinity}),false);
});
