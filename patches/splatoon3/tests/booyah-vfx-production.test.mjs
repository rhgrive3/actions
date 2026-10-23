import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { specialVfxDirector } from '../runtime/special-vfx.mjs';
import { SPARK } from '../runtime/special-vfx-kit.mjs';
import { terminalFrozen, section } from './booyah-vfx-fixture.mjs';
import { pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';

const minifier = process.env.BOOYAH_TEST_MINIFIED === '1'
  ? await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild') : null;

const HZ = [30, 60, 120, 144, 240];
async function boot({ candidate42 = process.env.BOOYAH_TEST_CANDIDATE42 === '1' } = {}) {
  let rngCalls = 0;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    adaptRuntime(rel, text) {
      if (candidate42 && rel === 'patches/splatoon3/runtime/special-vfx.mjs') {
        const begin = text.indexOf('  updateObjects(dt) {'), end = text.indexOf('\n  // ------------------------------------------------------------------ kit specials', begin);
        text = text.slice(0, begin) + terminalFrozen.updateObjects + text.slice(end);
        text = text.replace(section(text, 'object'), terminalFrozen.object);
      }
      if (rel === 'patches/splatoon3/runtime/special-vfx-kit.mjs') {
        const next = text.replace(/export function vfxRandom\(\) \{[\s\S]*?\n\}/, 'export function vfxRandom() { return globalThis.__booyahPresentationRandom(); }');
        assert.notEqual(next, text); text = next;
      }
      if (minifier && /patches\/splatoon3\/runtime\/special-vfx(?:-kit)?\.mjs$/.test(rel)) {
        const output = minifier.transformSync(adaptBuildSource(rel, text), { loader: 'js', format: 'esm', minify: true,
          charset: 'utf8', legalComments: 'inline', sourcefile: rel }).code;
        return compactModuleStrings(output).code;
      }
      return text;
    },
    adaptEmittedRuntime(rel, text) {
      if (rel === 'patches/splatoon3/runtime/special-vfx-kit.mjs') {
        // Read the emitted export binding; keep the actual built VFX module unchanged.
        const name = text.match(/([\w$]+) as vfxRandom\b/)?.[1];
        assert.ok(name, 'minified kit exports its presentation RNG');
        const begin = text.indexOf('function ' + name + '(){'), end = text.indexOf('}', begin);
        assert.ok(begin >= 0 && end > begin, 'locate the emitted RNG function body');
        return text.slice(0, begin) + 'function ' + name + '(){return globalThis.__booyahPresentationRandom();}' + text.slice(end + 1);
      }
      return text;
    } });
  f.context.__booyahPresentationRandom = () => { rngCalls++; return .2; };
  const { G, THREE } = f, api = f.installedRuntime;
  G.scene = new THREE.Scene(); G.projectiles = new api.Projectiles(G.scene);
  const fx = new api.FX(G.scene, { quality: 'high' }); fx.setCollider(() => null); G.fx = fx;
  G.camera = new THREE.PerspectiveCamera(60, 1, .1, 300); G.camera.position.set(0, 4, -8); G.camera.updateMatrixWorld(true);
  G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  const d = specialVfxDirector(fx), counts = { suction: 0, flightStars: 0, chargedStars: 0, scatter: 0, bursts: 0 };
  const spark = d.spark, drop = d.drop, flash = d.flash;
  d.spark = function (...args) {
    if (args[0] === SPARK.STREAK && args[5] === .3) counts.suction++;
    if (args[0] === SPARK.STAR && args[5] === .35) counts.flightStars++;
    if (args[0] === SPARK.STAR && args[5] === .2) counts.chargedStars++;
    return spark.apply(this, args);
  };
  d.drop = function (...args) { if (args[4] === .7 && args[5] === .16) counts.scatter++; return drop.apply(this, args); };
  d.flash = function (...args) { if (args[2] === 4 && args[3] === .35) counts.bursts++; return flash.apply(this, args); };
  const reset = () => { fx.clear(); G.projectiles.clear(); G.actors.length = 0; Object.keys(counts).forEach(k => counts[k] = 0); };
  const add = (scatter = false) => {
    const a = f.make('shooter'); a.isLocal = true; a.pos.set(0, 2, 0);
    a.weapon = { ...a.weapon, special: 'booyahBomb', specialCost: 200 }; a.special = 200; a._startSpecial();
    a._s3AllSpecialState.charge = 1;
    const p = { wid: 'booyahBomb', seed: 23, s3AllSpecialSeed: 17, owner: a, team: 0, pos: new THREE.Vector3(2, 4, 3), vel: new THREE.Vector3() };
    const o = { kind: 'booyahBlast', frameCount: scatter ? 60 : 20, maxRadius: 12.6, pos: new THREE.Vector3(4, 0, 5), owner: a, team: 0 };
    G.projectiles.list.push(p); (G.projectiles._s3AllSpecialObjects ||= []).push(o);
    // Create records without advancing their clocks; every measured update is installed FX.update.
    d.updateObjects(0);
    if (scatter) d.objects.get(o).blasted = true;
    return { a, p, o, warn: d.objects.get(o).d.warn };
  };
  const advance = dt => { if (Number.isFinite(dt) && dt > 0) G.time += dt; fx.update(dt, G.camera); };
  return { f, G, fx, d, counts, reset, add, advance, rngCalls: () => rngCalls };
}
const authority = (a, p, o) => JSON.stringify({ pos: a.pos.toArray(), hp: a.hp, gauge: a.special, state: a._s3AllSpecialState,
  projectile: { wid: p.wid, seed: p.seed, specialSeed: p.s3AllSpecialSeed, pos: p.pos.toArray(), vel: p.vel.toArray() },
  object: { kind: o.kind, frameCount: o.frameCount, maxRadius: o.maxRadius, pos: o.pos.toArray() } }, (k, v) => k === 'actor' || k === 'owner' ? undefined : v);
