// Issue #371 — Splat Bomb ground translation/rotation damping must consume the
// S3 horizontal/50-degree MoveParam endpoints rather than the old y>0.6 split.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { SUB_SPECIAL_FIDELITY, splatBombGroundResistance, applySplatBombSurfaceResponse } from '../runtime/sub-special-fidelity.mjs';

class V3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
}
class V2 { constructor(x=0,y=0){this.x=x;this.y=y;} multiplyScalar(s){this.x*=s;this.y*=s;return this;} }
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const normal=deg=>({x:0,y:Math.cos(deg*Math.PI/180),z:Math.sin(deg*Math.PI/180)});

test('#371 pinned Splat Bomb ground resistance fields preserve S3 0°/50° translation and rotation endpoints',()=>{
  const b=SUB_SPECIAL_FIDELITY.bomb;
  assert.deepEqual([
    b.groundPositionHorizonAirResist,b.groundPositionDeg50AirResist,
    b.groundRotateHorizonAirResist,b.groundRotateDeg50AirResist,b.groundReferenceDeg,
  ],[0.19,0.28,0.35,0.5,50]);
  close(splatBombGroundResistance(1,false),0.19);
  close(splatBombGroundResistance(Math.cos(50*Math.PI/180),false),0.28);
  close(splatBombGroundResistance(1,true),0.35);
  close(splatBombGroundResistance(Math.cos(50*Math.PI/180),true),0.5);
});

test('#371 slope interpolation is continuous around the old 0.6 normal-y threshold and clamps after 50°',()=>{
  const r52=splatBombGroundResistance(Math.cos(52*Math.PI/180),false);
  const r53=splatBombGroundResistance(Math.cos(53*Math.PI/180),false);
  const r54=splatBombGroundResistance(Math.cos(54*Math.PI/180),false);
  close(r52,0.28);close(r53,0.28);close(r54,0.28);
  const r20=splatBombGroundResistance(Math.cos(20*Math.PI/180),false);
  const r21=splatBombGroundResistance(Math.cos(21*Math.PI/180),false);
  assert.ok(r20<r21 && Math.abs(r21-r20)<0.01,'ordinary slopes interpolate smoothly');
});

test('#371 equal tangential speed retains 0.81 on flat ground and 0.72 at 50°, with independent spin damping',()=>{
  for(const [deg,posRet,rotRet] of [[0,0.81,0.65],[50,0.72,0.5]]){
    const n=normal(deg), tangent={x:1,y:-n.z/n.y,z:1};
    const dot=tangent.x*n.x+tangent.y*n.y+tangent.z*n.z;
    tangent.y-=dot*n.y;tangent.z-=dot*n.z;
    const before=Math.hypot(tangent.x,tangent.y,tangent.z);
    const b={vel:new V3(tangent.x,tangent.y,tangent.z),spin:new V2(4,-2)};
    applySplatBombSurfaceResponse(b,n);
    close(b.vel.length(),before*posRet);
    close(b.spin.x,4*rotRet);close(b.spin.y,-2*rotRet);
  }
});

test('#371 ground normal rebound stays on the pre-existing normal coefficient while only tangential drag changes',()=>{
  const b={vel:new V3(4,-10,0),spin:new V2(1,0)};
  applySplatBombSurfaceResponse(b,{x:0,y:1,z:0});
  close(b.vel.x,4*0.81);
  close(b.vel.y,10*0.35*0.45);
});

test('#371 transformed weapons source routes collision through the shared sourced surface response',()=>{
  const root=new URL('../../../',import.meta.url);
  const src=fs.readFileSync(new URL('inkwave-public/src/game/weapons.js',root),'utf8');
  const out=adaptSource('src/game/weapons.js',src);
  assert.match(out,/applySplatBombSurfaceResponse\(b, hit\.normal, undefined, dt\);/);
  assert.match(out,/runtime\/sub-special-fidelity\.mjs/);
  assert.doesNotMatch(out,/b\.vel\.multiplyScalar\(hit\.normal\.y > 0\.6 \? 0\.45 : 0\.6\)/);
});
