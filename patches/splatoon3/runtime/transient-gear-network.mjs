import { conditionClock } from './conditional-gear-network.mjs';
import { giveDrink, retireDrink, TACTICOOLER_SOURCE } from './support-cooler.mjs';
const TAG='inkwave-transient-gear-v1',MAX_BIRTH=86400,EPS=1e-8;
const sentEffects=new WeakMap();
const MAX_DRINK_SECONDS=TACTICOOLER_SOURCE.powerUpFrames[2]/60, DROP_BUFF_SECONDS=3;
const finite=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max;
const elapsed=m=>Number.isFinite(m?.duration)&&Number.isFinite(m?.time)?Math.max(0,m.duration-m.time):NaN;
const left=(effect,receipt,match)=>effect?Math.max(0,effect.remaining-Math.max(0,conditionClock(match)-receipt.clock)):0;
// Identity and bounded remaining time only. Effective AP is recomputed locally.
export function packTransientGear(net,now){
 if(typeof net?.cfg?.id!=='string'||!net.cfg.id||net.cfg.id.length>128||!net.byNid?.values)return undefined;
 const ownerElapsed=elapsed(net.match);if(!finite(ownerElapsed,MAX_BIRTH))return undefined;
 let emitted=sentEffects.get(net);if(!emitted)sentEffects.set(net,emitted=new WeakSet());
 const out=Object.create(null);let count=0;
 for(const a of net.byNid.values()){
  if(a.remote)continue;
  const s=a.s3,drink=s?.drink&&a.alive?Math.max(0,(s.drinkUntil||0)-now):0;
  const drop=a.alive&&s?.loadout?.[2]?.main==='dropRoller'?s.dropRollerBuffRemaining||0:0;
  // Never-used actors add no traffic. Once sent or inherited, keep explicit
  // cancellation rows so a peer with an older receipt cannot revive an effect.
  if(!(drink>0)&&!(drop>0)&&!emitted.has(a)&&!a.net?._transientGearReceipt)continue;
  emitted.add(a);count++;
  out[a.nid]=[TAG,net.cfg.id,a.nid,a.netLife||0,a._adoptionSequence,ownerElapsed,
   drink>0&&drink<=MAX_DRINK_SECONDS&&finite(s.drinkUntil,MAX_BIRTH)?[s.drinkUntil,drink]:null,
   drop>0&&drop<=DROP_BUFF_SECONDS&&finite(s.dropRollerBuffBornAt,MAX_BIRTH)?[s.dropRollerBuffBornAt,drop]:null];
 }
 return count?out:undefined;
}
export function readTransientGear(row,net,a,state,flags){
 if(!state?.gear||!Array.isArray(row)||row.length!==8||row[0]!==TAG||row[1]!==net.cfg?.id||row[2]!==a.nid||row[3]!==state.life||row[4]!==state.sequence||!finite(row[5],MAX_BIRTH)||!finite(elapsed(net.match),MAX_BIRTH))return null;
 const alive=!!(flags&1),old=a.net?._transientGearReceipt;
 const prior=old?.match===net.match&&old.owner===a.owner&&old.life===state.life?old:null;
 const next={owner:a.owner,life:state.life,sequence:state.sequence,clock:conditionClock(net.match)};
 Object.defineProperty(next,'match',{value:net.match});
 for(const [key,index,max] of [['drink',6,MAX_DRINK_SECONDS],['drop',7,DROP_BUFF_SECONDS]]){
  const p=row[index],high=prior?.[key+'Birth']??-1;
  if(p===null){next[key]=null;next[key+'Birth']=high;continue;}
  if(!alive||!Array.isArray(p)||p.length!==2||!finite(p[0],MAX_BIRTH)||!finite(p[1],max)||p[1]<=0||key==='drop'&&state.gear.loadout[2].main!=='dropRoller'||p[0]<high)return null;
  // Same match-clock comparison as conditional gear: a receiver ahead of
  // the sender consumes that known elapsed interval; a lagging clock grants no extra time.
  let remaining=Math.max(0,p[1]-Math.max(0,elapsed(net.match)-row[5]));
  if(p[0]===high){if(!prior[key])return null;remaining=Math.min(remaining,left(prior[key],prior,net.match));}
  next[key]=Object.freeze({birth:p[0],remaining});next[key+'Birth']=p[0];
 }
 const receipt=Object.freeze(next);a.net._transientGearReceipt=receipt;return receipt;
}
export function restoreAdoptedTransientGear(a,transfer,net,now){
 const state=transfer?.latest,r=state?.transientGear||a.net?._transientGearReceipt;
 if(!state?.gear||!r||r.match!==net.match||r.life!==state.life||r.life!==a.net?.lastLife||a.remote||!a.alive||!(transfer.snapshot?.f&1)||!Number.isFinite(now))return false;
 const special=a.special;retireDrink(a,now,true);
 a.s3.dropRollerBuffRemaining=0;delete a.s3.dropRollerBuffBornAt;
 const drink=left(r.drink,r,net.match),drop=left(r.drop,r,net.match);
 if(drink>EPS)giveDrink(a,now,drink);
 if(drop>EPS&&a.s3.loadout?.[2]?.main==='dropRoller'){
  a.s3.dropRollerBuffRemaining=drop;a.s3.dropRollerBuffBornAt=now;
 }
 a.s3RefreshGear();a.special=special;return true;
}
