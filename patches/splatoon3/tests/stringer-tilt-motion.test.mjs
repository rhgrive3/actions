import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {ALTERNATE_WEAPON_KITS} from '../runtime/alternate-weapon-kits-data.mjs';

test('local Stringer models and every kit read the emitted fan tilt without a second render clock',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {weaponFamilyPose} from './patches/splatoon3/runtime/weapon-models/registry.mjs';"});
  for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer')){
    for(const id of [r.id,...ALTERNATE_WEAPON_KITS.filter(kit=>kit.baseId===r.id).map(kit=>kit.id)]){
      const a=f.make(id);a.form='kid';a.grounded=false;a.weaponRunner.update(1/60,{fire:true,firePressed:true});
      const ch={weapon:{def:{modelId:r.id}},P:new Float64Array(3),wAim:1,
        grounded:true,_runner:()=>a.weaponRunner};
      for(const tilt of [9,27,45,81,90,78,42,0]){
        a.weaponRunner.catalogState.bowTilt=tilt;
        const before=JSON.stringify(a.weaponRunner.catalogState),expected=1-tilt/90;
        for(const dt of [1/30,1/60,1/120,0]){
          ch.P.fill(0);f.weaponFamilyPose(id)(ch,dt,{}, {ANCR:0});
          assert.ok(Math.abs(ch.P[2]-1.25*expected)<1e-12,id+' '+tilt+'° at '+dt+'s');
          assert.equal(JSON.stringify(a.weaponRunner.catalogState),before,'rendering never advances tilt, charge or ink state');
        }
      }
    }
  }
});

test('standalone/remote Stringer previews retain their bounded pose interpolation',async()=>{
  const f=await fixture({productionComposition:true,
    extraExports:"export {weaponFamilyPose} from './patches/splatoon3/runtime/weapon-models/registry.mjs';"});
  const ch={weapon:{def:{modelId:'s3-stringer-normal'}},P:new Float64Array(3),wAim:1,grounded:true};
  const pose=f.weaponFamilyPose('s3-stringer-normal');
  pose(ch,1/60,{}, {ANCR:0});const first=ch.P[2];
  assert.ok(first>0&&first<1.25,'a preview has no gameplay clock and keeps its smooth hold');
  for(let i=0;i<20;i++){ch.P.fill(0);pose(ch,1/60,{}, {ANCR:0});}
  assert.ok(ch.P[2]>first&&ch.P[2]<1.25);
});

test('all Stringer kits transmit the real fan tilt for remote posing, with legacy and malformed metadata guards',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {weaponFamilyPose} from './patches/splatoon3/runtime/weapon-models/registry.mjs';"});
  for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer'))
  for(const id of [r.id,...ALTERNATE_WEAPON_KITS.filter(kit=>kit.baseId===r.id).map(kit=>kit.id)]){
    f.G.projectiles.clear();const a=f.make(id);a.form='kid';a.nid=1;
    const full=r.parameters.spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge;
    for(let i=0;i<full;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
    a.grounded=false;a.weaponRunner.update(1/60,{fire:false});
    const p=f.G.projectiles.list[0];assert.ok(p.catalog);let packet;
    f.NetMatch.prototype.recProj.call({_rec:row=>{packet=[0,...row,0,1];return packet;},cfg:{id:'stringer-tilt'}},p);
    assert.equal(packet[27].s3Catalog.length,5,'existing catalogue payload remains readable by older peers');
    assert.equal(packet[27].s3StringerTilt,a.weaponRunner.catalogState.bowTilt,'emitted tilt, not delayed presentation state');
    const remote=f.make(id);remote.remote=true;remote.grounded=true;
    f.G.projectiles.ghostProjectile(remote,packet);
    assert.equal(remote.weaponRunner.catalogState.remoteBowTilt,9,id+' receives actual airborne fan tilt');
    const ch={weapon:{def:{modelId:r.id}},P:new Float64Array(3),wAim:1,grounded:true,_runner:()=>remote.weaponRunner};
    f.weaponFamilyPose(id)(ch,1/120,{}, {ANCR:0});
    assert.ok(Math.abs(ch.P[2]-1.25*.9)<1e-12,'remote bow shows the same captured tilt despite grounded interpolation');
    for(const encoding of ['named','sixth'])for(const value of [NaN,Infinity,-.1,90.1,'9',null]){
      const bad=packet.slice();bad[27]=encoding==='named'?{s3Catalog:[1,'arrow',0,1,0],s3StringerTilt:value}:{s3Catalog:[1,'arrow',0,1,0,value]};
      f.G.projectiles.ghostProjectile(remote,bad);
      assert.equal(remote.weaponRunner.catalogState.remoteBowTilt,9,'malformed tilt cannot alter accepted remote pose');
      assert.equal(f.G.projectiles.list.at(-1).catalog,null,'malformed extension cannot reconstruct a catalogue arrow');
    }
    const legacy=packet.slice();legacy[27]={s3Catalog:packet[27].s3Catalog.slice(0,5)};
    f.G.projectiles.ghostProjectile(remote,legacy);
    assert.ok(f.G.projectiles.list.at(-1).catalog,'five-entry legacy arrows remain accepted');
    assert.equal(remote.weaponRunner.catalogState.remoteBowTilt,null,'legacy senders retain grounded presentation fallback');
    const sixth=packet.slice();sixth[27]={s3Catalog:[...packet[27].s3Catalog,9]};
    f.G.projectiles.ghostProjectile(remote,sixth);
    assert.equal(remote.weaponRunner.catalogState.remoteBowTilt,9,'optional sixth-value receivers remain compatible');
  }
});
