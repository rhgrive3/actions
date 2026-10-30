import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

const f=await sourceLoadedActorFixture({random:()=>.5});
after(()=>f.reset());
async function rider(api,hz){
  api.reset();api.G.time=0;const a=await api.make();
  for(let i=0;i<hz;i++)api.tick(a,1/hz);
  a.weapon={...a.weapon,special:'crabTank'};a.special=a.specialCost();a._startSpecial();
  for(let i=0;i<hz/2;i++)api.tick(a,1/hz);
  return a;
}
function measure(api,a){
  const ch=a.character,T=api.THREE;ch.root.updateMatrixWorld(true);
  const forward=new T.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw));
  const at=name=>ch.bones[name].getWorldPosition(new T.Vector3());
  const hip=at('hips'),chest=at('chest'),head=at('head');
  const result={torsoAhead:chest.clone().sub(hip).dot(forward),headAhead:head.clone().sub(hip).dot(forward),legs:[],grips:[]};
  for(const side of ['L','R']){
    const thigh=at('thigh'+side),knee=at('shin'+side),ankle=at('foot'+side);
    result.legs.push({side,kneeAhead:knee.clone().sub(thigh).dot(forward),ankleBelowHip:thigh.y-ankle.y,
      ankleBelowKnee:knee.y-ankle.y,
      bend:knee.clone().sub(thigh).normalize().angleTo(ankle.clone().sub(knee).normalize())});
  }
  for(const d of ch.s3SpecialDevices())for(const side of ['L','R']){
    const target=d.model.root.localToWorld(new T.Vector3(...d.spec.hands[side]));
    const hole=ch.bones['hand'+side].localToWorld(new T.Vector3(side==='R'?.0255:-.0255,-.0525,0));
    result.grips.push(hole.distanceTo(target));
  }
  return result;
}
function forwardSeated(m){
  assert.ok(m.torsoAhead>.06,'chest must move toward the controls in actor-forward space: '+JSON.stringify(m));
  assert.ok(m.headAhead>.12,'head must stay ahead of the pelvis');
  for(const leg of m.legs){
    assert.ok(leg.kneeAhead>.08,'knee must be ahead of the anatomical hip: '+JSON.stringify(leg));
    assert.ok(leg.ankleBelowHip>.20,'ankle must be below the anatomical hip');
    assert.ok(leg.ankleBelowKnee>.07,'lower leg must descend from the knee');
    assert.ok(leg.bend>.6&&leg.bend<2.6,'native knee must remain bent within a seated range');
  }
  for(const error of m.grips)assert.ok(error<1e-5,'hands remain on actual device grips');
}

for(const hz of [30,60,120])test(`Crab has forward hips/knees and descending calves while riding at ${hz}Hz`,async()=>{
  const a=await rider(f,hz);let m=measure(f,a);forwardSeated(m);console.log(JSON.stringify({hz,pose:m}));
  const src=a.character.sourceMotion;a.intent.move.set(.6,0,.8);a.aimYaw=.7;
  for(let i=0;i<hz/2;i++){f.tick(a,1/hz);forwardSeated(measure(f,a));}
  assert.equal(src.active,true,'source controller ownership is restored');
  const numeric=m=>[m.torsoAhead,m.headAhead,...m.legs.flatMap(l=>[l.kneeAhead,l.ankleBelowHip,l.ankleBelowKnee,l.bend])];
  const before=numeric(measure(f,a));f.tick(a,0);const paused=numeric(measure(f,a));
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(before[i]-paused[i])<1e-9,'pause does not alter the rider pose');
});

test('the previous high rear-ankle calibration fails actual signed joint checks',async()=>{
  let replaced=false;
  const old=await sourceLoadedActorFixture({random:()=>.5,moduleTransform:(path,source)=>{
    if(path!=='patches/splatoon3/runtime/special-motion.mjs')return source;
    const out=source.replace(/crabTank: Object\.freeze\(\{ hips: \[[^\n]+\}\),/,
      'crabTank: Object.freeze({ hips: [0, .96, -.10], foot: [.297, 1.02, -.356], torso: [.08, .24, .08] }),');
    replaced=out!==source;return out;
  }});
  try{
    assert.ok(replaced);const a=await rider(old,60),m=measure(old,a);
    assert.ok(m.legs.every(leg=>leg.kneeAhead<0&&leg.ankleBelowHip<0),'old pose folds both knees rearward with ankles above hips');
    assert.throws(()=>forwardSeated(m));console.log(JSON.stringify({negativeControl:m}));
  }finally{old.reset();}
});
