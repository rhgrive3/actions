import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectCurling,collectWave} from './fixtures/action-traces/collect.mjs';
const reference=JSON.parse(readFileSync(new URL('./fixtures/action-traces/source-recorded.json',import.meta.url),'utf8')).traces;
const cancelled=JSON.parse(readFileSync(new URL('./fixtures/action-traces/cancel-recorded.json',import.meta.url),'utf8')).scenario;
// Every native tick traverses canonical prepare/apply before Actor.update.
// The canonicalizer receives command and identity only, never recorded
// charge, ink, projectile, damage or the expected result.
test('canonical input preserves different native Curling charges and legal contact/blast',async()=>{
 const short=await collectCurling({holdFrames:6,canonical:true});
 const long=await collectCurling({holdFrames:30,canonical:true});
 const hit=await collectCurling({holdFrames:30,victimAt:[0,0,8.6],canonical:true});
 assert.deepEqual(short,reference.curlingShort);assert.deepEqual(long,reference.curlingLong);assert.deepEqual(hit,reference.curlingContactBlast);
 assert.deepEqual(hit.events.filter(e=>e.kind==='hit').map(e=>[e.tick,e.id,e.damage]),[[202,'curling',20],[209,'bomb',180]]);
});
test('canonical native resource clocks distinguish same first wire birth on the later action',async()=>{
 const low=await collectCurling({holdFrames:60,initialInk:64.51,probeAt:420,canonical:true});
 const high=await collectCurling({holdFrames:60,initialInk:65.49,probeAt:420,canonical:true});
 assert.deepEqual(low,reference.curlingLow);assert.deepEqual(high,reference.curlingHigh);
 assert.deepEqual(low.wireBirth,high.wireBirth);assert.equal(low.probe.newBirth,false);assert.equal(high.probe.newBirth,true);
});
test('canonical cancelled sub hold stays silent while ordinary release throws',async()=>{
 const stopped=await collectCurling({holdFrames:30,cancelRelease:true,canonical:true});
 const released=await collectCurling({holdFrames:30,canonical:true});
 assert.deepEqual(stopped,cancelled);assert.deepEqual(released,reference.curlingLong);
 assert.deepEqual(stopped.beforeRelease,released.beforeRelease);
 assert.equal(stopped.birth,null);assert.equal(stopped.afterBirth.ink,100);
 assert.equal(released.birth.tick,62);assert.equal(released.afterBirth.ink,35);
});
test('canonical special input preserves native deployment and later Wave Breaker pulses',async()=>{
 const wave=await collectWave({canonical:true}),empty=await collectWave({fullSpecial:false,canonical:true});
 assert.deepEqual(wave,reference.wave);assert.deepEqual(empty,reference.waveNoGauge);
 assert.deepEqual(wave.events.filter(e=>e.kind==='hit').map(e=>[e.tick,e.damage]),[[137,45],[287,45]]);
 assert.ok(!empty.events.some(e=>e.kind==='special:use'));
});
