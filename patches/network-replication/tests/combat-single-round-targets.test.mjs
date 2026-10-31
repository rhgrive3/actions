import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';
import {setup,registerSingleRoundFamily} from './combat-single-round-family-fixture.mjs';

// Keep the missing-weapon regression and the 14 legacy shooter cases here.
test('missing local weapon definition cannot throw or grant a usable birth proof',async t=>{
  const x=await setup(t),row=x.f.packActor(x.attacker,{f:1});
  const event=nativeMainBirth(x.f,x.nm,x.attacker,x.weapon,1000);event.length=27;event[4]=0;
  x.attacker.weapon=null;
  assert.doesNotThrow(()=>x.nm.onMessage('peer',{
    k:'t',ts:1000,u:60000,a:[row],l:{17:0},e:[event],
  }));
  const proofs=x.nm._combatProvenance.proofs.get('peer')||[];
  assert.equal(proofs.length,1,'valid native timing reaches the missing-weapon proof policy');
  assert.ok(proofs.every(p=>p.maxUses===0));
  assert.doesNotThrow(()=>x.hit());assert.equal(x.victims[0].hp,100);
});

registerSingleRoundFamily('shooter',false);
