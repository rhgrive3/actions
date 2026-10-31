import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {equip} from '../../splatoon3/tests/sub-mark-fixture.mjs';
export {equip};
const DT=1/60,json=value=>JSON.parse(JSON.stringify(value));

// Each endpoint owns its native module graph and deterministic performance
// clock. Only transport, display, stationary motion and scene inputs are fixtures.
export async function peer(id,sub,ap){
 const clock={elapsed:0};
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  vmPerformance:{now:()=>(100+clock.elapsed)*1000}});
 f.G.scene ||= new f.THREE.Scene();f.G.camera ||= new f.THREE.PerspectiveCamera();
 f.G.level={...f.G.level,blocks:[],spawnPads:[new f.THREE.Vector3(),new f.THREE.Vector3()],groundHeight:()=>0,
  queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
 f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const o=f.make('shooter'),v=f.make('shooter');
 Object.assign(o,{nid:1,owner:'a',team:0,remote:id!=='a',isLocal:id==='a',netLife:0,invuln:0});
 Object.assign(v,{nid:2,owner:'b',team:1,remote:id!=='b',isLocal:id==='b',netLife:0,invuln:0});
 o.character.actor=o;v.character.actor=v;equip(v,ap);o.weapon={...o.weapon,sub};o.pos.set(0,0,0);o.aimDir.set(0,0,1);v.pos.set(0,0,2);
 const packets=[],tr={broadcast(packet){packets.push(json(packet));return true;},sendTo(){return true;}};
 const session={myId:id,hostId:'a',isHost:id==='a',_members:new Map([['a',{}],['b',{}]]),tr};
 const nm=new f.NetMatch(session,{id:'storm-native-device-contact',map:'reef'});
 const match={playing:()=>true,canRespawn:()=>true,state:'playing',time:180,duration:180,actors:[o,v],
  removeActor(actor){this.actors=this.actors.filter(a=>a!==actor);f.G.actors=this.actors;}};
 Object.assign(f.G,{match,actors:match.actors});nm.bind(match);
 return{f,o,v,nm,packets,clock,lastNetworkTime:0,
  close(){nm.dispose();f.G.projectiles.clear();f.restoreRandom();}};
}
export function time(p,elapsed){assert.ok(Number.isFinite(elapsed)&&elapsed>=0);p.clock.elapsed=elapsed;p.f.G.time=elapsed;}
function updateNetwork(p,dt){
 p.nm.update(dt);
 for(const actor of p.nm.byNid.values())if(actor.remote)p.nm.applyRemote(actor,dt);
 p.lastNetworkTime=p.f.G.time;
}
export function send(p,recipients=[]){
 const start=p.packets.length;assert.equal(p.nm._sendTick(),true,'native transport accepts the encoded tick');
 const packet=p.packets.slice(start).findLast(packet=>packet.k==='t');assert.ok(packet,'native tick packer produced a packet');
 for(const recipient of recipients){time(recipient,packet.ts-100);receive(recipient,p.nm.myId,packet);}
 return json(packet);
}
export function receive(p,from,packet){
 p.nm.onMessage(from,json(packet));
 updateNetwork(p,Math.max(0,p.f.G.time-p.lastNetworkTime));
}
// Finish the existing native jitter-buffer playback after the final arrival.
// No peer simulation tick, private receipt or cloud state is manufactured.
export function drain(p,frames=60){
 for(let i=0;i<frames;i++){
  time(p,p.f.G.time+DT);updateNetwork(p,DT);p.f.G.projectiles.update(DT);
  if([...p.nm.peers.values()].every(peer=>!peer.events.length&&peer.sim>=peer.physicsPoints?.at(-1)))return;
 }
 assert.ok([...p.nm.peers.values()].every(peer=>!peer.events.length&&peer.sim>=peer.physicsPoints?.at(-1)),
  'native playback drains through the final admitted source tick');
}
