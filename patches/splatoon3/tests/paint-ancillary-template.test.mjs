// #1671: per-record ancillary templates and the unstretched dot rejection must
// leave every piece, sample and cell-visibility decision unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../runtime/paint-ownership.mjs', import.meta.url), 'utf8');
const load = code => import('data:text/javascript;base64,' + Buffer.from(code + '\nexport {prepareAncillary,cellIsSolidlyVisible};\n').toString('base64'));
const current = await load(source);
const baseline = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL('./fixtures/paint-piece-ownership-baseline.mjs', import.meta.url), 'utf8') + '\nexport {prepareAncillary};\n').toString('base64'));
const start = source.indexOf('  // #1671: nearly every test of a growing bomb');
const end = source.indexOf('  const dx = face.cu * 0.32, dy = face.cv * 0.32;', start);
assert.ok(start > 0 && end > start, 'dot rejection block present');
const unrejected = await load(source.slice(0, start) + source.slice(end));
const snapshot = mask => mask && { ...mask, pieces: mask.pieces.map(p => ({ ...p })) };
// The baseline allocates each piece with its own fields; the pool also keeps
// stale fields of other types. Compare every field the baseline defines.
const fields = (actual, expected) => actual && expected
  ? { ...actual, pieces: actual.pieces.map((p, i) => expected.pieces[i] ? Object.fromEntries(Object.keys(expected.pieces[i]).map(k => [k, p[k]])) : p) }
  : actual;

test('one growth record reuses its template without changing any piece', () => {
  const full = Array.from({ length: 8 }, () => [4, 3, 3, 3]);
  const drips = full.map(s => [0, 0, 0, s[3]]);
  let word = 0x51f15e, calls = 0;
  const random = () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
  for (const seed of [0, 0.37, 0.99999]) {
    // One record object across faces, ticks, stretches and both contracts, as
    // the native settled pass alternates them; the baseline gets a fresh record.
    const g = { R: 2.7, kind: 3, seed, dripDur: 3 };
    for (let i = 0; i < 400; i++) {
      const wall = random() < 0.5, sa = [0, 0, 0.4, 1.7, NaN][Math.floor(random() * 5)];
      const sdu = [0.6, 0.6, -0.8, NaN][Math.floor(random() * 4)], sdv = 0.8;
      const dn = random() * 2.8, tn = random() * 3, dT = Math.min(1, tn / 3);
      const contract = { shapes: random() < 0.3 ? drips : full };
      const face = { wall, atlas: { ppm: [16, 32][Math.floor(random() * 2)] } };
      const expected = snapshot(baseline.prepareAncillary({ ...g }, face, 10, 12, dn, sdu, sdv, sa, tn, dT, contract));
      const actual = snapshot(current.prepareAncillary(g, face, 10, 12, dn, sdu, sdv, sa, tn, dT, contract));
      assert.deepEqual(fields(actual, expected), expected, JSON.stringify({ seed, i, wall, sa, sdu, dn, tn }));
      calls++;
    }
    g.seed = seed + 0.125; // a reused record with a new seed rebuilds its template
    const face = { wall: true, atlas: { ppm: 32 } };
    const expected = snapshot(baseline.prepareAncillary({ ...g }, face, 0, 0, 0.3, 0, 0, 0, 1, 0.5, { shapes: full }));
    assert.deepEqual(fields(snapshot(current.prepareAncillary(g, face, 0, 0, 0.3, 0, 0, 0, 1, 0.5, { shapes: full })), expected), expected);
  }
  assert.equal(calls, 1200);
});

