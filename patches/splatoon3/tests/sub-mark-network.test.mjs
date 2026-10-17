import test from 'node:test';
import assert from 'node:assert/strict';
import {gearCurve} from '../runtime/gear.mjs';
import {near,equip,world,peer} from './sub-mark-fixture.mjs';
for(const sub of ['pointSensor','angleShooter','inkMine'])for(const ap of [0,10,57])for(const power of [0,57])test(`${sub} JSON receiver applies ${ap}AP once to attacker ${power}AP raw duration`,async()=>{
 const a=await peer('a',sub,ap),b=await peer('b',sub,ap);equip(a.o,power,'subPower');equip(b.o,power,'subPower');let mark;
 const replay=()=>{for(const e of a.nm.out.splice(0)){const row=JSON.parse(JSON.stringify(e));b.nm._play('a',row);if((row[1]==='ks'&&row[2]==='m')||(row[1]==='ac'&&row[5]?.phase==='mark'))mark=row;}};
 const obj=a.f.G.projectiles.throwBomb(a.o);assert.ok(obj);replay();
 if(sub==='pointSensor'){const sensor=a.f.G.projectiles._s3SupportSensors[0];sensor.pos.set(0,.7,2);sensor.activeAt=0;sensor.expires=3;const ghost=b.f.G.projectiles._s3SupportSensors[0];ghost.pos.set(0,.7,2);}
 else{obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}}
 for(let i=0;i<20&&!mark;i++){a.f.G.projectiles.update(1/60);replay();}
 assert.ok(mark,'real projectile contact emitted a mark');const raw=(sub==='pointSensor'?8:5)*(power===57?2:1);assert.equal(sub==='pointSensor'?mark[7]:mark[5].frames,raw*60,'wire remains raw source frames');
 const before=b.v.s3.revealedUntil[0];near(before-b.f.G.time,(raw-(sub==='angleShooter'?(mark[5].markAgeFrames||0)/60:0))*gearCurve(ap,1,sub==='inkMine'?.55:.43,.1));
 b.f.G.time+=.2;b.nm._play('a',JSON.parse(JSON.stringify(mark)));b.nm._play('other',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil[0],before,'duplicate and forged sender cannot renew');
 b.v.splat(null,'water');b.v.respawn();assert.equal(b.v.s3.revealedUntil,undefined,'new life clears old marks');b.nm._play('a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined,'old-life row cannot revive mark');
});
