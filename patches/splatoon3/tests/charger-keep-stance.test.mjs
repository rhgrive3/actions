// A resurfaced full-charge keep is still a held full charge during its 31F
// fire / 25F laser pre-delay. Before this fix the runner reported neither
// `charging` nor a firing pose there, so the humanoid walked at full run speed
// facing its movement, then snapped to the 1.2 full-charge walk and the aim
// when the keep turned into a live charge — the laser sight visibly lurched.
// Logic-only check through the installed runtime (no Switch measurement).
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const DT=1/60;
async function keep(){
 const f=await fixture({fidelity:true,network:true}),a=f.make('charger'),r=a.weaponRunner;
 const owned=f.G.paint.splat(new f.THREE.Vector3(a.pos.x,a.pos.y+.07,a.pos.z),3,a.team,{seed:.5});
 assert.ok(owned>0,'precondition: own ink beneath the Charger');
 f.G.actors=[a];a.intent.fire=true;
 const step=()=>{f.G.time+=DT;a.update(DT);f.projectiles._updateBeams(DT);f.projectiles.syncSights();};
 for(let i=0;i<80;i++)step();assert.equal(r.charging,true);
 a.intent.squid=true;for(let i=0;i<20;i++)step();assert.ok(r.s3Stored,'precondition: kept charge');
 return {f,a,r,step};
}
test('squid with a kept charge is not in a stance',async()=>{
 const {f,a,r}=await keep();
 assert.equal(a.form,'squid');
 assert.equal(r.firingPose(),false);
 f.projectiles.clear();
});
test('resurfaced keep holds the full-charge stance and speed through its pre-delay',async()=>{
 const {f,a,r,step}=await keep();a.intent.squid=false;
 const full=a.weapon.moveSpeedFiring;
 let speeds=[];
 for(let frame=1;frame<=34;frame++){
  step();
  if(a.form==='squid')continue;
  assert.equal(r.firingPose(),true,`frame ${frame}: aiming stance (stored=${!!r.s3Stored}, charging=${r.charging})`);
  speeds.push(r.moveSpeed());
 }
 assert.ok(speeds.length>20,'humanoid frames observed');
 const base=speeds[speeds.length-1];
 for(const s of speeds)assert.ok(Math.abs(s-base)<1e-9,`speed continuous across keep -> live charge: ${s} vs ${base}`);
 assert.ok(base<=full*1.5+1e-9,`full-charge walk speed band: ${base} vs ${full}`);
 f.projectiles.clear();
});
test('cancelling the keep by releasing ZR drops the stance',async()=>{
 const {f,a,r,step}=await keep();a.intent.squid=false;
 for(let i=0;i<8;i++)step();
 a.intent.fire=false;step();step();
 assert.equal(r.s3Stored,null);assert.equal(r.charging,false);
 assert.equal(r.firingPose(),r.firingT>0,'only the ordinary post-shot pose timer may remain');
 f.projectiles.clear();
});
