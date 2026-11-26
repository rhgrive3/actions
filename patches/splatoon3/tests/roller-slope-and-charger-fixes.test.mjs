import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSplashDrop, advanceSplashDrops } from '../runtime/blaster-flight-paint.mjs';
import { playProgressCharge } from '../runtime/audio/progress-charge-playback.mjs';
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
    cancelScheduledValues() {},
    setValueAtTime(v) { this.value = v; this.calls.push(v); },
    linearRampToValueAtTime(v) { this.value = v; this.calls.push(v); },
  };
}

function pcm(seconds, rate = 48000) {
  const n = Math.round(seconds * rate);
  const d = new Float32Array(n);
  return { sampleRate: rate, length: n, duration: seconds, numberOfChannels: 1, getChannelData: () => d };
}

function makeAudioCtx() {
  const sources = [];
  const gains = [];
  const ctx = {
    state: 'running',
    sampleRate: 48000,
    currentTime: 0,
    createBufferSource() {
      const s = { playbackRate: audioParam(1), connect() {}, disconnect() {}, start() {}, stop() {} };
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

test('roller vertical flick splash drop projects centreBack and stretch onto downhill slope tangent plane', () => {
  const slopeDeg = 18;
  const slopeRad = (slopeDeg * Math.PI) / 180;
  // Downhill along +Z: plane passes through (0, 0, 0) with normal (0, cos θ, sin θ)
  const normal = new Vec3(0, Math.cos(slopeRad), Math.sin(slopeRad));
  const splats = [];
  const system = {};
  const game = {
    projectiles: system,
    physics: {
      segment(from, end, out) {
        const d0 = from.x * normal.x + from.y * normal.y + from.z * normal.z;
        const d1 = end.x * normal.x + end.y * normal.y + end.z * normal.z;
        if (d0 >= 0 && d1 <= 0 && d0 !== d1) {
          const t = d0 / (d0 - d1);
          out.hit = true;
          out.dist = from.distanceTo(end) * t;
          out.point.set(
            from.x + (end.x - from.x) * t,
            from.y + (end.y - from.y) * t,
            from.z + (end.z - from.z) * t,
          );
          out.normal.copy(normal);
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
        const dn = point.x * normal.x + point.y * normal.y + point.z * normal.z;
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
  assert.ok(drop, 'splash drop spawned');
  for (let i = 0; i < 60 && splats.length === 0; i++) {
    advanceSplashDrops(system, 1 / 60, game);
  }
  assert.equal(splats.length, 1, 'drop landed and called paint.splat');
  assert.ok(splats[0].dn >= -0.02 && splats[0].dn <= 0.05, `splat stays on slope plane (dn=${splats[0].dn})`);
  assert.ok(splats[0].stretchAmt > 0, 'stretchAmt preserved');
  const dotStretchNormal =
    splats[0].stretch.x * normal.x + splats[0].stretch.y * normal.y + splats[0].stretch.z * normal.z;
  assert.ok(Math.abs(dotStretchNormal) < 1e-5, `stretch vector is tangent to slope (dot=${dotStretchNormal})`);
});

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

test('main-weapon-catalog.mjs implements catalog charger foot paint and raised roller nearest ray origin', () => {
  const src = fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs', import.meta.url), 'utf8');
  assert.match(src, /r\.family==='charger'&&!a\.remote&&a\.alive!==false/);
  assert.match(src, /SplashPaintParam\?\.RadiusSpawnNearest/);
  assert.match(src, /SplashSpawnParam\?\.SpawnNearestChargeRate/);
  assert.match(src, /const lift=Math\.max\(\.65,n\.MaxHeight\)/);
});

test('weapons-charger-flight.mjs provides 1.2m feetPaintRadius fallback for legacy charger_scope', () => {
  const src = fs.readFileSync(new URL('../runtime/weapons-charger-flight.mjs', import.meta.url), 'utf8');
  assert.match(src, /w\.feetPaintRadius>0\?w\.feetPaintRadius:\(w\.kind==='charger'\?1\.2:0\)/);
});

test('non-1.0s chargers start immediately at nominal playbackRate without frame-1 pitch jump', () => {
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
    assert.ok(
      Math.abs(sources[0].playbackRate.value - expectedNominal) < 1e-4,
      `${name}: initial rate ${sources[0].playbackRate.value} equals nominal ${expectedNominal}`,
    );
    h.stop();
  }
});

test('jumping mid-charge (1x -> 1/3x speed) adapts smoothly without 30Hz mute chop', () => {
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
  // 200ms grounded at 1x, then 500ms airborne at 1/3x
  for (let frame = 1; frame <= 42; frame++) {
    const dt = 1 / 60;
    ctx.currentTime = frame * dt;
    const speedFactor = frame <= 12 ? 1.0 : 1 / 3;
    progress = Math.min(0.98, progress + (dt / chargeTime) * speedFactor);
    h.set({ progress });
    if (frame > 2 && gains[0].gain.value === 0) muteChops++;
  }
  assert.equal(muteChops, 0, `charge audio never chopped to silence during jump (muteChops=${muteChops})`);
  assert.ok(
    sources[0].playbackRate.value < 0.65 && sources[0].playbackRate.value > 0.05,
    `playbackRate adapted down for airborne charge (${sources[0].playbackRate.value})`,
  );
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

test('audio/engine.mjs passes resolved chargeTime to prewarmChargerChargeRise during prepareWeapon', () => {
  const src = fs.readFileSync(new URL('../runtime/audio/engine.mjs', import.meta.url), 'utf8');
  assert.match(src, /const CHARGER_CHARGE_TIME=new Map/);
  assert.match(src, /this\.prewarmChargerChargeRise\?\.\(id,resolvedChargeTime\)/);
});
