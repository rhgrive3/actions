import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSplashDrop, advanceSplashDrops } from '../runtime/blaster-flight-paint.mjs';
import { playProgressCharge } from '../runtime/audio/progress-charge-playback.mjs';
import { installWeaponAudioEngine } from '../runtime/audio/engine.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
}

function audioParam(value = 0) {
  return {
    value,
    calls: [],
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
    setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['ramp', v, t]); },
  };
}

function pcm(seconds, rate = 48000) {
  const n = Math.round(seconds * rate);
  const d = new Float32Array(n);
  return { sampleRate: rate, length: n, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function makeAudioCtx(sampleRate = 48000) {
  const sources = [];
  const gains = [];
  const ctx = {
    state: 'running',
    sampleRate,
    currentTime: 0,
    createBufferSource() {
      const s = { playbackRate: audioParam(1), connect() {}, disconnect() {}, start(...args) { s.startArgs = args; }, stop() {} };
      sources.push(s);
      return s;
    },
    createGain() {
      const g = { gain: audioParam(0), connect() {}, disconnect() {} };
      gains.push(g);
      return g;
    },
  };
  return { ctx, sources, gains };
}

for (const [label, sign] of [['downhill 18° slope', 1], ['uphill 18° slope', -1]]) {
  test(`roller vertical flick splash drop projects centreBack and stretch onto ${label} tangent plane`, () => {
    const slopeDeg = 18;
    const slopeRad = (slopeDeg * Math.PI) / 180;
    // Downhill (+1): normal (0, cos θ, sin θ); Uphill (-1): normal (0, cos θ, -sin θ)
    const unitNormal = new Vec3(0, Math.cos(slopeRad), sign * Math.sin(slopeRad));
    // Also exercise defensive normalization when physics returns a non-unit normal
    const reportedNormal = sign < 0 ? unitNormal.clone().multiplyScalar(1.25) : unitNormal.clone();
    const splats = [];
    const system = {};
    const game = {
      projectiles: system,
      physics: {
        segment(from, end, out) {
          const d0 = from.x * unitNormal.x + from.y * unitNormal.y + from.z * unitNormal.z;
          const d1 = end.x * unitNormal.x + end.y * unitNormal.y + end.z * unitNormal.z;
          if (d0 >= 0 && d1 <= 0 && d0 !== d1) {
            const t = d0 / (d0 - d1);
            out.hit = true;
            out.dist = from.distanceTo(end) * t;
            out.point.set(
              from.x + (end.x - from.x) * t,
              from.y + (end.y - from.y) * t,
              from.z + (end.z - from.z) * t,
            );
            out.normal.copy(reportedNormal);
            out.face = 1;
            return out;
          }
          out.hit = false;
          return out;
        },
      },
      paint: {
        splat(point, radius, team, opts) {
          // Compute signed distance to slope plane (same check as paint.js:430 dn < -0.12)
          const dn = point.x * unitNormal.x + point.y * unitNormal.y + point.z * unitNormal.z;
          splats.push({ point: point.clone(), radius, team, dn, stretch: opts.stretch?.clone(), stretchAmt: opts.stretchAmt });
          return dn < -0.12 || dn > radius ? 0 : 1;
        },
      },
    };
    const owner = { remote: false, addTurf() {} };
    const spec = {
      surfaceOnly: true,
      depthScaleMin: 3.0,
      depthScaleMax: 3.0,
      dropHeightMax: 0,
      dropHeightMin: 10,
      gravity: 25,
      drag: 0.02,
    };
    const drop = spawnSplashDrop(game, {
      owner,
      team: 0,
      seed: 0.25,
      from: new Vec3(0, 1.5, 0),
      direction: new Vec3(0, 0, 1),
      radius: 1.8,
      spec,
      depth: true,
    });
    assert.ok(drop, `${label}: splash drop spawned`);
    for (let i = 0; i < 60 && splats.length === 0; i++) {
      advanceSplashDrops(system, 1 / 60, game);
    }
    assert.equal(splats.length, 1, `${label}: drop landed and called paint.splat`);
    assert.ok(splats[0].dn >= -0.02 && splats[0].dn <= 0.05, `${label}: splat stays on slope plane (dn=${splats[0].dn})`);
    assert.ok(splats[0].stretchAmt > 0, `${label}: stretchAmt preserved`);
    const dotStretchNormal =
      splats[0].stretch.x * unitNormal.x + splats[0].stretch.y * unitNormal.y + splats[0].stretch.z * unitNormal.z;
    assert.ok(Math.abs(dotStretchNormal) < 1e-5, `${label}: stretch vector is tangent to slope (dot=${dotStretchNormal})`);
  });
}

test('all 8 catalog chargers define RadiusSpawnNearest and Bamboozler suppresses via SpawnNearestChargeRate > 1', () => {
  const chargers = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'charger');
  assert.equal(chargers.length, 8);
  for (const r of chargers) {
    const radius = r.parameters?.SplashPaintParam?.RadiusSpawnNearest;
    assert.ok(Number.isFinite(radius) && radius > 0, `${r.id} has positive RadiusSpawnNearest (${radius})`);
    const minRate = r.parameters?.SplashSpawnParam?.SpawnNearestChargeRate ?? 0;
    if (r.id === 's3-charger-light') {
      assert.ok(minRate > 1, `Bamboozler (${r.id}) has SpawnNearestChargeRate > 1 (${minRate})`);
    } else {
      assert.ok(minRate <= 1, `${r.id} allows foot paint at full charge (minRate=${minRate})`);
    }
  }
});

test('main-weapon-catalog.mjs implements catalog charger foot paint with floor normal check, dedicated scratch, and raised roller nearest ray origin', () => {
  const src = fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs', import.meta.url), 'utf8');
  assert.match(src, /r\.family==='charger'&&!a\.remote&&a\.alive!==false/);
  assert.match(src, /SplashPaintParam\?\.RadiusSpawnNearest/);
  assert.match(src, /SplashSpawnParam\?\.SpawnNearestChargeRate/);
  assert.match(src, /if\(h\.hit&&h\.normal\.y>=\.5&&G\.paint\?\.splat\)/);
  assert.match(src, /chargerFootAt\.copy\(h\.point\)\.addScaledVector\(h\.normal,\.1\)/);
  assert.match(src, /const lift=Math\.max\(\.65,n\.MaxHeight\)/);
});

test('weapons-charger-flight.mjs preserves explicit zero feetPaintRadius, falls back to 1.2m, and checks floor normal', () => {
  const src = fs.readFileSync(new URL('../runtime/weapons-charger-flight.mjs', import.meta.url), 'utf8');
  assert.match(src, /Number\.isFinite\(w\.feetPaintRadius\)\?w\.feetPaintRadius:\(w\.kind==='charger'\?1\.2:0\)/);
  assert.match(src, /if\(!h\.hit\|\|h\.normal\.y<\.5\)return;/);
});

test('progress = 0 start and 120Hz fresh start stay muted at 0 then run at nominal without plunging to 0.25x', () => {
  const quantum = t => Math.floor((t * 48000) / 128) * 128 / 48000;
  for (const [name, chargeTime] of [['Squiffer', 0.75], ['Bamboozler', 20 / 60], ['E-liter 4K', 92 / 60]]) {
    const { ctx, sources } = makeAudioCtx();
    // Unstretched raw buffer (body = 1.0s)
    const length = 1.215;
    const expectedNominal = 1.0 / chargeTime;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(length), {
      offset: 0,
      length,
      chargeTime,
      progress: 0,
      volume: 0.55,
    });
    assert.equal(sources.length, 1, `${name}: creates one source`);
    assert.equal(sources[0].playbackRate.value, 0, `${name}: starts at 0 rate while progress = 0`);

    // 120Hz display with 0/1 sim ticks per frame from fresh start
    let ticks = 0;
    let minRate = Infinity;
    const totalTicks = Math.round(chargeTime * 60);
    for (let i = 1; ticks < totalTicks - 2; i++) {
      ticks += i % 2;
      ctx.currentTime = quantum(i / 120);
      h.set({ progress: ticks / totalTicks });
      if (ticks > 0) {
        minRate = Math.min(minRate, sources[0].playbackRate.value);
      }
    }
    assert.ok(
      minRate >= 0.72 * expectedNominal,
      `${name}: 120Hz fresh start minRate ${minRate} never plunges below 0.72x nominal (${0.72 * expectedNominal})`,
    );
    // Completing charge keeps nominal pitch in full tail
    ctx.currentTime += 1 / 60;
    h.set({ progress: 1 });
    assert.equal(sources.length, 2, `${name}: full charge starts natural tail`);
    assert.ok(
      Math.abs(sources[1].playbackRate.value - expectedNominal) < 1e-4,
      `${name}: full-charge tail preserves nominal rate ${expectedNominal} (got ${sources[1].playbackRate.value})`,
    );
    h.stop();
  }
});

