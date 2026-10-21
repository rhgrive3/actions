// Inkjet-only admission shares the *currently free* existing sprite capacity.
// Actor order and global pools are unchanged; no live sprite is evicted.
// Reuse all bookkeeping after first appearance, without rebuilding per-actor bookkeeping objects.
function includeOwner(budget, actor) {
  let rec = budget.records.get(actor);
  if (!rec) { rec = { time: NaN, memberTime: NaN, puffs: 0, sparks: 0 }; budget.records.set(actor, rec); }
  if (rec.memberTime === budget.time) return;
  rec.memberTime = budget.time;
  budget.members.push(rec);
}
export function inkjetVfxAdmission(director, actor) {
  let budget = director.inkjetAdmissionBudget;
  if (!budget) budget = director.inkjetAdmissionBudget = {
    time: NaN, epoch: -1, cursor: 0, members: [], records: new WeakMap(),
  };
  if (budget.time !== director.time) {
    budget.time = director.time;
    const members = budget.members; members.length = 0;
    for (const a of director.G.actors || []) {
      if (a?.alive && !a.superJumpState && a.specialActive?.id === 'inkjet' &&
          a.form !== 'squid' && !a.intent?.squid) includeOwner(budget, a);
    }
    // Read live projectiles, not last render's round records: those can have
    // expired or been recycled before updateRounds prunes/retags them.
    for (const p of director.G.projectiles?.list || []) {
      if (p?.wid === 'inkjet' && !p.dead && p.pos && p.owner) includeOwner(budget, p.owner);
    }
    const n = members.length;
    const epoch = Math.floor(director.time * 60 + 1e-7);
    if (epoch !== budget.epoch) { budget.epoch = epoch; budget.cursor++; }
    if (n) {
      const p = Math.max(0, director.kit.puffs.cap - director.kit.puffs.n);
      const s = Math.max(0, director.kit.sparks.cap - director.kit.sparks.n);
      const offset = budget.cursor % n, pBase = Math.floor(p / n), sBase = Math.floor(s / n);
      for (let i = 0; i < n; i++) {
        const rec = members[i];
        const rank = (i - offset + n) % n;
        rec.time = budget.time;
        rec.puffs = pBase + (rank < p % n ? 1 : 0);
        rec.sparks = sBase + (rank < s % n ? 1 : 0);
      }
    }
  }
  const rec = actor && budget.records.get(actor);
  return rec?.time === director.time ? rec : null;
}
export function inkjetVfxRoom(admission, pool, kind) {
  if (!admission || !(admission[kind] > 0) || !(pool.n < pool.cap)) return false;
  admission[kind]--;
  return true;
}
