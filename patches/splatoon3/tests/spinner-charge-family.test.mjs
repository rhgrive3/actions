// This verifies the labelled INKWAVE charge-brake model and production routing.
// Neither this trace nor the extracted .9/.05 values prove Nintendo's curve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const records = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'splatling');
const source=JSON.parse(fs.readFileSync(new URL('../reference/spinner-kinematics-1130.json',import.meta.url),'utf8'));
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);
const speed=a=>Math.hypot(a.vel.x,a.vel.z);
const options={fullRuntime:true,productionComposition:true,realProjectiles:true};

async function trace(hz,input=1) {
  const f=await fixture(options), clock=new FixedClock();
  const actors=records.map(r=>{const a=f.make(r.id);a.form='kid';a.intent.move.set(0,0,input);return a;});
  for(let i=0;i<60;i++) for(const a of actors) f.tick(a);
  const rows=actors.map(a=>({id:a.weaponId,run:speed(a),samples:[]}));
  for(const a of actors) a.intent.fire=true;
  while(clock.ticks<36) clock.advance(1/hz,dt=>{
    f.G.time+=dt;
    actors.forEach((a,i)=>{a.update(dt);rows[i].samples.push({speed:speed(a),charging:a.weaponRunner.charging,
      target:a.weaponRunner.moveSpeed()*input,modeled:!!a.weaponRunner.s3SplatlingChargeDecel});});
  });
  return rows;
}

test('all six production owners use their charge target with a single ground slowdown',async()=>{
  for(const input of [1,.15]) {
    for(const row of await trace(60,input)) {
      const r=records.find(r=>r.id===row.id), raw=source.records.find(s=>s.sourceActor===r.sourceActor).parameters.WeaponParam;
      const first=row.samples.findIndex(s=>s.charging);
      assert.ok(first>=0,row.id+' admits charge');
      close(row.samples[first].speed,row.run,row.id+' admission tick preserves Actor/Runner order');
      let expected=row.run,active=0;
      for(const s of row.samples.slice(first+1)) {
        assert.equal(s.charging,true);
        close(s.target,raw.MoveSpeed_Charge*60*input,row.id+' per-main source target');
        expected=Math.max(s.target,expected*.95);
        close(s.speed,expected,row.id+' single model decay');
        if(s.modeled)active++;
      }
      assert.ok(active>0,row.id+' actually reaches the charge slowdown hook');
      close(row.samples.at(-1).speed,raw.MoveSpeed_Charge*60*input,row.id+' settles');
    }
  }
});

test('all Spinner slowdown traces match at 30/60/120 Hz render cadence',async()=>{
  const traces=[];
  for(const hz of [30,60,120]) traces.push((await trace(hz)).map(r=>({id:r.id,samples:r.samples.map(s=>+s.speed.toFixed(9))})));
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('neutral, air, enemy ink and canceled charge keep the generic movement path',async()=>{
  const enabled=await fixture(options);
  const control=await fixture({...options,adaptRuntime:(name,text)=>name==='patches/splatoon3/runtime/splatling.mjs'
    ?text.replace('const chargeDownRate = splatlingChargeDownRate(profile, this.weapon);','const chargeDownRate = 0;'):text});
  for(const r of records) for(const mode of ['neutral','air','enemy','canceled','streaming']) {
    const pair=[enabled,control].map(f=>{
      const a=f.make(r.id);a.form='kid';a.kidT=2;a.vel.set(0,0,6);a.intent.move.set(0,0,mode==='neutral'?0:1);
      a.weaponRunner.charging=!['canceled','streaming'].includes(mode);
      a.weaponRunner.streaming=mode==='streaming';a.grounded=mode!=='air';
      return a;
    });
    for(const a of pair) a._horizontal(1/60,false,mode==='enemy');
    for(const axis of ['x','y','z']) close(pair[0].vel[axis],pair[1].vel[axis],r.id+' '+mode+' '+axis);
    assert.equal(pair[0].weaponRunner.s3SplatlingChargeDecel,undefined,r.id+' inactive trace is clear');
  }
});

test('charge slowdown does not gain speed and completes 90/180-degree direction changes',async()=>{
  const f=await fixture(options);
  for(const r of records) for(const [x,z] of [[1,0],[0,-1]]) {
    const a=f.make(r.id);a.form='kid';a.kidT=2;a.vel.set(0,0,6);a.intent.move.set(x,0,z);a.weaponRunner.charging=true;
    const before=speed(a),target=a.weaponRunner.moveSpeed();
    a._horizontal(1/60,false,false);
    assert.ok(speed(a)<=before+1e-9,r.id+' does not gain speed on the turn');
    assert.ok(Number.isFinite(a.vel.x)&&Number.isFinite(a.vel.z));
    for(let i=0;i<120;i++)a._horizontal(1/60,false,false);
    close(a.vel.x,target*x,r.id+' eventual turn x');close(a.vel.z,target*z,r.id+' eventual turn z');
  }
});
