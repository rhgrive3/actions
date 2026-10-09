import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function rig(charge=45){
 const f=await fixture({productionComposition:true}),a=f.make();let terrain='wall';
 a.grounded=false;a.form='squid';a.intent.squid=true;a.climbing=true;a.wallN.set(0,0,1);a.intent.move.set(0,0,-1);a.intent.jump=true;
 f.G.physics.raycast=(p,dir,max,h)=>{h.hit=Math.abs(dir.y)<.5&&terrain!=='top';if(h.hit){h.face=0;h.u=h.v=.5;h.normal.set(0,0,1);h.point.copy(p).addScaledVector(dir,.3);}return h;};
 f.G.paint.sample=()=>1;f.tick(a,charge);a.intent.jump=false;
 return {...f,a,terrain:v=>terrain=v};
}
for(const charge of [1,15,45])for(const delay of [2,8,12,40])test(`#568 charge ${charge}F, wall exit ${delay}F: armor starts at launch`,async()=>{
 const f=await rig(charge),a=f.a;f.tick(a,delay);
 assert.equal(a.climbing,true);assert.equal(a.s3.actions.armor,null);assert.equal(a.s3.surge.armorTime,0);
 const hp=a.hp;a.damage(10,null,'shooter');near(a.hp,hp-10);
 f.terrain('top');f.tick(a);const shield=a.s3.actions.armor;
 assert.ok(shield);assert.equal(a.climbing,false);near(shield.armorTime,f.profile.movement.surge.armorTime);
 a.damage(20,null,'shooter');near(a.hp,hp-10);near(shield.armorHP,f.profile.movement.surge.armorHP-20);
 f.tick(a);near(shield.armorTime,f.profile.movement.surge.armorTime-1/60);
 a._ledgePop(new f.THREE.Vector3(0,0,-1));near(shield.armorTime,f.profile.movement.surge.armorTime-1/60);
});
test('#568 cancellation cannot resurrect a queued shield at a later ledge',async()=>{
 for(const cause of ['away','form','death','reset']){
  const f=await rig(),a=f.a;f.tick(a,10);
  if(cause==='away'){a.intent.move.set(0,0,1);f.tick(a);}
  if(cause==='form'){a.intent.squid=false;f.tick(a);}
  if(cause==='death')a.splat(null,'shooter');if(cause==='reset')a.reset();
  a._ledgePop(new f.THREE.Vector3(0,0,-1));assert.equal(a.s3.actions?.armor??null,null,cause);
 }
});
test('#568 30/60/120Hz retain identical launch and armor-expiration boundaries',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){const f=await rig(),clock=new FixedClock(),trace=[];let n=0;
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{if(++n===12)f.terrain('top');f.tick(f.a);trace.push([f.a.climbing,f.a.s3.actions.armor?.armorTime??0]);});traces.push(trace);}
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);near(traces[0][11][1],.75);near(traces[0][56][1],0);
});
