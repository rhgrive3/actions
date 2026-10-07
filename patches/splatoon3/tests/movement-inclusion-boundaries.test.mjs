import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('699 wall speed floor composes with 767 stick heading and shared retained history',async()=>{
 const f=await fixture(),a=f.make();a.form='squid';a.climbing=true;a.submerged=false;a.wallN.set(0,0,1);a.intent.move.set(.5,0,Math.sqrt(.75));a.vel.set(0,2,0);
 f.beforeActions(a,1/60,true);const first=Math.hypot(a.vel.x,a.vel.z);near(first,Math.max(f.profile.movement.roll.minimumSpeed,f.PLAYER.swimSpeed*.8));near(Math.atan2(a.vel.x,a.vel.z),Math.PI/6);
 a.climbing=true;a.vel.set(0,2,0);f.beforeActions(a,1/60,true);near(Math.hypot(a.vel.x,a.vel.z),first*f.profile.movement.roll.chainRetention);
});
test('699 admission tick retains exact roll velocity and the following native tick can steer',async()=>{
 const f=await fixture(),a=f.make();a.form='squid';a.submerged=true;a.grounded=true;a.vel.set(0,0,12);a.intent.move.set(0,0,-1);f.beforeActions(a,1/60,true);
 const v=a.vel.clone();a.intent.move.set(1,0,0);a._horizontal(1/60,false,true);near(a.vel.x,v.x);near(a.vel.z,v.z);a._horizontal(1/60,false,true);assert.ok(a.vel.x>0);assert.ok(a.vel.z!==v.z);
});
for(const hz of [30,60,120])test(`699 Surge removes wall-normal contact bias and preserves tangential/gravity velocity at ${hz}Hz`,async()=>{
 const f=await fixture(),a=f.make();a.form='squid';a.climbing=true;a.submerged=false;a.wallN.set(0,0,1);a.intent.jump=true;a.vel.set(3,8,-1.1);
 f.beforeActions(a,1/hz,false);near(a.vel.x,3);near(a.vel.y,8);near(a.vel.z,0);assert.ok(a.s3.actions.surge.charge>0);
});
test('negative control: former Surge path keeps inward contact bias',async()=>{
 const f=await fixture({adaptRuntime:(rel,s)=>rel.endsWith('/movement.mjs')?s.replace('a.vel.x -= n.x * vn; a.vel.z -= n.z * vn;',''):s});const a=f.make();a.form='squid';a.climbing=true;a.wallN.set(0,0,1);a.intent.jump=true;a.vel.set(3,8,-1.1);f.beforeActions(a,1/60,false);near(a.vel.z,-1.1);
});
