// #940: S3 Heavy Splatling Stand/Jump_DegSwerve are sourced maximum
// angular bounds; DegBias is the median angular fraction applied at launch.
// The Nintendo RNG/PDF is not recovered. This guards against reintroducing
// the obsolete extra Bernoulli draw or legacy shooter bloom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installSplatling } from '../runtime/splatling.mjs';
import { signedBiasSample } from '../runtime/weapon-edgecases.mjs';

const GROUND = { kind: 'splatling', spreadGround: 3.3, spreadAir: 7, spreadFirst: .6 };
const WITH_BIAS = { weaponsFidelityCompletion: { weapons: { splatling: { WeaponParam: { Stand_DegBiasMax: .3, Jump_DegBiasMax: .3 } } } } };

function fixture(profile) {
  class WeaponRunner {
    constructor(a) { this.a=a; this.bloom=0; }
    _spreadDeg() { return 0; }
    reset() {}
    cancelPendingInput() {}
  }
  class Projectiles {
    constructor() { this.calls=[]; }
    fireSplatling(a,w,spread) { this.calls.push(spread); }
    _fireRound() { return null; }
  }
  class Actor {}
  const api={ WeaponRunner,Projectiles,Actor,G:{},PLAYER:{inkMax:100} };
  installSplatling(api,profile,{
    splatlingChargeCap:()=>0,splatlingReservation:()=>null,
    tickSplatlingInterrupt:()=>null,releaseSplatlingInterrupt:()=>{},
  });
  return { runner:new WeaponRunner({grounded:true}),proj:new Projectiles(),Projectiles };
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
function noRandom(body) {
  const original=Math.random;
  Math.random=()=>{throw Error('Splatling must not draw a separate outer/inner coin toss');};
  try{return body();}finally{Math.random=original;}
}

test('#940 ground/air source maxima are not scaled by legacy bloom or spreadFirst',()=>{
  const {runner}=fixture(WITH_BIAS);
  close(runner._spreadDeg(GROUND),3.3);
  runner.a.grounded=false;
  close(runner._spreadDeg(GROUND),7);
});

test('#940 direct Splatling launches keep the supplied cone with no Bernoulli RNG',()=>{
  const {runner,proj,Projectiles}=fixture(WITH_BIAS);
  noRandom(()=>{
    for(const value of [3.3,2.5,7]) Projectiles.prototype.fireSplatling.call(proj,runner.a,GROUND,value);
  });
  assert.deepEqual(proj.calls,[3.3,2.5,7]);
});

test('#940 standing bias 0.3 is an angular median quantile inside 3.3 degrees',()=>{
  close(3.3*signedBiasSample(.75,.3),.99);
  close(3.3*signedBiasSample(1,.3),3.3);
  close(3.3*signedBiasSample(.25,.3),-.99);
});

test('#940 jump age never adds a second spread selection',()=>{
  const {runner,proj,Projectiles}=fixture(WITH_BIAS);
  runner.a.s3SplatlingJumpAgeFrames=10;
  noRandom(()=>Projectiles.prototype.fireSplatling.call(proj,runner.a,GROUND,5.2));
  assert.deepEqual(proj.calls,[5.2]);
});

test('#940 sparse source without Stand_DegBiasMax still emits the full supplied angle',()=>{
  const {runner,proj,Projectiles}=fixture({});
  noRandom(()=>Projectiles.prototype.fireSplatling.call(proj,runner.a,GROUND,runner._spreadDeg(GROUND)));
  assert.deepEqual(proj.calls,[3.3]);
});
