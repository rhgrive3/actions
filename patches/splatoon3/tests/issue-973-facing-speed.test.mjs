import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function trace(magnitude, hz=60, mode='ordinary') {
  const f=await fixture(), a=f.make(); a.yaw=0; a.yawVel=0;
  a.intent.move.set(magnitude,0,0); a.vel.set(magnitude*f.PLAYER.runSpeed,0,0); a.aimYaw=Math.PI/2;
  if (mode==='aim') a.intent.sub=true;
  if (mode==='squid') a.form='squid';
  if (mode==='air') a.grounded=false;
  if (mode==='roller') a.weaponRunner.rolling=true;
  const rows=[], clock=new FixedClock();
  for(let i=0;i<hz/2;i++) clock.advance(1/hz,dt=>{a._face(dt,mode==='squid'); rows.push([a.yaw,a.yawVel,a.anim.turnRate]);});
  return rows;
}
test('#973 slow/middle/full turn responses are ordered, with full speed unchanged',async()=>{const slow=await trace(.25),mid=await trace(.5),full=await trace(1);for(const tick of [0,2,5,10])assert.ok(slow[tick][0]<mid[tick][0]&&mid[tick][0]<full[tick][0]);assert.equal(full[0][1],170/60);assert.equal(full[0][0],170/3600);});
test('#973 crossing .2 no longer changes from idle to a full-strength yaw curve',async()=>{const lo=await trace(.19),hi=await trace(.21),full=await trace(1);assert.ok(lo[0][0]>0&&lo[0][0]<hi[0][0]);assert.ok(hi[0][0]<full[0][0]*.3);assert.ok(hi[0][0]/lo[0][0]<1.4);});
test('#973 aim, squid, airborne and roller ownership remain separate',async()=>{for(const mode of ['aim','squid','air','roller'])assert.deepEqual(await trace(.25,60,mode),await trace(1,60,mode));});
test('#973 30/60/120Hz rendering produces the same fixed-tick facing',async()=>{const reference=await trace(.5);for(const hz of [30,120])assert.deepEqual(await trace(.5,hz),reference);});
test('#973 coasting fallback uses finite run-speed normalization and does not rotate at rest',async()=>{const f=await fixture(),slow=f.make(),fast=f.make(),rest=f.make();for(const [a,speed]of [[slow,2],[fast,f.PLAYER.runSpeed],[rest,0]]){a.yaw=0;a.yawVel=0;a.intent.move.set(0,0,0);a.vel.set(speed,0,0);a._face(1/60,false);assert.ok(Number.isFinite(a.yaw)&&Number.isFinite(a.yawVel));}assert.ok(slow.yaw>0&&slow.yaw<fast.yaw);assert.equal(rest.yaw,0);});
