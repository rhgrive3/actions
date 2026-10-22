// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
test('receipt cannot transfer to a different owner',async t=>{const x=await setup(t);x.tick();x.remote.owner='third';x.hit({},'third');untouched(x);assert.equal(x.nm.peers.get('third')?.lastHit,undefined);});
test('receipt cannot cross actor authoritative life change',async t=>{const x=await setup(t);x.tick();x.remote.netLife=1;x.hit();untouched(x);});
test('latest accepted nonrolling row removes rolling contact authority',async t=>{const x=await setup(t);x.tick();x.tick(1000.1,100.1,{u:106,a:[x.f.packActor(x.remote,{f:1})]});x.hit();untouched(x,{pending:true});assert.equal(x.state().pending.get('peer').length,1,'fresh nonrolling flick queue remains usable');});
test('latest accepted nonalive row cannot use retained alive/rolling actor presentation',async t=>{const x=await setup(t);x.tick(1000,100,{a:[x.f.packActor(x.remote,{f:256})]});x.hit();untouched(x,{pending:true});});
test('far accepted actor snapshot cannot borrow retained close renderer position',async t=>{const x=await setup(t);x.tick(1000,100,{a:[x.f.packActor(x.remote,{f:257,x:50})]});x.hit();untouched(x,{pending:true});});
