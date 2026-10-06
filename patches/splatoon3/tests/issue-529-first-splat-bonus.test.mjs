import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installFlow } from '../runtime/flow.mjs';

// #529: Splatoon 3 gives the player who scores the first enemy splat of the match an
// additional +10 Flow points, separate from the ordinary splat award. The bonus is
// match-global (once per battle, not per player/team), survives respawns, cannot be
// duplicated by stale network events, and stacks into the ordinary splat gain.
// Uses the installed runtime (runtime/flow.mjs) with the shipped profile config.
const profile = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../patches/splatoon3/profile.json', import.meta.url)), 'utf8'));
const cfg = profile.flow;
const bonusFp = cfg.progress.firstSplatBonus;
const fpScore = fp => fp * cfg.threshold / cfg.progress.referenceThreshold;
const SPLAT = cfg.weights.splat;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9, `${a} != ${b} ${msg || ''}`);

function rig({ tuning = profile, match = { battle: 1 } } = {}) {
  const listeners = new Map();
  const on = (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn]);
  const emit = (name, payload) => { for (const fn of listeners.get(name) || []) fn(payload); };
  class Actor {
    constructor(team) { this.team = team; this.alive = true; this.pos = { clone: () => ({ y: 0 }) }; }
    reset() {} respawn() {} update() {}
  }
  const G = { match, time: 0, paint: { splat() {} } };
  installFlow({ Actor, on, emit, G }, tuning);
  return {
    G, on, emit,
    actor: team => new Actor(team),
    splat: (attacker, victim, cause = 'weapon') => emit('splatted', { attacker, victim, cause }),
    score: a => (a.s3 && a.s3.flow ? a.s3.flow.score : 0),
    flow: a => a.s3.flow,
  };
}

test('#529: the first enemy splat of a battle earns ordinary + 10fp; later splats do not', () => {
  const r = rig();
  const a = r.actor(0), b = r.actor(0);
  r.splat(a, r.actor(1));
  near(r.score(a), SPLAT + fpScore(bonusFp), 'first splat = ordinary award + 10 fp');
  r.splat(b, r.actor(1));
  near(r.score(b), SPLAT, 'second splat of the match is ordinary only');
  r.splat(a, r.actor(1));
  near(r.score(a), 2 * SPLAT + fpScore(bonusFp), 'no repeated bonus for the same attacker');
});

test('#529: bonus is match-global once per battle; duplicates and respawns cannot repeat it', () => {
  const r = rig();
  const a = r.actor(0), v = r.actor(1);
  r.splat(a, v);
  near(r.score(a), SPLAT + fpScore(bonusFp));
  r.splat(a, v);
  near(r.score(a), 2 * SPLAT + fpScore(bonusFp), 'duplicate/stale event grants no second bonus');
  a.reset();
  r.splat(a, r.actor(1));
  near(r.score(a), SPLAT, 'respawn clears flow state but not bonus eligibility');
  r.G.match = { battle: 2 };
  const c = r.actor(0);
  r.splat(c, r.actor(1));
  near(r.score(c), SPLAT + fpScore(bonusFp), 'first splat of the next battle is eligible again');
});

test('#529: non-qualifying first splats keep eligibility; the flag is global across teams', () => {
  const r = rig();
  const a = r.actor(0);
  r.splat(a, a);
  near(r.score(a), 0, 'self-splat awards nothing');
  const mate = r.actor(0);
  r.splat(mate, r.actor(0));
  near(r.score(mate), 0, 'same-team splat awards nothing');
  r.splat(a, r.actor(1));
  near(r.score(a), SPLAT + fpScore(bonusFp), 'bonus still pending for the first qualifying splat');
  const enemy = r.actor(1);
  r.splat(enemy, r.actor(0));
  near(r.score(enemy), SPLAT, 'flag is match-global, not once per team/player');
});

test('#529: fixed-step runs at 30/60/120 Hz produce identical bonus outcomes', () => {
  const run = (dt, steps) => {
    const r = rig();
    const a = r.actor(0), b = r.actor(0);
    r.splat(a, r.actor(1));
    for (let i = 0; i < steps; i++) a.update(dt);
    r.splat(b, r.actor(1));
    for (let i = 0; i < steps; i++) { a.update(dt); b.update(dt); }
    return [r.score(a), r.score(b)];
  };
  const [slow, mid, fast] = [[1 / 30, 15], [1 / 60, 30], [1 / 120, 60]].map(([dt, n]) => run(dt, n));
  for (const other of [mid, fast]) for (let i = 0; i < 2; i++) near(slow[i], other[i], `fps-independent score[${i}]`);
  near(slow[0], SPLAT + fpScore(bonusFp) - fpScore(0.2), 'first-splat bonus survives fixed-step decay accounting (1.0s idle at 0.2fp/s)');
});

test('#529: the bonus stacks into the same splat gain that activates Flow', () => {
  const tuning = { flow: { ...cfg, threshold: 1, weights: { ...cfg.weights, splat: 0.95 } } };
  const r = rig({ tuning });
  const a = r.actor(0);
  let activated = false;
  r.on('actor:flow', ({ active }) => { if (active) activated = true; });
  r.splat(a, r.actor(1));
  // ordinary 0.95 alone stays below threshold 1; the +10fp (0.1) must fold into the
  // same gain so activation happens exactly as it would for any splat award.
  assert.equal(r.flow(a).active, true, 'first splat with bonus crosses the threshold');
  assert.equal(activated, true, 'actor:flow activation event fires');
});
