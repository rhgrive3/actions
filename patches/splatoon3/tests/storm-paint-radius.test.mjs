import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #757: authoritative Ink Storm rain paint must sample from the same active
// (growth/fade-scaled) radius as the visible rain and Boss rain of that tick.
async function storm({ t = 0, ghost = false, adapt } = {}) {
  const f = await fixture(adapt ? { adapt } : {});
  f.installSubSpecialFidelity?.(f, f.profile);
  const { G, THREE } = f; G.scene = new THREE.Scene(); G.netm = null; G.actors = [];
  const p = G.projectiles = new f.Projectiles(G.scene), owner = f.make(); owner.team = 0;
  const visual = [], boss = [], paints = [];
  G.fx = { rain: (_pos, r) => visual.push(r) }; G.boss = { rain: (_a, _x, _z, r) => boss.push(r) };
  G.physics.raycast = (origin, _dir, _len, hit) => { hit.hit = true; hit.point.copy(origin).setY(0); hit.normal.set(0, 1, 0); hit.dist = origin.y; return hit; };
  G.paint.splat = (pos, size) => { paints.push(Math.hypot(pos.x, pos.z)); return size; };
  const c = { t, dur: 8, team: 0, ghost, owner, dir: new THREE.Vector3(), rainT: 0, group: new THREE.Group() };
  c.group.position.set(0, 5, 0); p.clouds.push(c);
  return { f, p, c, visual, boss, paints, owner };
}
// Force the radius draw (2nd Math.random() per drop) to its maximum so the
// sampled point sits on the edge of whatever radius the code uses.
function edgeRandom(f) { let n = 0; f.setRandom(() => (n++ % 4 === 1 ? 0.999999 : 0.5)); }

test('#757 first growth tick paints only inside the visible/Boss rain radius', async () => {
  const s = await storm(); edgeRandom(s.f);
  s.p._updateClouds(1 / 60);
  const radius = s.f.SPECIALS.storm.radius;
  assert.equal(s.visual.length, 1); assert.ok(s.visual[0] < radius * 0.4, `growth radius ${s.visual[0]}`);
  assert.ok(Math.abs(s.boss[0] - s.visual[0]) < 1e-12);
  assert.ok(s.paints.length > 0);
  for (const d of s.paints) assert.ok(d <= s.visual[0] + 1e-9, `paint ${d} outside active radius ${s.visual[0]}`);
});

test('#757 every growth/full/fade tick keeps paint inside that tick\'s active radius; full size still reaches the full radius', async () => {
  const s = await storm(); edgeRandom(s.f);
  const radius = s.f.SPECIALS.storm.radius; let maxFull = 0;
  for (let i = 0; i < 8 * 60; i++) {
    const before = s.paints.length, vis = s.visual.length;
    s.p._updateClouds(1 / 60);
    if (s.visual.length === vis) continue;
    const active = s.visual.at(-1);
    for (const d of s.paints.slice(before)) {
      assert.ok(d <= active + 1e-9, `tick ${i}: paint ${d} > active ${active}`);
      if (active > radius - 1e-9) maxFull = Math.max(maxFull, d);
    }
  }
  assert.ok(maxFull > radius * 0.99, 'full-grown cloud still paints out to the full radius');
});

test('#757 Turf/special credit only comes from in-radius paint; ghost clouds never paint', async () => {
  const s = await storm(); edgeRandom(s.f);
  const before = s.owner.stats.turf; s.p._updateClouds(1 / 60);
  assert.ok(s.owner.stats.turf > before, 'owner is credited for the in-radius paint');
  const g = await storm({ ghost: true }); g.owner.remote = true; edgeRandom(g.f); g.p._updateClouds(1 / 60);   // replayed cloud of a still-remote owner (adopted owners: storm-adoption-paint.test.mjs)
  assert.equal(g.paints.length, 0); assert.equal(g.boss.length, 0);
});

test('#757 RNG call count per drop is unchanged', async () => {
  const counts = [];
  for (const adapt of [undefined, (rel, code) => adaptSource(rel, code).replace('Math.sqrt(Math.random()) * (sp.radius * s)', 'Math.sqrt(Math.random()) * sp.radius')]) {
    const s = await storm({ adapt }); let n = 0; s.f.setRandom(() => { n++; return 0.5; });
    for (let i = 0; i < 60; i++) s.p._updateClouds(1 / 60);
    counts.push(n);
  }
  assert.equal(counts[0], counts[1]);
});

test('negative control: main sampling paints outside the first-tick visible radius', async () => {
  const s = await storm({ adapt: (rel, code) => adaptSource(rel, code).replace('Math.sqrt(Math.random()) * (sp.radius * s)', 'Math.sqrt(Math.random()) * sp.radius') });
  edgeRandom(s.f); s.p._updateClouds(1 / 60);
  assert.ok(s.paints.some(d => d > s.visual[0] + 1), 'full-radius sampling escapes the visible rain');
});

test('#757 30/60/120Hz fixed ticks give identical paint envelopes', async () => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const s = await storm(); edgeRandom(s.f); const clock = new FixedClock(), rows = [];
    for (let i = 0; i < hz * 2; i++) clock.advance(1 / hz, dt => { const b = s.paints.length; s.p._updateClouds(dt); rows.push([s.visual.at(-1) ?? null, s.paints.slice(b)]); });
    const r = JSON.parse(JSON.stringify(rows)); if (expected) assert.deepEqual(r, expected); else expected = r;
  }
});
