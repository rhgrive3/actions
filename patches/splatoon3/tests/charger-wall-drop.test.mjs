import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
import {chargerWallDropParameters,beginChargerWallDrop,advanceChargerWallDrops} from '../runtime/weapons-charger-flight.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url))).weaponsFidelityCompletion.weapons.charger;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('#625 sourced shock/fall endpoints and explicitly resolved movement defaults',()=>{
 for(const [charge,shock,fall] of [[8/60,1.2,.8],[34/60,1.5,1],[1,1.8,1.2]]){
  const p=chargerWallDropParameters(raw,charge);near(p.shock,shock);near(p.fall,fall);assert.equal(p.ground,null);
  assert.ok(p.first>=15&&p.first<=30);assert.ok(p.last>=15&&p.last<=30);assert.equal(p.second,10);near(p.firstSpeed,.04);near(p.secondSpeed,.05);near(p.gravity,.008);
  const q=chargerWallDropParameters(raw,charge,true);near(q.shock,shock/2);near(q.fall,fall*.5625);near(q.ground,.4);
 }
});
async function shot(charge,{ghost=false,wall=true}={}){
 const f=await fixture({fidelity:true}),a=f.make('charger',{y:10});
 if(wall)f.wall(8,{height:20});
 if(ghost)f.projectiles.ghostFire(a,{weapon:'charger',charge,muzzle:new f.THREE.Vector3(0,11.05,.3),dir:new f.THREE.Vector3(0,0,1)});
 else f.projectiles.fireCharger(a,a.weapon,charge);
 for(let i=0;i<30&&f.projectiles._fidelityChargerFlights?.length;i++)f.projectiles.update(1/60);
 return {...f,a};
}
for(const charge of [8/60,.5,1])test(`#625 finite ${charge} Charger swept impact retains descending gameplay paint`,async()=>{
 const f=await shot(charge),drops=f.projectiles._s3ChargerWallDrops;assert.equal(drops.length,1);
 const y=drops[0].pos.y,shock=f.paints.at(-1);near(shock.radius,chargerWallDropParameters(raw,charge).shock);
 const before=f.paints.length;for(let i=0;i<30;i++)f.projectiles.update(1/60);
 assert.ok(f.paints.length>before);assert.ok(f.paints.slice(before).some(p=>p.center[1]<y-.3));
 for(const p of f.paints.slice(before))near(p.radius,chargerWallDropParameters(raw,charge).fall);
 f.projectiles.clear();assert.equal(f.projectiles._s3ChargerWallDrops.length,0);
});
test('#625 ghosts and open-air flights do not create wall-paint authority',async()=>{
 for(const opts of [{ghost:true},{wall:false}]){const f=await shot(1,opts);assert.equal(f.projectiles._s3ChargerWallDrops?.length||0,0);f.projectiles.clear();}
});
test('#625 splash-wall path consumes its own radii and ground radius',async()=>{
 const f=await fixture({fidelity:true}),a=f.make('charger'),V=f.THREE.Vector3,system={};
 const hit={hit:true,point:new V(0,.1,2),normal:new V(0,0,-1),face:-1};
 assert.ok(beginChargerWallDrop(system,{owner:a,team:0,charge:1,seed:.5},hit,raw,f,true));
 near(f.paints[0].radius,.9);
 for(let i=0;i<20;i++)advanceChargerWallDrops(system,1/60,f);
 assert.equal(system._s3ChargerWallDrops.length,0);near(f.paints.at(-1).radius,.4);
});
test('#625 post-impact traces match for 30/60/120Hz fixed simulation',async()=>{
 const traces=[];for(const hz of [30,60,120]){const f=await shot(1),clock=new FixedClock();for(let i=0;i<hz*2;i++)clock.advance(1/hz,dt=>f.projectiles.update(dt));traces.push(JSON.parse(JSON.stringify(f.paints.map(p=>[p.center,p.radius]))));f.projectiles.clear();}
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
