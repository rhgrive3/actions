import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueSubPredictionChargeKey } from '../runtime/all-subs.mjs';
import { kitSubPredictionChargeKey, CURLING } from '../runtime/kit-subs.mjs';
import { fixture } from './source-fixture.mjs';

const STEP=1/60,SUB={curling:CURLING},now={anticipateRelease:true};
function actor(id,frames,queue=0){return {weapon:{sub:id},weaponRunner:{
  s3SubHold:frames*STEP,s3SubReady:{age:50*STEP,minimum:5*STEP,pending:false,useStartup:null},
  s3FizzyCharge:{queue},
}};}
const fizzy=(a,options=now)=>catalogueSubPredictionChargeKey(a,options);
const curling=(a,options=now)=>kitSubPredictionChargeKey(SUB,a,options);

test('Fizzy signature changes on both release-now pop boundaries between 30 Hz guide refreshes',()=>{
  for(const [frames,expected] of [[38,'fizzy:1'],[39,'fizzy:2'],[40,'fizzy:2'],[118,'fizzy:2'],[119,'fizzy:3'],[120,'fizzy:3']])
    assert.equal(fizzy(actor('fizzy',frames)),expected,`${frames} held frames`);
  assert.equal(fizzy(actor('fizzy',39),{}),'fizzy:1','immediate snapshot omits future startup charge');
  assert.equal(fizzy(actor('fizzy',119),{}),'fizzy:2');
});

test('Fizzy signature observes existing queue and remaining readiness without raw-hold changes',()=>{
  const a=actor('fizzy',38);
  assert.equal(fizzy(a),'fizzy:1');
  a.weaponRunner.s3FizzyCharge.queue=2;
  assert.equal(fizzy(a),'fizzy:2','already queued shake crosses the forecast boundary');
  a.weaponRunner.s3FizzyCharge.queue=0;a.weaponRunner.s3SubHold=39*STEP;
  assert.equal(fizzy(a),'fizzy:2');
  a.weaponRunner.s3SubReady.useStartup=STEP;
  assert.equal(fizzy(a),'fizzy:1','the pending startup is already charged');
  a.weaponRunner.s3SubHold=35*STEP;a.weaponRunner.s3SubReady={age:0,minimum:10*STEP,pending:false,useStartup:null};
  assert.equal(fizzy(a),'fizzy:2','unfinished minimum readiness adds its owned held ticks');
  a.weaponRunner.s3SubReady.age=20*STEP;
  assert.equal(fizzy(a),'fizzy:1');
});

test('Curling signature follows effective charge every frame and remains stable at full charge',()=>{
  const a=actor('curling',10);
  assert.equal(curling(a),`curling:${10*STEP+STEP}`);
  assert.equal(curling(a,{}),`curling:${10*STEP}`);
  a.weaponRunner.s3SubReady.useStartup=STEP;
  assert.equal(curling(a),`curling:${10*STEP}`);
  assert.equal(curling(actor('curling',59)),'curling:1');
  assert.equal(curling(actor('curling',60)),'curling:1');
  assert.equal(curling(actor('bomb',10),{...now,id:'curling'}),`curling:${10*STEP+STEP}`,'explicit id selects Curling');
});

test('ordinary sub signatures return null without touching charge clocks',()=>{
  for(const sub of ['bomb','suction','burst','sprinkler','splashWall','autobomb','beakon','pointSensor','inkMine','toxicMist','angleShooter','torpedo']){
    const a={weapon:{sub},get weaponRunner(){throw Error('ordinary subs must not read held state');}};
    assert.equal(fizzy(a),null);assert.equal(curling(a),null);
  }
});

test('charge signatures are read-only even with frozen readiness and queued shake records',()=>{
  for(const id of ['fizzy','curling']){
    const a=actor(id,38,5),r=a.weaponRunner,before=JSON.stringify(a);
    Object.freeze(r.s3SubReady);Object.freeze(r.s3FizzyCharge);Object.freeze(r);Object.freeze(a.weapon);Object.freeze(a);
    const getter=id==='fizzy'?fizzy:curling,first=getter(a);
    for(let i=0;i<10;i++)assert.equal(getter(a),first);
    assert.equal(JSON.stringify(a),before);
  }
});

test('production composition exposes the cheap key independently of trajectory and physics',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const p=f.G.projectiles,a=f.make(),r=a.weaponRunner;
  const forbidden=()=>{throw Error('charge key must not compute a trajectory or query physics');};
  p.s3PredictSubTrajectory=forbidden;f.G.physics.segment=forbidden;f.G.physics.raycast=forbidden;
  r.s3SubReady={age:50*STEP,minimum:5*STEP,pending:false,useStartup:null};r.s3FizzyCharge={queue:0};
  a.weapon={...a.weapon,sub:'fizzy'};r.s3SubHold=38*STEP;
  assert.equal(p.s3SubPredictionChargeKey(a,now),'fizzy:1');r.s3SubHold=39*STEP;
  assert.equal(p.s3SubPredictionChargeKey(a,now),'fizzy:2');
  a.weapon={...a.weapon,sub:'curling'};r.s3SubHold=10*STEP;
  assert.equal(p.s3SubPredictionChargeKey(a,now),`curling:${10*STEP+STEP}`);
  a.weapon={...a.weapon,sub:'pointSensor'};
  assert.equal(p.s3SubPredictionChargeKey(a,now),null);
});
