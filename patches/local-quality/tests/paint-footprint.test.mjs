import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptPaintFootprint } from '../paint-footprint-adapter.mjs';
import { shapeHash, sdRay, smoothMin, SHAPE_COUNTS } from '../paint-footprint.mjs';

const replaceOnce = (code, before, after, label) => {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) throw new Error(`unexpected ${label}`);
  return code.slice(0, at) + after + code.slice(at + before.length);
};

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

// ---------------------------------------------------------------- build seam

test('paint footprint adapter rewrites the native seams but leaves inkwave-public bytes alone', () => {
  const native = read('inkwave-public/src/world/paint.js');
  const out = compose('src/world/paint.js');
  assert.notEqual(out, native);
  // The on-disk authoritative source must stay exactly as published.
  assert.match(native, /float hsh\(float n\) \{ return fract\(sin\(n\) \* 43758\.5453123\); \}/);
  assert.match(native, /gl_FragColor = vec4\(team, 1\.0, hsh\(seed \* 1\.73\), a\);/);
  assert.doesNotMatch(native, /installPaintFootprint|_cpuSplatOwned|toneHash/);
  // Seams landed exactly once.
  for (const needle of [
    'installPaintFootprint(PaintSystem, { blobWobble, maxQuads: MAX_QUADS });',
    'float toneHash(float n) { return fract(sin(n) * 43758.5453123); }',
    "import { installPaintFootprint } from '../../patches/local-quality/paint-footprint.mjs';",
    'const order = cosmetic ? 0 : this._nextPaintOrder();',
    'this._cpuSplatOwned(f, lu, lv, rr, team, seed, sdu, sdv, sa, kind, order)',
    'kind, order, owner: opts.owner || null, age: 0,',
    'this._queueCpuGrowth(g, i, tn, dT, true);',
    'this._queueCpuGrowth(g, i, tn, dT, false);',
    'if (u1 <= u0 || v1 <= v0) return 0;',
    'return dripOnly === 2 ? 2 : 1;',
    'toneHash(seed * 1.73)',
  ]) assert.ok(out.includes(needle), needle);
  // Re-adapting the composed source must fail loudly instead of double-patching.
  assert.throws(() => adaptQualitySource('src/world/paint.js', out), /quality patch conflict/);
  // Unrelated files pass straight through this adapter.
  assert.equal(adaptPaintFootprint('src/world/inkShading.js', 'const x = 1;', replaceOnce), 'const x = 1;');
});

// ---------------------------------------------------------------- pure helpers

test('shape hash is deterministic, in range, and float-stable across scales', () => {
  for (const [seed, sc, idx, isc] of [[0.5, 7.31, 0, 1.93], [0.5, 3.17, 11, 5.71], [0.123456, 13.1, 9, 7.7]]) {
    const a = shapeHash(seed, sc, idx, isc), b = shapeHash(seed, sc, idx, isc);
    assert.equal(a, b);
    assert.ok(Number.isFinite(a) && a >= 0 && a < 1, `${a}`);
  }
  // Nearby seeds must not collapse onto the same value.
  const values = new Set([0, 1, 2, 3, 4, 5].map((k) => shapeHash(0.5, 7.31, k, 1.93)));
  assert.equal(values.size, 6);
});

test('smooth min is a C1-ish union that never exceeds the hard minimum', () => {
  for (let x = -2; x <= 2; x += 0.13) {
    const v = smoothMin(x, 0.4, 0.6);
    assert.ok(v <= Math.min(x, 0.4) + 1e-9);
    assert.ok(Number.isFinite(v));
  }
  assert.ok(sdRay(0, 0, 0, 0, 1, 0, 0.1, 0.1) < 0);
  assert.ok(sdRay(0, 5, 0, 0, 1, 0, 0.1, 0.1) > 0);
});

test('per-kind shape counts mirror the shader kindShape table', () => {
  assert.deepEqual(SHAPE_COUNTS.slice(0, 6), [[5, 7, 8, 3], [3, 4, 5, 2], [7, 9, 10, 4], [10, 12, 14, 5], [3, 4, 4, 2], [2, 2, 0, 1]]);
  assert.deepEqual(SHAPE_COUNTS[6], [0, 0, 0, 0]);
  assert.deepEqual(SHAPE_COUNTS[7], [0, 0, 0, 0]);
});

