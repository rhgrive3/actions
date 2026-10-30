// Final build-only installation, after all ranked/network/reliability overlays.
// Derive the pre-queue predicate from the FINAL native payload guards, including
// Blaster's bounded knockback refinement. Never copy an intermediate policy or
// replace native guard anchors consumed by preceding composition adapters.
export function adaptCombatProvenance(rel,code){
  if(rel==='src/game/weapons.js'){
    // Pure native birth decoding and motion for the receiver's crablet gate.
    // The live ghost list, Actor state, RNG, FX, paint and damage stay untouched.
    return "import { advanceInkFrame as iwCrabletInkStep, INK_LENGTH_SCALE as iwCrabletInkScale } from './inkFlight.js';\n"
      +"import { fidelityWorldCollisionRadius as iwCrabletFieldRadius } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n"
      +"import { sweptWorldHit as iwCrabletWorldSweep } from '../../patches/splatoon3/runtime/weapons-collision.mjs';\n"
      +code+`
Projectiles.prototype.crabletCombatBirthId=function(event){
  const e=this.prepareFidelityProjectilePacket?.(event);if(!e)return undefined;
  const offset=(e[27]===null||typeof e[27]==='object'?1:0)+([35,36,37].includes(e.length)?2:0);
  const id=e[29+offset];return Number.isSafeInteger(id)&&id>0?id:undefined;
};
Projectiles.prototype.makeCrabletCombatProbe=function(actor,event){
  const e=this.prepareFidelityProjectilePacket?.(event);
  if(!e||typeof this.restoreCrabletFidelityProbe!=='function'||
    typeof this.restoreCrabletCatalogProbe!=='function')return null;
  const p={type:e[3],wid:e[4],owner:actor,team:actor.team,age:0,delay:e[11],life:e[12],
    straight:e[13],radius:e[14],size:e[15],grav:e[16],drag:e[17],ghost:true,seed:0,
    combatProjectileId:this.crabletCombatBirthId(e),fieldRadius:0,fidelityMode:null,fidelityPhase:0,fidelityPlayerCollision:null,
    fidelityFieldCollision:null,catalog:null,inkProfile:null,
    pos:new THREE.Vector3(e[5],e[6],e[7]),prev:new THREE.Vector3(e[5],e[6],e[7]),
    start:new THREE.Vector3(e[5],e[6],e[7]),vel:new THREE.Vector3(e[8],e[9],e[10])};
  this.inkFlight.restore(p,e[27]);
  this.restoreCrabletFidelityProbe(p,actor);
  return this.restoreCrabletCatalogProbe(p,actor,event);
};
Projectiles.prototype.stepCrabletCombatProbe=function(p){
  if(p.catalog)return this.stepCrabletCatalogProbe(p);
  if(p.inkProfile){
    p.prev.copy(p.pos);iwCrabletInkStep(p,p.inkProfile);
    const field=p.inkProfile.collision.field*iwCrabletInkScale;
    return {field0:field,field1:field,pad:p.inkPlayerRadius*.6,done:p.pos.y<PLAYER.waterY-1.8};
  }
  const field0=iwCrabletFieldRadius(p);
  advanceFidelityProjectile(p,1/60);
  return {field0,field1:iwCrabletFieldRadius(p),pad:p.size*.6,done:p.pos.y<PLAYER.waterY-1.8};
};
Projectiles.prototype.worldCrabletCombatProbe=function(from,to,r0,r1){
  const hit=this._crabletWorldProbe||(this._crabletWorldProbe=new Hit());
  return iwCrabletWorldSweep(G.physics,from,to,r0,r1,hit,true);
};
`;
  }
  if(rel!=='src/net/netmatch.js')return code;
  if(code.includes('installCombatProvenance(NetMatch'))throw Error('combat provenance installed twice');
  const start="    const blastKnockback = d.w === 'blaster' && validBlasterKnockback(d.kb);";
  const end="    if (Object.hasOwn(IW_CATALOGUE_SUB_HIT_MAX,d.w) && d.d > IW_CATALOGUE_SUB_HIT_MAX[d.w]) return;";
  const a=code.indexOf(start),b=code.indexOf(end);
  if(a<0||b<a||code.indexOf(start,a+1)>=0||code.indexOf(end,b+1)>=0)throw Error('combat provenance native payload guard identity mismatch');
  const guard=code.slice(a,b+end.length);
  if((guard.match(/return;/g)||[]).length!==5||!guard.includes('IW_HIT_MAX_DAMAGE')||!guard.includes('IW_HIT_CAUSES')||!guard.includes('IW_ANGLE_SHOOTER_HIT_MAX'))throw Error('combat provenance native payload guard shape mismatch');
  const hitStart='  _hit(d, from) {', hitEnd='    this._applyingHit = true;';
  const hs=code.indexOf(hitStart), he=code.indexOf(hitEnd,hs);
  if(hs<0||he<hs||code.indexOf(hitStart,hs+1)>=0)throw Error('combat provenance native receipt guard identity mismatch');
  let receipt=code.slice(hs+hitStart.length,he);
  const replacements=[
    // A genuine hit may precede the first owner tick. Native admission would
    // create an empty peer here; model that default without allocating state.
    ["    const hitPeer = this._peer(from ?? atk.owner);","    const hitPeer = this.peers?.get(from ?? atk.owner) || {};"],
    ["    const seenHits = hitPeer.hitSequences || (hitPeer.hitSequences = new Set());","    const seenHits = hitPeer.hitSequences;"],
    ["seenHits.has(d.h)","seenHits?.has(d.h)"],
    ["    const hitSlots = hitPeer.hitSequenceSlots || (hitPeer.hitSequenceSlots = new Map());",""]
  ];
  for(const [before,after] of replacements){if(receipt.split(before).length!==2)throw Error('combat provenance receipt read-only anchor mismatch');receipt=receipt.replace(before,after);}
  const mutStart='    const slot = d.h % HIT_SEQUENCE_WINDOW;',mutEnd='    hitPeer.lastHit = nextHighHit;';
  const ms=receipt.indexOf(mutStart),me=receipt.indexOf(mutEnd);
  if(ms<0||me<ms||receipt.indexOf(mutStart,ms+1)>=0||receipt.indexOf(mutEnd,me+1)>=0)throw Error('combat provenance receipt mutation identity mismatch');
  const mutations=receipt.slice(ms,me+mutEnd.length);
  const expectedMutations='    const slot = d.h % HIT_SEQUENCE_WINDOW;\n    const previous = hitSlots.get(slot);\n    if (previous !== undefined) seenHits.delete(previous);\n    hitSlots.set(slot, d.h);\n    seenHits.add(d.h);\n    hitPeer.lastHit = nextHighHit;';
  if(mutations!==expectedMutations)throw Error('combat provenance receipt mutation shape mismatch');
  receipt=receipt.slice(0,ms)+receipt.slice(me+mutEnd.length);
  if(!receipt.includes('nextHighHit - HIT_SEQUENCE_WINDOW')||!receipt.includes('hitSafe(hitRevision)'))throw Error('combat provenance receipt policy shape mismatch');
  const receiptPredicate='\nfunction iwRemoteHitReceiptAllowed(d,from) {\n  if (!d) return false;\n'+receipt.replaceAll('return;','return false;')+'\n  return true;\n}\n';
  // Boss proofs have the same transaction boundary: native life/nonce/value
  // rejection must precede spending a bounded shot or contact capability.
  // Derive the policy from the final native method; only its peer allocation
  // and successful nonce commit are omitted from this read-only preflight.
  const bossStart='  _acceptBossHit(from, d) {',bossEnd='\n  sendBossHit(';
  const bs=code.indexOf(bossStart),be=code.indexOf(bossEnd,bs);
  if(bs<0||be<bs||code.indexOf(bossStart,bs+1)>=0)throw Error('combat provenance Boss receipt identity mismatch');
  let bossReceipt=code.slice(bs+bossStart.length,be);
  const bossTail='    return true;\n  }\n';
  if(!bossReceipt.endsWith(bossTail))throw Error('combat provenance Boss receipt tail mismatch');
  bossReceipt=bossReceipt.slice(0,-bossTail.length);
  for(const [before,after] of [
    ['    const peer = this._peer(from);','    const peer = this.peers?.get(from);'],
    ['    if (d.q <= (peer.lastBossHit ?? 0)) return false;','    if (d.q <= (peer?.lastBossHit ?? 0)) return false;'],
    ['    peer.lastBossHit = d.q;\n','']
  ]){
    if(bossReceipt.split(before).length!==2)throw Error('combat provenance Boss read-only receipt anchor mismatch');
    bossReceipt=bossReceipt.replace(before,after);
  }
  const bossReceiptPredicate='\nfunction iwRemoteBossHitReceiptAllowed(d,from) {\n  if (!d) return false;\n'+bossReceipt+'\n  return true;\n}\n';
  const predicate='\nfunction iwRemoteHitPayloadAllowed(d) {\n  if (!d) return false;\n'+guard.replaceAll('return;','return false;')+'\n  return true;\n}\n';
  return "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';\n"
    +code+predicate+receiptPredicate+bossReceiptPredicate+"\ninstallCombatProvenance(NetMatch,{G,THREE,hitPayloadAllowed:iwRemoteHitPayloadAllowed,hitReceiptAllowed:iwRemoteHitReceiptAllowed,bossReceiptAllowed:iwRemoteBossHitReceiptAllowed});\n";
}
