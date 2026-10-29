import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
async function setup(t,{host='me',peer='peer',roller=true,transformSource=null}={}) {
 const f=await fixture({productionComposition:true,transformSource});
 const s=f.makeSession('me',host,[['me','Me'],[peer,'Peer'],['third','Third']]);
 const nm=f.makeNetMatch(s),local=f.makeActor({nid:7,owner:'me',remote:false,team:0,roller:false}),remote=f.makeActor({nid:17,owner:peer,remote:true,team:1,roller});
 f.bind(nm,[local,remote]);local.netLife=0;remote.weaponRunner.rolling=true;
 const calls=[];f.projectiles.applyHit=(...a)=>{calls.push(a);return'accepted'};
 t.after(()=>nm.dispose());
 return {f,s,nm,local,remote,calls,peer,
  tick(ts=1000,at=100,extra={}) { f.clock.set(at); nm.onMessage(peer,{k:'t',ts,u:100,a:[f.packActor(remote,{f:257})],l:{17:0},...extra}); },
  hit(extra={},from=peer) {nm.onMessage(from,{k:'hit',m:nm.cfg.id,v:7,a:17,d:10,w:'roller',l:0,h:1,seq:1,...extra});},
  state(){return nm._combatProvenance;},
  proof(ts=1000,extra={}){return [ts,'ev','weapon:fire',{actor:{n:17},weapon:remote.weapon.id,muzzle:[0,2,0],dir:[0,0,1],...extra}];}
 };
}
function untouched(x,{pending=false}={}) {assert.equal(x.calls.length,0,'native applyHit called');assert.equal(x.nm.peers.get(x.peer)?.lastHit,undefined,'hit replay consumed');assert.equal(x.state()?.contacts.size??0,0,'contact proof consumed');if(!pending)assert.ok((x.state()?.pending.get(x.peer)||[]).every(i=>i.proofOnly===true),'deferred claims must not inherit pose fallback');}
function deferredOnly(x){const items=x.state().pending.get('peer');assert.equal(x.calls.length,0);assert.equal(x.nm.peers.get('peer')?.lastHit,undefined);assert.equal(x.state().contacts.size,0);assert.equal(items?.length,1);assert.equal(items[0].proofOnly,true,'receiver-private deferral disallows body fallback');}
function bossSetup(x){let hits=0;x.nm.match.boss={sim:true,dead:false,pos:new x.f.THREE.Vector3(0,2,0),crabs:new Map([[3,{x:0,y:1.6,z:0,dead:false}]]),remoteHit(){hits++}};return{get hits(){return hits},hit(extra={}){x.nm.onMessage('peer',{k:'bhit',m:x.nm.cfg.id,a:17,d:10,w:'crab',c:3,l:0,q:1,weak:0,...extra})}};}
export {setup,untouched,deferredOnly,bossSetup};
