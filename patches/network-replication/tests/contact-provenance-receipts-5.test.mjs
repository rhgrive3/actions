// Actual production composition; bounded groups avoid accumulating many VM fixtures.
import test from 'node:test';
import {fixture} from './robustness-fixture.mjs';
import assert from 'node:assert/strict';
import {setup,untouched,deferredOnly,bossSetup} from './contact-provenance-fixture.mjs';
test('native produced paint event playback is not blocked by stale body contact',async t=>{
 const x=await setup(t);x.tick();
 const f=await fixture({productionComposition:true}),tx=f.makeNetMatch(f.makeSession('peer','me',[['me','Me'],['peer','Peer']])),owner=f.makeActor({nid:17,owner:'peer',remote:false,team:1,roller:true});
 f.bind(tx,[owner]);t.after(()=>tx.dispose());owner.netLife=0;f.clock.set(1004);f.G.time=340/60;const order=tx.recSplat(new f.THREE.Vector3(0,0,0),1,1,{claimOwner:owner,seed:.2});assert.ok(order,'native paint recorder grants own actor paint');const rows=JSON.parse(JSON.stringify(tx.out));assert.equal(rows.length,1);
 let splats=0;x.f.G.paint.splat=()=>{splats++;return 1};x.tick(1004,104,{r:2,u:340,a:[],e:rows});const peer=x.nm.peers.get('peer');assert.equal(peer.events.length,1,'producer paint admitted to FIFO');peer.tr=1004;peer.sim=340;x.nm._playEvents();assert.equal(peer.events.length,0);assert.equal(splats,1);assert.equal(x.state().contactSnapshots.get(x.remote).at,100,'paint did not freshen body authority');
});
test('native already admitted sub birth commits and flushes after contact receipt expires',async t=>{
 const x=await setup(t);x.remote.weapon={...x.remote.weapon,sub:'burst'};const payload={v:1,phase:'spawn',subId:'burst',life:0,sourceLife:0,seq:1,seed:1,charge:0,x:0,y:2,z:0,vx:0,vy:1,vz:0};const event=[1000,'ac','sub',17,0,payload,100,1];
 x.tick(1000,100,{r:2,e:[event],a:[x.f.packActor(x.remote,{f:1})]});const peer=x.nm.peers.get('peer');assert.equal(peer.events.length,1);assert.equal(x.state().proofs.get('peer')?.length??0,0,'raw admitted event is not a committed proof');
 x.f.clock.set(103.4);x.hit({w:'burst'});assert.equal(x.calls.length,0);assert.equal(x.state().pending.get('peer').length,1);
 x.f.clock.set(103.6);peer.tr=1000;peer.sim=100;x.nm._playEvents();assert.equal(peer.events.length,0);assert.equal(x.calls.length,1,'actual native creation released pending hit after receipt expiry');assert.equal(x.state().pending.has('peer'),false);assert.equal(x.state().proofs.get('peer')[0].uses,1);assert.equal(x.state().contactSnapshots.get(x.remote).at,100);assert.ok(x.f.G.projectiles._s3SubObjects.some(o=>o.owner===x.remote&&o.seq===1&&o.ghost),'real native remote sub object created');
});
test('original sixty-one-second stale roller claim cannot consume native hit identity',async t=>{
 const x=await setup(t);x.tick(1000.1,100.1,{a:[x.f.packActor(x.remote,{f:256})],l:undefined});
 assert.equal(x.nm.peers.get('peer').lastTs,1000.1);x.f.clock.set(161);x.hit();untouched(x);
 assert.equal(x.nm.peers.get('peer').lastTs,1000.1);assert.equal(x.state().pending.get('peer')[0].proofOnly,true);
});
