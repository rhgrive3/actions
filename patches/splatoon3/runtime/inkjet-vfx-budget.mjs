// Inkjet-only admission shares the *currently free* existing sprite capacity.
// Actor order and global pools are unchanged; no live sprite is evicted.
// Reuse all bookkeeping after first appearance, with no per-frame object allocation.
export function inkjetVfxAdmission(director, actor) {
  let budget = director.inkjetAdmissionBudget;
  if (!budget) budget = director.inkjetAdmissionBudget = {
    time: NaN, epoch: -1, cursor: 0, actors: [], records: new WeakMap(),
  };
  if (budget.time !== director.time) {
    budget.time = director.time;
    const actors = budget.actors; actors.length = 0;
    for (const a of director.G.actors || []) {
      if (a?.alive && !a.superJumpState && a.specialActive?.id === 'inkjet' &&
          a.form !== 'squid' && !a.intent?.squid) actors.push(a);
    }
    // Existing flight records also keep an expired/dead owner's tail eligible.
    // New active rounds already have their owner in actors; unknown newcomers
    // wait until the next render rather than stealing an allocated share.
    for (const r of director.rounds?.values?.() || []) {
      const a = r.wid === 'inkjet' && r.p?.owner;
      if (a && !actors.includes(a)) actors.push(a);
    }
    const n = actors.length;
    const epoch = Math.floor(director.time * 60 + 1e-7);
    if (epoch !== budget.epoch) { budget.epoch = epoch; budget.cursor++; }
    if (n) {
      const p = Math.max(0, director.kit.puffs.cap - director.kit.puffs.n);
      const s = Math.max(0, director.kit.sparks.cap - director.kit.sparks.n);
      const offset = budget.cursor % n, pBase = Math.floor(p / n), sBase = Math.floor(s / n);
      for (let i = 0; i < n; i++) {
        let rec = budget.records.get(actors[i]);
        if (!rec) { rec = { time: 0, puffs: 0, sparks: 0 }; budget.records.set(actors[i], rec); }
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
