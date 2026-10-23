import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { digest, RATES } from './zipcaster-vfx-cadence-harness.mjs';

if (process.env.INKWAVE_BUILT_SITE) throw new Error('Zipcaster deterministic source-composition suite; built-browser acceptance is separate');

// Production adapters/FX/Director/Float32 pools, with a deterministic replacement
// only for presentation RNG. Actor simulation is deliberately held in fixed
// phases: this is CPU composition evidence, not live browser/retail timing.
async function boot(quality = 1) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmPerformance: { now: () => 0 }, vmMathRandom: () => .5,
    adaptRuntime(rel, code) {
      if (rel !== 'patches/splatoon3/runtime/special-vfx-kit.mjs') return code;
      const patched = code.replace(/export function vfxRandom\(\) \{[\s\S]*?\n\}/,
        'export function vfxRandom() { return .25; }');
      assert.notEqual(patched, code, 'test-only presentation RNG boundary');
      return patched;
    },
  });
  const { G, THREE } = f, api = f.installedRuntime;
  G.scene = new THREE.Scene(); G.projectiles = new api.Projectiles(G.scene);
  const fx = G.fx = new api.FX(G.scene, { quality }); fx.setCollider(() => null);
  G.camera = new THREE.PerspectiveCamera(60, 1, .1, 300); G.camera.position.set(0, 4, -8); G.camera.updateMatrixWorld(true);
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; }, segment: (_a, _b, h) => { h.hit = false; return h; } };
  const d = fx.s3SpecialVfx;
  assert.ok(d, 'installed production FX owns the Director');
  const counters = { drops: 0, coat: 0, pushes: 0, peak: 0, evictions: 0, births: [] };
  for (const [method, field] of [['drop', 'drops'], ['puff', 'coat'], ['pushRibbon', 'pushes']]) {
    const original = d[method];
    d[method] = function (...args) { counters[field]++; return original.apply(this, args); };
  }
  const pool = d.kit.puffs, spawn = pool.spawnRaw, evict = pool._evict;
  pool.spawnRaw = function (...args) {
    const result = spawn.apply(this, args);
    counters.peak = Math.max(counters.peak, this.n);
    counters.births.push(Array.from(this.p.subarray((this.n - 1) * this.S, this.n * this.S)));
    return result;
  };
  pool._evict = function (...args) { counters.evictions++; return evict.apply(this, args); };
  function resetCounters() {
    Object.assign(counters, { drops: 0, coat: 0, pushes: 0, peak: 0, evictions: 0 }); counters.births.length = 0;
  }
  function actor(phase = 'hookFlight') {
    const a = f.make('shooter'); a.isLocal = true; a.pos.set(1, 2, 3); a.vel.set(8, 2, 4); a.form = 'kid';
    a.weapon = { ...a.weapon, special: 'zipcaster', specialCost: 200 }; a.special = 200;
    a._startSpecial(); d.track(a);
    Object.assign(a._s3AllSpecialState, { phase, zipTarget: new THREE.Vector3(1, 3, 15), hookFlightT: .05, hookFlightDuration: .1 });
    return a;
  }
  function clear() { fx.clear(); G.projectiles.clear(); G.actors.length = 0; resetCounters(); }
  function step(dt) { if (Number.isFinite(dt) && dt > 0) G.time += dt; fx.update(dt, G.camera); }
  function run(hz, seconds = 1) { for (let i = 0; i < Math.round(hz * seconds); i++) step(1 / hz); }
  return { f, G, fx, d, pool, counters, resetCounters, actor, clear, step, run,
    snapshot(a) { return JSON.stringify({ pos: a.pos, vel: a.vel, hp: a.hp, special: a.special, active: a.specialActive, state: a._s3AllSpecialState }); } };
}

test('production-composed Zipcaster preserves births, coat cadence and gameplay state at all five rates', async () => {
  const e = await boot();
  const measurements = [];
  try {
    for (const phase of ['hookFlight', 'zip']) {
      let reference;
      for (const hz of RATES) {
        const a = e.actor(phase); e.d.kit.clear(); e.resetCounters();
        const before = e.snapshot(a);
        let paint = 0, hits = 0, events = 0, random = 0;
        e.G.paint = { splat() { paint++; } };
        e.G.projectiles.applyHit = () => { hits++; };
        const off = e.f.on('all:special', () => { events++; });
        e.f.setRandom(() => { random++; return .5; });
        e.run(hz);
        off?.(); e.f.restoreRandom();
        const { counters: c } = e;
        assert.equal(c.drops, phase === 'zip' ? 120 : 60, `${phase} ${hz}Hz`);
        assert.equal(c.coat, 6);
        assert.equal(c.pushes, phase === 'zip' ? hz : 0, 'render-cadence trail');
        const hash = digest(c.births);
        reference ??= hash;
        assert.equal(hash, reference, 'identical actual Float32 birth rows across rates');
        assert.equal(e.snapshot(a), before);
        assert.deepEqual({ paint, hits, events, random }, { paint: 0, hits: 0, events: 0, random: 0 });
        assert.equal(c.evictions, 0);
        assert.ok(c.peak < e.pool.cap);
        assert.equal(e.d.errors, 0);
        measurements.push({ phase, hz, drops: c.drops, coat: c.coat, peakPuffs: c.peak, cap: e.pool.cap, evictions: c.evictions, birthHash: hash });
        e.clear();
      }
    }
    console.log('Zipcaster composed fixed-phase CPU measurements ' + JSON.stringify(measurements));
  } finally { e.fx.dispose?.(); }
});

