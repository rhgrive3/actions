import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #757: authoritative Ink Storm rain paint must sample from the same active
// (growth/fade-scaled) radius as the visible rain and Boss rain of that tick.
async function storm({ t = 0, ghost = false, remote = false, raycastHit = true, adapt } = {}) {
  const f = await fixture(adapt ? { adapt } : {});
  f.installSubSpecialFidelity?.(f, f.profile);
  const { G, THREE } = f; G.scene = new THREE.Scene(); G.netm = null; G.actors = [];
  const p = G.projectiles = new f.Projectiles(G.scene), owner = f.make(); owner.team = 0;
  owner.remote = remote;
  const visual = [], boss = [], paints = [];
  G.fx = { rain: (_pos, r) => visual.push(r) }; G.boss = { rain: (_a, _x, _z, r) => boss.push(r) };
  G.physics.raycast = (origin, _dir, _len, hit) => {
    hit.hit = raycastHit;
    if (raycastHit) {
      hit.point.copy(origin).setY(0); hit.normal.set(0, 1, 0); hit.dist = origin.y;
    }
    return hit;
  };
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


test('#226 rain audit counts sampled candidate, ground contacts and actual paint separately',async()=>{
  const s=await storm();s.p._updateClouds(1/60);
  const audit=s.c.s3RainAudit;assert.ok(audit&&audit.candidateDrops>0);
  assert.equal(audit.candidateDrops,audit.groundHits);
  assert.equal(audit.paintEvents,s.paints.length);
  assert.ok(audit.candidateDrops!==72,'source RainNum is not silently substituted for native per-tick paint calls');
});

test('#226 full lifetime rain audit decouples candidates, ground hits and paint across 30/60/120Hz without forcing RainNum=72', async () => {
  for (const hz of [30, 60, 120]) {
    const s = await storm();
    const clock = new FixedClock();
    for (let i = 0; i < hz * 8; i++) clock.advance(1 / hz, dt => s.p._updateClouds(dt));
    const audit = s.c.s3RainAudit;
    assert.equal(audit.candidateDrops, 178);
    assert.equal(audit.groundHits, 178);
    assert.equal(audit.paintEvents, 178);
    assert.equal(s.paints.length, 178);
    assert.notEqual(audit.candidateDrops, 72, 'full-duration candidate count is not forced to 72 without semantic proof');
  }
});

test('#226 rain audit decouples candidate generation from ground contact when raycast misses', async () => {
  const s = await storm({ raycastHit: false });
  for (let i = 0; i < 480; i++) s.p._updateClouds(1 / 60);
  const audit = s.c.s3RainAudit;
  assert.equal(audit.candidateDrops, 178);
  assert.equal(audit.groundHits, 0, 'no ground contact recorded on raycast miss');
  assert.equal(audit.paintEvents, 0, 'no paint event emitted on raycast miss');
  assert.equal(s.paints.length, 0);
});

test('#226 rain audit decouples ground contact from authoritative paint for ghost/remote cloud', async () => {
  const s = await storm({ ghost: true, remote: true });
  for (let i = 0; i < 480; i++) s.p._updateClouds(1 / 60);
  const audit = s.c.s3RainAudit;
  assert.equal(audit.candidateDrops, 178);
  assert.equal(audit.groundHits, 178, 'ground contact is still simulated for remote cloud');
  assert.equal(audit.paintEvents, 0, 'remote/ghost cloud emits zero authoritative paint events');
  assert.equal(s.paints.length, 0);
});

test('#735 actors far below rain trace cannot receive infinite-cylinder damage',async()=>{
  const s=await storm(),{G,THREE}=s.f,enemy=s.f.make();
  enemy.team=1;enemy.remote=false;enemy.alive=true;enemy.pos.set(0,0,0);
  let damage=0;enemy.damage=n=>{damage+=n;return false;};
  G.actors=[enemy];G.physics.los=()=>true;
  s.c.group.position.set(0,100,0);
  s.p._updateClouds(1/60);assert.equal(damage,0);
  enemy.pos.set(0,98,0);
  s.p._updateClouds(1/60);assert.ok(damage>0,'nearby uncovered actor remains eligible');
  assert.ok(s.c.s3RainAudit.groundHits>0,'rain/paint diagnostics remain independent of HP gate');
});
