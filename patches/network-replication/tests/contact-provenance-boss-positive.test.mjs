import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,bossSetup} from './contact-provenance-fixture.mjs';
import {combatAdmission} from '../combat-provenance.mjs';
test('current main positive boss damage guard survives fresh contact port',async t=>{
 const x=await setup(t),b=bossSetup(x);x.tick();
 const claim={m:x.nm.cfg.id,a:17,d:0,w:'crab',c:3,l:0,q:1,weak:0};
 assert.equal(combatAdmission(x.nm,'peer',claim,'boss',100),false);
 assert.equal(x.state().contacts.size,0);
 b.hit({d:0});assert.equal(b.hits,0);assert.equal(x.state()?.pending.has('peer')??false,false);
 b.hit({d:10});assert.equal(b.hits,1);
});
test('current main positive boss guard never queues zero damage for later proof',async t=>{
 const x=await setup(t),b=bossSetup(x);x.f.clock.set(100);
 b.hit({d:0});assert.equal(b.hits,0);assert.equal(x.state()?.pending.has('peer')??false,false);
});