// ---------------------------------------------------------------- runtime fixture

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  sub(o) { this.x -= o.x; this.y -= o.y; this.z -= o.z; return this; }
  addScaledVector(o, s) { this.x += o.x * s; this.y += o.y * s; this.z += o.z * s; return this; }
  dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}
class Attr {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
  setUsage() { return this; }
  clearUpdateRanges() { this.ranges = []; }
  addUpdateRange(s, n) { (this.ranges || (this.ranges = [])).push([s, n]); }
}
class Geo {
  constructor() { this.attributes = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(index) { this.index = index; return this; }
  setDrawRange(a, b) { this.drawRange = [a, b]; return this; }
  dispose() {}
}
const noop = () => {};
function makeThree() {
  return {
    Vector3: V3, Color: V3, Sphere: class { constructor(c, r) { this.center = c; this.radius = r; } },
    BufferGeometry: Geo, BufferAttribute: Attr, DynamicDrawUsage: 1,
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.frustumCulled = true; this.visible = true; this.renderOrder = 0; } },
    Scene: class { constructor() { this.children = []; } add(o) { this.children.push(o); } },
    OrthographicCamera: class { constructor() {} },
    ShaderMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
    WebGLRenderTarget: class { constructor() { this.texture = { anisotropy: 0 }; } dispose() {} },
    UnsignedByteType: 1, RGBAFormat: 1, LinearMipmapLinearFilter: 1, LinearFilter: 1,
    CustomBlending: 1, AddEquation: 1, MaxEquation: 1, SrcAlphaFactor: 1, OneMinusSrcAlphaFactor: 1,
    OneFactor: 1, ReverseSubtractEquation: 1, ZeroFactor: 1,
  };
}
function makeRenderTarget() {
  const r = {
    autoClear: true,
    capabilities: { getMaxAnisotropy: () => 8 },
    getRenderTarget: () => null,
    setRenderTarget: noop,
    getClearColor: (c) => c,
    getClearAlpha: () => 1,
    setClearColor: noop,
    clear: noop,
    render: noop,
  };
  return r;
}
function makeLevel() {
  const floor = {
    paintable: true, turf: true, wall: false, block: 0,
    origin: new V3(0, 0, 0), n: new V3(0, 1, 0), u: new V3(1, 0, 0), v: new V3(0, 0, 1), su: 60, sv: 60,
  };
  const wall = {
    paintable: true, turf: true, wall: true, block: 0,
    origin: new V3(0, 0, 0), n: new V3(0, 0, 1), u: new V3(1, 0, 0), v: new V3(0, 1, 0), su: 24, sv: 12,
  };
  return {
    faces: [floor, wall],
    blocks: [{ aabbMin: new V3(-40, -2, -40), aabbMax: new V3(40, 14, 40), faces: [0, 1, -1, -1, -1, -1] }],
    pointInside: () => false,
    queryBlocks: (x0, z0, x1, z1, out) => { out.length = 0; out.push(0); return out; },
  };
}

async function bootPaint() {
  const code = compose('src/world/paint.js');
  const sandbox = { console };
  const context = vm.createContext(sandbox);
  const three = makeThree();
  sandbox.__THREE = three;
  sandbox.__G = {};
  const threeSource = 'const T = globalThis.__THREE;\n' + Object.keys(three).map((k) => `export const ${k} = T.${k};`).join('\n');
  const entry = new vm.SourceTextModule(code, { context, identifier: 'src/world/paint.js' });
  await entry.link(async (spec) => {
    if (spec === 'three') return new vm.SourceTextModule(threeSource, { context, identifier: 'three' });
    if (spec === '../core/ctx.js') return new vm.SourceTextModule('export const G = globalThis.__G;', { context, identifier: 'src/core/ctx.js' });
    if (spec === '../../patches/local-quality/paint-footprint.mjs') return new vm.SourceTextModule(read('patches/local-quality/paint-footprint.mjs'), { context, identifier: 'patches/local-quality/paint-footprint.mjs' });
    throw new Error('unexpected import ' + spec);
  });
  await entry.evaluate();
  const level = makeLevel();
  const paint = new entry.namespace.PaintSystem(makeRenderTarget(), level, { atlasSize: 1024, maxDensity: 30 });
  return { paint, level, G: sandbox.__G, context };
}