test('unstretched dot rejection never changes a cell decision', () => {
  let word = 0x2a17, checked = 0, rejected = 0, hits = 0;
  const random = () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
  for (let i = 0; i < 60000; i++) {
    const type = random() < 0.6 ? 1 : 2, radius = [0, 1e-4, 0.02, 0.1, 0.35, NaN][Math.floor(random() * 6)];
    const face = { cu: [0.05, 0.1, 0.25][Math.floor(random() * 3)], cv: [0.05, 0.1, 0.25][Math.floor(random() * 3)] };
    const piece = { type, radius, x: random() < 0.01 ? Infinity : (random() - 0.5) * 1.2, y: (random() - 0.5) * 1.2, ux: 0.6, uy: -0.8,
      el: [1, 1.7, 0.6, NaN][Math.floor(random() * 4)] };
    piece.minX = piece.x - radius * 2; piece.maxX = piece.x + radius * 2; piece.minY = piece.y - radius * 2; piece.maxY = piece.y + radius * 2;
    const mask = { sa: [0, 0, NaN, 0.5][Math.floor(random() * 4)], sdu: 0.6, sdv: 0.8, margin: [0, 0.005, 0.03][Math.floor(random() * 3)], seed: 0.4, dT: 1 };
    // Cells from far away down to cells whose rectangle just touches the dot's reach.
    let x = (random() - 0.5) * 1.6, y = (random() - 0.5) * 1.6;
    if (random() < 0.4 && Number.isFinite(radius)) {
      const reach = type === 2 ? radius * Math.max(1, piece.el || 1) : radius, a = random() * 6.2831;
      x = piece.x + Math.cos(a) * (reach + face.cu * 0.5) * (1 + (random() - 0.5) * 1e-5);
      y = piece.y + Math.sin(a) * (reach + face.cv * 0.5) * (1 + (random() - 0.5) * 1e-5);
    }
    const expected = unrejected.cellIsSolidlyVisible(mask, face, x, y, piece);
    assert.equal(current.cellIsSolidlyVisible(mask, face, x, y, piece), expected, JSON.stringify({ i, mask, face, x, y, piece }));
    checked++; if (expected) hits++;
    if (!(mask.sa > 0) && Number.isFinite(radius)) rejected++;
  }
  assert.equal(checked, 60000);
  assert.ok(hits > 1000 && rejected > 20000, `${hits} hits, ${rejected} eligible`);
});


test('stretched dot enclosure preserves exact sample/witness decisions at source-cell boundaries', async () => {
  const fastStart = source.indexOf('  // Conservative stretched dot enclosure:');
  const fastEnd = source.indexOf('  const dx = face.cu * 0.32, dy = face.cv * 0.32;', fastStart);
  assert.ok(fastStart > 0 && fastEnd > fastStart, 'stretched fast path must be installed');
  const unoptimized = await load(source.slice(0, fastStart) + source.slice(fastEnd));
  let word = 0x1671acdc, hits = 0, tested = 0, stretched = 0;
  const random = () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
  for (let i = 0; i < 35000; i++) {
    const angle = random() * Math.PI * 2, dotAngle = random() * Math.PI * 2;
    const type = random() < 0.5 ? 1 : 2;
    const sa = [0.03, 0.4, 1.2, 2.5, 0, NaN, Infinity, -0.2][i % 8];
    const cu = [0.08, 0.2, 0.5][i % 3], cv = [0.08, 0.3, 0.45][i % 3];
    const face = { cu, cv };
    const mask = { sa, sdu: Math.cos(angle), sdv: Math.sin(angle), margin: 0.01, seed: .53, dT: 1 };
    if (i % 31 === 0) mask.sdu *= 1.15; // deliberately non-unit: must fall back
    const piece = { type, x: (random() - 0.5) * 5, y: (random() - 0.5) * 5,
      radius: [0, 1e-4, 0.015, 0.1, 0.3][i % 5],
      ux: Math.cos(dotAngle), uy: Math.sin(dotAngle), el: [0.6, 1, 1.7, 2.9][i % 4] };
    if (i % 37 === 0) piece.el = NaN;
    if (i % 41 === 0) piece.ux *= 2;
    const rad = piece.radius * (type === 2 ? Math.max(1, piece.el || 1) : 1);
    piece.minX = piece.x - rad; piece.maxX = piece.x + rad;
    piece.minY = piece.y - rad; piece.maxY = piece.y + rad;
    const along = piece.x * mask.sdu + piece.y * mask.sdv;
    const k = [0, 1, 0.25][i % 3];
    const sx = piece.x + mask.sdu * along * sa * k, sy = piece.y + mask.sdv * along * sa * k;
    const radial = rad * (1 + Math.max(0, sa || 0) * k), bearing = random() * Math.PI * 2;
    const near = (i % 5) !== 0;
    const offset = near ? (radial + Math.max(cu, cv) * .5) * (1 + (random() - .5) * 1e-5) : random() * 7;
    const x = near ? sx + Math.cos(bearing) * offset : piece.x + (random() - .5) * 12;
    const y = near ? sy + Math.sin(bearing) * offset : piece.y + (random() - .5) * 12;
    const expected = unoptimized.cellIsSolidlyVisible(mask, face, x, y, piece);
    const actual = current.cellIsSolidlyVisible(mask, face, x, y, piece);
    assert.equal(actual, expected, JSON.stringify({ i, mask, face, x, y, piece }));
    tested++; if (expected) hits++;
    if (sa > 0 && Number.isFinite(sa)) stretched++;
  }
  assert.equal(tested, 35000);
  assert.ok(stretched > 12000 && hits > 100, 'must cover active stretch and actual positive cells');
});
