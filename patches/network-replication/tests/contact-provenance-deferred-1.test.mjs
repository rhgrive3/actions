// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
for(const stale of [false,true])test(`delayed flick after ${stale?'stale':'missing'} snapshot recovers`,async t=>{
 const x=await setup(t);x.remote.weaponRunner.rolling=false;if(stale)x.tick(996,96,{u:0,a:[x.f.packActor(x.remote,{f:1})]});x.f.clock.set(100);x.hit();deferredOnly(x);x.tick(1000.1,100.1,{u:246,a:[x.f.packActor(x.remote,{f:1})],e:[x.proof(1000.1)]});assert.equal(x.calls.length,1);assert.equal(x.nm.peers.get('peer').lastHit,1);assert.equal(x.state().pending.has('peer'),false);
});
test('expired contact cannot become damage merely because later rolling snapshot arrives',async t=>{const x=await setup(t);x.tick();x.f.clock.set(104);x.hit();deferredOnly(x);x.tick(1004.1,104.1,{u:346});deferredOnly(x);});
test('missing-snapshot claim cannot become damage on first rolling snapshot',async t=>{const x=await setup(t);x.f.clock.set(100);x.hit();deferredOnly(x);x.tick(1000.1,100.1,{u:106});deferredOnly(x);});
test('fresh nonrolling claim cannot become body contact through later rolling snapshot',async t=>{const x=await setup(t);x.tick(1000,100,{a:[x.f.packActor(x.remote,{f:1})]});x.hit();deferredOnly(x);x.tick(1000.1,100.1,{u:106});deferredOnly(x);});