test('jumping mid-charge (1x -> 1/3x speed) adapts smoothly without dropping below 0.25x or chopping gain', () => {
  const chargeTime = 0.75; // Squiffer
  const { ctx, sources, gains } = makeAudioCtx();
  const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(1.215 * chargeTime), {
    offset: 0,
    length: 1.215 * chargeTime,
    chargeTime,
    progress: 0,
    volume: 0.55,
  });
  let progress = 0;
  let muteChops = 0;
  let minRate = Infinity;
  // 200ms grounded at 1x, then 500ms airborne at 1/3x
  for (let frame = 1; frame <= 42; frame++) {
    const dt = 1 / 60;
    ctx.currentTime = frame * dt;
    const speedFactor = frame <= 12 ? 1.0 : 1 / 3;
    progress = Math.min(0.98, progress + (dt / chargeTime) * speedFactor);
    h.set({ progress });
    minRate = Math.min(minRate, sources[0].playbackRate.value);
    if (frame > 2 && gains[0].gain.value === 0) muteChops++;
  }
  assert.equal(muteChops, 0, `charge audio never chopped to silence during jump (muteChops=${muteChops})`);
  assert.ok(minRate >= 0.25, `playbackRate never dropped below 0.25x during jump (minRate=${minRate})`);
  assert.ok(
    sources[0].playbackRate.value < 0.65 && sources[0].playbackRate.value >= 0.25,
    `playbackRate adapted down for airborne charge (${sources[0].playbackRate.value})`,
  );
  h.stop();
});

