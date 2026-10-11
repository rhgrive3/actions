const TAG='inkwave-gear-clocks-v1';
// Transport safety envelope, not a claimed retail match/ability duration.
const MAX_CLOCK=86400, MAX_CREDITS=65535, EPS=1e-8;
let cfg=null;
// Receiver-local active simulation time. Host clock corrections may move match.time
// backwards; they must not refund elapsed ability time. NetMatch.update runs once
// per rendered frame, before Match physics substeps, and also observes pause.
const simulationClocks=new WeakMap();
export function conditionClock(match){return match&&simulationClocks.get(match)||0;}
export function advanceConditionalClock(match,dt){
 if(!match||match.state!=='playing'||match.paused||match.attract||!Number.isFinite(dt)||dt<=0)return;
 simulationClocks.set(match,conditionClock(match)+dt);
}
export function openingRemaining(state,match,tuning=cfg){
 // Installation configures this before Actor gear refresh; fail closed during partial initialization.
 if(!tuning)return 0;
 return Math.max(0,state.networkOpeningEnd==null?(state.openingEnd??tuning.openingDuration)-elapsed(match):state.networkOpeningEnd-conditionClock(match));
}
export function configureConditionalGearNetwork(value){cfg=value;}
const elapsed=match=>Number.isFinite(match?.duration)&&Number.isFinite(match?.time)?Math.max(0,match.duration-match.time):NaN;
const bounded=(x,max)=>Number.isFinite(x)&&x>=0&&x<=max;
const age=(receipt,match)=>Math.max(0,conditionClock(match)-receipt.receivedClock);
export function packConditionalGear(match){
 if(!cfg)return undefined;const result=Object.create(null),now=elapsed(match.match);
 if(!bounded(now,MAX_CLOCK))return undefined;
 for(const a of match.byNid.values()){
  const s=a.s3?.conditionalGear,head=a.s3?.loadout?.[0]?.main;
  if(a.remote||s?.match!==match.match||!['comeback','openingGambit'].includes(head))continue;
  result[a.nid]=[TAG,match.cfg.id,a.nid,a.netLife||0,a._adoptionSequence,now,
   head==='comeback'?s.comeback:0,head==='comeback'&&s.enemyDeath===true,
   head==='openingGambit'?(s.openingCredits||0):0,
   head==='openingGambit'?Math.min(openingRemaining(s,match.match),Math.max(0,cfg.openingDuration+(s.openingCredits||0)*cfg.openingExtension-now)):0];
 }
 return result;
}
export function readConditionalGear(row,match,actor,state,flags){
 const head=state?.gear?.loadout?.[0]?.main,now=elapsed(match.match),alive=!!(flags&1);
 if(!cfg||!['comeback','openingGambit'].includes(head)||!Array.isArray(row)||row.length!==10||row[0]!==TAG||row[1]!==match.cfg.id||row[2]!==actor.nid||row[3]!==state.life||row[4]!==state.sequence||!bounded(now,MAX_CLOCK))return null;
 const[,,,,,ownerElapsed,comeback,enemyDeath,credits,opening]=row;
 if(!bounded(ownerElapsed,MAX_CLOCK)||!bounded(comeback,cfg.comebackDuration)||typeof enemyDeath!=='boolean'||!Number.isSafeInteger(credits)||credits<0||credits>MAX_CREDITS||!bounded(opening,MAX_CLOCK)||
  comeback>0&&!alive||enemyDeath&&alive||
  head==='comeback'&&(credits!==0||opening!==0)||head==='openingGambit'&&(comeback!==0||enemyDeath)||
  opening>Math.max(0,cfg.openingDuration+credits*cfg.openingExtension-ownerElapsed)+EPS)return null;
 // Never give a receiver extra time merely because its match clock is behind.
 let leftComeback=Math.min(comeback,Math.max(0,ownerElapsed+comeback-now));
 let leftOpening=Math.min(opening,Math.max(0,ownerElapsed+opening-now));
 const previous=actor.net?._gearConditionReceipt;
 if(previous?.matchId===match.cfg.id&&previous.localMatch===match.match&&previous.head===head){
  if(head==='comeback'&&previous.life===state.life)leftComeback=Math.min(leftComeback,Math.max(0,previous.comeback-age(previous,match.match)));
  if(head==='openingGambit'){
   if(credits<previous.credits)return null;
   leftOpening=Math.min(leftOpening,Math.max(0,previous.opening-age(previous,match.match))+(credits-previous.credits)*cfg.openingExtension);
  }
 }
 const receipt={matchId:match.cfg.id,head,life:state.life,sequence:state.sequence,receivedElapsed:now,receivedClock:conditionClock(match.match),comeback:leftComeback,enemyDeath,credits,opening:leftOpening};
 Object.defineProperty(receipt,'localMatch',{value:match.match});Object.freeze(receipt);
 actor.net._gearConditionReceipt=receipt;return receipt;
}
export function applyConditionalGear(actor,state,match){
 const r=state?.condition||actor.net?._gearConditionReceipt,now=elapsed(match);
 if(!cfg||!actor.s3||!bounded(now,MAX_CLOCK))return false;
 if(!r||r.localMatch!==match||r.life!==actor.net?.lastLife||r.head!==actor.s3.loadout?.[0]?.main){
  // A new life or legacy/malformed sidecar cannot keep a previous life buff.
  // Same-life missing sidecars use the prior immutable receipt above, continuing
  // to age it rather than freezing the last rendered numeric remainder.
  const current=actor.s3.conditionalGear;
  if(actor.s3.loadout?.[0]?.main==='comeback'&&current?.match===match){
   current.comeback=0;current.enemyDeath=false;
   const points=actor.special;actor.s3RefreshGear();actor.special=points;
  }
  return false;
 }
 // Reapplying the same interpolated snapshot cannot restart its deadline.
 const remainingAge=age(r,match),old=actor.s3.conditionalGear;
 const s=old?.match===match?old:{match,openingEnd:cfg.openingDuration,openingCredits:0,comeback:0,enemyDeath:false};
 if(r.head==='comeback') {s.comeback=actor.alive?Math.max(0,r.comeback-remainingAge):0;s.enemyDeath=!actor.alive&&r.enemyDeath;}
 else {s.openingCredits=r.credits;s.openingEnd=now+Math.max(0,r.opening-remainingAge);s.networkOpeningEnd=conditionClock(match)+Math.max(0,r.opening-remainingAge);}
 actor.s3.conditionalGear=s;const points=actor.special;actor.s3RefreshGear();actor.special=points;return true;
}

export function applyReceivedDeathCondition(actor,match){return applyConditionalGear(actor,{condition:actor.net?._gearConditionReceipt},match);}
