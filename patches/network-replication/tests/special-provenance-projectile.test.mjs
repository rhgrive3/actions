import test from 'node:test';import assert from 'node:assert/strict';import {specialSetup} from './special-provenance-fixture.mjs';
import {fixture} from './robustness-fixture.mjs';
test('native-produced special projectile proof survives stale special receipt',async t=>{
 const x=await specialSetup(t);x.remote.weapon={...x.remote.weapon,special:'inkjet'};x.active();x.sample();x.f.clock.set(110.1);x.hit({w:'inkjet'});assert.equal(x.calls.length,0);
 const f=await fixture({productionComposition:true}),tx=f.makeNetMatch(f.makeSession('peer','me',[['me','Me'],['peer','Peer']])),owner=f.makeActor({nid:17,owner:'peer',remote:false,team:1,roller:true});owner.weapon={...owner.weapon,special:'inkjet'};owner.netLife=0;f.bind(tx,[owner]);t.after(()=>tx.dispose());f.clock.set(1010.2);
 tx.recProj({owner,type:'shot',wid:'inkjet',pos:new f.THREE.Vector3(0,2,0),vel:new f.THREE.Vector3(0,0,10),life:1,straight:1,radius:.5,size:.1,grav:0,drag:0});const e=JSON.parse(JSON.stringify(tx.out));assert.equal(e.length,1);
 x.active(1010.2,110.2,{a:[],l:{},e});assert.equal(x.calls.length,1);assert.equal(x.state().proofs.get('peer')[0].src,'p');assert.equal(x.state().pending.has('peer'),false);
});
test('queued stale claim cannot gain fallback from later active snapshot alone',async t=>{const x=await specialSetup(t);x.active();x.sample();x.f.clock.set(110.1);x.specialHit();x.active(1010.2,110.2);x.sample();assert.equal(x.calls.length,0);assert.equal(x.state().pending.get('peer')[0].proofOnly,true);});
