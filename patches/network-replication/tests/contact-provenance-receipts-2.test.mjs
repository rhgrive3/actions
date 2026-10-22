// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
test('invalid life sidecar advances receive timestamp but cannot mint contact authority',async t=>{const x=await setup(t);x.tick(1000,100,{l:{17:-1}});assert.equal(x.nm.peers.get('peer').lastReceiveAt,100);assert.equal(x.remote.net.buf.length,0);x.hit();untouched(x);});
test('older life row cannot refresh prior receipt after it expires',async t=>{const x=await setup(t);x.tick(1000,100,{l:{17:1}});assert.equal(x.remote.net.lastLife,1);x.tick(1004,104,{u:340,l:{17:0}});assert.equal(x.remote.net.buf.at(-1).t,1000);assert.equal(x.state().contactSnapshots.get(x.remote).at,100);x.hit();untouched(x);});
test('invalid physics cannot renew even if actual actor buffer accepts its row',async t=>{const x=await setup(t);x.tick();x.tick(1004,104,{u:1000000});assert.equal(x.nm.peers.get('peer').lastReceiveAt,104);assert.equal(x.nm.peers.get('peer').physicsPoints.at(-1),100);assert.equal(x.state().contactSnapshots.get(x.remote).at,100);x.hit();untouched(x);});
test('malformed first physics tick never authorizes contact',async t=>{const x=await setup(t);x.tick(1000,100,{u:-1});x.hit();untouched(x);});
test('receipt cannot transfer to a new actor object reusing the same ID',async t=>{const x=await setup(t);x.tick();const replacement=x.f.makeActor({nid:17,owner:'peer',remote:true,team:1,roller:true});x.nm.byNid.set(17,replacement);x.nm._setupActor(replacement);replacement.weaponRunner.rolling=true;x.hit();untouched(x);});