const owned = (paint, f) => {
  let n = 0;
  for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) if (paint.grid[f.grid + j * f.nu + i]) n++;
  return n;
};
const ownedAll = (paint, level) => level.faces.reduce((n, f) => n + owned(paint, f), 0);
const maxRadius = (paint, f, lu, lv) => {
  let m = 0;
  for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
    if (!paint.grid[f.grid + j * f.nu + i]) continue;
    m = Math.max(m, Math.hypot((i + 0.5) * f.cu - lu, (j + 0.5) * f.cv - lv));
  }
  return m;
};
const flushFor = (paint, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) paint.flush(1 / 60); };

// ---------------------------------------------------------------- behaviour

test('a non-cosmetic splat owns its whole native footprint, not just the body', async () => {
  const { paint, level } = await bootPaint();
  const floor = level.faces[0];
  const center = new V3(0, 0, 0);
  const bodyArea = paint.splat(center, 2.7, 0, { seed: 0.5, kind: 'bomb' });
  assert.ok(bodyArea > 0);
  const bodyOnly = ownedAll(paint, level);
  const bodyReach = maxRadius(paint, floor, 0, 0);
  // The published main blob alone cannot reach past WOB_MAX * radius.
  assert.ok(bodyReach <= 2.7 * 1.5 + 0.3, `body reach ${bodyReach}`);

  flushFor(paint, 4);
  const grown = ownedAll(paint, level);
  const grownReach = maxRadius(paint, floor, 0, 0);
  assert.ok(grown > bodyOnly, `${grown} > ${bodyOnly}`);
  // Satellites (r * up to 2.15) and spatter (r * up to 2.5) sit well beyond the blob.
  assert.ok(grownReach > 5.0, `grown reach ${grownReach}`);
  assert.ok(grownReach <= 2.7 * 2.5 + 0.5, `grown reach ${grownReach}`);
  // Turf counts track the grid exactly.
  assert.equal(paint.counts[0], grown);
});

test('growth credit lands exactly once and the settled grid stops changing', async () => {
  const { paint, level } = await bootPaint();
  const floor = level.faces[0];
  const owner = { calls: 0, total: 0, addTurf(a) { this.calls++; this.total += a; } };
  paint.splat(new V3(0, 0, 0), 2.7, 0, { seed: 0.5, kind: 'bomb', owner });
  flushFor(paint, 5);
  const late = paint.lateAreaByTeam[0];
  assert.ok(late > 0, 'late growth credited some area');
  assert.ok(Math.abs(owner.total - late) < 1e-9, `${owner.total} vs ${late}`);
  const settledGrid = owned(paint, floor), settledTotal = owner.total, settledLate = late;
  flushFor(paint, 6);
  assert.equal(owned(paint, floor), settledGrid, 'settled grid is idempotent');
  assert.equal(owner.total, settledTotal, 'no additional owner credit');
  assert.equal(paint.lateAreaByTeam[0], settledLate, 'no additional late area');
});

test('an older splat cannot overwrite newer paint with late growth', async () => {
  const { paint, level } = await bootPaint();
  const floor = level.faces[0];
  paint.splat(new V3(0, 0, 0), 2.7, 0, { seed: 0.5, kind: 'bomb' });
  paint.flush(1 / 60);                       // first growth step of the older splat is committed
  // The newer splat covers the band the older splat's rays/spatter will still grow into.
  paint.splat(new V3(0, 0, 0), 2.7, 1, { seed: 0.9, kind: 'bomb' });
  const newer = [];
  for (let j = 0; j < floor.nv; j++) for (let i = 0; i < floor.nu; i++) {
    const k = floor.grid + j * floor.nu + i;
    if (paint.grid[k] === 2) newer.push(k);
  }
  assert.ok(newer.length > 0);
  flushFor(paint, 5);
  for (const k of newer) assert.equal(paint.grid[k], 2, 'newer team ink survived older late growth');
});

