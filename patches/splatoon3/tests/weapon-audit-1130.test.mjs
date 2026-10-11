// Raw receipts, independent source endpoints, actual six-adapter production
// modules, real terrain/paint. Gamma checks validate a named hypothesis only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ShooterAccuracy } from '../runtime/shooter-accuracy.mjs';
import { biasQuantile, accuracyEnvelope, withShotBias } from '../runtime/weapon-accuracy.mjs';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const ROOT=new URL('../reference/weapon-audit-1130/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',ROOT)));
const raw=id=>JSON.parse(fs.readFileSync(new URL(manifest.files[id].file,ROOT))).GameParameters;
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('seven independent raw receipts retain their archive byte hashes and exact non-Coop paths',()=>{
  assert.equal(manifest.version,'11.3.0');assert.equal(Object.keys(manifest.files).length,7);
  for(const [id,r] of Object.entries(manifest.files)){
    assert(!r.file.includes('_Coop'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(r.file,ROOT))).digest('hex'),r.sha256,id);
    assert(Object.keys(raw(id)).length>0,id+' has a game parameter table');
  }
  // Literal extracted boundaries, not copied from the runtime profile.
  const d=raw('dualies').WeaponParam,s=raw('splatling').WeaponParam;
  assert.equal(d.RepeatFrame,5);assert.equal(d.Stand_DegBiasMin,.01);assert.equal(d.Stand_DegBiasKf,.01);assert.equal(d.Stand_DegBiasDecrease,.005);
  assert.equal(d.Jump_DegBiasMax,.4);assert.equal(d.LapOver_DegSwerve,0);
  assert.equal(s.Stand_DegBiasMax,.3);assert.equal(s.PitchDegBias,.4);
  assert.equal(s.Stand_DegSwerve,3.3);assert.equal(s.Jump_DegSwerve,7);assert.equal(s.PitchDegSwerve,1.6);
  assert.equal(s.ChargeFrame_First,48);assert.equal(s.ChargeFrame_Second,72);
  assert.equal(raw('charger').WeaponParam.MoveSpeedFullCharge,.02);
});
test('Dualies use their own .005/frame recovery after 5F; idle partitioning is invariant',()=>{
  const p=raw('dualies').WeaponParam;
  for(const hz of [30,60,120]){
    const a=new ShooterAccuracy(p);
    for(let n=0;n<30;n++)a.shot(true,null);
    close(a.stand,.25);a.advance(5/60);close(a.stand,.25);
    for(let i=0;i<hz/2;i++)a.advance(1/hz);
    close(a.stand,.10); // 30 elapsed recovery frames *.005
    a.advance(100);close(a.stand,.01);
  }
  assert.throws(()=>new ShooterAccuracy(p,0),RangeError);
});
test('gamma hypothesis has the declared median, support, and no Bernoulli point mass',()=>{
  for(const b of [.01,.25,.3,.4,.5]){
    close(biasQuantile(.5,b),b);assert.equal(biasQuantile(0,b),0);assert.equal(biasQuantile(1,b),1);
    let previous=-1,below=0;const count=100000;
    for(let i=0;i<count;i++){const x=biasQuantile((i+.5)/count,b);assert(x>0&&x<1&&x>previous);previous=x;if(x<b)below++;}
    assert.equal(below,50000);
  }
  assert.equal(biasQuantile(.8,0),0);
});
test('temporary launch state cleans up after throwing and nested calls',()=>{
  const actor={weaponRunner:{s3ShotBias:undefined}};
  assert.throws(()=>withShotBias(actor,.3,.4,()=>{
    assert.deepEqual(actor.weaponRunner.s3ShotBias,{horizontal:.3,pitch:.4});
    withShotBias(actor,.1,.2,()=>assert.deepEqual(actor.weaponRunner.s3ShotBias,{horizontal:.1,pitch:.2}));
    assert.equal(actor.weaponRunner.s3ShotBias.horizontal,.3);throw Error('launch failed');
  }),/launch failed/);
  assert.equal(actor.weaponRunner.s3ShotBias,undefined);
});
test('jump endpoints are independent of generic bloom and retain the 25/70F calibration gates',()=>{
  const w={spreadGround:2,spreadAir:7.5},p=raw('dualies').WeaponParam;
  close(accuracyEnvelope(w,true,null,p),2);close(accuracyEnvelope(w,false,null,p),7.5);
  close(accuracyEnvelope(w,true,25/60,p),7.5);close(accuracyEnvelope(w,true,70/60,p),2);
  let last=7.5;for(let i=26;i<=70;i++){const x=accuracyEnvelope(w,true,i/60,p);assert(x<=last);last=x;}
});
test('native Actor slide travels 4 WU during 12F roll plus 1 WU during 4F post-roll glide, at all render cadences',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await fixture({fidelity:true}),a=f.make('dualies'),clock=new FixedClock(),trace=[];
    f.G.actors=[a];a.intent.fire=true;a.intent.move.set(0,0,1);a.intent.jump=true;
    for(let i=0;i<hz*.4;i++)clock.advance(1/hz,dt=>{
      f.G.time+=dt;a.update(dt);a.intent.jump=false;
      trace.push([a.pos.x,a.pos.z,a.ink,a.weaponRunner.dodge?.t??-1]);
    });
    assert.equal(trace.length,24);
    for(let i=0;i<4;i++)close(trace[i][1],0);
    close(trace[15][1],4);close(trace[15][2],93); // 4WU moving roll, 7% ink, no shot before20F
    close(trace[19][1],5);close(trace[23][1],5);assert.equal(a.weaponRunner.dodge,null);assert.equal(a.weaponRunner.s3DualiesGlide,null);traces.push(trace);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('actual aerial input admits a slide, spends once, consumes jump, and respects real wall collision',async()=>{
  const f=await fixture({fidelity:true}),a=f.make('dualies',{y:10});f.G.actors=[a];
  a.grounded=false;a.coyote=0;a.intent.fire=true;a.intent.jump=true;a.intent.move.set(0,0,1);
  for(let i=0;i<16;i++){f.G.time+=1/60;a.update(1/60);a.intent.jump=false;}
  close(a.pos.z,4);close(a.ink,93);assert.equal(a.weaponRunner.rollsLeft,1);assert.equal(a.jumpBuffer,0);
  const rollEndY=a.pos.y;for(let i=0;i<4;i++){f.G.time+=1/60;a.update(1/60);}
  close(a.pos.z,5);assert(a.pos.y<rollEndY);close(a.ink,92.28); // first post-roll shot at 20F
  assert(a.pos.y<10 && !a.grounded); // exact S3 drop speed is a calibrated candidate
  assert(a.vel.y < -8, 'aerial dodge begins a steeper descent than ordinary freefall');
  const g=await fixture({fidelity:true});g.wall(2,{height:20});const b=g.make('dualies',{y:10});g.G.actors=[b];
  b.grounded=false;b.coyote=0;b.intent.fire=true;b.intent.jump=true;b.intent.move.set(0,0,1);
  for(let i=0;i<16;i++){g.G.time+=1/60;b.update(1/60);b.intent.jump=false;}
  assert(b.pos.z<2,'native swept collision must stop before the wall');close(b.ink,93);
});
test('aerial insufficient-ink admission cannot consume a roll or create an extra jump',async()=>{
  const f=await fixture({fidelity:true}),a=f.make('dualies',{y:10});f.G.actors=[a];
  a.grounded=false;a.coyote=0;a.ink=0;a.intent.fire=true;a.intent.jump=true;a.intent.move.set(0,0,1);
  a.update(1/60);assert.equal(a.weaponRunner.dodge,null);assert.equal(a.weaponRunner.rollsLeft,2);assert(a.vel.y<=0);assert(a.ink>=0);
});
