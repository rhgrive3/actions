import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectCurling,collectBlaster,collectWave,collectRoller} from './fixtures/action-traces/collect.mjs';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/action-traces/source-recorded.json',import.meta.url),'utf8'));
const near=(a,b)=>Math.abs(a-b)<1e-8;

// Explicit ground, paint and character sinks are described in the fixture.
// Only real Actor input, native Runner and Projectiles advance, at 60Hz.
// These traces measure this build's behavior, not retail S3 parity.
test('identical network snapshot can conceal distinct legal Curling holds',async()=>{
 const short=await collectCurling({holdFrames:6}),long=await collectCurling({holdFrames:30});
 assert.deepEqual(short,recorded.traces.curlingShort);assert.deepEqual(long,recorded.traces.curlingLong);
 assert.deepEqual(short.beforeRelease,long.beforeRelease);
 assert.ok(near(short.hold,.1)&&near(long.hold,.5));
 assert.equal(short.birth.tick,62);assert.equal(long.birth.tick,62);
 assert.ok(near(short.birth.charge,7/60)&&near(long.birth.charge,31/60));
 assert.notDeepEqual(short.birth.velocity,long.birth.velocity);assert.notEqual(short.birth.fuse,long.birth.fuse);
 assert.equal(short.afterBirth.ink,35);assert.equal(long.afterBirth.ink,35);
});
test('a real Curling contact and later blast can both hit the same victim',async()=>{
 const hit=await collectCurling({holdFrames:30,victimAt:[0,0,8.6]});
 const miss=await collectCurling({holdFrames:30,victimAt:[20,0,8.6]});
 assert.deepEqual(hit,recorded.traces.curlingContactBlast);assert.deepEqual(miss,recorded.traces.curlingMiss);
 assert.deepEqual(hit.events.filter(e=>e.kind==='hit').map(e=>[e.tick,e.id,e.damage,e.victim]),[[202,'curling',20,2],[209,'bomb',180,2]]);
 assert.deepEqual(hit.victim,{tick:210,hp:0,alive:false});assert.ok(!miss.events.some(e=>e.kind==='hit'));
});
test('identical Curling birth packets hide distinct ink and later native admission',async()=>{
 const low=await collectCurling({holdFrames:60,initialInk:64.51,probeAt:420});
 const high=await collectCurling({holdFrames:60,initialInk:65.49,probeAt:420});
 assert.deepEqual(low,recorded.traces.curlingLow);assert.deepEqual(high,recorded.traces.curlingHigh);
 assert.deepEqual(low.beforeRelease,high.beforeRelease);assert.deepEqual(low.wireBirth,high.wireBirth);
 assert.ok(near(low.afterBirth.ink,9.51)&&near(high.afterBirth.ink,10.49));
 assert.ok(near(low.afterBirth.recoveryStop,.5)&&near(high.afterBirth.recoveryStop,.5));
 assert.equal(low.probe.newBirth,false);assert.equal(high.probe.newBirth,true);
 assert.deepEqual(high.events.filter(e=>e.kind==='bomb:throw').map(e=>e.tick),[62,426]);
});
test('actual Blaster direct and multi-victim splash hits remain distinct, with a far negative control',async()=>{
 const direct=await collectBlaster(),multi=await collectBlaster({targetX:2,extraTarget:true}),miss=await collectBlaster({targetX:12});
 assert.deepEqual(direct,recorded.traces.blasterDirect);assert.deepEqual(multi,recorded.traces.blasterMultiSplash);assert.deepEqual(miss,recorded.traces.blasterMiss);
 assert.equal(direct.births[0].tick,15);assert.equal(direct.events.find(e=>e.kind==='hit').damage,125);
 assert.equal(direct.final.victims[0].alive,false);assert.equal(direct.final.tick,23,'native delayed lethal resolves on victim update');
 const hits=multi.events.filter(e=>e.kind==='hit');assert.deepEqual(hits.map(e=>e.victim),[2,3]);assert.ok(hits.every(e=>e.tick===27&&near(e.damage,53.73643264249681)));
 assert.ok(multi.final.victims.every(v=>near(v.hp,46.3)));assert.ok(!miss.events.some(e=>e.kind==='hit'));
});
test('real Wave Breaker device gives repeated independent hits and rejects an uncharged activation',async()=>{
 const active=await collectWave(),empty=await collectWave({fullSpecial:false});
 assert.deepEqual(active,recorded.traces.wave);assert.deepEqual(empty,recorded.traces.waveNoGauge);
 assert.equal(active.initial.special,190);assert.equal(active.final.special,0);
 assert.equal(active.devices.find(x=>x.kind==='wave').tick,10);
 assert.deepEqual(active.events.filter(e=>e.action==='pulse').map(e=>e.tick),[124,274]);
 assert.deepEqual(active.events.filter(e=>e.kind==='hit').map(e=>[e.tick,e.damage]),[[137,45],[287,45]]);
 assert.ok(!empty.events.some(e=>e.kind==='special:use'));assert.equal(empty.devices.length,0);
});
test('native Roller contact hits in the rolling state',async()=>{
 const contact=await collectRoller(),miss=await collectRoller({targetX:10});
 assert.deepEqual(contact,recorded.traces.roller);assert.deepEqual(miss,recorded.traces.rollerMiss);
 const hit=contact.events.find(e=>e.kind==='hit');assert.deepEqual([hit.tick,hit.damage,hit.rolling],[29,125,true]);
 assert.ok(!miss.events.some(e=>e.kind==='hit'));
});