test('installed production-composed fixed-phase presentation matches all refresh rates and leaves authority untouched', async () => {
  const env = await boot(), { G, fx, d, counts, reset, add, advance } = env, measurements = [];
  let paint = 0, hits = 0, events = 0, gameplayRandom = 0;
  G.paint = { sample: () => 1, splat() { paint++; return 0; } };
  G.projectiles.applyHit = () => { hits++; };
  const off = env.f.on('all:special', () => events++);
  try {
    for (const hz of HZ) {
      env.f.restoreRandom();
      reset(); const { a, p, o, warn } = add(), angle0 = warn.v[7], before = authority(a, p, o);
      events = 0; gameplayRandom = 0; env.f.setRandom(() => { gameplayRandom++; return .5; });
      for (let k = 0; k < hz; k++) advance(1 / hz);
      const angle = warn.v[7] - angle0;
      assert.ok(Math.abs(angle - 1.2) < 1e-6);
      assert.deepEqual({ ...counts }, { suction: 60, flightStars: 60, chargedStars: 60, scatter: 0, bursts: 0 });
      assert.equal(authority(a, p, o), before);
      assert.deepEqual({ paint, hits, events, gameplayRandom }, { paint: 0, hits: 0, events: 0, gameplayRandom: 0 });
      const holdStats = { ...d.kit.stats() };
      for (const pool of d.kit.pools) assert.ok(pool.n === undefined ? pool.recs.length < pool.cap : pool.n <= pool.cap);
      env.f.restoreRandom(); reset(); add(true);
      for (let k = 0; k < hz; k++) advance(1 / hz);
      assert.equal(counts.scatter, 60); assert.equal(counts.bursts, 0);
      measurements.push({ hz, angle: +angle.toFixed(6), suction: 60, flightStars: 60, chargedStars: 60, scatter: counts.scatter, holdStats, scatterStats: { ...d.kit.stats() } });
    }
    assert.equal(d.errors, 0);
    console.log('Booyah installed production fixed-phase measurements', JSON.stringify(measurements));
  } finally { env.f.restoreRandom(); off?.(); fx.dispose(); }
});

