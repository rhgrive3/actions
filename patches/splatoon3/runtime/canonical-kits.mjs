import {CANONICAL_KITS} from './canonical-kits-data.mjs';
// Validate the shipped registries after all sub/special installers have run.
export function validateCanonicalKits({WEAPONS,SUB,SPECIALS}){
 for(const [id,k]of Object.entries(CANONICAL_KITS)){
  const w=WEAPONS[id];
  if(!w||w.sub!==k.sub||w.special!==k.special||w.specialCost!==k.specialCost||!SUB[k.sub]||!SPECIALS[k.special])throw Error('Canonical kit registration mismatch: '+id);
  if(w.blurb)w.blurb=w.blurb.replace('Original INKWAVE kit (not a verified Splatoon 3 kit).','').trim();
  Object.assign(w,{kitStatus:'verified-base-kit',kitReference:k.main,kitVerifiedSlots:['sub','special'],kitMissingSlots:{}});
 }
}
// Bot input policy is intentionally INKWAVE AI, not a claim about retail AI.
// It drives the SAME admitted Actor inputs rather than granting free effects.
export function driveCanonicalBotSpecial(actor,intent,dt,target){
 if(!actor?.alive||actor.remote||!Number.isFinite(dt)||dt<=0)return;
 const special=actor.weapon?.special;
 const range={ultraStamp:12,zipcaster:28,crabTank:30,reefslider:20,tentaMissiles:60,inkjet:30,booyahBomb:35,killerWail:60,tripleInkstrike:40,tacticooler:20,waveBreaker:22,superChump:40,krakenRoyale:15,splattercolorScreen:30,tripleSplashdown:9}[special];
 if(!range)return; // Mature native Trizooka/Bubbler/Vac/Storm owners remain.
 if(!actor.specialActive){actor.s3KitBotTime=0;if(target?.alive&&target.team!==actor.team&&actor.pos.distanceTo(target.pos)<=range&&actor.specialReady?.())intent.special=true;return;}
 const t=actor.s3KitBotTime=(actor.s3KitBotTime||0)+dt;
 const pulse=Math.floor(t*4)%2===0;
 intent.squid=false;
 if(special==='booyahBomb'){intent.booyah=pulse;intent.fire=false;intent.sub=t>2.2&&pulse;}
 else if(special==='zipcaster'){intent.fire=true;intent.sub=pulse;}
 else if(special==='crabTank'){intent.fire=true;intent.sub=pulse;}
 else if(special==='ultraStamp'){intent.fire=true;intent.sub=false;}
 else if(special==='inkjet'){intent.fire=true;intent.sub=false;}
 else if(special==='tentaMissiles'){intent.fire=t>.5&&pulse;intent.sub=false;}
 else if(special==='reefslider'){intent.fire=t>.8&&pulse;intent.sub=false;}
 else if(special==='krakenRoyale'){intent.fire=true;intent.jump=pulse;}
 else if(special!=='killerWail'){intent.fire=pulse;intent.sub=false;}
}