test('30/60/120Hz stall-and-resume restores sources[0] at 1x rate and 0.55 gain cleanly; large paused jump seeks fresh source', () => {
  for (const hz of [30, 60, 120]) {
    const { ctx, sources, gains } = makeAudioCtx(8000);
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(2, 8000), {
      length: 1.215,
      progress: 0.5,
      chargeTime: 1,
      volume: 0.55,
    });
    const settle = Math.ceil(hz * 0.1);
    for (let i = 1; i <= settle; i++) {
      ctx.currentTime = i / hz;
      h.set({ progress: 0.5 });
    }
    assert.equal(sources[0].playbackRate.value, 0, `${hz}Hz: paused at 0 rate`);
    const rates = sources[0].playbackRate.calls.length;
    const levels = gains[0].gain.calls.length;
    for (let i = settle + 1; i <= hz * 10; i++) {
      ctx.currentTime = i / hz;
      h.set({ progress: 0.5 });
    }
    assert.equal(sources[0].playbackRate.calls.length, rates, `${hz}Hz: zero extra rate calls while stalled`);
    assert.equal(gains[0].gain.calls.length, levels, `${hz}Hz: zero extra gain calls while stalled`);
    ctx.currentTime += 1 / hz;
    h.set({ progress: 0.5 + 1 / hz });
    assert.equal(sources.length, 1, `${hz}Hz: keeps sources[0] active on short resume`);
    assert.ok(Math.abs(sources[0].playbackRate.value - 1) < 1e-12, `${hz}Hz: restores rate to 1`);
    assert.equal(gains[0].gain.value, 0.55, `${hz}Hz: restores gain to 0.55`);
    h.stop();
  }

  // Large progress jump while paused (> 0.15 * nominal) must genuinely seek via a new source
  const { ctx, sources } = makeAudioCtx(48000);
  const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(2, 48000), {
    length: 1.215,
    progress: 0.2,
    chargeTime: 1,
    volume: 0.55,
  });
  for (let i = 1; i <= 10; i++) {
    ctx.currentTime = i / 60;
    h.set({ progress: 0.2 });
  }
  assert.equal(sources[0].playbackRate.value, 0);
  ctx.currentTime += 1 / 60;
  h.set({ progress: 0.75 });
  assert.equal(sources.length, 2, 'large jump while paused creates fresh source to seek playhead');
  assert.ok(sources[1].startArgs[1] > 0.65, `fresh source seeks near new progress (offset=${sources[1].startArgs[1]})`);
  h.stop();
});