test('installed phase boundaries, cancellation, projectile reuse and clear restart fractional clocks', async () => {
  const env = await boot(), { G, fx, d, counts, reset, add, advance } = env;
  try {
    const { a, p, o, warn } = add();
    advance(1 / 240); assert.equal(counts.suction, 0); assert.equal(counts.chargedStars, 0);
    o.frameCount = 39; advance(1 / 240); assert.equal(counts.bursts, 0); assert.ok(warn.v[11] > 0);
    o.frameCount = 40; advance(1 / 240); assert.equal(counts.bursts, 1); assert.equal(warn.v[11], 0);
    // With the previous three quarter-ticks retained, the next tick belongs to frame 41.
    o.frameCount = 41; advance(1 / 240);
    assert.equal(counts.scatter, 1); advance(1 / 240); assert.equal(counts.scatter, 1); assert.equal(counts.bursts, 1);
    // Reuse the actual projectile object with a changed seed, forcing a fresh presentation record.
    advance(1 / 240); const previous = d.rounds.get(p); p.seed++; const starBefore = counts.flightStars;
    advance(1 / 120); assert.notEqual(d.rounds.get(p), previous); assert.equal(counts.flightStars, starBefore);
    advance(1 / 120); assert.equal(counts.flightStars, starBefore + 1);
    const oldTrack = d.tracks.get(a), oldObject = d.objects.get(o);
    a.alive = false; o.dead = true; p.dead = true; advance(1 / 240);
    assert.equal(d.tracks.has(a), false); assert.equal(d.objects.has(o), false); assert.equal(d.rounds.has(p), false);
    assert.equal(oldTrack.d.orb.dead, true); assert.equal(oldObject.d.warn.dead, true);
    a.alive = true; o.dead = false; o.frameCount = 20; p.dead = false; const before = { ...counts };
    advance(1 / 120);
    assert.notEqual(d.tracks.get(a), oldTrack); assert.notEqual(d.objects.get(o), oldObject);
    assert.equal(counts.suction, before.suction); assert.equal(counts.flightStars, before.flightStars); assert.equal(counts.chargedStars, before.chargedStars);
    advance(1 / 120); assert.equal(counts.suction, before.suction + 1); assert.equal(counts.flightStars, before.flightStars + 1);
    reset(); add(); advance(1 / 120); assert.equal(counts.suction, 0); assert.equal(counts.flightStars, 0); assert.equal(counts.chargedStars, 0);
    reset(); assert.deepEqual({ ...d.kit.stats() }, { sparks: 0, puffs: 0, ribbons: 0, shapes: 0, draws: 12 });
    assert.equal(d.errors, 0); assert.equal(G.actors.length, 0);
  } finally { fx.dispose(); }
});

