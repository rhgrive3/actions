// Comparison basis: Kanamoji's S3 angular-CDF research (#1/#2 and Spinner
// follow-ups), plus the pinned 11.3.0 WeaponParam fields.  The simulated
// distribution is not presented as a recovered Nintendo PRNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';
import { ShooterAccuracy } from '../runtime/shooter-accuracy.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { fixture } from './source-fixture.mjs';

// Load the runtime through the existing VM fixture, which resolves vendored Three.
// Delegate RNG dynamically so the original withDraws controls stay authoritative.
const { catalogAngularLaunch, catalogAngularEnvelope, catalogSpinnerLaunchSpeed, advanceCatalogJumpClock } =
  await fixture({ productionComposition:true, vmMathRandom:()=>Math.random(),
    extraExports:"export { catalogAngularLaunch, catalogAngularEnvelope, catalogSpinnerLaunchSpeed, advanceCatalogJumpClock } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" });

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

test('all six 11.3.0 source Spinners pin asymmetric speed bias and rate, including Ballpoint long mode',()=>{
  const entries=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling');
  assert.equal(entries.length,6);
  for(const r of entries){
    const m=r.parameters.MoveParam;
    assert.ok(Number.isFinite(m.SpawnSpeedRandomRate)&&m.SpawnSpeedRandomRate>0,r.names.en+' source rate');
    assert.equal(m.SpawnSpeedRandomBias,.2,r.names.en+' source median');
    for(const [u,signed] of [[0,-1],[.5,0],[1,1]]){
      const actual=catalogSpinnerLaunchSpeed(100,m,()=>u);
      near(actual,100*(1+m.SpawnSpeedRandomRate*signed),r.names.en+' speed quantile u='+u);
    }
  }
  const ballpoint=entries.find(r=>r.sourceRow==='Spinner_Downpour_00');
  assert.equal(ballpoint.parameters.MoveParam.SpawnSpeedRandomRate,.12);
  assert.equal(ballpoint.parameters.VariableMoveParam.SpawnSpeedRandomRate,.03);
  near(catalogSpinnerLaunchSpeed(100,ballpoint.parameters.VariableMoveParam,()=>1),103,
    'Ballpoint long mode pinned +-3% not short-mode +-12%');
});

test('native added Mini Splatling projectile stores the source-randomized emitted velocity',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const r=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceRow==='Spinner_Quick_00');
  try{
    for(const u of [0,.5,1-1e-12]){
      f.G.projectiles.clear();f.G.actors.length=0;
      f.setRandom(()=>u);
      const a=f.make(r.id);a.form='kid';a.intent.fire=true;
      f.tick(a,r.parameters.WeaponParam.ChargeFrame_Second);
      a.intent.fire=false;f.tick(a,8);
      const p=f.G.projectiles.list.find(p=>p.wid===r.id);
      assert.ok(p?.catalog,'actual native projectile at quantile '+u);
      near(p.vel.length(),catalogSpinnerLaunchSpeed(p.catalog.descriptor.speed,
        p.catalog.descriptor.m,()=>u),'source speed written to emitted projectile u='+u,1e-7);
    }
  }finally{f.restoreRandom();}
});

test('five added Spinners share authoritative Heavy Splatling 25F/70F jump recovery endpoints',()=>{
  const src=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling'&&!r.legacy);
  assert.equal(src.length,5);
  for(const r of src){
    const p=r.parameters.WeaponParam;
    assert.equal(p.Jump_DegBiasDecreaseStartFrame,25,r.names.en+' hold');
    assert.equal(p.Jump_DegBiasEndFrame,70,r.names.en+' end');
    const ground=p.Stand_DegSwerve,jump=p.Jump_DegSwerve;
    for(const onGround of [true,false]){
      for(const [frame,expected] of [[0,jump],[25,jump],[47.5,(jump+ground)/2],[70,ground]]){
        near(catalogAngularEnvelope('splatling',onGround,ground,jump,frame/60,0,p),expected,
          r.names.en+' frame '+frame+' grounded='+onGround);
      }
    }
  }
  near(catalogAngularEnvelope('splatling',true,3.3,7,null),3.3,'regular ground');
  near(catalogAngularEnvelope('splatling',false,3.3,7,null),7,'regular air');
});

