import test from 'node:test';
import assert from 'node:assert/strict';
import {gearCurve} from '../runtime/gear.mjs';
import {near,equip,world,peer} from './sub-mark-fixture.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {SUB_MARK_RESISTANCE_CURVES} from '../runtime/sub-mark-resistance.mjs';
test('mark curves match the pinned raw 11.3.0 source and its high/mid/low ordering',()=>{
 const bytes=fs.readFileSync(new URL('../reference/gear-params-1130.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e');const raw=JSON.parse(bytes);assert.deepEqual(SUB_MARK_RESISTANCE_CURVES.normal,[...raw.MarkingTimeRt].reverse());assert.deepEqual(SUB_MARK_RESISTANCE_CURVES.trap,[...raw.MarkingTimeRt_Trap].reverse());
});
for(const ap of [0,3,10,30,57])test(`actual Actor sensor contact applies victim Sub Resistance ${ap}AP once`,async()=>{
 const f=await world(),a=f.make();a.team=1;equip(a,ap);f.G.time=10;assert.equal(f.pointSensorMark(a,0,10,8),true);near(a.s3.revealedUntil[0]-10,8*gearCurve(ap,1,.43,.1));
 const old=a.s3.revealedUntil[0];equip(a,0);assert.equal(a.s3.revealedUntil[0],old,'equipment change does not rewrite an admitted deadline');
});
for(const sub of ['inkMine','angleShooter'])for(const ap of [0,10,57])test(`${sub} actual projectile contact shortens mark at ${ap}AP`,async()=>{
 const f=await world(),o=f.make(),v=f.make();o.team=0;v.team=1;o.invuln=v.invuln=0;equip(v,ap);o.weapon={...o.weapon,sub};o.aimDir.set(0,0,1);o.pos.set(0,0,0);v.pos.set(0,0,2);f.G.actors=[o,v];
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);f.G.time=10;
 const obj=f.G.projectiles.throwBomb(o);assert.ok(obj);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);
 if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}
 for(let i=0;i<20&&!v.s3.revealedUntil?.[0];i++)f.G.projectiles.update(1/60);
 assert.ok(v.s3.revealedUntil?.[0]>10);near(v.s3.revealedUntil[0]-10,5*gearCurve(ap,1,sub==='inkMine'?.55:.43,.1));
});
test('overlapping marks retain max admitted deadline across gear changes and sources',async()=>{
 const f=await world(),v=f.make();v.team=1;equip(v,57);f.pointSensorMark(v,0,10,8);near(v.s3.revealedUntil[0],10.8);f.pointSensorMark(v,0,10.1,5);near(v.s3.revealedUntil[0],10.8);
 f.pointSensorMark(v,0,10.5,8);near(v.s3.revealedUntil[0],11.3);equip(v,0);near(v.s3.revealedUntil[0],11.3);f.pointSensorMark(v,0,10.6,8);near(v.s3.revealedUntil[0],18.6);equip(v,57);near(v.s3.revealedUntil[0],18.6);
});