test('muted ghost splats claim nothing and never enter the credit path', async () => {
  const { paint, level, G } = await bootPaint();
  const floor = level.faces[0];
  G.netm = { mute: 1 };
  const area = paint.splat(new V3(0, 0, 0), 2.7, 0, { seed: 0.5, kind: 'bomb' });
  assert.equal(area, 0);
  assert.equal(owned(paint, floor), 0);
  flushFor(paint, 2);
  assert.equal(owned(paint, floor), 0);
  assert.equal(paint.lateAreaByTeam[0], 0);
  G.netm = null;
});

test('clear resets ownership, order and pending growth without breaking later splats', async () => {
  const { paint, level } = await bootPaint();
  const floor = level.faces[0];
  paint.splat(new V3(0, 0, 0), 2.7, 0, { seed: 0.5, kind: 'bomb' });
  flushFor(paint, 3);
  assert.ok(paint.paintOrder.some((v) => v !== 0));
  paint.clear();
  assert.deepEqual([...paint.counts], [0, 0]);
  assert.equal(owned(paint, floor), 0);
  assert.deepEqual([...paint.lateAreaByTeam], [0, 0]);
  assert.equal(paint.paintOrder.every((v) => v === 0), true);
  assert.equal(paint._pendingCpuCount, 0);
  // Still usable after a clear: a later splat grows again.
  paint.splat(new V3(0, 0, 0), 2.7, 0, { seed: 0.5, kind: 'bomb' });
  const body = owned(paint, floor);
  flushFor(paint, 4);
  assert.ok(owned(paint, floor) > body);
});

test('wall drips own cells below the contact edge, flagged cosmetically-safe kinds do not', async () => {
  const { paint, level } = await bootPaint();
  const wall = level.faces[1];
  paint.splat(new V3(0, 4, 0), 1.3, 0, { seed: 0.25, kind: 'shot' });
  const bodyOnly = owned(paint, wall);
  const lowest = () => {
    let v = Infinity;
    for (let j = 0; j < wall.nv; j++) for (let i = 0; i < wall.nu; i++) {
      if (paint.grid[wall.grid + j * wall.nu + i]) v = Math.min(v, (j + 0.5) * wall.cv);
    }
    return v;
  };
  const bodyLowest = lowest();
  flushFor(paint, 6);
  assert.ok(owned(paint, wall) > bodyOnly, 'drips extended ownership');
  // Drips run down from the lower edge: ownership reaches well below the body-only edge.
  assert.ok(lowest() < bodyLowest - 0.5, `lowest owned v ${lowest()} vs body ${bodyLowest}`);
  // A cosmetic speck must never claim turf even with the growth mirror installed.
  const before = owned(paint, wall);
  paint.speck(new V3(0, 2, 0), 0.1, 0, 0.5);
  flushFor(paint, 2);
  assert.equal(owned(paint, wall), before);
});

test('stale-order guard accepts the wraparound-newer order and rejects the older one', async () => {
  const { paint, level } = await bootPaint();
  const f = level.faces[0];
  const k = f.grid + 3 * f.nu + 3;
  paint.grid[k] = 2; paint.paintOrder[k] = 50;
  assert.equal(paint._cpuCellWrite(f, k, 0, 10), 0);      // older order, rejected
  assert.equal(paint.grid[k], 2);
  assert.ok(paint._cpuCellWrite(f, k, 0, 60) > 0);        // newer order, accepted
  assert.equal(paint.grid[k], 1);
  paint.grid[k] = 2; paint.paintOrder[k] = 0xfffffff0;
  assert.ok(paint._cpuCellWrite(f, k, 0, 5) > 0, 'counter wrapped past 2^32 is still newer');
  paint.grid[k] = 2; paint.paintOrder[k] = 5;
  assert.equal(paint._cpuCellWrite(f, k, 0, 0xfffffff0), 0, 'wrapped-old order rejected');
  // Re-owning the same team never double-counts area.
  paint.grid[k] = 1; paint.paintOrder[k] = 5;
  assert.equal(paint._cpuCellWrite(f, k, 0, 6), 0);
});
