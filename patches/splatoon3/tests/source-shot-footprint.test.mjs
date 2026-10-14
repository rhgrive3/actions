import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { sourceShotRasterRadius, SOURCE_SHOT_RASTER_ENVELOPE as bounds } from '../runtime/source-shot-footprint.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const upstream = path.join(ROOT, 'inkwave-public/src/world/paint.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-12,
  'expected ' + actual + ' ≈ ' + expected);

test('shot source WidthHalf bounds procedural rays, satellites and fine spatter', () => {
  // Original procedural shader: fine spatter at <= (1.3 + 1.2) R plus
  // <= (0.011 + 0.02) R dot radius. Source WidthHalf is a maximum,
  // not the inner circle of a second layer of randomly flung splashes.
  assert.ok(bounds.shot >= 2.531);
  assert.ok(bounds.drop >= 1.1 + .8 + .113);
  for (const [name, sourceWidth] of [
    ['Splattershot near', 1.93],
    ['Splattershot far', 1.71],
    ['Splattershot intermediate', 1.472],
    ['Splattershot forced nearest', 2.0608],
    ['Splat Dualies', 1.71],
    ['Heavy Splatling', 2.226],
  ]) {
    const inner = sourceShotRasterRadius(sourceWidth, 0, 13);
    close(inner * bounds.shot, sourceWidth);
    assert.ok(inner < sourceWidth, name + ' is no longer inflated by the raster corona');
  }
  close(sourceShotRasterRadius(1.472, 5, 4) * bounds.drop, 1.472);
  close(sourceShotRasterRadius(2.0608, 4, 4) * bounds.shot, 2.0608);
});

test('only source-faced paint is adjusted: specials, body rollers, cosmetics and legacy splats are untouched', () => {
  for (const kind of [2, 3, 6, 7]) {
    close(sourceShotRasterRadius(2.1, kind, 0), 2.1);
  }
  for (const kind of [0, 1, 4, 5]) {
    close(sourceShotRasterRadius(2.1, kind, undefined), 2.1);
    close(sourceShotRasterRadius(2.1, kind, 0, true), 2.1);
    close(sourceShotRasterRadius(2.1, kind, 0.5), 2.1);
    close(sourceShotRasterRadius(2.1, kind, NaN), 2.1);
    close(sourceShotRasterRadius(2.1, kind, 0, false) > 0 ? 1 : 0, 1);
  }
  // NetMatch encodes face -1 for catalogue shots and omits that face on
  // receiver playback. Its explicit kind='shot' survives on the wire.
  close(sourceShotRasterRadius(1.93, 0, -1, false, 'shot'),
    sourceShotRasterRadius(1.93, 0, undefined, false, 'shot'));
  close(sourceShotRasterRadius(1.93, 0, undefined, false, 'bomb'), 1.93);
  close(sourceShotRasterRadius(1.93, 0, undefined), 1.93);
  close(sourceShotRasterRadius(0, 0, 3), 0);
  close(sourceShotRasterRadius(-1, 0, 3), -1);
  assert.equal(sourceShotRasterRadius(Infinity, 0, 3), Infinity);
});

test('actual production paint composition normalizes once after network recording, before shared CPU/GPU stamping', () => {
  const source = fs.readFileSync(upstream, 'utf8');
  const built = adaptSource('src/world/paint.js', source);
  const injected = 'radius = sourceShotRasterRadius(radius, kind, opts.face, cosmetic, opts.kind);';
  assert.equal(built.split(injected).length - 1, 1, 'only one transform, never twice');
  assert.ok(built.includes("import { sourceShotRasterRadius } from '../../patches/splatoon3/runtime/source-shot-footprint.mjs';"));
  assert.ok(built.indexOf('nm.recSplat(center, radius, team, opts)') < built.indexOf(injected),
    'nominal width is recorded on wire, receiver reconstructs exactly once');
  assert.ok(built.indexOf(injected) < built.indexOf('const reachK = REACH[kind]'),
    'world query and GPU bounds must use corrected radius');
  assert.ok(built.indexOf(injected) < built.indexOf('claimed += this._cpuSplat('),
    'turf and GPU cannot use different radii');
  assert.ok(built.includes('float dist = r * (1.1 + (big ? 1.05 : 0.8) * h2 * h2)'));
  assert.ok(built.includes('r * (1.3 + 1.2 * h2)'),
    'changing artist radius-extents requires an updated maximum-reach proof');
});


test('actual PaintSystem gives local and network replay identical source-shot body ownership', async () => {
  const { fixture } = await import('./source-fixture.mjs');
  const { makePaintWorld } = await import('./paint-authority-fixture.mjs');
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, V, face } = makePaintWorld(f);
  const input = V(0, 0, 8), rawRadius = 1.93;
  const seed = .37, net = { mute: 0, applying: false, out: [],
    recSplat(center, radius, team, opts) {
      this.out.push({ radius, team, kind: opts.kind, face: opts.face, seed: opts.seed, point: center.clone() });
    },
  };
  f.G.netm = net;
  const snapshot = (withFace) => {
    paint.clear();
    const area = paint.splat(input, rawRadius, 0, { kind: 'shot', seed,
      ...(withFace ? { face: 0 } : {}) });
    assert.ok(area > 0);
    const growing = paint.growing.at(-1);
    close(growing.R, rawRadius / bounds.shot);
    assert.ok(growing.entries.includes(face), 'real floor face receives the sourced stamp');
    return { area, body: Array.from(paint.grid), radius: growing.R };
  };

  const local = snapshot(true);
  assert.equal(net.out.length, 1);
  assert.equal(net.out[0].radius, rawRadius, 'network retains nominal source width');
  assert.equal(net.out[0].face, 0, 'world-contact face is recorded');
  net.applying = true;
  const remote = snapshot(true);
  assert.deepEqual(remote, local, 'paint replay uses identical local source width');
  net.applying = false;
  const catalogLocal = snapshot(false);
  net.applying = true;
  const catalogReplay = snapshot(false);
  assert.deepEqual(catalogReplay, catalogLocal,
    'face-less catalog shot also has matching network replay footprint');
});
