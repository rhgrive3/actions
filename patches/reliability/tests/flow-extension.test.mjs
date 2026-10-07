import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('#504 native splats add ten seconds below cap and keep thirty-second activation',async()=>{
 const f=await fixture(),a=f.make();for(const [remaining,expected] of [[10,20],[15,25],[25,30],[30,30]]){
  const victim=f.make();victim.team=1;Object.assign(a.s3.flow,{active:true,remaining});victim.splat(a,'weapon');near(a.s3.flow.remaining,expected);victim.splat(a,'weapon');near(a.s3.flow.remaining,expected);
 }
 const v=f.make();v.team=1;Object.assign(a.s3.flow,{active:false,score:f.profile.flow.threshold});v.splat(a,'weapon');near(a.s3.flow.remaining,30);
});
test('#504 native damage assist extends ten seconds; uncredited teammate does not',async()=>{
 const f=await fixture(),helper=f.make(),killer=f.make(),uncredited=f.make(),victim=f.make();victim.team=1;victim.invuln=0;
 for(const a of [helper,uncredited])Object.assign(a.s3.flow,{active:true,remaining:10});victim.damage(1,helper,'shooter');victim.splat(killer,'weapon');near(helper.s3.flow.remaining,20);near(uncredited.s3.flow.remaining,10);
});
test('#504 six hundred fixed ticks consume exactly the ten-second extension across render cadences',async()=>{
 for(const hz of [30,60,120,144]){const f=await fixture(),a=f.make(),v=f.make();v.team=1;Object.assign(a.s3.flow,{active:true,remaining:10});v.splat(a,'weapon');const clock=new f.FixedClock();for(let i=0;i<hz*10;i++)clock.advance(1/hz,()=>f.advanceFlow(a.s3.flow,1/60,f.profile.flow));assert.equal(clock.ticks,600);near(a.s3.flow.remaining,10);}
});
