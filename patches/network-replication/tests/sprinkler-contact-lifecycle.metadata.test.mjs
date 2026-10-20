import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const path=process.env.SPRINKLER_CONTACT_HELPER || new URL('../sprinkler-contact-commit.mjs',import.meta.url).pathname;
const api=await import(pathToFileURL(path));
function fixture(){
 const actor={nid:1,owner:'remote',remote:true,alive:true,netLife:2,team:0};
 const victim={nid:2,owner:'local',remote:false,alive:true,netLife:3,team:1};
 const peer={};let clears=0,releases=0;
 const projectiles={bombs:[],clear(){clears++;this.bombs.length=0;return 'cleared';},_releaseBomb(b,arg){releases++;return arg;}};
 const G={projectiles};
 const nm={myId:'local',cfg:{id:'match'},match:{},byNid:new Map([[1,actor],[2,victim]]),peers:new Map([['remote',peer]]),s:{_members:new Set(['local','remote'])}};
 const bomb={owner:actor,ghost:true,s3GhostResolved:{spec:{id:'sprinkler',dropletDamage:20}},_netBorn:1,_netBornTick:2,_netPeer:peer};projectiles.bombs.push(bomb);
 const receipt={nid:1,from:'remote',life:2,eventTime:1,eventTick:2};let notifications=0;
 assert.equal(api.registerReceiverSprinkler(nm,bomb,receipt,G,()=>notifications++,.95,48),true);
 const claim={a:1,v:2,l:3,h:1,m:'match',w:'sprinkler',d:20};
 const record=(drop={},t=10)=>api.recordReceiverSprinklerContact(nm,bomb,drop,victim,20,t);
 const take=(d=claim,t=10,scope=null)=>api.consumeReceiverSprinklerContact(nm,'remote',d,t,scope);
 return {actor,victim,peer,projectiles,G,nm,bomb,receipt,claim,record,take,notices:()=>notifications,counters:()=>({clears,releases})};
}
test('native clear revokes before same bomb reinsertion and preserves return',()=>{const f=fixture();f.record();assert.equal(f.projectiles.clear(),'cleared');f.projectiles.bombs.push(f.bomb);assert.equal(f.take(),false);assert.equal(f.record(),false);assert.equal(f.counters().clears,1);});
test('native release revokes even if caller retains bomb in array, forwards args/return',()=>{const f=fixture();f.record();assert.equal(f.projectiles._releaseBomb(f.bomb,'returned'),'returned');assert.equal(f.take(),false);assert.equal(f.record(),false);assert.equal(f.counters().releases,1);});
const changes={
 world:f=>{const old=f.G.projectiles;f.G.projectiles={bombs:[]};return()=>f.G.projectiles=old;},
 owner:f=>{f.actor.owner='foreign';return()=>f.actor.owner='remote';},
 peer:f=>{f.nm.peers.set('remote',{});return()=>f.nm.peers.set('remote',f.peer);},
 match:f=>{const old=f.nm.match;f.nm.match={};return()=>f.nm.match=old;},
 actorLife:f=>{f.actor.netLife++;return()=>f.actor.netLife--;},
 membership:f=>{f.nm.s._members.delete('remote');return()=>f.nm.s._members.add('remote');},
 bombRemoval:f=>{f.projectiles.bombs.length=0;return()=>f.projectiles.bombs.push(f.bomb);},
 exactActor:f=>{f.nm.byNid.set(1,{...f.actor});return()=>f.nm.byNid.set(1,f.actor);},
};
for(const [name,change]of Object.entries(changes))test(name+' invalidation cannot revive after observed failure and restoration',()=>{const f=fixture();f.record();const restore=change(f);assert.equal(f.take(),false);restore();assert.equal(f.take(),false);assert.equal(f.record(),false);});
test('one drop allows one receipt; a distinct birth wrapper sharing vectors allows new contact',()=>{const f=fixture(),pos={},vel={},d={pos,vel};assert.equal(f.record(d),true);assert.equal(f.record(d),false);assert.equal(f.take(),true);assert.equal(f.record({pos,vel}),true);assert.equal(f.take({...f.claim,h:2}),true);assert.equal(f.take({...f.claim,h:3}),false);});
test('expired contact is removed, including after clock moves back',()=>{const f=fixture();f.record();assert.equal(f.take(f.claim,10.96),false);assert.equal(f.take(f.claim,10),false);});
test('wrong damage/life/known sequence cannot consume valid contact',()=>{const f=fixture();f.record();assert.equal(f.take({...f.claim,d:40}),false);assert.equal(f.take({...f.claim,l:4}),false);f.peer.hitSequences=new Set([1]);assert.equal(f.take(),false);assert.equal(f.take({...f.claim,h:2}),true);});
test('victim life change destroys old contact even if life later restored',()=>{const f=fixture();f.record();f.victim.netLife++;assert.equal(f.take({...f.claim,l:4}),false);f.victim.netLife--;assert.equal(f.take(),false);});
test('replacement registration cannot satisfy old private scope',()=>{const f=fixture();const old=api.receiverSprinklerScope(f.nm,'remote',1);const next={...f.bomb};f.projectiles.bombs.push(next);assert.equal(api.registerReceiverSprinkler(f.nm,next,f.receipt,f.G,()=>{},.95,48),true);assert.equal(api.recordReceiverSprinklerContact(f.nm,next,{},f.victim,20,10),true);assert.equal(f.take(f.claim,10,old),false);assert.equal(f.take(),true);});
test('close revokes all device receipts and cannot revive via direct reinsertion',()=>{const f=fixture();f.record();api.closeReceiverSprinklers(f.nm);assert.equal(f.take(),false);assert.equal(f.record(),false);});
