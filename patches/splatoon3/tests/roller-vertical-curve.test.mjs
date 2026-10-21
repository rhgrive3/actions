import test from 'node:test';
import assert from 'node:assert/strict';
import { verticalRollerPose, VERTICAL_ROLLER_SWING, VERTICAL_SWING, ROLLER_POSE } from '../runtime/roller.mjs';

test('vertical lift keeps rising to the late crest instead of borrowing the horizontal overhead hold', () => {
  for (const [windupFrames, intervalFrames] of [[20,40],[31,56],[40,65]]) {
    const windup=windupFrames/60,interval=intervalFrames/60,crest=windup-VERTICAL_ROLLER_SWING.crestLead;
    let peak=-Infinity,peakTime=0;
    for(let i=0;i<=windupFrames*4;i++){
      const t=i/240,y=verticalRollerPose(t,windup,interval).anchor[1];
      if(y>peak){peak=y;peakTime=t;}
    }
    assert(Math.abs(peakTime-crest)<=1/240,'crest is two frames before live release');
    const early=verticalRollerPose(windup*.45,windup,interval),late=verticalRollerPose(windup*.78,windup,interval);
    assert(late.anchor[1]>early.anchor[1]+.05,'no long early height plateau');
    assert.equal(verticalRollerPose(windup,windup,interval).rotation[0],VERTICAL_SWING.release);
    const settled=verticalRollerPose(windup+5/60,windup,interval);
    assert.equal(settled.rotation[0],VERTICAL_SWING.follow,'follow-through completes promptly');
    const ready=verticalRollerPose(interval,windup,interval);
    assert.deepEqual(ready.anchor,ROLLER_POSE.READY_ANCHOR);assert.equal(ready.weight,0);
  }
});

test('vertical fitted grip has continuous position and velocity across crest, release, follow-through and return', () => {
  const windup=31/60,interval=56/60,hold=windup-4/60;
  for(const time of [hold*.25,hold*.65,hold,windup-2/60,windup,windup+5/60,interval-10/60]){
    const h=1e-7,a=verticalRollerPose(time-h,windup,interval),b=verticalRollerPose(time,windup,interval),c=verticalRollerPose(time+h,windup,interval);
    for(const key of ['anchor','rotation'])for(let i=0;i<3;i++){
      assert(Math.abs(c[key][i]-a[key][i])<1e-4,'no pose jump');
      const left=(b[key][i]-a[key][i])/h,right=(c[key][i]-b[key][i])/h;
      assert(Math.abs(left-right)<.002,'no angular/translation velocity reset at key');
    }
  }
});
