// Match-scoped transitions, independent of final-killer/assist credit.
const states=new WeakMap(),hudStates=new WeakMap();
function valid(m){return m?.mode==='turf'&&!m.attract&&Array.isArray(m.actors);}
export function resetTeamWipes(m){states.delete(m);sampleTeamWipes(m,()=>{});}
export function rearmTeamWipe(m,actor){if(!valid(m)||!actor?.alive||!m.actors.includes(actor))return;const s=states.get(m);if(s&&(actor.team===0||actor.team===1))s.armed[actor.team]=true;}
export function sampleTeamWipes(m,emit){
 if(!valid(m)){if(m)states.delete(m);return;}
 let n0=0,n1=0,a0=0,a1=0;
 for(const a of m.actors){if(a.team===0){n0++;if(a.alive)a0++;}else if(a.team===1){n1++;if(a.alive)a1++;}}
 // This contract is ordinary4v4 only, not Tricolor, Boss or partial test rosters.
 if(n0!==4||n1!==4){states.delete(m);return;}
 let s=states.get(m);if(!s){s={armed:[a0>0,a1>0],serial:0};states.set(m,s);}
 for(let team=0;team<2;team++){
  const alive=team===0?a0:a1;
  if(alive>0){s.armed[team]=true;continue;}
  if(s.armed[team]&&m.state==='playing'&&!m.paused&&m.time>0){s.armed[team]=false;emit('team:wipeout',{match:m,team,sequence:++s.serial});}
  else if(m.state!=='playing')s.armed[team]=false;
 }
}
export function clearTeamWipes(m){states.delete(m);}
export function resetTeamWipeHud(hud){hudStates.delete(hud);}
export function queueTeamWipeHud(hud,event,current){
 if(event?.match!==current||!valid(current)||current.state!=='playing'||(event.team!==0&&event.team!==1)||!Number.isSafeInteger(event.sequence)||event.sequence<1)return;
 let s=hudStates.get(hud);if(!s||s.match!==current){s={match:current,last:[0,0],pending:0};hudStates.set(hud,s);}
 if(event.sequence<=s.last[event.team])return;s.last[event.team]=event.sequence;s.pending|=1<<event.team;
}
export function flushTeamWipeHud(hud,current,tr=x=>x){
 const s=hudStates.get(hud);if(!s?.pending)return;
 if(s.match!==current||!valid(current)||current.state!=='playing'||!hud._live()){hudStates.delete(hud);return;}
 if(current.paused)return;
 const me=hud._local();if(!me||(me.team!==0&&me.team!==1))return;
 // Both teams can drop in one simulation tick. Own-team danger has priority;
 // the event producer still reports both transitions for independent consumers.
 const own=!!(s.pending&(1<<me.team));s.pending=0;
 hud._callout('WIPEOUT!!!',tr(own?'Your whole team is splatted':'The whole team is splatted'),true,own?'defeat_jingle':'special_ready');
 const el=hud.callouts.lastElementChild||hud.callouts.children?.[hud.callouts.children.length-1];
 el?.classList.add(own?'is-own-wipeout':'is-enemy-wipeout');
}
