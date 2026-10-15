import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './kit-composed-fixture.mjs';
import {installKitBigBubbler,clearBigBubblers,bigBubblerDomes,bigBubblerRemoteDomes,bigBubblerSnapshot,replayBigBubbler,damageBigBubblerFromBeam} from '../runtime/kit-big-bubbler.mjs';

function countSets(run){
 const Original=globalThis.Set;let allocations=0;
 globalThis.Set=class extends Original{constructor(...args){super(...args);allocations++;}};
 try{return {value:run(),allocations};}finally{globalThis.Set=Original;}
}

test('empty beam queries allocate no Set and admit a later real activation without caching emptiness',async()=>{
 const f=await fixture(),scene=new f.THREE.Scene();
 f.G.scene=scene;f.G.projectiles=new f.Projectiles(scene);
 const api={...f,Actor:f.Actor,Projectiles:f.Projectiles,THREE:f.THREE,G:f.G,PLAYER:f.PLAYER,emit:f.emit,SPECIALS:f.SPECIALS};
 installKitBigBubbler(api,{...f.profile,kits:{bigBubbler:{timeDamageIntervalSeconds:1e9}}});
 clearBigBubblers('test-setup');
 const attacker=f.make('charger');attacker.team=1;attacker.alive=true;
 const start=new f.THREE.Vector3(0,1.2,-10),end=new f.THREE.Vector3(0,1.2,10);
 const before={start:start.toArray(),end:end.toArray(),special:attacker.special,ink:attacker.ink};
 const events=[];const off=f.on('kit:bubbler:hit',e=>events.push(e));
 const empty=countSets(()=>{for(let i=0;i<1000;i++)assert.equal(damageBigBubblerFromBeam(attacker,start,end,3.5),0);});
 assert.equal(empty.allocations,0,'no per-beam Set with zero local and remote domes');
 assert.equal(events.length,0);
 assert.deepEqual({start:start.toArray(),end:end.toArray(),special:attacker.special,ink:attacker.ink},before);
 const owner=f.make('roller');owner.team=0;owner.pos.set(0,0,0);owner.yaw=owner.aimYaw=0;
 owner.weapon={...owner.weapon,special:'bubbler'};owner.special=owner.specialCost();owner._startSpecial();
 const dome=bigBubblerDomes()[0];assert.ok(dome,'real native activation creates dome after empty calls');
 start.x=end.x=dome.pos.x;start.z=dome.pos.z-10;end.z=dome.pos.z+10;
 const hp=dome.hp;
 const active=countSets(()=>damageBigBubblerFromBeam(attacker,start,end,3.5));
 assert.ok(active.value>0);assert.equal(active.allocations,1);assert.equal(dome.hp,hp-active.value);assert.equal(events.length,1);
 assert.equal(damageBigBubblerFromBeam({...attacker,remote:true},start,end,3.5),0,'remote actors remain ineligible');
 const snapshot=bigBubblerSnapshot()[0];
 clearBigBubblers('test-clear');
 const cleared=countSets(()=>damageBigBubblerFromBeam(attacker,start,end,3.5));
 assert.deepEqual(cleared,{value:0,allocations:0});assert.equal(events.length,1);
 const remote={...owner,remote:true,nid:'remote-bubbler',owner:'peer'};
 const replay=replayBigBubbler('deploy',remote,{...snapshot,id:'remote-beam',domeId:'remote-beam'});
 assert.equal(replay.ok,true);assert.equal(bigBubblerDomes().length,0);
 const remoteDome=bigBubblerRemoteDomes()[0],remoteHp=remoteDome.hp,proposals=[];
 const stop=f.on('kit:bubbler:damage-proposal',e=>proposals.push(e));
 const remoteHit=countSets(()=>damageBigBubblerFromBeam(attacker,start,end,3.5));
 assert.equal(remoteHit.allocations,1);assert.equal(remoteDome.hp,remoteHp,'remote HP remains owner-authoritative');
 assert.equal(proposals.length,1,'remote-only pool produces a proposal immediately');
 stop();off();clearBigBubblers('test-finish');
});