test('production phase boundaries, missing targets and cancellation/reuse retire lines and trails', async () => {
  const e = await boot();
  try {
    for (const hz of RATES) {
      const a = e.actor(); e.d.kit.clear(); e.resetCounters();
      e.run(hz, .5);
      const t = e.d.tracks.get(a), line = t.d.line;
      assert.equal(e.counters.drops, 30);
      a._s3AllSpecialState.phase = 'zip'; e.run(hz, .5);
      const trail = t.d.trail;
      assert.equal(e.counters.drops, 90);
      assert.equal(t.d.line, line);
      a._s3AllSpecialState.phase = 'hookWait'; e.run(hz, .5);
      assert.equal(e.counters.drops, 90);
      assert.equal(line.v[11], 0); assert.equal(trail.ended, true); assert.equal(t.d.trail, null);
      a._s3AllSpecialState.phase = 'zip'; e.run(hz, .5);
      const reusedTrail = t.d.trail;
      assert.notEqual(reusedTrail, trail); assert.equal(e.counters.drops, 150);
      a._s3AllSpecialState.zipTarget = null; e.run(hz, .5);
      assert.equal(e.counters.drops, 150); assert.equal(e.counters.coat, 15);
      assert.equal(reusedTrail.ended, true); assert.equal(line.v[11], 0);
      a.alive = false; e.step(1 / hz);
      assert.equal(e.d.tracks.has(a), false); assert.equal(line.dead, true);
      a.alive = true; a._s3AllSpecialState.zipTarget = new e.f.THREE.Vector3(1, 3, 15);
      e.resetCounters(); e.step(1 / 240);
      const next = e.d.tracks.get(a);
      assert.notEqual(next, t); assert.equal(next.d.zipVfxCarry, .25);
      // start() has activation bursts, so count only the subsequent partial tick.
      e.resetCounters(); e.step(1 / 240);
      assert.equal(e.counters.drops, 0); assert.equal(e.counters.coat, 0);
      assert.equal(next.d.zipVfxCarry, .5);
      e.G.actors.length = 0; e.step(1 / 60);
      assert.equal(e.d.tracks.size, 0); assert.equal(next.d.line.dead, true); assert.equal(next.d.trail.ended, true);
      assert.equal(e.d.errors, 0); e.clear();
    }
  } finally { e.fx.dispose?.(); }
});

test('production Director dt policy ignores zero/negative/NaN and caps large deltas without replay', async () => {
  const e = await boot();
  try {
    const a = e.actor('zip'); e.d.kit.clear(); e.resetCounters();
    e.step(1 / 240);
    const t = e.d.tracks.get(a), time = e.d.time;
    for (const dt of [0, -1, NaN, undefined, null]) {
      // Call the installed Director entry point: unrelated native FX counters
      // intentionally have their own dt policy and are outside this task.
      e.d.update(dt, e.G.camera);
      assert.equal(e.counters.drops, 0); assert.equal(e.d.time, time); assert.equal(t.d.zipVfxCarry, .25);
    }
    for (const dt of [Infinity, 5, Number.MAX_VALUE]) {
      const prior = e.counters.drops;
      e.d.update(dt, e.G.camera); // existing Director policy clamps these to .1s
      assert.equal(e.counters.drops - prior, 4);
      assert.equal(t.d.zipVfxCarry, .25);
      e.step(1 / 240); assert.equal(e.counters.drops - prior, 4);
      e.step(1 / 120); assert.equal(e.counters.drops - prior, 6);
      assert.equal(t.d.zipVfxCarry, 0);
      e.step(1 / 240);
    }
    assert.ok(Array.from(e.pool.p.subarray(0, e.pool.n * e.pool.S)).every(Number.isFinite));
    assert.equal(e.d.errors, 0);
  } finally { e.fx.dispose?.(); }
});

test('minimum-quality pools stay bounded at two and eight Zipcasters across five rates, including stalls', async () => {
  const e = await boot(.35), measurements = [];
  try {
    for (const actors of [2, 8]) for (const hz of RATES) {
      for (let i = 0; i < actors; i++) e.actor('zip');
      e.d.kit.clear(); e.resetCounters();
      e.run(hz, 2);
      assert.equal(e.counters.drops, actors * 240); assert.equal(e.counters.coat, actors * 12);
      const prior = e.counters.drops; e.step(10);
      assert.equal(e.counters.drops - prior, actors * 4);
      e.step(1 / 240); assert.equal(e.counters.drops - prior, actors * 4, 'no backlog after stall');
      assert.ok(e.counters.peak <= e.pool.cap);
      if (actors === 2) assert.equal(e.counters.evictions, 0);
      else {
        assert.equal(e.counters.peak, e.pool.cap, 'overload reaches the fixed pool capacity');
        assert.ok(e.counters.evictions > 0, 'report expected saturation; do not alter native 60 Hz density');
      }
      assert.ok(e.d.kit.inkBeams.recs.length <= actors); assert.ok(e.d.kit.ribbons.list.length <= actors);
      assert.equal(e.d.errors, 0);
      measurements.push({ hz, actors, seconds: 2, drops: e.counters.drops, coat: e.counters.coat,
        peakPuffs: e.counters.peak, cap: e.pool.cap, evictions: e.counters.evictions });
      e.clear();
      assert.deepEqual({ ...e.d.kit.stats() }, { sparks: 0, puffs: 0, ribbons: 0, shapes: 0, draws: 12 });
    }
    console.log('Zipcaster composed bounded-load CPU measurements ' + JSON.stringify(measurements));
  } finally { e.fx.dispose?.(); }
});
