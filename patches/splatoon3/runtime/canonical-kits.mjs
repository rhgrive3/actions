import {CANONICAL_KITS} from './canonical-kits-data.mjs';
import {createBotSpecialContext,prepareBotSpecialFrame,createBotSpecialFrame,completeBotSpecialContext} from './bot-special-context.mjs';
import {driveMeleeSpecial} from './bot-special-melee.mjs';
import {driveRangedSpecial} from './bot-special-ranged.mjs';
import {driveSupportSpecial} from './bot-special-support.mjs';
export {resetBotSpecialMemory} from './bot-special-context.mjs';
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
// BotBrain's shared tail only reads perception after `handled` becomes true.
// Its explicit opt-in can skip inactive perception; other callers keep the
// complete public context, including current LOS and action helpers.
export function driveCanonicalBotSpecial(actor,intent,dt,target,options={},deferInactiveContext=false){
 let ctx=null,frame=null;
 if(deferInactiveContext){frame=prepareBotSpecialFrame(actor,intent,dt);if(!frame)return null;}
 else {ctx=createBotSpecialContext(actor,intent,dt,target,options);if(!ctx)return null;}
 // Activation has one owner in every mode. A native painting/duel decision
 // must not bypass the category's range, terrain, recognition or team checks.
 intent.special=false;
 // Rainmaker owns its carrier's weapon and Actor suppresses specials there.
 // Skip preparation too, so a full meter cannot redirect the carrier's shot.
 const match=(deferInactiveContext?options.world:ctx.world)?.match;
 const actorId=String(actor.nid??`${actor.team}:${actor.slot}`);
 if(match?.mode==='rainmaker'&&match.ranked?.rule?.state?.carrier===actorId)return ctx;
 // An uncharged bot still uses its ordinary main weapon. Avoid both the
 // category's preparation aim and its more expensive trajectory probes.
 if(!(frame||ctx).state&&!actor.specialReady?.())return ctx;
 if(deferInactiveContext){
  ctx=createBotSpecialFrame(actor,intent,dt,options,frame);
  completeBotSpecialContext(ctx,target,options);
 }
 if(ctx.state){
  intent.fire=intent.sub=intent.jump=intent.squid=intent.booyah=false;
  if(ctx.brain)ctx.brain._bombAim=ctx.brain._releaseBomb=false;
 }
 ctx.handled=driveMeleeSpecial(ctx)||driveRangedSpecial(ctx)||driveSupportSpecial(ctx);
 // The original story-mode slam is outside the 19 competitive specials.
 // Retain its short-range admission through the same perception gate.
 if(!ctx.handled&&ctx.special==='slam'){
  ctx.handled=true;
  if(!ctx.state&&ctx.visible&&ctx.distance<4.5&&Math.abs(ctx.height)<2&&actor.specialReady?.())intent.special=true;
 }
 return ctx;
}
