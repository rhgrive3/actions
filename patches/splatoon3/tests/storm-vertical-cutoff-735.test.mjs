import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';

// #735: adapter.mjs makes Ink Storm damage eligible only down to cloudY - 14
// (`e.pos.y + 1.2 < cloudY - 0.8 - inkWaveRainReach` is excluded, with
// inkWaveRainReach = 12, the same reach as the rain-paint ray). That bound is
// INKWAVE's internal consistency value. It is NOT a verified Splatoon 3 cutoff:
// the pinned Ver. 11.3.0 table (Leanny/splat3 7280ff9c) has no vertical reach
// field. These tests pin the internal boundary and its frame-interval behaviour.
// Horizontal radius, above-cloud and cover rejection are covered by
// storm-lifetime.test.mjs (#563 eligibility) and storm-paint-radius.test.mjs.

const DPS = 24;          // specials.storm.dps: 0.4 HP/frame at 60 Hz
const CLOUD_Y = 100;
const INTERNAL_LOWER_CUTOFF = CLOUD_Y - 14; // 86, inclusive in the adapter
const GATE = 'e.pos.y + 1.2 < c.group.position.y - 0.8 - inkWaveRainReach';

async function rig({ adapt } = {}) {
  const f = await fixture(adapt ? { adapt } : {});
  f.installSubSpecialFidelity?.(f, f.profile);
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.netm = null; G.actors = [];
  G.fx = { rain() {} }; G.boss = { rain() {} };
  G.physics.los = () => true;
  G.physics.raycast = (origin, _dir, _len, hit) => { hit.hit = true; hit.point.copy(origin).setY(0); hit.normal.set(0, 1, 0); hit.dist = origin.y; return hit; };
  G.paint.splat = (_pos, size) => size;
  const p = G.projectiles = new f.Projectiles(G.scene), owner = f.make(); owner.team = 0;
  // t = 1 keeps the cloud fully grown (s = 1), so only the vertical gate varies.
  const c = { t: 1, dur: 8, team: 0, ghost: false, owner, dir: new THREE.Vector3(), rainT: 0, group: new THREE.Group() };
  c.group.position.set(0, CLOUD_Y, 0); p.clouds.push(c);
  const victim = f.make(); victim.team = 1; victim.remote = false; victim.alive = true; victim.pos.set(0, 0, 0);
  let damage = 0; victim.damage = (n) => { damage += n; return false; };
  G.actors = [victim];
  return { f, p, c, victim, total: () => damage };
}

test('#735 internal lower reach: eligibility flips at cloudY-14 (inclusive), not at an S3-verified value', async () => {
  const cases = [
    [INTERNAL_LOWER_CUTOFF + 0.001, true, 'just inside'],
    [INTERNAL_LOWER_CUTOFF, true, 'at the boundary'],
    [INTERNAL_LOWER_CUTOFF - 0.001, false, 'just outside'],
  ];
  for (const [y, eligible, label] of cases) {
    const r = await rig(); r.victim.pos.y = y;
    r.p._updateClouds(STEP);
    if (eligible) assert.ok(Math.abs(r.total() - DPS * STEP) < 1e-12, `${label} (y=${y}): 24 HP/s for one tick`);
    else assert.equal(r.total(), 0, `${label} (y=${y}): no storm damage`);
  }
});

test('#735 negative control: without the internal reach gate, a far-below victim is damaged', async () => {
  const adapt = (rel, code) => {
    const out = adaptSource(rel, code);
    if (rel !== 'src/game/weapons.js') return out;
    assert.ok(out.includes(GATE), 'the lower reach gate is present in the adapted source');
    return out.replace(GATE, 'false');
  };
  const r = await rig({ adapt });
  r.victim.pos.y = CLOUD_Y - 60;
  r.p._updateClouds(STEP);
  assert.ok(r.total() > 0, 'unbounded cylinder damages the far-below victim, so the boundary test is discriminating');
});

test('#735 30/60/120 Hz frame intervals: same lower-reach eligibility and integrated 24 HP/s', async () => {
  for (const hz of [30, 60, 120]) {
    // One cloud, two victims directly beneath it: one inside the internal reach, one outside.
    const raw = await rig(); const insideRaw = raw.victim, outsideRaw = raw.f.make();
    outsideRaw.team = 1; outsideRaw.remote = false; outsideRaw.alive = true; outsideRaw.pos.set(0, 0, 0);
    let outsideRawDamage = 0; outsideRaw.damage = (n) => { outsideRawDamage += n; return false; };
    raw.f.G.actors.push(outsideRaw);
    insideRaw.pos.y = INTERNAL_LOWER_CUTOFF + 0.5; outsideRaw.pos.y = INTERNAL_LOWER_CUTOFF - 0.5;
    for (let i = 0; i < hz * 2; i++) raw.p._updateClouds(1 / hz);
    assert.ok(Math.abs(raw.total() - DPS * 2) < 1e-9, `${hz} Hz raw dt: ${raw.total()} != ${DPS * 2}`);
    assert.equal(outsideRawDamage, 0, `${hz} Hz raw dt: outside the internal reach`);

    // Gameplay clock: the fixed 60 Hz tick is independent of render cadence.
    const clk = await rig(); const insideClk = clk.victim, outsideClk = clk.f.make();
    outsideClk.team = 1; outsideClk.remote = false; outsideClk.alive = true; outsideClk.pos.set(0, 0, 0);
    let outsideClkDamage = 0; outsideClk.damage = (n) => { outsideClkDamage += n; return false; };
    clk.f.G.actors.push(outsideClk);
    insideClk.pos.y = INTERNAL_LOWER_CUTOFF + 0.5; outsideClk.pos.y = INTERNAL_LOWER_CUTOFF - 0.5;
    const ci = new FixedClock();
    for (let i = 0; i < hz * 2; i++) ci.advance(1 / hz, (dt) => clk.p._updateClouds(dt));
    assert.ok(ci.ticks >= 2 * 60 - 1, `${hz} Hz fixed clock ran ${ci.ticks} ticks`);
    assert.ok(Math.abs(clk.total() - DPS * STEP * ci.ticks) < 1e-9, `${hz} Hz fixed clock integrated damage`);
    assert.equal(outsideClkDamage, 0, `${hz} Hz fixed clock: outside the internal reach`);
  }
});
