import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA=`
 export { Match } from './inkwave-public/src/game/match.js';
 export { BotBrain } from './inkwave-public/src/game/bots.js';
 export { NetSession } from './inkwave-public/src/net/session.js';
 export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
 export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
 export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
 export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
 export { OWNER_CLOCK_VERSION } from './patches/network-replication/owner-clock.mjs';
`;
const DT=1/60;
const stage={id:'objective-device-loopback',zones:[],tower:{path:[[0,0,-8],[0,0,8]],centerIndex:0,checkpoints:[[],[]],speed:1.2,halfSize:1.4},
 rainmaker:{center:[0,0,0],goals:[[0,0,9],[0,0,-9]],checkpoints:[[],[]]},clams:{spawns:[],goals:[[0,0,9],[0,0,-9]]}};

async function peer(id,queue,{defenderOwner='host',separateDeviceOwner=false}={}){
 const clock={ms:10000};
 const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,
  vmPerformance:{now:()=>clock.ms},vmMathRandom:()=>.5,extraExports:EXTRA});
 f.context.structuredClone=structuredClone;
 f.installRanked({...f.installedRuntime,G:f.G,Match:f.Match,BotBrain:f.BotBrain,NetSession:f.NetSession,structuredClone});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.settings={quality:'low'};G.time=0;
 G.level=new f.Level({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},spawnPads:[[0,0,-8],[0,0,8]],single:[{kind:'box',min:[-12,-1,-12],max:[12,0,12]}],half:[]});
 G.physics=new f.Physics(G.level);G.projectiles.dispose?.();G.projectiles=new f.Projectiles(G.scene);
 const roster=[['source',301,0,[0,0,0]],[defenderOwner,302,1,[0,0,4]]];
 if(separateDeviceOwner)roster.push(['host',303,1,[9,0,4]]);
 const actors=roster.map(([owner,nid,team,pos])=>{
  const a=new f.Actor({team,weapon:'shooter',isLocal:owner===id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  a.nid=nid;a.owner=owner;a.character.actor=a;a.character.onEvent=null;a.pos.set(...pos);a.vel.set(0,0,0);a.grounded=a.ground.hit=true;a.invuln=0;a.s3.spawnArmor=null;
  a.form='kid';a.kidT=10;a.aimYaw=a.yaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);G.scene.add(a.character.root);return a;
 });
 const source=actors[0],defender=actors[1];G.actors=actors;
 defender.weapon={...defender.weapon,sub:'splashWall'};defender.weaponRunner.reset();defender.s3.abilityPoints={...defender.s3.abilityPoints,subPower:0};source.s3.objectHitGear=false;
 // Controlled target condition, not an attack proof: each world uses the real
 // native wall factory, then starts at the same deployed rectangle. No source
 // action/receipt/private capability is fabricated by this target setup.
 const wall=G.projectiles.throwBomb(defender);assert.equal(wall.subId,'splashWall');wall.phase='deployed';wall.pos.set(0,0,2);wall.yaw=0;
 const match=new f.Match({mode:'rainmaker',duration:300});assert.equal(match.mode,'rainmaker');
 Object.assign(match,{state:'playing',actors,local:actors.find(a=>a.owner===id),paused:false,follower:id!=='host',ranked:new f.RankedEngine('rainmaker',stage),rankedBarrierHits:[],rankedGains:[0,0]});
 G.match=match;match.rankedWorld=new f.RankedWorld(f.installedRuntime,match,stage);match.rankedEffects=f.createRankedEffects(f.installedRuntime,match);
 // Open-shield initial condition. The host still performs the real pickup,
 // held charge, release/windup and actual objective projectile birth.
 match.ranked.rule.state.barrier.active=false;
 const session={myId:id,hostId:'host',isHost:id==='host',ownerClockVersion:f.OWNER_CLOCK_VERSION,_members:new Map(roster.map(([owner])=>[owner,{}]))};
 session.tr={broadcast(packet){queue.push({from:id,packet:JSON.parse(JSON.stringify(packet))});return true;},sendTo(to,packet){queue.push({from:id,to,packet:JSON.parse(JSON.stringify(packet))});return true;}};
 const nm=new f.NetMatch(session,{id:'objective-device-loopback',map:'tidewater',mode:'rainmaker',difficulty:'normal'});nm.bind(match);
 wall.ghost=defender.remote;
 const events=[],claims=[],off=f.on('all:sub',e=>{if(e.phase==='objectHit'){events.push({seq:e.seq,eventSeq:e.eventSeq,damage:e.damage,cause:e.cause});claims.push({...e});}});
 return {id,f,G,clock,source,defender,wall,match,nm,events,claims,close(){off();nm.dispose();match.rankedEffects.dispose();match.rankedWorld.dispose();for(const a of actors)a.character.dispose?.();G.projectiles.dispose?.();}};
}

const hasClaim=message=>message.from==='source'&&message.packet.k==='t'&&message.packet.e?.some(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='objectHit');
async function loopback({transform=null,separateDeviceOwner=false}={}){
 const queue=[],options={defenderOwner:separateDeviceOwner?'defender':'host',separateDeviceOwner},host=await peer('host',queue,options),source=await peer('source',queue,options),deviceOwner=separateDeviceOwner?await peer('defender',queue,options):host,peers=separateDeviceOwner?[host,source,deviceOwner]:[host,source];
 const wire=[];
 const deliver=()=>{for(let cap=0;queue.length&&cap<1000;cap++){
  const message=queue.shift();wire.push(message);
  for(const target of peers)if(target.id!==message.from&&(!message.to||message.to===target.id)){
   const changed=transform?transform(message,target):message;
   if(changed)target.nm.onMessage(changed.from,JSON.parse(JSON.stringify(changed.packet)));
  }
 }assert.equal(queue.length,0,'bounded in-memory transport cannot recurse forever');};
 const step=(fire=false)=>{
  for(const p of peers){p.clock.ms+=1000/60;p.G.time+=DT;}
  source.source.intent.fire=fire;source.source.intent.move.set(0,0,0);
  for(const a of source.match.actors)a.update(DT);
  source.match.advanceRanked(DT);source.nm.update(DT);deliver();
  for(const p of peers)if(p!==source){p.nm.update(DT);deliver();for(const a of p.match.actors)a.update(DT);p.match.advanceRanked(DT);deliver();}
 };
 return {host,source,deviceOwner,wire,queue,step,deliver,close(){for(const p of peers)p.close();}};
}
function pickup(r){for(let i=0;i<45;i++)r.step(false);assert.equal(r.host.match.ranked.rule.state.carrier,'301');assert.equal(r.source.match.ranked.rule.state.carrier,'301');}
function release(r,frames=90){for(let i=0;i<90;i++)r.step(true);for(let i=0;i<frames;i++)r.step(false);}
function forgedClaim(r,extra={}){
 const target=r.host.wall;
 return {v:1,phase:'objectHit',subId:'rainmaker',seq:0,eventSeq:101,life:0,targetOwnerId:302,targetLife:target.sourceLife,targetOwnerLife:0,targetSeq:target.seq,targetSubId:'splashWall',damage:60,cause:'Gachihoko_Bullet',objectShredder:false,x:0,y:1,z:2,actor:r.source.source,...extra};
}
function sendClaim(r,claim){r.source.f.installedRuntime.emit('all:sub',claim);for(let i=0;i<15;i++)r.step(false);}
function realShotCount(r){return r.wire.flatMap(m=>m.from==='host'&&m.packet.k==='rkevent'?m.packet.events.filter(e=>e.kind==='rainmaker-shot'):[]).length;}


export {loopback,pickup,release,realShotCount};
