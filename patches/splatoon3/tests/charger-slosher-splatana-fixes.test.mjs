import test from 'node:test';
import assert from 'node:assert/strict';
import { playProgressCharge } from '../runtime/audio/progress-charge-playback.mjs';
import { chargerRiseBuffer, playChargerRise, disposeChargerRise } from '../runtime/audio/charger-charge-rise.mjs';
import { INK_PROFILE_SECTIONS, inkFootprintContains } from '../runtime/main-ink-footprints.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

function makeAudioEnv() {
  const sources = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    createBufferSource() {
      const rateCalls = [];
      const s = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: {
          value: 1,
          calls: rateCalls,
          cancelScheduledValues() {},
          setValueAtTime(v, t) { this.value = v; rateCalls.push({ v, t }); },
        },
        connect() {},
        disconnect() {},
        start(...args) { this.startArgs = args; },
        stop() {},
      };
      sources.push(s);
      return s;
    },
    createGain() {
      return {
        gain: { value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } },
        connect() {},
        disconnect() {},
      };
    },
    createBuffer(ch, len, sr) {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => data[i] };
    },
    async decodeAudioData() {
      return this.createBuffer(1, Math.round(2.0 * 48000), 48000);
    },
  };
  return { ctx, sfxIn: {}, sources, _sfxSilent: () => false };
}

async function setupWeapon(id, height = 0) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { paint } = makePaintWorld(f, { wall: false });
  f.G.settings = {};
  f.setRandom(() => 0.37);
  const a = f.make(id);
  a.form = 'kid';
  a.pos.set(0, height, 0);
  a.aimDir.set(0, 0, 1);
  a.aimPoint.set(0, height + 1.05, 100);
  a.character.getMuzzle = out => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  const stamps = [];
  const raw = paint.splat;
  paint.splat = function(at, r, team, opts = {}) {
    stamps.push({ at: at.clone(), r, opts: { ...opts, stretch: opts.stretch?.clone() } });
    return raw.call(this, at, r, team, opts);
  };
  return { f, a, paint, stamps };
}

function fire(a, frames = 1) {
  for (let i = 0; i < frames; i++) a.weaponRunner.update(1 / 60, { fire: true, firePressed: i === 0 });
  for (let i = 0; i < 50; i++) a.weaponRunner.update(1 / 60, { fire: false });
}

test('playProgressCharge stays rock-steady under 60Hz jitter without 0.5x octave drops', () => {
  const audio = makeAudioEnv();
  const buffer = audio.ctx.createBuffer(1, Math.round(1.215 * 48000), 48000);
  const handle = playProgressCharge(audio, buffer, { offset: 0, length: 1.215, chargeTime: 1, progress: 0.016, volume: 0.55 });
  const dtPattern = [0.017, 0.016, 0.018, 0.015, 0.017, 0.016];
  const tickPattern = [0, 2, 1, 1, 0, 2];
  let p = 0.016;
  for (let i = 0; i < 48; i++) {
    audio.ctx.currentTime += dtPattern[i % dtPattern.length];
    p = Math.min(0.95, p + tickPattern[i % tickPattern.length] / 60);
    handle.set({ progress: p });
  }
  const src = audio.sources[0];
  const rates = [1, ...src.playbackRate.calls.map(c => c.v)];
  assert.ok(Math.min(...rates) >= 0.94, `unexpected pitch drop: min=${Math.min(...rates)}`);
  assert.ok(Math.max(...rates) <= 1.05, `unexpected pitch spike: max=${Math.max(...rates)}`);
  handle.stop();
});

test('playChargerRise keeps unstretched fallback at 1x pitch for fast/slow chargers while WSOLA warms up', async () => {
  const audio = makeAudioEnv();
  const fakeBytes = new Uint8Array(20000);
  const fetcher = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(fakeBytes.byteLength) }),
    arrayBuffer: async () => fakeBytes.buffer,
  });
  const buf = await chargerRiseBuffer(audio.ctx, { fetcher, sourceUrl: 'https://example.test/charger.mp3' });
  assert.ok(buf);
  const handle = playChargerRise(audio, {
    weaponId: 's3-charger-light',
    chargeTime: 1 / 3,
    progress: 0.05,
    volume: 0.55,
  });
  assert.ok(handle);
  assert.equal(audio.sources.length, 1);
  assert.ok(Math.abs(audio.sources[0].playbackRate.value - 1) < 0.02,
    `expected ~1x fallback rate, got ${audio.sources[0].playbackRate.value}`);
  handle.stop();
  disposeChargerRise(audio.ctx);
});

