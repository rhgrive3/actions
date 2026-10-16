import { KIT_AUDIO, SUB_AUDIO_IDS, SPECIAL_AUDIO_IDS } from './kit-recipes.mjs';
const pos3=p=>Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:p;
const eventOfAction=Object.freeze({activate:'open',end:'release',return:'release',shot:'fire',cannon:'fire',launch:'fire',throw:'fire',
 impact:'explosion',block:'shield_hit',swing:'impact',jumpSwing:'impact',zip:'dodge',hookImpact:'impact',jump:'impact',
 marker:'ready',balloon:'fire',screen:'open',device:'open',laser:'fire',pulse:'impact',cross:'impact',cheer:'ready'});
// Event names are gameplay actions; the real MP3 manifest uses articulation
// names. Do not play an unrelated sound when the proper sample is absent.
export function specialActionAudioEvent(id,action){
 if(id==='crabTank'&&action==='cannon')return 'fire_alt'; // actual cannon, not short gun
 if(id==='zipcaster'&&action==='zip')return 'fire'; // recorded hook-launch shot, not absent dodge
 if(id==='ultraStamp'&&action==='swing')return 'fire'; // regular stamp swing
 if(id==='ultraStamp'&&action==='jumpSwing')return 'impact'; // heavy swing
 if(id==='tripleInkstrike'&&action==='marker')return 'fire'; // throw/launch marker
 return eventOfAction[action]||null;
}
export function installKitAudio(api,{listen,options}){
 const {G,Actor,Projectiles}=api,active=new Map(),recent=new WeakMap();
 function sound(a,kind,id,event,pos,volume=.7){
   if(!a||!KIT_AUDIO[kind+':'+id]?.events.includes(event))return;
   const isAlly=a!==G.local&&a.team===G.local?.team, relation=isAlly&&kind==='special'?.7:1;
   const o=options(a,pos3(pos)||a.pos,volume*relation);if(event==='impact'||event==='explosion')o.pos=pos3(pos)||a.pos;
   o.priority=kind==='special'?76:60;return G.audio?.playWeapon?.(kind+':'+id,event,o);
 }
 function activation(a,id){if(!a||!SPECIAL_AUDIO_IDS.includes(id))return;
   const now=G.time||0,last=recent.get(a);if(last?.id===id&&Math.abs(now-last.at)<.075)return;
   recent.set(a,{id,at:now});sound(a,'special',id,'open',a.pos,.82);
   if(a.isLocal)G.audio?.duck?.(.25,.38);
 }
 listen('special:use',e=>activation(e?.actor,e?.id||e?.actor?.weapon?.special));
 const specialEvent=e=>{if(!e)return;if(e.action==='activate'){activation(e.actor,e.id);return;}
   const event=specialActionAudioEvent(e.id,e.action);
   if(event)sound(e.actor,'special',e.id,event,e.pos,.64);
 };
 listen('all:special',specialEvent);
 listen('audio:special-replay',specialEvent);
 const phase={spawn:'fire',deploy:'open',burst:'explosion',bounce:'impact',fizzyHop:'ready',destroy:'break'};
 const subEvent=e=>{if(phase[e?.phase])sound(e.actor,'sub',e.subId,phase[e.phase],{x:e.x,y:e.y,z:e.z},.68);};
 listen('all:sub',subEvent);listen('audio:sub-replay',subEvent);
 // Five native bomb families (including Autobomb / Sprinkler) share this lifecycle.
 for(const [ev,event] of [['bomb:throw','fire'],['bomb:explode','explosion'],['bomb:arm','impact']])listen(ev,e=>{
   const id=e?.subId||e?.actor?.weapon?.sub||'bomb';if(['bomb','suction','curling','autobomb','sprinkler'].includes(id))sound(e.actor,'sub',id,event,e.pos,.68);
 });
 listen('kit:bubbler:deploy',e=>activation(e?.actor||e?.owner,'bubbler'));
 listen('special:slam',e=>sound(e?.actor,'special','slam','explosion',e?.pos,.9));
 listen('special:inkvac-release',e=>sound(e?.actor,'special','inkVac','fire',e?.actor?.pos,.8));
 listen('special:inkvac-absorb',e=>sound(e?.actor,'special','inkVac','impact',e?.actor?.pos,.42));
 for(const [ev,event] of [['ignite','ready'],['hit','shield_hit'],['collapse','break'],['remote:ignite','ready'],['remote:gone','break']]){
   listen('kit:bubbler:'+ev,e=>sound(e?.actor||e?.owner,'special','bubbler',event,e?.pos,.66));
 }
 // The existing support module has no public Point Sensor throw event. Observe admission,
 // not the input edge, so failed throws stay silent and do not mutate resource accounting.
 const throwBomb=Projectiles.prototype.throwBomb;
 Projectiles.prototype.throwBomb=function(a,...args){const n=this._s3SupportSensors?.length||0;const result=throwBomb.call(this,a,...args);
   if(a?.weapon?.sub==='pointSensor'&&(this._s3SupportSensors?.length||0)>n)sound(a,'sub','pointSensor','fire',a.pos,.68);return result;};
 const start=Actor.prototype._startSpecial;
 Actor.prototype._startSpecial=function(...args){const before=this.stats?.specials||0,id=this.weapon?.special;const r=start.apply(this,args);
   if((this.stats?.specials||0)>before)activation(this,id);return r;};
 // Observe actual native Trizooka projectile admission, not trigger edges.
 const push=Projectiles.prototype._push,burst=Projectiles.prototype._blastBurst,trizookaFire=new WeakMap();
 Projectiles.prototype._push=function(p,...args){const result=push.call(this,p,...args);
   if(p?.wid==='trizooka'&&p.owner){const now=G.time||0,last=trizookaFire.get(p.owner);
     if(last===undefined||Math.abs(now-last)>.025){trizookaFire.set(p.owner,now);sound(p.owner,'special','trizooka','fire',p.pos,.8);}}
   return result;};
 Projectiles.prototype._blastBurst=function(p,point,...args){const result=burst.call(this,p,point,...args);
   if(p?.wid==='trizooka')sound(p.owner,'special','trizooka','explosion',point,.72);return result;};
 const stopAll=()=>{for(const r of active.values())r.handle?.stop(.04);active.clear();};
 listen('match:state',e=>{if(e?.state!=='playing')stopAll();});
 const stopActor=a=>{active.get(a)?.handle?.stop(.04);active.delete(a);};
 listen('actor:removed',e=>stopActor(e?.actor||e));
 // Disposal does not emit a state transition or actor:removed for each actor.
 // Release only this match: a late old owner must not stop its replacement.
 listen('match:dispose',e=>{for(const a of e?.match?.actors||[])stopActor(a);});
 // Continuous power beds use one handle per active actor, never one per frame.
 const update=Actor.prototype._updateSpecial;
 Actor.prototype._updateSpecial=function(dt,...args){const result=update.call(this,dt,...args),id=this.specialActive?.id;
   const loopEvent=id==='inkVac'?'charge':['inkjet','crabTank','krakenRoyale','storm','killerWail','booyahBomb'].includes(id)?'spin':null;
   let row=active.get(this);
   // A deferred real loop may fail while the special remains active. Retire
   // the failed handle so the next update can retry after loader backoff.
   if(row&&(row.id!==id||!this.alive||!loopEvent||!row.handle?.playing)){
     row.handle?.stop(.1);active.delete(this);row=null;
   }
   if(loopEvent&&this.alive&&KIT_AUDIO['special:'+id]){
     if(!row){row={id,handle:G.audio?.loopWeapon?.('special:'+id,loopEvent,{...options(this,this.pos,.25),pitch:.85})};if(row.handle)active.set(this,row);}
     row?.handle?.set({pos:this.isLocal?undefined:this.pos,volume:.25});
   }return result;};
 listen('splatted',e=>stopActor(e?.victim));
 return {subCount:SUB_AUDIO_IDS.length,specialCount:SPECIAL_AUDIO_IDS.length,dispose(){stopAll();}};
}