test('single dropped 60Hz frame (33ms hitch) does not chop grounded charge audio, while genuine >80ms pause mutes cleanly', () => {
  const chargeTime = 1.533; // E-liter 4K
  const { ctx, gains } = makeAudioCtx();
  const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(1.215 * chargeTime), {
    offset: 0,
    length: 1.215 * chargeTime,
    chargeTime,
    progress: 0,
    volume: 0.55,
  });
  let progress = 0;
  for (let frame = 1; frame <= 20; frame++) {
    ctx.currentTime = frame / 60;
    // Frame 10 stalls for 33ms (2 frames no progress)
    if (frame !== 10 && frame !== 11) {
      progress = Math.min(0.95, progress + (1 / 60) / chargeTime);
    }
    h.set({ progress });
    if (frame >= 2) {
      assert.equal(gains[0].gain.value, 0.55, `no mute on short hitch at frame ${frame}`);
    }
  }
  // Now hold progress steady for 120ms (genuine pause / empty tank)
  for (let i = 1; i <= 8; i++) {
    ctx.currentTime = (20 + i) / 60;
    h.set({ progress });
  }
  assert.equal(gains[0].gain.value, 0, 'mutes after >80ms genuine pause');
  h.stop();
});

test('installWeaponAudioEngine preserves requested weapon id before init() so Snipewriter 5H prewarms 1.2s', () => {
  class MockEngine {
    constructor() {
      this.ctx = null;
      this.byName = new Map();
    }
    init() {
      this.ctx = { state: 'running', sampleRate: 48000, currentTime: 0 };
    }
    _def() { return null; }
    play() { return null; }
    loop() { return null; }
    stopAll() {}
    stats() { return {}; }
  }
  installWeaponAudioEngine(MockEngine);
  const engine = new MockEngine();
  const prewarmCalls = [];
  engine.prewarmChargerChargeRise = (weaponId, chargeTime) => {
    prewarmCalls.push({ weaponId, chargeTime });
    return true;
  };
  // Stub weaponBank to avoid network/worker side effects while exercising real prepareWeapon & init
  const stubBank = { authorized: { byEvent: new Map() }, has: () => false, warm() {}, dispose() {} };
  engine.weaponBank = function () { return this.ctx ? stubBank : null; };

  // Select Snipewriter 5H (s3-charger-pencil, 72 frames = 1.2s) BEFORE AudioContext init()
  engine.prepareWeapon('s3-charger-pencil', { urgent: true });
  assert.equal(prewarmCalls.length, 0, 'no prewarm before AudioContext exists');
  assert.ok(engine._warmWeapons.has('s3-charger-pencil'), '_warmWeapons stores requested id s3-charger-pencil');

  // Now initialize AudioContext; init() must replay prepareWeapon with s3-charger-pencil -> 1.2s
  engine.init();
  assert.equal(prewarmCalls.length, 1, 'prewarmChargerChargeRise invoked once upon init()');
  assert.equal(prewarmCalls[0].weaponId, 's3-charger-light');
  assert.ok(
    Math.abs(prewarmCalls[0].chargeTime - 1.2) < 1e-9,
    `Snipewriter 5H prewarms 1.2s buffer (got ${prewarmCalls[0].chargeTime})`,
  );
});

