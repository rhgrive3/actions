// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
test('accepted native snapshot authorizes fresh contact even without retained rendered rolling',async t=>{const x=await setup(t);x.remote.weaponRunner.rolling=false;x.tick();assert.equal(x.state().contactSnapshots.get(x.remote).life,0);x.hit();assert.equal(x.calls.length,1);assert.equal(x.nm.peers.get('peer').lastHit,1);});
test('exact 3.5 second receipt boundary is accepted, not an enlarged timestamp window',async t=>{const x=await setup(t);x.tick();x.f.clock.set(103.5);x.hit();assert.equal(x.calls.length,1);});
test('expired contact rejects without mutation and same hit ID can recover with genuine fresh row',async t=>{const x=await setup(t);x.tick();x.f.clock.set(103.500001);x.hit();untouched(x);x.tick(1003.6,103.6,{u:316});x.hit();assert.equal(x.calls.length,1);assert.equal(x.nm.peers.get('peer').lastHit,1);});
test('receiver clock rollback fails closed without spending contact',async t=>{const x=await setup(t);x.tick();x.f.clock.set(99.99);x.hit();untouched(x);});
test('bad actor vector advances receive timestamp but cannot mint contact authority',async t=>{const x=await setup(t);const row=x.f.packActor(x.remote,{f:257});row[1]=NaN;x.tick(1000,100,{a:[row]});assert.equal(x.nm.peers.get('peer').lastReceiveAt,100);assert.equal(x.remote.net.buf.length,0);x.hit();untouched(x);});