test('ink-slosh and ink-brush silhouettes are trimmed well below bloated 3.0+ R^2 coverage', () => {
  const areaRatio = kind => {
    const N = 160;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      const a = -1 + (2 * (i + 0.5)) / N;
      for (let j = 0; j < N; j++) {
        const c = -1 + (2 * (j + 0.5)) / N;
        if (inkFootprintContains(a, c, kind, 0)) hits++;
      }
    }
    return 4 * hits / (N * N);
  };
  const sloshArea = areaRatio(11);
  const brushArea = areaRatio(12);
  assert.ok(sloshArea > 1.8 && sloshArea < 2.5, `ink-slosh area/R^2 out of expected range: ${sloshArea}`);
  assert.ok(brushArea > 1.8 && brushArea < 2.7, `ink-brush area/R^2 out of expected range: ${brushArea}`);
  assert.equal(INK_PROFILE_SECTIONS.length, 10);
});

test('Tri-Slosher honors AfterPaintParam on trailing Unit 0 globs (index > 0 paints 0)', async () => {
  const x = await setupWeapon('s3-slosher-diffusion', 0);
  x.a.aimDir.set(0, -0.2, 0.98).normalize();
  fire(x.a);
  x.stamps.length = 0;
  for (let i = 0; i < 120; i++) {
    x.f.G.time += 1 / 60;
    x.f.G.projectiles.update(1 / 60);
    x.paint.advanceSimulation(1 / 60);
  }
  const largeStamps = x.stamps.filter(s => s.r >= 2.5);
  assert.equal(largeStamps.length, 1, `Tri-Slosher Unit 0 should only stamp 1 large glob (index 0), got ${largeStamps.length}`);
});

test('Explosher BlastParam interpolates paint radius across DistanceNear..DistanceFar', async () => {
  const rec = MAIN_WEAPON_CATALOG.records.find(r => r.sourceActor === 'WeaponSlosherWashtub');
  const bp = rec.parameters.BlastParam;
  assert.equal(bp.DistanceNear, 21);
  assert.equal(bp.DistanceFar, 23);
  assert.equal(bp.PaintRadiusNear, 4.5);
  assert.equal(bp.PaintRadiusFar, 4.095);
  const x = await setupWeapon('s3-slosher-washtub', 1);
  fire(x.a);
  const p = x.f.G.projectiles.list.find(q => q.catalog);
  assert.ok(p);
  x.stamps.length = 0;
  p.start.set(0, 1, 0);
  p.pos.set(0, 0.05, 25);
  p.vel.set(0, -10, 0);
  x.f.G.projectiles._step(p, 1 / 60);
  assert.ok(x.stamps.some(s => Math.abs(s.r - 4.095) < 0.02), `expected far Explosher blast radius ~4.095, got ${JSON.stringify(x.stamps.map(s => s.r))}`);
});

test('Splatana horizontal impactPaint scales depth down on steep downward angle via PaintDegreeMax', async () => {
  const x = await setupWeapon('s3-saber-lite', 0);
  fire(x.a);
  const p = x.f.G.projectiles.list.find(q => q.catalog && q.catalog.descriptor.key === 'saber-horizontal');
  assert.ok(p);
  x.stamps.length = 0;
  p.pos.set(0, 0.25, 2);
  p.vel.set(0, -18, 2);
  for (let i = 0; i < 15; i++) {
    if (x.f.G.projectiles._step(p, 1 / 60)) break;
  }
  assert.ok(x.stamps.some(s => s.r < 1.5), `expected compact steep-angle Saber stamp (<1.5), got ${JSON.stringify(x.stamps.map(s => s.r))}`);
});