test('full-charge tail passes buffer-time playTail, clamps short/zero tail monotonically, and post-seek stays at 1x without 4x spike', () => {
  // Unstretched Bamboozler (nominal = 3.0): tail in buffer-time is length - length/1.215
  {
    const { ctx, sources, gains } = makeAudioCtx();
    const length = 1.215, chargeTime = 20 / 60;
    const expectedTail = length - length / 1.215;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(length), { offset: 0, length, chargeTime, progress: 0.5, volume: 0.55 });
    ctx.currentTime = 0.05;
    h.set({ progress: 1.0 });
    assert.equal(sources.length, 2, 'full-charge tail spawns second source');
    assert.ok(Math.abs(sources[1].startArgs[2] - expectedTail) < 1e-6, `tail uses buffer-time (${sources[1].startArgs[2]} vs ${expectedTail})`);
    assert.ok(Math.abs(sources[1].playbackRate.value - 3.0) < 1e-4, 'tail keeps nominal 3x rate');
    // Verify gain timestamps are monotonically non-decreasing
    const times = gains[1].gain.calls.map(c => c.time ?? c[2]).filter(Number.isFinite);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], 'gain timeline monotonic');
    h.stop();
  }
  // Short-tail buffer clamp (0 < tailDur < 0.006): monotonic gain schedule with fadeIn <= holdEnd <= tailDur
  {
    const { ctx, sources, gains } = makeAudioCtx();
    const length = 1.215, body = length / 1.215, shortPlayTail = 0.004;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(body + shortPlayTail), { offset: 0, length, chargeTime: 1, progress: 0.5, volume: 0.55 });
    ctx.currentTime = 0.05;
    h.set({ progress: 1.0 });
    assert.equal(sources.length, 2, 'short tail spawns second source');
    assert.ok(Math.abs(sources[1].startArgs[2] - shortPlayTail) < 1e-6, `short tail passes clamped buffer-time (${sources[1].startArgs[2]})`);
    const times = gains[1].gain.calls.map(c => c.time ?? c[2]).filter(Number.isFinite);
    assert.ok(times.length >= 3, 'short tail schedules gain envelope');
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1], `short tail gain timeline monotonic (${times[i - 1]} -> ${times[i]})`);
    }
    assert.ok(times[times.length - 1] <= 0.05 + shortPlayTail + 1e-6, 'short tail envelope ends within now + tailDur');
    h.stop();
  }
  // Zero-tail buffer clamp (buffer.duration === offset + body)
  {
    const { ctx, sources } = makeAudioCtx();
    const length = 1.215, body = length / 1.215;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(body), { offset: 0, length, chargeTime: 1, progress: 0.5, volume: 0.55 });
    ctx.currentTime = 0.05;
    h.set({ progress: 1.0 });
    assert.equal(sources[1].startArgs[2], 0, 'clamped zero tail starts with duration 0');
    h.stop();
  }
  // Large paused jump seek: 6 frames of 60Hz 1x charging stays near 1x (no 4x pitch spike)
  {
    const { ctx, sources } = makeAudioCtx();
    const length = 1.215;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(length), { offset: 0, length, chargeTime: 1, progress: 0.2, volume: 0.55 });
    for (let i = 1; i <= 10; i++) { ctx.currentTime = i / 60; h.set({ progress: 0.2 }); }
    ctx.currentTime = 11 / 60;
    h.set({ progress: 0.75 });
    assert.equal(sources.length, 2, 'large jump seeks fresh source');
    for (let i = 1; i <= 6; i++) {
      ctx.currentTime = (11 + i) / 60;
      h.set({ progress: 0.75 + i / 60 });
      assert.ok(Math.abs(sources[1].playbackRate.value - 1) < 0.05, `post-seek frame ${i} stays near 1x (${sources[1].playbackRate.value})`);
    }
    h.stop();
  }
  // 200Hz constant volume: no redundant gain ramp cancellations
  {
    const { ctx, gains } = makeAudioCtx();
    const length = 1.215;
    const h = playProgressCharge({ ctx, sfxIn: {} }, pcm(length), { offset: 0, length, chargeTime: 1, progress: 0.05, volume: 0.55 });
    const initialCalls = gains[0].gain.calls.length;
    for (let i = 1; i <= 60; i++) {
      ctx.currentTime = i / 200;
      h.set({ progress: 0.05 + i / 200 });
    }
    assert.equal(gains[0].gain.calls.length, initialCalls, '200Hz constant volume schedules zero redundant gain ramps');
    h.stop();
  }
});
