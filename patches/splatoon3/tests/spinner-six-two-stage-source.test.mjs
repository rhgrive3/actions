import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { fixture } from './source-fixture.mjs';

// Source 11.3.0 GameParameterTable: "two-stage charging" and "recharge
// while streaming" are different mechanics. Never enable midstream recharge
// for a Spinner whose source does not declare EnableRecharge.
const SOURCE = Object.freeze({
  WeaponSpinnerQuick:      {first:18, second:27, recharge:false},
  WeaponSpinnerStandard:   {first:48, second:72, recharge:false},
  WeaponSpinnerHyper:      {first:120,second:150,recharge:false},
  WeaponSpinnerDownpour:   {first:1,  second:100,recharge:true},
  WeaponSpinnerSerein:     {first:38, second:76, recharge:true},
  WeaponSpinnerHyperShort: {first:60, second:120,recharge:false},
});
const mains=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling');

test('all six S3 11.3.0 Spinners have distinct 1st/2nd source charge stages',()=>{
  assert.equal(mains.length,6);
  for(const r of mains){
    const expected=SOURCE[r.sourceActor],p=r.parameters.WeaponParam;
    assert.ok(expected,r.sourceActor);
    assert.equal(p.ChargeFrame_First,expected.first,r.id+' first stage');
    assert.equal(p.ChargeFrame_Second,expected.second,r.id+' second stage');
    assert.ok(p.ChargeFrame_Second>p.ChargeFrame_First,r.id+' first stage must not be mistaken for full charge');
    assert.equal(p.EnableRecharge===true,expected.recharge,r.id+' mid-stream recharge is independent from two stages');
  }
});

test('all six installed actual Spinner runners pass both charges before the first release',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const r of mains){
    const a=f.make(r.id),p=r.parameters.WeaponParam;
    a.form='kid';a.ink=100;a.intent.fire=true;
    const target=p.ChargeFrame_First/p.ChargeFrame_Second;
    let first=null,second=null,last=0;
    for(let tick=1;tick<=p.ChargeFrame_Second+10;tick++){
      f.tick(a);
      const q=a.weaponRunner.charge;
      assert.ok(Number.isFinite(q)&&q>=last-1e-7&&q<=1+1e-7,
        r.id+' continuous charge should never reset/overshoot between stages at tick '+tick);
      last=q;
      if(first===null&&q+1e-6>=target)first=tick;
      if(second===null&&q+1e-6>=1)second=tick;
    }
    assert.ok(first!==null&&first>=p.ChargeFrame_First&&first<=p.ChargeFrame_First+10,
      r.id+' first source stage '+p.ChargeFrame_First+'F, actual '+first);
    assert.ok(second!==null&&second>=p.ChargeFrame_Second&&second<=p.ChargeFrame_Second+10,
      r.id+' second source stage '+p.ChargeFrame_Second+'F, actual '+second);
    assert.ok(second>first,r.id+' must not turn first into the full/only stage');
    assert.equal(a.weaponRunner.charge,1,r.id+' full charge after both stages');
    assert.equal(a.weaponRunner.streaming,false,'ZR hold must not emit the stream yet');
    a.intent.fire=false;f.tick(a);
    assert.equal(a.weaponRunner.streaming,true,r.id+' release after full charge emits stream');
  }
});

test('midstream recharge occurs only for the two source-enabled Spinners',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const r of mains){
    const a=f.make(r.id),p=r.parameters.WeaponParam;
    a.form='kid';a.ink=100;a.intent.fire=true;
    f.tick(a,p.ChargeFrame_Second+9);
    assert.equal(a.weaponRunner.charge,1,r.id+' full before release');
    a.intent.fire=false;f.tick(a);
    assert.equal(a.weaponRunner.streaming,true,r.id+' stream begins at release');
    a.intent.fire=true;f.tick(a);
    if(p.EnableRecharge===true){
      assert.equal(a.weaponRunner.streaming,false,r.id+' may recycle remaining bullets into charging');
      assert.equal(a.weaponRunner.charging,true,r.id+' is recharging midstream');
    }else{
      assert.equal(a.weaponRunner.streaming,true,r.id+' must keep firing instead of fictional recharge');
    }
  }
});
