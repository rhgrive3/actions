import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('#278 vertical1+2+2 groups preserve their source-relative launch heights before integration',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('roller',{x:2,y:10,z:3});
 a.weaponRunner.s3FlickVertical=true;
 function volley(seed,yaw=0){
  f.projectiles.clear();f.reseed(seed);a.yaw=yaw;f.projectiles.fireFlick(a,a.weapon);
  const all=[...f.projectiles.list];assert.equal(all.length,5);const rows=[];
  const units=[0,1,1,2,2],offsets=[.5,0,0,-1,-1];
  for(let i=0;i<5;i++){
   const p=all[i];assert.equal(p.age,0);assert.equal(p.fidelityRollerUnitIndex,units[i]);
   near(p.start.x,a.pos.x+Math.sin(yaw)*.6);near(p.start.z,a.pos.z+Math.cos(yaw)*.6);
   near(p.start.y,a.pos.y+1.3+offsets[i]);near(p.pos.distanceTo(p.start),0);near(p.prev.distanceTo(p.start),0);
   rows.push({unit:units[i],start:Array.from(p.start.toArray())});
  }
  assert.equal(new Set(rows.map(x=>JSON.stringify(x.start))).size,3);
  return rows;
 }
 const first=volley(112);assert.deepEqual(volley(112),first);assert.deepEqual(volley(113),first,'vertical position fields have no positional RNG');
 volley(112,.73);f.projectiles.clear();
});
test('#278 pinned vertical group heights match the test table and their unverified combination stays recorded',()=>{
 const profile=JSON.parse(readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
 const units=profile.weaponsFidelityCompletion.weapons.roller.VerticalSwingUnitGroupParam.Unit;
 assert.deepStrictEqual(units.map(u=>u.BulletNum??1),[1,2,2]);
 assert.deepStrictEqual(units.map(u=>(u.SpawnPositionOffsetHeight||0)+(u.SpawnPositionHeight||0)),[.5,0,-1]);
 let note=null;
 (function walk(o){if(o&&typeof o==='object'){if(typeof o.rollerVerticalSpawnHeight==='string')note=o.rollerVerticalSpawnHeight;for(const v of Object.values(o))walk(v);}})(profile);
 assert.ok(note,'rollerVerticalSpawnHeight must be recorded in profile models');
 for(const s of ['unverified','scale 1','not an SI-metre claim'])assert.ok(note.includes(s),`missing "${s}"`);
});