test('installed director ignores zero/invalid dt and bounds large updates, repeated stalls and multiple Booyahs', async () => {
  const env = await boot(), { fx, d, counts, add, advance } = env;
  try {
    const resources = d.kit.root.children.map(m => [m, m.geometry, m.material]);
    for (let k = 0; k < 24; k++) add(k % 2 === 0);
    advance(1 / 240);
    const prior = { ...counts }, calls = env.rngCalls(), time = d.time;
    // Exercise the presentation director directly: native FX.update does not sanitize NaN.
    for (const dt of [0, -1, NaN, -Infinity]) d.update(dt, env.G.camera);
    assert.deepEqual({ ...counts }, prior); assert.equal(env.rngCalls(), calls); assert.equal(d.time, time);
    for (const dt of [Infinity, 10000]) {
      const before = { ...counts }; d.update(dt, env.G.camera);
      assert.equal(counts.flightStars - before.flightStars, 48); assert.equal(counts.chargedStars - before.chargedStars, 48);
      assert.equal(counts.suction - before.suction, 24); assert.equal(counts.scatter - before.scatter, 24);
    }
    for (let k = 0; k < 120; k++) advance(.1);
    for (const pool of d.kit.pools) assert.ok(pool.n === undefined ? pool.recs.length < pool.cap : pool.n <= pool.cap, pool.mesh.name);
    assert.ok(d.kit.ribbons.list.length <= 40); assert.ok(d.kit.glowRibbons.list.length <= 28);
    assert.equal(d.kit.root.children.length, resources.length);
    resources.forEach(([mesh, geometry, material], i) => {
      assert.equal(d.kit.root.children[i], mesh); assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material);
    });
    assert.equal(d.errors, 0);
    console.log('Booyah 24-instance repeated-stall bounds', JSON.stringify({ stats: d.kit.stats(), caps: { sparks: d.kit.sparks.cap, puffs: d.kit.puffs.cap }, counts: { ...counts } }));
    fx.clear(); assert.equal(d.objects.size + d.rounds.size + d.tracks.size, 0);
    assert.equal(d.kit.stats().sparks + d.kit.stats().puffs + d.kit.stats().shapes + d.kit.stats().ribbons, 0);
  } finally { fx.dispose(); }
});

test('installed terminal drain is per record and immediate; another owner cancelled at 79 receives no drain', async () => {
  const env = await boot(), { G, fx, d, counts, add, advance } = env;
  try {
    const a = add(true), b = add(true);
    a.o.frameCount = 78; b.o.frameCount = 79;
    advance(1 / 30);
    const ra = d.objects.get(a.o), rb = d.objects.get(b.o), before = counts.scatter;
    const authorityA = authority(a.a, a.p, a.o), authorityB = authority(b.a, b.p, b.o);
    // Only test-owned source fields change; neither owner nor its gauge is authored by the drain.
    a.o.frameCount = 80; a.o.dead = true; b.o.dead = true;
    G.projectiles._s3AllSpecialObjects.length = 0;
    const stateA = authority(a.a, a.p, a.o), stateB = authority(b.a, b.p, b.o);
    d.updateObjects(1 / 30);
    assert.equal(counts.scatter, before + 1); assert.equal(ra.particleFrame, 80); assert.equal(rb.particleFrame, 79);
    assert.equal(d.objects.size, 0); assert.equal(ra.d.warn.dead, true); assert.equal(rb.d.warn.dead, true);
    assert.equal(authority(a.a, a.p, a.o), stateA); assert.equal(authority(b.a, b.p, b.o), stateB);
    assert.notEqual(authorityA, stateA); assert.equal(authorityB, stateB);
    const calls = env.rngCalls(); d.updateObjects(1 / 30);
    assert.equal(counts.scatter, before + 1); assert.equal(env.rngCalls(), calls); assert.equal(d.errors, 0);
  } finally { fx.dispose(); }
});

