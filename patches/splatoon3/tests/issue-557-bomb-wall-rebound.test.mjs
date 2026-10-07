// Issue #557 — standard Splat Bomb vertical-wall rebound consumes
// HitVerticalWallReboundMaxRate=0.7 as a cap, not the legacy 0.21 normal-speed
// retention and not a constant 0.7 multiplier for every incidence angle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUB_SPECIAL_FIDELITY, applySplatBombSurfaceResponse } from '../runtime/sub-special-fidelity.mjs';

class V3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
}
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const wall={x:1,y:0,z:0};
function collide(x,y,z){
  const b={vel:new V3(x,y,z)};const before=b.vel.length();
  applySplatBombSurfaceResponse(b,wall);
  return {b,before,normal:b.vel.x,after:b.vel.length()};
}

test('#557 runtime retains the pinned vertical-wall rebound maximum 0.7',()=>{
  assert.equal(SUB_SPECIAL_FIDELITY.bomb.hitVerticalWallReboundMaxRate,0.7);
});

test('#557 perpendicular 60Hz wall contact rebounds at the 0.7 cap instead of legacy 0.21',()=>{
  const r=collide(-10,0,0);
  close(r.normal,7);close(r.after,7);
  assert.notEqual(r.normal,2.1);
});

test('#557 first oblique 60Hz wall contact uses its smaller incoming normal component, not a constant 0.7 multiplier',()=>{
  const r=collide(-5,0,12);
  close(r.normal,5);close(r.b.vel.z,7.2);
  close(r.normal/r.before,5/13);
  assert.ok(r.after<r.before,'collision cannot add speed');
});

test('#557 steeper oblique 60Hz wall contact caps normal rebound at 70% of incoming total speed',()=>{
  const r=collide(-12,0,5);
  close(r.normal,13*0.7);close(r.b.vel.z,3);
  close(r.normal/r.before,0.7);
  assert.ok(r.after<r.before,'collision cannot add speed');
});

test('#557 ground/slope branch remains independent of vertical-wall rebound',()=>{
  const b={vel:new V3(4,-10,0),spin:{multiplyScalar(){return this;}}};
  applySplatBombSurfaceResponse(b,{x:0,y:1,z:0});
  close(b.vel.x,4*0.81);close(b.vel.y,10*0.35*0.45);
});

test('#557 ceiling retains the non-wall compatibility law',()=>{
  const r={vel:new V3(0,10,0)};
  applySplatBombSurfaceResponse(r,{x:0,y:-1,z:0});
  close(r.vel.y,-2.1);
});
