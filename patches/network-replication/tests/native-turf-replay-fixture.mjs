// CPU-only source/emitted native Match/Actor/Physics/NetMatch probe.
// The socket, scene and floor are test boundaries; no spawn phase, body,
// life, resource, network clock or weapon state is assigned by the fixture.
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

const extraExports = `
 export { NetSession } from './src/net/session.js';
 export { PROTO, COMPAT } from './src/net/transport.js';
 export { beginInitialSquidSpawn } from './patches/splatoon3/runtime/respawn-lifecycle.mjs';
 export const setAuditResource = fn => globalThis.__turfReplayResource = fn;
 export const installTestSocket=(Socket,interval,cancel)=>{globalThis.WebSocket=Socket;globalThis.location={search:'',hostname:'localhost'};globalThis.setInterval=interval;globalThis.clearInterval=cancel;};
`;
function observeResources(rel,code){
 if(rel!=='patches/splatoon3/runtime/resources.mjs')return code;
 const plain='export function updateResources(a, dt) {';
 if(code.includes(plain)) return code.replace(plain,'export function updateResources(a, dt) { globalThis.__turfReplayResource?.(a,dt);');
 const m=code.match(/\b([A-Za-z_$][\w$]*) as updateResources\b/);
 if(!m)throw Error('Unable to observe emitted resource owner');
 const n=m[1];return code.replace(m[0],`__auditTurfResource as updateResources`)+`\nfunction __auditTurfResource(a,dt){globalThis.__turfReplayResource?.(a,dt);return ${n}(a,dt);}\n`;
}
export async function nativeTurfProbe(weapon='charger', {historic=false,generic=false}={}) {
 const historicExports=historic ? "export {installNativeChargerReplay,createNativeChargerReplay,advanceNativeChargerReplay,nativeChargerReplayState} from './patches/network-replication/tests/fixtures/native-charger-9d8efc/native-charger-replay.mjs';" : '';
 const genericExports=generic ? "export {createTrustedNativeReplay,advanceTrustedNativeReplay,inspectTrustedNativeReplay,disposeTrustedNativeReplay} from './patches/network-replication/trusted-native-replay.mjs';" : '';
 const f=await sourceLoadedActorFixture({extraExports:extraExports+historicExports+genericExports,moduleTransform:observeResources});
 const {G,THREE}=f;
 // Warm the module loader before roster construction creates two characters.
 // This prevents concurrent dynamic-link races in the Node VM, not game state.
 await f.make();f.reset();
 // Actual NetSession and Transport, with a fake WebSocket/relay boundary.
 // The session generates its own START epoch and the relay echoes it.
 const wire=[],sockets=[];
 class Socket{constructor(url){this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);}send(data){this.sent.push(data);if(data.startsWith('b|'))wire.push(JSON.parse(data.slice(2)));}close(){this.readyState=3;this.onclose?.({reason:'bye'});}}
 f.installTestSocket(Socket,setInterval,clearInterval);
 let match;
 G.game={settings:{},menus:{current:null},profile:{name:'Owner',weapon,style:{hair:0,skin:2,outfit:0,eyes:0}},
  async startNetMatch(cfg,net){match=new f.Match({...cfg,myId:net.myId,host:net.isHost,CharacterClass:f.Character});G.match=match;G.mode='match';match.setup();await Promise.all(match.actors.map(a=>a.character._sourceMotionLoader));net.bind(match);this.match=match;},
  netMatchGo(){match.start();}};
 const session=new f.NetSession();G.net=session;
 const connect=session.join('ABCDE','Owner'),ws=sockets.at(-1);assert(ws);
 ws.onmessage({data:JSON.stringify({t:'welcome',proto:f.PROTO,compat:f.COMPAT,id:'owner',host:'owner',members:[{id:'owner',name:'Owner'}],relayClock:1})});await connect;
 ws.onmessage({data:JSON.stringify({t:'join',m:{id:'peer',name:'Peer'}})});
 session.setSettings({map:'reef',bots:false});session.confirmTeams();session.setMe({ready:true});
 ws.onmessage({data:'m|peer|'+JSON.stringify({k:'me',ready:true,weapon:'shooter'})});
 assert.equal(session.canStart(),true);assert.equal(session.start(),true);
 const cfg=wire.findLast(x=>x.k==='start');assert(cfg?.id);
 ws.onmessage({data:JSON.stringify({t:'start_result',id:cfg.id,ok:true})});
 const until=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+label);};
 await until(()=>session.state==='starting'&&session._setupReady,'native Match setup');
 ws.onmessage({data:'m|peer|'+JSON.stringify({k:'ready',id:cfg.id})});await until(()=>session.state==='match','native GO');
 const net=session.match,actor=match.local;assert(actor);await actor.character._sourceMotionLoader;if(actor.character.sourceMotion?.ready)await actor.character.sourceMotion.ready;
 const original=f.WeaponRunner.prototype.update;let effective=null,resources=0,resourceBody=null;
 f.WeaponRunner.prototype.update=function(dt,input,...args){if(this.a===actor) effective=(input?.fire?1:0)|(input?.firePressed?2:0)|(input?.sub?4:0)|(input?.subReleased?8:0);return original.call(this,dt,input,...args);};
 f.setAuditResource(a=>{if(a===actor){resources++;resourceBody=[a.pos.x,a.pos.y,a.pos.z,a.vel.y,a.form==='squid'?1:0];}});
 const births=[], fire=G.projectiles.fireCharger;
 G.projectiles.fireCharger=function(a,w,...args){if(a===actor)births.push({time:G.time,weapon:w.id,charge:args[0]});return fire.call(this,a,w,...args);};
 const rows=[];
 const step=()=>{
  const state=actor.s3?.squidSpawn?.phase||'landed',raw=actor.intent, bits=(raw.fire?1:0)|(raw.squid?2:0)|(raw.sub?4:0)|(raw.jump?8:0)|(raw.special?16:0);
  const aim=[actor.aimYaw,actor.aimPitch],aimPoint=actor.aimPoint.toArray(),move=[raw.move.x,raw.move.z],seq=net._eventSeq||0;
  effective=null;resources=0;resourceBody=null;G.time+=1/60;match.update(1/60);
  const c=actor.character,pose={};
  for(const name of ['hips','spine','chest','head','footL','footR']){const b=c.bones[name];if(b)pose[name]=[...b.position.toArray(),...b.quaternion.toArray()];}
  const spawn=actor.s3?.squidSpawn;
  rows.push({tick:rows.length+1,dt:1/60,time:G.time,phaseBefore:state,phaseAfter:spawn?.phase||'landed',spawn:spawn?JSON.parse(JSON.stringify(spawn)):null,matchState:match.state,bits,effective,resources,position:actor.pos.toArray(),velocity:actor.vel.toArray(),vy:actor.vel.y,grounded:actor.grounded,form:actor.form,aim,aimPoint,move,life:actor.netLife??0,invuln:actor.invuln===Infinity?'infinity':actor.invuln,ink:actor.ink,charging:actor.weaponRunner.charging,charge:actor.weaponRunner.charge,pose,resourceBody,seq});
 };
 const dispose=()=>{f.setAuditResource(null);f.WeaponRunner.prototype.update=original;G.projectiles.fireCharger=fire;session.leave(true);match.dispose();G.net=null;f.reset();};
 return {f,match,actor,net,session,wire,rows,births,step,dispose};
}

// A separate native module realm is dedicated to private replay. Its Match
// owns only its state clock; the replay owner creates all private actors.
// Native Match.update advances intro/playing without authoring actor state.
export async function privateNativeRealm() {
 const genericExports="export {createTrustedNativeReplay,advanceTrustedNativeReplay,inspectTrustedNativeReplay,disposeTrustedNativeReplay} from './patches/network-replication/trusted-native-replay.mjs'; export {createNativeCommandRoomPolicy,nativeCommandCapability,admitNativeCommandPeer,attachNativeCommandEnvelope,prepareNativeCommandEnvelope,commitNativeCommandEnvelope,retireNativeCommandPeer} from './patches/network-replication/native-command-wire.mjs';";
 const f=await sourceLoadedActorFixture({extraExports:extraExports+genericExports,moduleTransform:observeResources});
 await f.make();f.reset();
 const {G}=f;G.mode='match';G.game={settings:{},menus:{current:null}};
 const match=new f.Match({mode:'turf',duration:180,CharacterClass:f.Character});G.match=match;match.start();
 return {f,match,step(){G.time+=1/60;match.update(1/60);},dispose(){match.dispose();f.reset();}};
}