test('native Booyah launch and 40F/80F world clocks keep identical damage, paint, events and gauge with presentation on/off at every rate', async () => {
  const env = await boot(), { f, G, fx, d, counts, reset } = env, measurements = [];
  try {
    for (const hz of [...HZ, 'boundary-jitter']) {
      const results = [];
      for (const enabled of [false, true]) {
        reset(); G.time = 0; fx.s3SpecialVfxEnabled = enabled;
        const owner = f.make('shooter'), center = f.make('shooter'), far = f.make('shooter');
        owner.weapon = { ...owner.weapon, special: 'booyahBomb', specialCost: 200 }; owner.special = 200;
        center.team = far.team = 1; center.pos.set(0, -.55, 0); far.pos.set(6, -.55, 0); center.hp = far.hp = 1000;
        let seed = 7; f.setRandom(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
        const paint = [], events = [], hits = [];
        G.paint = { sample: () => 1, splat(p, radius, team) { paint.push([...p.toArray(), radius, team]); return 0; } };
        const apply = G.projectiles.applyHit;
        G.projectiles.applyHit = function (...args) { hits.push([args[1] === center ? 'center' : args[1] === far ? 'far' : 'other', args[2], args[3]]); return apply.apply(this, args); };
        const off = f.on('all:special', e => events.push([e.id, e.action, e.activation, e.seed, e.pos]));
        try {
          owner._startSpecial(); for (let k = 0; k < 30; k++) owner._updateSpecial(1 / 60);
          owner._s3AllSpecialState.charge = 1;
          owner.intent.sub = true; owner._updateSpecial(1 / 60); owner.intent.sub = false; owner._updateSpecial(1 / 60);
          for (let k = 0; k < 16 && owner.specialActive; k++) owner._updateSpecial(1 / 60);
          const p = G.projectiles.list.find(p => p.s3AllSpecial === 'booyahBomb'); assert.ok(p, 'native launch');
          G.projectiles._blastBurst(p, new f.THREE.Vector3(0, 0, 0), null); G.projectiles.list.splice(G.projectiles.list.indexOf(p), 1);
          const blast = G.projectiles._s3AllSpecialObjects.find(o => o.kind === 'booyahBlast'); assert.ok(blast);
          assert.equal(blast.startDelay, 40 / 60); assert.equal(blast.expand, 40 / 60); assert.equal(blast.maxRadius, 12.6);
          const steps = hz === 'boundary-jitter'
            ? [...Array(39).fill(1 / 60), 1 / 30, ...Array(38).fill(1 / 60), 1 / 30]
            : Array(Math.ceil(80 * hz / 60)).fill(1 / hz);
          let firstBurstFrame = null, firstBurstSeconds = null, holdPeak = 0;
          for (const dt of steps) {
            G.time += dt; G.projectiles.update(dt); const before = counts.bursts; fx.update(dt, G.camera);
            if (counts.bursts !== before) { firstBurstFrame = blast.frameCount; firstBurstSeconds = G.time; }
            holdPeak = Math.max(holdPeak, d.kit.sparks.n);
          }
          assert.equal(blast.frameCount, 80); assert.equal(blast.dead, true); assert.equal(blast.paintFrame, 6);
          assert.equal(blast.paintedRadius, 13.5); assert.equal(G.projectiles._s3AllSpecialObjects.length, 0);
          assert.equal(hits.filter(x => x[0] === 'center' && x[1] === 3.3).length, 40); assert.equal(hits.filter(x => x[0] === 'far' && x[1] === 3.3).length, 21);
          if (enabled) {
            // The jitter case has no render callback at 40: its interval contains 40 and 41.
            assert.equal(firstBurstFrame, hz === 'boundary-jitter' ? 41 : 40);
            assert.ok(Math.abs(firstBurstSeconds - firstBurstFrame / 60) < 1e-9); assert.equal(counts.bursts, 1);
            assert.equal(counts.suction, 39); assert.equal(counts.scatter, 39);
          }
          results.push({ center: center.hp, far: far.hp, gauge: owner.special, special: owner.specialActive?.id ?? null,
            paint: JSON.stringify(paint), hits: JSON.stringify(hits), events: JSON.stringify(events), gameplaySeed: seed });
          if (enabled) measurements.push({ hz, firstBurstFrame, firstBurstSeconds: +firstBurstSeconds.toFixed(9),
            sourceEndFrame: blast.frameCount, centerHits: 40, farHits: 21, paintFrame: blast.paintFrame, paintedRadius: blast.paintedRadius,
            centerHP: +center.hp.toFixed(9), farHP: +far.hp.toFixed(9), gauge: owner.special, paintCalls: paint.length, eventCount: events.length,
            suction: counts.suction, scatter: counts.scatter, holdPeak });
        } finally { off?.(); G.projectiles.applyHit = apply; f.restoreRandom(); }
      }
      assert.deepEqual(results[1], results[0], hz + 'Hz native observer invariance');
    }
    assert.equal(d.errors, 0);
    console.log('Booyah actual native clock measurements', JSON.stringify(measurements));
  } finally { f.restoreRandom(); fx.dispose(); }
});
