// Comparison basis: Kanamoji's S3 angular-CDF research (#1/#2 and Spinner
// follow-ups), plus the pinned 11.3.0 WeaponParam fields.  The simulated
// distribution is not presented as a recovered Nintendo PRNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogAngularLaunch, catalogAngularEnvelope, advanceCatalogJumpClock } from '../runtime/main-weapon-catalog.mjs';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';
import { ShooterAccuracy } from '../runtime/shooter-accuracy.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const near = (a, b, label, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) <= tolerance, label + ': ' + a + ' != ' + b);
const deg = x => x * 180 / Math.PI;
const vec = () => ({
  x:0, y:0, z:1,
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;},
  normalize(){const d=Math.hypot(this.x,this.y,this.z);if(d){this.x/=d;this.y/=d;this.z/=d;}return this;}
});
function withDraws(draws, fn) {
  const previous=Math.random;
  let index=0;
  Math.random=()=>{if(index>=draws.length)throw Error('unexpected gameplay RNG draw');return draws[index++];};
  try{const result=fn();assert.equal(index,draws.length,'launch uses sourced draw count');return result;}
  finally{Math.random=previous;}
}
const actor = grounded => ({grounded,weaponRunner:{s3JumpSpreadAge:null,s3ShotBias:undefined}});

test('catalog Shooters use the article angular quantile, never a two-cone Bernoulli split',()=>{
  const a=actor(true), accuracy=new ShooterAccuracy(), system={_spread(){throw Error('legacy 2D cone used');}};
  for(const [i,u] of [0,.25,.5,.75,1-1e-12].entries()){
    const expectedMedian=Math.min(.25,.01+.01*i), direction=vec();
    withDraws([u,.75],()=>catalogAngularLaunch(system,direction,a,'shooter',
      {Stand_DegSwerve:4.86},accuracy,4.86));
    near(deg(Math.atan2(direction.x,direction.z)),4.86*biasQuantile(u,expectedMedian),'horizontal shot '+i,1e-8);
    near(direction.y,0,'no artificial Shooter pitch spread');
    assert.equal(a.weaponRunner.s3ShotBias,undefined,'shot bias context restored');
  }
  near(accuracy.stand,.06,'one bias increment per emitted shot');
});

test('catalog Splatlings sample independent sourced yaw and pitch without first-shot buildup',()=>{
  const a=actor(true), p={Stand_DegBiasMax:.3,Jump_DegBiasMax:.3,
    PitchDegBias:.4,PitchDegSwerve:1.6},system={_spread(){throw Error('legacy cone');}};
  const accuracy={shot(){throw Error('Splatlings do not build up Shooter first-shot bias');}};
  for(const u of [.25,.5,.75]){
    const dir=vec();
    withDraws([u,.75],()=>catalogAngularLaunch(system,dir,a,'splatling',p,accuracy,3.3));
    near(deg(Math.atan2(dir.x,dir.z)),3.3*(2*u===1?0:Math.sign(2*u-1)*biasQuantile(Math.abs(2*u-1),.3)),'independent yaw');
    near(deg(Math.atan2(dir.y,Math.hypot(dir.x,dir.z))),1.6*.4,'independent pitch');
    assert.equal(a.weaponRunner.s3ShotBias,undefined);
  }
});

test('catalog Splatlings use the airborne sourced median and maximum, not standing first-shot bias',()=>{
  const a=actor(false),d=vec(),p={Stand_DegBiasMax:.1,Jump_DegBiasMax:.4,PitchDegBias:.4,PitchDegSwerve:1.6};
  withDraws([.75,.5],()=>catalogAngularLaunch({_spread(){throw Error('legacy cone');}},d,a,'splatling',p,null,7));
  near(deg(Math.atan2(d.x,d.z)),7*.4,'7 degree maximum times sourced 0.4 median');
  near(d.y,0,'centered pitch sample');
});

test('catalog explicit maximum overrides the Shooter-only community 0.25 default',()=>{
  const a=new ShooterAccuracy({Stand_DegBiasMin:.04,Stand_DegBiasMax:.12,Stand_DegBiasKf:.03});
  for(let i=0;i<12;i++)a.shot(true,null);
  near(a.stand,.12,'weapon-specific cap is authoritative');
  near(a.shot(true,null),.12,'later shots keep the sourced cap');
  const defaults=new ShooterAccuracy();
  for(let i=0;i<30;i++)defaults.shot(true,null);
  near(defaults.stand,.25,'sparse 11.3 Shooter still uses documented .25 fallback');
});

