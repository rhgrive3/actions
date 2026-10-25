import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function cloud(team=1){return {subId:'toxicMist',team,phase:'deployed',dead:false,pos:new f.THREE.Vector3(0,.7,0),expireAt:1e9,spec:{radius:100,slowScale:.5}};}
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} vs ${b}`);
test('all 58 added main owners retain Poison Mist speed scaling exactly once across idle, fire and charge states',()=>{
 const rows=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy);assert.equal(rows.length,58);
 for(const row of rows){
  const a=f.make(row.id);a.form='kid';a.pos.set(0,0,0);a.weaponRunner.update(1/60,{fire:false});
  const runner=a.weaponRunner;
  for(const phase of ['idle','fire','charge','rolling']){
   runner.firingT=phase==='fire'?.35:0;runner.charging=phase==='charge';runner.rolling=phase==='rolling';
   f.G.projectiles._s3SubObjects=[];const dry=runner.moveSpeed();
   f.G.projectiles._s3SubObjects=[cloud()];near(runner.moveSpeed(),dry*.5,row.id+' '+phase);
   a.s3.modifiers.subMistResistance=.5;near(runner.moveSpeed(),dry*.75,row.id+' resistance');
   a.s3.modifiers.subMistResistance=1;
   f.G.projectiles._s3SubObjects=[cloud(),cloud()];near(runner.moveSpeed(),dry*.5,row.id+' overlap is not multiplicative');
   f.G.projectiles._s3SubObjects=[cloud(0)];near(runner.moveSpeed(),dry,row.id+' allied mist');
   const dead=cloud();dead.dead=true;f.G.projectiles._s3SubObjects=[dead];near(runner.moveSpeed(),dry,row.id+' expired mist');
  }
 }
 f.G.projectiles._s3SubObjects=[];
});
test('the seven legacy owners retain their existing single Mist multiplier',()=>{
 for(const row of MAIN_WEAPON_CATALOG.records.filter(r=>r.legacy)){
  const a=f.make(row.id);a.form='kid';a.pos.set(0,0,0);
  f.G.projectiles._s3SubObjects=[];const dry=a.weaponRunner.moveSpeed();
  f.G.projectiles._s3SubObjects=[cloud()];near(a.weaponRunner.moveSpeed(),dry*.5,row.id);
 }
 f.G.projectiles._s3SubObjects=[];
});
test('catalogue grounded and airborne movement uses the same cloud membership at 30/60/120Hz and recovers immediately on exit',()=>{
 for(const id of ['s3-shooter-short','s3-brush-mini','s3-saber-lite'])for(const hz of [30,60,120])for(const airborne of [false,true]){
  const a=f.make(id);a.form='kid';a.pos.set(0,0,0);a.grounded=!airborne;a.intent.move.set(0,0,1);a.vel.set(0,0,0);
  f.G.projectiles._s3SubObjects=[cloud()];
  for(let i=0;i<hz;i++)a._horizontal(1/hz,false,false);
  const mist=a.vel.z;
  f.G.projectiles._s3SubObjects=[];
  for(let i=0;i<hz;i++)a._horizontal(1/hz,false,false);
  assert.ok(a.vel.z>mist*1.5,id+' exits the live cloud');
 }
});
