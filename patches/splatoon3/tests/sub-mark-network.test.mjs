import test from 'node:test';
import assert from 'node:assert/strict';
import {gearCurve} from '../runtime/gear.mjs';
import {near,equip,peer,tickTo,stepUntil,nativeThrow} from './sub-mark-fixture.mjs';
// #1975: rows arrive only in the owner's actual tick, the throw is paid through
// the native WeaponRunner, and the receiver's own fixed-step contact settles
// the mark. The wire still carries raw source frames; Mark Resistance applies
// once on the receiver.
const marking=e=>(e[1]==='ks'&&e[2]==='m')||(e[1]==='ac'&&e[5]?.phase==='mark');
const terminal=e=>e[1]==='ac'&&['burst','expire'].includes(e[5]?.phase);
for(const sub of ['pointSensor','angleShooter','inkMine'])for(const ap of [0,10,57])for(const power of [0,57])test(`${sub} JSON receiver applies ${ap}AP once to attacker ${power}AP raw duration`,async()=>{
 const a=await peer('a',sub,ap),b=await peer('b',sub,ap);equip(a.o,power,'subPower');equip(b.o,power,'subPower');let mark=null,markArrival=null,birthArrival=null;
 const deliver=()=>{for(const p of tickTo(a,b,e=>!terminal(e)))for(const e of p.e||[]){if(e[1]==='ks'&&e[2]==='p'||e[1]==='ac'&&e[5]?.phase==='spawn')birthArrival=b.f.G.time;if(marking(e)){mark=e;markArrival=b.f.G.time;}}};
 tickTo(a,b);
 const obj=nativeThrow(a);assert.ok(obj,'native paid throw');deliver();
 if(sub==='pointSensor'){
  const ghost=b.f.G.projectiles._s3SupportSensors?.[0];assert.ok(ghost?.ghost,'paid native birth creates the receiver sensor');
  for(const s of [obj,ghost]){s.pos.set(0,.7,2);s.activeAt=0;}obj.expires=3;
 }else{obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}}
 for(let i=0;i<20&&!mark;i++){a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);deliver();}
 assert.ok(mark,'real projectile contact emitted a mark');const raw=(sub==='pointSensor'?8:5)*(power===57?2:1);assert.equal(sub==='pointSensor'?mark[7]:mark[5].frames,raw*60,'wire remains raw source frames');
 assert.ok(stepUntil(b,()=>b.v.s3.revealedUntil?.[0]>b.f.G.time,120),'receiver native contact settles the mark');
 const before=b.v.s3.revealedUntil[0];
 const receiverAge=sub==='angleShooter'?Math.max(mark[5].markAgeFrames||0,Math.floor((markArrival-birthArrival)*60+1e-8)):0;
 near(before-b.f.G.time,(raw-receiverAge/60)*gearCurve(ap,1,sub==='inkMine'?.55:.43,.1));
 b.f.G.time+=.2;b.nm._play('a',JSON.parse(JSON.stringify(mark)));b.nm._play('other',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil[0],before,'duplicate and forged sender cannot renew');
 b.v.splat(null,'water');b.v.respawn();assert.equal(b.v.s3.revealedUntil,undefined,'new life clears old marks');b.nm._play('a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined,'old-life row cannot revive mark');
});
