import test from 'node:test';
import assert from 'node:assert/strict';
import { splatBombAxisVelocity } from '../runtime/kit-subs.mjs';
const vec=()=>({set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}});
const actor=()=>({aimYaw:0,aimPitch:0,vel:{x:0,y:0,z:0}});
test('#281 neutral Splat Bomb uses independent sourced 0.24/F Y and 1.12/F Z',()=>{
 const a=actor(), v=splatBombAxisVelocity(a,67.2,14.4,vec());
 assert.equal(v.x,0);assert.equal(v.y,14.4);assert.equal(v.z,67.2);
});
test('#281 aim pitch rotates both components while yaw controls the forward axis',()=>{
 const a=actor();a.aimPitch=Math.PI/6;
 const v=splatBombAxisVelocity(a,67.2,14.4,vec());
 assert.ok(Math.abs(v.y-(67.2*0.5+14.4*Math.sqrt(3)/2))<1e-8);
 assert.ok(Math.abs(v.z-(67.2*Math.sqrt(3)/2-14.4*.5))<1e-8);
 a.aimPitch=0;a.aimYaw=Math.PI/2;
 const yawed=splatBombAxisVelocity(a,67.2,14.4,vec());
 assert.ok(Math.abs(yawed.x-67.2)<1e-8);
 assert.ok(Math.abs(yawed.z)<1e-8);
});
test('#281 preserves established horizontal velocity carry without contaminating Y',()=>{
 const a=actor();a.vel={x:5,y:12,z:-5};
 const v=splatBombAxisVelocity(a,67.2,14.4,vec());
 assert.equal(v.x,2);assert.equal(v.z,65.2);assert.equal(v.y,14.4);
});
