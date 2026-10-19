// Host-side admission of client-owned Rainmaker shield hits.
// A raw rkhit is only a *proposal*: it cannot change the objective until the
// host also sees a matching, bounded shot birth on that owner's actor timeline.
// The host derives the source kind and damage ceiling from its own loadout.
const RECEIPT_SECONDS = 1.4;
const PENDING_SECONDS = 0.65;
const MAX_SHOTS = 64;
const MAX_PENDING = 24;
const isVec = p => Array.isArray(p) && p.length === 3 && p.every(n => Number.isFinite(n) && Math.abs(n) < 2000);
const id = a => String(a?.nid ?? `${a?.team}:${a?.slot}`);
const point = p => p && [p.x,p.y,p.z];
const length = a => Math.hypot(a[0],a[1],a[2]);
const delta = (a,b) => a.map((n,i)=>n-b[i]);
const distance = (a,b) => length(delta(a,b));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const weaponOf = a => a?.weapon && typeof a.weapon === 'object' ? a.weapon : null;
const cap = (weapon,kind) => {
  if (kind === 'bomb') return 240;
  // Catalog weapons may expose damage under a family-specific property; do
  // not accept the old arbitrary 2000 damage ceiling as a fallback.
  const values = [
    weapon.damage,weapon.damageMax,weapon.maxDamage,
    weapon.rollDamage,weapon.flickDamage,weapon.flickDamageMax,
    weapon.splashDamage,weapon.splashDamageMax,
    weapon.fullDamage,weapon.fullChargeDamage,weapon.chargeDamageMax
  ].filter(n => Number.isFinite(n) && n > 0);
  // The trusted weapon's own damage, not an arbitrary 120-point floor,
  // limits a remote claimed hit. Some alternate actions expose no scalar here;
  // their admission requires a separate source-backed rule before widening it.
  return Math.min(300,(values.length ? Math.max(...values) : 80)*1.25);
};
function plausiblePath(origin, velocity, shield, reach, tolerance=3) {
  if (!isVec(origin) || !isVec(velocity) || !isVec(shield)) return false;
  const speed=length(velocity);
  if (!(speed>0.05) || speed>600 || !Number.isFinite(reach) || reach<=0) return false;
  const direction=velocity.map(n=>n/speed), toShield=delta(shield,origin);
  const projected=dot(toShield,direction);
  if (projected < -2 || projected > reach+2) return false;
  const closest=origin.map((n,i)=>n+direction[i]*Math.max(0,Math.min(reach,projected)));
  return distance(closest,shield)<=tolerance;
}
function shotFromEvent(e, actor, shield) {
  if (!Array.isArray(e) || !Number.isFinite(e[0])) return null;
  const weapon=weaponOf(actor);
  if (!weapon || typeof weapon.id !== 'string') return null;
  const base=point(actor.pos);
  if (!isVec(base)) return null;
  const reach=Math.min(80, Math.max(8,Number.isFinite(weapon.range) ? weapon.range+6 : 30));
  let origin, velocity, kind=weapon.kind || weapon.id, damageCap;
  if (e[1]==='p' && id(actor)===String(e[2])) {
    // [time,'p',ownerId,type,weaponId,x,y,z,vx,vy,vz,...]
    if (e[4] && e[4]!==weapon.id) return null;
    origin=e.slice(5,8);velocity=e.slice(8,11);
    if (!isVec(origin) || !isVec(velocity) || distance(origin,base)>6) return null;
    if (!plausiblePath(origin,velocity,shield,reach,4.0)) return null;
    damageCap=cap(weapon,kind);
  } else if (e[1]==='b' && id(actor)===String(e[2]) && e[3]==='bomb') {
    // A grenade can arc/bounce after leaving its owner; enforce its reachable
    // area and corroborate the source with the host-owned equipped sub weapon.
    if (weapon.sub!=='bomb') return null;
    origin=e.slice(4,7);velocity=e.slice(7,10);kind='bomb';
    if (!isVec(origin) || !isVec(velocity) || distance(origin,base)>6 || distance(origin,shield)>22) return null;
    damageCap=cap(weapon,kind);
  } else if (e[1]==='ev' && e[2]==='weapon:fire' && e[3]?.actor?.n != null
             && String(e[3].actor.n)===id(actor) && weapon.kind==='charger') {
    // Charger's beam is a single firing event, not necessarily a blob birth.
    const ev=e[3];
    if (ev.weapon!==weapon.id) return null;
    origin=ev.muzzle;velocity=ev.dir;
    if (!isVec(origin) || !isVec(velocity) || distance(origin,base)>6) return null;
    const beamReach=Number.isFinite(ev.len) ? Math.min(reach,Math.max(0,ev.len)) : reach;
    if (!plausiblePath(origin,velocity,shield,beamReach,3.7)) return null;
    damageCap=cap(weapon,kind);
  } else return null;
  return { id:id(actor), at:0, kind, maxDamage:damageCap, origin, velocity, reach, used:false };
}
function stores(nm) {
  nm.rankedBarrierProofs ||= new Map();
  nm.rankedBarrierPending ||= new Map();
  nm.rankedBarrierEventKeys ||= new Map();
}
function prune(nm,now) {
  stores(nm);
  for(const [peer,shots] of nm.rankedBarrierProofs) {
    const kept=shots.filter(s => !s.used && now-s.at<=RECEIPT_SECONDS && now>=s.at-0.01);
    if(kept.length) nm.rankedBarrierProofs.set(peer,kept);
    else nm.rankedBarrierProofs.delete(peer);
  }
  for(const [peer,hits] of nm.rankedBarrierPending) {
    const kept=hits.filter(h=>now-h.at<=PENDING_SECONDS && now>=h.at-0.01);
    if(kept.length) nm.rankedBarrierPending.set(peer,kept);
    else nm.rankedBarrierPending.delete(peer);
  }
  for(const [peer,keys] of nm.rankedBarrierEventKeys) {
    for(const [key,time] of keys) if(now-time>RECEIPT_SECONDS) keys.delete(key);
    if(!keys.size) nm.rankedBarrierEventKeys.delete(peer);
  }
}
function active(nm) {
  const m=nm.match,s=m?.ranked?.rule?.state;
  return nm.isHost && m?.mode==='rainmaker' && m.state==='playing' && m.ranked.winner==null
    && s?.barrier?.active && isVec(s.pos) && Array.isArray(m.rankedBarrierHits);
}
function shieldOf(nm) {
  const s=nm.match.ranked.rule.state;
  return [s.pos[0],s.pos[1]+1,s.pos[2]];
}
export function noteRankedBarrierShots(nm,from,packet,now) {
  if(!active(nm) || !Array.isArray(packet?.e) || packet.e.length>512 || !Number.isFinite(now)) return;
  prune(nm,now);
  const shield=shieldOf(nm);
  const receipts=nm.rankedBarrierProofs.get(from) || [];
  const keys=nm.rankedBarrierEventKeys.get(from) || new Map();
  for(const e of packet.e.slice(0,256)) {
    if(!Array.isArray(e) || !['p','b','ev'].includes(e[1])) continue;
    const actorId=e[1]==='ev' ? e[3]?.actor?.n : e[2];
    const actor=nm.match.actors.find(a=>id(a)===String(actorId) && a?.alive && a.owner===from);
    if(!actor) continue;
    const fingerprint=JSON.stringify(e);
    if(keys.has(fingerprint)) continue; // a resent owner tick cannot mint another hit
    const shot=shotFromEvent(e,actor,shield);
    if(!shot) continue;
    const count=receipts.filter(r=>r.id===shot.id && now-r.at<1).length;
    const weapon=actor.weapon;
    const rate=Number.isFinite(weapon.fireInterval) && weapon.fireInterval>0 ? 1/weapon.fireInterval : 12;
    const burst=['roller','slosher','stringer','brush'].includes(weapon.kind) ? 10 : 3;
    if(count>=Math.min(60,Math.ceil(rate*burst)+2)) continue;
    shot.at=now;
    receipts.push(shot);
    keys.set(fingerprint,now);
  }
  if(receipts.length) nm.rankedBarrierProofs.set(from,receipts.slice(-MAX_SHOTS));
  if(keys.size) nm.rankedBarrierEventKeys.set(from,keys);
  flushRankedBarrierHits(nm,now);
}
export function queueRankedBarrierHit(nm,from,d,now) {
  if(!active(nm) || !Number.isFinite(now)) return false;
  const a=nm.match.actors.find(a=>id(a)===d.id && a.alive && a.owner===from);
  const shield=shieldOf(nm);
  if(!a || !isVec(d.pos) || !isVec(point(a.pos)) || distance(d.pos,shield)>7
      || distance(point(a.pos),shield)>85 || !Number.isSafeInteger(d.seq) || d.seq<=0
      || !Number.isFinite(d.damage) || d.damage<=0 || d.damage>300) return false;
  prune(nm,now);
  const watermark=nm.rankedHitSeq?.get(from)||0;
  const pending=nm.rankedBarrierPending.get(from)||[];
  if(d.seq<=watermark || pending.some(h=>h.data.seq===d.seq) || pending.length>=MAX_PENDING) return false;
  pending.push({data:{id:d.id,seq:d.seq,damage:d.damage,pos:[...d.pos]},at:now});
  nm.rankedBarrierPending.set(from,pending);
  flushRankedBarrierHits(nm,now);
  return true;
}
export function flushRankedBarrierHits(nm,now) {
  if(!active(nm) || !Number.isFinite(now)) return;
  prune(nm,now);
  const shield=shieldOf(nm);
  for(const [peer,pending] of nm.rankedBarrierPending) {
    const shots=nm.rankedBarrierProofs.get(peer)||[];
    for(const h of [...pending].sort((a,b)=>a.data.seq-b.data.seq)) {
      if(h.data.seq <= (nm.rankedHitSeq?.get(peer)||0)) continue;
      const a=nm.match.actors.find(a=>id(a)===h.data.id && a.alive && a.owner===peer);
      if(!a) continue;
      const shot=shots.find(s=>!s.used && s.id===h.data.id && h.data.damage<=s.maxDamage
        && distance(h.data.pos,s.origin)<s.reach+7
        && (s.kind==='bomb' ? distance(s.origin,shield)<=22
            : plausiblePath(s.origin,s.velocity,shield,s.reach,4.5)));
      if(!shot) continue;
      shot.used=true;
      (nm.rankedHitSeq ||= new Map()).set(peer,h.data.seq);
      // Never forward untrusted kind or an inflated damage claim to the rule.
      nm.match.rankedBarrierHits.push({id:h.data.id,team:a.team,damage:h.data.damage,kind:shot.kind});
    }
    const watermark=nm.rankedHitSeq?.get(peer)||0;
    const left=pending.filter(h=>h.data.seq>watermark);
    if(left.length) nm.rankedBarrierPending.set(peer,left);
    else nm.rankedBarrierPending.delete(peer);
  }
}
export function resetRankedBarrierAdmission(nm) {
  nm.rankedBarrierProofs?.clear();nm.rankedBarrierPending?.clear();nm.rankedBarrierEventKeys?.clear();
}
