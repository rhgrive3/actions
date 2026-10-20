// Receiver-private capability. Wire fields never create device/contact authority.
const registries=new WeakMap(),devices=new WeakMap(),worldHooks=new WeakMap();
function retire(r){if(!r)return;const registry=registries.get(r.nm);if(registry?.get(r.actor.nid)===r)registry.delete(r.actor.nid);if(devices.get(r.bomb)===r)devices.delete(r.bomb);r.contacts.length=0;}
function attachWorld(G){const p=G?.projectiles;if(!p||typeof p.clear!=='function'||typeof p._releaseBomb!=='function')return false;
 const existing=worldHooks.get(p);if(existing)return existing===G;
 const clear=p.clear,release=p._releaseBomb;
 p.clear=function(...args){for(const b of this.bombs||[])retire(devices.get(b));return clear.apply(this,args);};
 p._releaseBomb=function(b,...args){retire(devices.get(b));return release.call(this,b,...args);};
 worldHooks.set(p,G);return true;}

const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
function live(nm,r){
 const ok=!!r&&!nm._disposed&&r.G.projectiles===r.projectiles&&devices.get(r.bomb)===r&&registries.get(nm)?.get(r.actor.nid)===r&&nm.match===r.match&&nm.cfg?.id===r.epoch&&
  nm.s?._members?.has(r.from)&&nm.peers?.get(r.from)===r.peer&&nm.byNid?.get(r.actor.nid)===r.actor&&
  r.actor.remote&&r.actor.owner===r.from&&r.actor.alive!==false&&life(r.actor)===r.life&&
  r.bomb._netBorn===r.eventTime&&r.bomb._netBornTick===r.eventTick&&r.bomb._netPeer===r.peer&&
  r.bomb.owner===r.actor&&r.bomb.ghost===true&&!r.bomb.s3Destroyed&&!r.bomb.dead&&
  r.projectiles.bombs.includes(r.bomb);
 if(!ok)retire(r);return ok;
}
export function registerReceiverSprinkler(nm,bomb,receipt,G,notify,maxAge,maxContacts){
 const projectiles=G?.projectiles;
 if(!attachWorld(G)||!bomb||bomb.ghost!==true||bomb.s3GhostResolved?.spec?.id!=='sprinkler'||bomb.owner!==nm.byNid?.get(receipt.nid)||
  !projectiles?.bombs?.includes(bomb)||typeof notify!=='function'||!(maxAge>0)||!(maxContacts>0))return false;
 let registry=registries.get(nm);if(!registry){registry=new Map();registries.set(nm,registry);}
 const actor=bomb.owner;retire(registry.get(actor.nid));const r={nm,G,bomb,actor,from:receipt.from,life:receipt.life,eventTime:receipt.eventTime,eventTick:receipt.eventTick,peer:nm.peers.get(receipt.from),match:nm.match,epoch:nm.cfg.id,projectiles,notify,maxAge,maxContacts,contacts:[],drops:new WeakSet()};
 registry.set(actor.nid,r);devices.set(bomb,r);return live(nm,r);
}
export function receiverSprinklerObserved(nm,bomb){const r=registries.get(nm)?.get(bomb?.owner?.nid);return r?.bomb===bomb&&live(nm,r);}
export function recordReceiverSprinklerContact(nm,bomb,drop,victim,damage,t){
 const r=registries.get(nm)?.get(bomb?.owner?.nid);
 if(r?.bomb!==bomb||!live(nm,r)||!drop||r.drops.has(drop)||victim?.remote||!victim?.alive||victim.owner!==nm.myId||
  nm.byNid?.get(victim.nid)!==victim||victim.team===r.actor.team||damage!==bomb.s3GhostResolved.spec.dropletDamage||!Number.isFinite(t))return false;
 r.drops.add(drop);r.contacts=r.contacts.filter(c=>t-c.at>=0&&t-c.at<=r.maxAge&&c.victim.alive&&life(c.victim)===c.life);
 if(r.contacts.length>=r.maxContacts)return false;
 r.contacts.push({victim,life:life(victim),damage,at:t});
 r.notify.call(nm,r.from);return true;
}
export function receiverSprinklerScope(nm,from,id){const r=registries.get(nm)?.get(id);return r?.from===from&&live(nm,r)?r:null;}
export function consumeReceiverSprinklerContact(nm,from,d,t,scope=null){
 const r=registries.get(nm)?.get(d.a);
 if(scope&&r!==scope)return false;
 if(!live(nm,r)||r.from!==from||d.m!==r.epoch||d.w!=='sprinkler'||!Number.isSafeInteger(d.h)||d.h<1||r.peer.hitSequences?.has(d.h))return false;
 const victim=nm.byNid?.get(d.v);
 if(!victim||victim.remote||victim.owner!==nm.myId||!victim.alive||d.l!==life(victim))return false;
 r.contacts=r.contacts.filter(c=>t-c.at>=0&&t-c.at<=r.maxAge&&c.victim.alive&&life(c.victim)===c.life);
 const i=r.contacts.findIndex(c=>c.victim===victim&&c.life===d.l&&c.damage===d.d);
 if(i<0)return false;r.contacts.splice(i,1);return true;
}
export function closeReceiverSprinklers(nm){for(const r of registries.get(nm)?.values()||[])retire(r);registries.delete(nm);}
