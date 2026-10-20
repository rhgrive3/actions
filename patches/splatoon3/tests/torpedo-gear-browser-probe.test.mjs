import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';

const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('      class DisplayCharacter {'),source.indexOf('      const {CANONICAL_KITS}'));
const original=source.slice(source.indexOf('      const torpedoGearContactChecks=[];'),source.indexOf('      const directSubChecks=[];'));
assert.ok(original.includes('one first gear plus birth packet'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function runProbe(broken=false,legacyContact=false){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:(rel,code)=>{
  if(legacyContact&&rel==='patches/network-replication/combat-provenance.mjs'){
   const guard="    if(type==='pvp'&&d.w==='torpedo-splash'&&p.nativeTorpedoContact)continue;";
   assert.equal(code.split(guard).length,2);return code.replace(guard,'');
  }return code;
 },extraExports:"export {applyAcceptedGear} from './patches/splatoon3/runtime/gear-loadout-network.mjs'; export {receiverTorpedoObservationState} from './patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs';"});
 f.G.scene=new f.THREE.Scene();
 let probe=original;
 for(const line of ["const {applyAcceptedGear}=await import('/patches/splatoon3/runtime/gear-loadout-network.mjs');","const {receiverTorpedoObservationState}=await import('/patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs');"]){
  assert.equal(probe.split(line).length,2);probe=probe.replace(line,'');
 }
 if(broken){const line='nm.bind(match);session.match=nm;';assert.equal(probe.split(line).length,2);probe=probe.replace(line,'nm.bind(match);session.match=match;');}
 const run=new AsyncFunction('Actor','THREE','Player','G','NetMatch','Projectiles','api','emptyLoadout','applyAcceptedGear','receiverTorpedoObservationState','check',helpers+'const catalogueSubChecks=[];'+probe+'return {rows:torpedoGearContactChecks,catalogueSubChecks};');
 const saved={...f.G};
 try{return await run(f.Actor,f.THREE,f.PLAYER,f.G,f.NetMatch,f.Projectiles,f.installedRuntime,f.emptyLoadout,f.applyAcceptedGear,f.receiverTorpedoObservationState,(ok,label)=>assert.ok(ok,label));}
 finally{assert.equal(f.G.match,saved.match);assert.equal(f.G.projectiles,saved.projectiles);}
}
test('exact Torpedo AP57 browser probe uses native session ownership, contact, HP and ACK',async()=>{
 const {rows,catalogueSubChecks}=await runProbe();assert.equal(rows.length,2);
 assert.deepEqual(rows.map(r=>[r.attackerSubPowerAP,r.victimSubResistanceAP,r.hp,r.ackDamage]),[[57,0,28,12],[0,57,64,6]]);
 for(const row of rows){assert.equal(row.nativeTerrain,true);assert.equal(row.duplicateInert,true);}
 assert.deepEqual(catalogueSubChecks,[{source:'torpedo-splash',ap:57,wire:true,nativeContact:true,damage:6}]);
});
test('a Match in session.match reproduces the rejected first Torpedo tick',async()=>{
 await assert.rejects(runProbe(true),/one first gear plus birth packet/);
});

test('legacy launch-ray fallback reproduces pre-contact terrain damage',{skip:!!process.env.INKWAVE_BUILT_SITE},async()=>{
 await assert.rejects(runProbe(false,true),/early raw12 cannot replace receiver terrain contact/);
});