test('Ballpoint long mode uses source .2 vertical bias and .75-degree pitch envelope',()=>{
  const record=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceRow==='Spinner_Downpour_00');
  const p=record.parameters.VariableShotParam,actorRef=actor(true),d=vec();
  assert.equal(p.PitchDegBias,.2);
  assert.equal(p.PitchDegSwerve,.75);
  assert.equal(p.Stand_DegSwerve,1.5);
  const acc={shot(){throw Error('Spin mode must not grow shot bias');}};
  withDraws([.75,.75],()=>catalogAngularLaunch({_spread(){throw Error('old scatter');}},
    d,actorRef,'splatling',p,acc,p.Stand_DegSwerve));
  near(deg(Math.atan2(d.x,d.z)),p.Stand_DegSwerve*p.Stand_DegBiasMax,'Ballpoint long yaw median');
  near(deg(Math.atan2(d.y,Math.hypot(d.x,d.z))),.75*.2,'Ballpoint long pitch median');
});

test('11.3.0 .96 Gal shot buildup and full idle recovery match the article boundaries',()=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceRow==='Shooter_Heavy_00'),p=r.parameters.WeaponParam;
  assert.deepEqual([p.Stand_DegBiasMin,p.Stand_DegBiasMax,p.Stand_DegBiasKf,p.Stand_DegBiasDecrease,p.RepeatFrame],
    [.04,.30,.03,.02,12]);
  const a=new ShooterAccuracy(p),frame=1/60;
  near(a.shot(true,null),.04,'first Gal shot');
  for(let i=1;i<9;i++)a.shot(true,null);
  near(a.stand,.3,'ninth emitted shot reaches max');
  a.advance(12*frame);near(a.stand,.3,'12F recovery gate');
  a.advance(13*frame);near(a.stand,.04,'13F of -0.02 b recovery returns minimum');
});

test('11.3.0 Splattershot Pro settles after 24 shots and resets after 56F',()=>{
  const r=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceRow==='Shooter_Expert_00'),p=r.parameters.WeaponParam;
  assert.equal(p.Stand_DegSwerve,2.5,'post Ver9.2.0, never 2024 2.7-degree value');
  assert.deepEqual([p.Stand_DegBiasMin,p.Stand_DegBiasKf,p.Stand_DegBiasDecrease,p.RepeatFrame],
    [.01,.01,.005,8]);
  assert.equal(p.Stand_DegBiasMax,undefined,'missing Nintendo default is treated separately from source');
  const a=new ShooterAccuracy(p);
  for(let i=0;i<24;i++)a.shot(true,null);
  near(a.stand,.25,'24th admitted shot reaches 0.25 community-supported ceiling');
  a.advance(8/60);near(a.stand,.25,'8F unchanged');
  a.advance(48/60);near(a.stand,.01,'48F linear recovery after the gate');
});

test('Rapid, Rapid Pro and Clash Blaster use the extracted 40F jump recovery start',()=>{
  for(const name of ['Blaster_Light_00','Blaster_LightLong_00','Blaster_LightShort_00']){
    const p=MAIN_WEAPON_CATALOG.records.find(x=>x.sourceRow===name).parameters.WeaponParam;
    near(catalogAngularEnvelope('blaster',true,0,p.Jump_DegSwerve,39/60,0,p),
      p.Jump_DegSwerve,name+' remains full air envelope at F39');
    near(catalogAngularEnvelope('blaster',true,0,p.Jump_DegSwerve,40/60,0,p),
      p.Jump_DegSwerve,name+' full at sourced 40F');
    assert.equal(p.Jump_DegBiasDecreaseStartFrame,40,name+' canonical source');
    const accuracy=new ShooterAccuracy(p);
    near(accuracy.chance(true,40/60),p.Jump_DegBiasMax,name+' bias held through F40');
    assert.ok(accuracy.chance(true,50/60)<p.Jump_DegBiasMax,name+' median recovers');
    near(accuracy.chance(true,70/60),0,name+' final median zero');
  }
});

test('catalog unsupported shot families retain both original provisional fallback cones',()=>{
  const a=actor(true),direction=vec(),accuracy={shot(){return .25;}};
  let received=null;
  const system={_spread(_dir,angle){received=angle;return _dir;}};
  // This intentionally unchanged provisional path selects full spread for
  // U < 0.25, and 0.45-scaled spread otherwise. Both branches must be tested.
  withDraws([.2],()=>catalogAngularLaunch(system,direction,a,'charger',{},accuracy,2));
  near(received,2,'legacy full cone chosen when random draw < 0.25');
  withDraws([.8],()=>catalogAngularLaunch(system,direction,a,'charger',{},accuracy,2));
  near(received,.9,'legacy inner cone chosen when random draw >= 0.25');
});
