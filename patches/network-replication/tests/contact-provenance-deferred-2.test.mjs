// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
test('fresh distant claim cannot become body contact through later close snapshot',async t=>{const x=await setup(t);x.tick(1000,100,{a:[x.f.packActor(x.remote,{f:257,x:50})]});x.hit();deferredOnly(x);x.tick(1000.1,100.1,{u:106});deferredOnly(x);});
test('packet cannot remove private noContactFallback metadata',async t=>{const x=await setup(t);x.f.clock.set(100);x.hit({proofOnly:false,noContactFallback:false,allowPoseFallback:true});deferredOnly(x);x.tick(1000.1,100.1,{u:106,noContactFallback:false});deferredOnly(x);});
test('native retransmission remains valid and removes deferred copy before later proof consumption',async t=>{const x=await setup(t);x.tick();x.f.clock.set(104);x.hit();deferredOnly(x);x.tick(1004.1,104.1,{u:346});deferredOnly(x);x.hit();assert.equal(x.calls.length,1);assert.equal(x.nm.peers.get('peer').lastHit,1);x.tick(1004.2,104.2,{u:352,e:[x.proof(1004.2)],a:[x.f.packActor(x.remote,{f:1})]});assert.equal(x.calls.length,1);assert.equal(x.state().proofs.get('peer')[0].uses,0,'old queued copy cannot spend new projectile proof');assert.equal(x.state().pending.has('peer'),false);});
test('private queued flag cannot forbid a separately received valid contact',async t=>{const x=await setup(t);x.tick();x.hit({proofOnly:true,noContactFallback:true,allowPoseFallback:false});assert.equal(x.calls.length,1);});