test('11.3.0 added Shooters and Dualies honor every explicitly extracted median cap',()=>{
  const caps=[
    ['Shooter_Short_00',.4],
    ['Shooter_First_00',.4],
    ['Shooter_Blaze_00',.5],
    ['Shooter_Heavy_00',.3],
    ['Shooter_QuickLong_00',.25],
    ['Maneuver_Short_00',.4],
    ['Maneuver_Dual_00',.3],
    ['Maneuver_Long_00',.3]
  ];
  for(const [source,expected] of caps){
    const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceRow===source);
    assert.ok(r&&!r.legacy,'added canonical record: '+source);
    const param=r.parameters.WeaponParam;
    assert.equal(param.Stand_DegBiasMax,expected,'pinned source: '+source);
    const accuracy=new ShooterAccuracy(param);
    for(let j=0;j<120;j++)accuracy.shot(true,null);
    near(accuracy.stand,expected,'sourced main weapon bias cap: '+source);
  }
});

test('catalog actual jumps use pinned 25F hold and 70F landing recovery, ledge falls do not',()=>{
  const a=actor(true),s={accuracy:new ShooterAccuracy(),jumpAge:null,jumpSerial:0};
  a.s3JumpSerial=0;a.grounded=false;
  assert.equal(advanceCatalogJumpClock(s,a,'shooter',1/60),null,'falling off ledge never starts jump clock');
  a.s3JumpSerial=1;
  assert.equal(advanceCatalogJumpClock(s,a,'shooter',1/60),0,'admitted jump starts at 0F');
  for(let i=0;i<25;i++)advanceCatalogJumpClock(s,a,'shooter',1/60);
  near(s.jumpAge*60,25,'source start boundary 25F');
  near(s.accuracy.chance(false,s.jumpAge),.4,'jump median held through 25F');
  a.grounded=true;
  for(let i=0;i<22;i++)advanceCatalogJumpClock(s,a,'shooter',1/60);
  const mid=s.accuracy.chance(true,s.jumpAge);
  assert.ok(mid>.01&&mid<.4,'landing during recovery must not abruptly snap to ground bias');
  for(let i=0;i<23;i++)advanceCatalogJumpClock(s,a,'shooter',1/60);
  assert.equal(s.jumpAge,null,'on-ground clock clears after sourced 70F');
  near(s.accuracy.chance(true,s.jumpAge),.01,'grounded endpoint');
});

test('catalog Dualies end the airborne jump window without entering a false zero-bias mode',()=>{
  const a=actor(false),s={accuracy:new ShooterAccuracy(),jumpSerial:0,jumpAge:null};
  a.s3JumpSerial=1;
  advanceCatalogJumpClock(s,a,'dualies',1/60);
  for(let i=0;i<70;i++)advanceCatalogJumpClock(s,a,'dualies',1/60);
  assert.equal(s.jumpAge,null,'70F is the end even before landing');
  near(s.accuracy.chance(false,s.jumpAge),.4,'normal airborne median restored');
});

test('catalog Shooter maximum angle continuously recovers across landing, never snaps at touch-down',()=>{
  const source={Jump_DegBiasDecreaseStartFrame:25,Jump_DegBiasEndFrame:70};
  for(const grounded of [false,true]){
    const f=t=>catalogAngularEnvelope('shooter',grounded,4.86,11.66,t/60,0,source);
    near(f(0),11.66,'jump 0F held');
    near(f(25),11.66,'jump 25F held');
    near(f(47.5),(11.66+4.86)/2,'47.5F maximum angle recovers halfway');
    near(f(70),4.86,'70F source ground maximum');
  }
  near(catalogAngularEnvelope('shooter',true,4.86,11.66,null),4.86,'ordinary ground');
  near(catalogAngularEnvelope('shooter',false,4.86,11.66,null),11.66,'ledge fall airborne');
});

test('catalog Dualies/Blasters retain air maximum through landing, not Shooter lerp',()=>{
  const d={Jump_DegBiasDecreaseStartFrame:25,Jump_DegBiasEndFrame:70};
  for(const [family,ground,jump] of [['dualies',2,7.5],['blaster',0,8]]){
    for(const frames of [0,25,47.5,69.99]){
      near(catalogAngularEnvelope(family,true,ground,jump,frames/60,0,d),jump,
        family+' active recovery after landing '+frames+'F');
    }
    near(catalogAngularEnvelope(family,true,ground,jump,null),ground,family+' recovered ground');
  }
  near(catalogAngularEnvelope('blaster',false,0,8,null),0,'non-jump ledge fall cannot start blaster penalty');
  near(catalogAngularEnvelope('dualies',false,2,7.5,null),7.5,'non-jump dualies stay airborne');
  near(catalogAngularEnvelope('splatling',false,3.3,7,null),7,'Spinner not changed by these owners');
  near(catalogAngularEnvelope('shooter',false,4.86,11.66,null,.5),8.26,
    'Action Strength reduces airborne maximum but not ordinary ground');
});

test('catalog unsupported shot families retain existing provisional fallback until source is verified',()=>{
  const a=actor(true),direction=vec(),accuracy={shot(){return .25;}};
  let received=null;
  withDraws([.2],()=>catalogAngularLaunch({_spread(_dir,angle){received=angle;return _dir;}},
    direction,a,'charger',{},accuracy,2));
  near(received,.9,'unchanged prior two-cone fallback for nonresearched families');
});
