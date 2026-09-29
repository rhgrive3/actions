// Run from repository root: node reports/inkwave-input-network-probe-2026-09-30.mjs
// Compare actual Gyro / NetMatch code with their unchanged files at the pre-fix commit.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const base = 'd5d54d1d37274dfa82467b37b9b8009719783ed3';
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const blob = s => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(s) + '\0').update(s).digest('hex');
function sources(path, expectedBlob) {
  const before = process.env.INKWAVE_BASELINE_DIR
    ? fs.readFileSync(process.env.INKWAVE_BASELINE_DIR + '/' + path, 'utf8')
    : execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' });
  assert.equal(blob(before), expectedBlob, 'baseline file equals GitHub main before these fixes');
  const after = fs.readFileSync(path, 'utf8');
  return { before, after, hashes: { before: sha256(before), after: sha256(after) } };
}
const gyroSrc = sources('inkwave-public/src/core/gyro.js', '6b7989eeb332b47fbf4cc0db107f7288b60e7374');
const netSrc = sources('inkwave-public/src/net/netmatch.js', '850f35917eb9e19e7766c0f0d834d3370dbec37c');
const strip = s => s.replace(/^import .*;\n/gm, '').replace(/\bexport (?=(class|const|function)\b)/g, '').replace(/^export \{.*\};\n/gm, '');
const fields = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

function gyroRuntime(source) {
  const counters = { sin: 0, cos: 0, gainCalls: 0, rateArrays: 0, calibrationArrays: 0 };
  const math = Object.create(Math);
  for (const name of ['sin', 'cos']) math[name] = (...args) => { counters[name]++; return Math[name](...args); };
  // Count source-level temporaries, without relying on engine-specific heap/timing measurements.
  source = source.replace('const A = [b, g, a], B = [a, b, g];',
    'const A = (counters.calibrationArrays++, [b, g, a]), B = (counters.calibrationArrays++, [a, b, g]);');
  source = source.replace('function gyroTurnDeg(sens) {', 'function gyroTurnDeg(sens) { counters.gainCalls++;');
  let angle = 0, time = 1;
  const listeners = new Map();
  const context = { Math: math, counters, window: { DeviceOrientationEvent: {}, DeviceMotionEvent: {} },
    performance: { now: () => time }, screenAngle: () => angle,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const Gyro = vm.runInNewContext(strip(source) + '\nGyro', context);
  const g = new Gyro(); g.start();
  return { g, counters, setAngle: a => { angle = a; }, setTime: t => { time = t; },
    motion(e) { const prev = g._rr; g._motion(e); if (g._rr && prev !== g._rr) counters.rateArrays++; }, listeners };
}
function gyroState(g) {
  return { ...fields(g, ['enabled', 'working', 'sens', 'invX', 'invY', 'dYaw', 'dPitch', '_hasQ', '_tQ', '_tRR', '_src', '_rrScale']),
    q: Array.from(g._q), qp: Array.from(g._qp), dq: Array.from(g._dq), down: Array.from(g._down),
    rr: g._rr && Array.from(g._rr), sm: { ...g._sm }, cal: { ...g._cal } };
}
const gyro = [];
for (const kind of ['ori', 'inconclusive', 'rrA-deg', 'rrA-rad', 'rrB-deg', 'rrB-rad']) {
  const runtimes = [gyroRuntime(gyroSrc.before), gyroRuntime(gyroSrc.after)];
  const trace = crypto.createHash('sha256');
  const chosen = new Set();
  for (let i = 0; i < 2500; i++) {
    const t = 10 + i * (1000 / 60);
    const simple = i < 400 || i >= 2100;
    const orientation = { timeStamp: t, alpha: simple ? 0 : 35 * Math.sin(i * 0.014),
      beta: simple ? i : 60 + 20 * Math.sin(i * 0.021), gamma: simple ? 0 : 12 * Math.cos(i * 0.017) };
    const rate = kind.endsWith('rad') ? Math.PI / 3 : 60;
    const rotationRate = kind.startsWith('rrA') ? { alpha: 0, beta: rate, gamma: 0 }
      : kind.startsWith('rrB') ? { alpha: rate, beta: 0, gamma: 0 } : { alpha: 21, beta: 32, gamma: -54 };
    for (const r of runtimes) {
      r.setTime(t); r.setAngle(i < 500 ? 0 : i < 900 ? 90 : i < 1350 ? 270 : i < 2000 ? 180 : 90);
      if (i === 600) r.g.configure({ sens: 1.8, invX: true });
      if (i === 1100) r.g.configure({ sens: -3.2, invY: true });
      if (i === 1500) r.g.configure({ sens: 5, invX: false, invY: false });
      if (i === 1800) r.g.configure({ sens: '0' });
      if (i === 1000) r.g.resync();
      if (i === 2100) { r.g.stop(); r.g.start(); }
      if (kind !== 'ori') r.motion({ timeStamp: t, rotationRate });
      r.g._orientation(orientation);
      // Duplicate delivery and incomplete sensor data must preserve the same early-return behavior.
      if (i % 97 === 0) r.g._orientation({ ...orientation, timeStamp: t + 0.5 });
      if (i % 131 === 0) r.motion({ timeStamp: t + 1, rotationRate: { alpha: null, beta: 1, gamma: 1 } });
    }
    const a = gyroState(runtimes[0].g), b = gyroState(runtimes[1].g);
    assert.deepEqual(a, b, kind + ' sample ' + i); trace.update(JSON.stringify(a)); chosen.add(a._src);
    if (i % 3 === 0) {
      const x = {}, y = {}; runtimes[0].g.consume(x); runtimes[1].g.consume(y); assert.deepEqual(x, y);
    }
    if (i % 113 === 0) for (const r of runtimes) r.g.discard();
  }
  // Public sensitivity changes are also observed, even outside configure().
  for (const sens of [undefined, NaN, Infinity, -Infinity, -0, '2.5']) {
    for (const r of runtimes) { r.g.sens = sens; r.g._sample(0.5, -0.6, 0.7, 1 / 60); }
    assert.deepEqual(gyroState(runtimes[0].g), gyroState(runtimes[1].g));
  }
  if (kind.startsWith('rrA')) assert(chosen.has('rrA'));
  if (kind.startsWith('rrB')) assert(chosen.has('rrB'));
  gyro.push({ kind, samples: 2500, sourcesUsed: [...chosen], baseline: runtimes[0].counters,
    fixed: runtimes[1].counters, statesAndConsumedDeltasEqual: true, stateSha256: trace.digest('hex') });
}

function netRuntime(source) {
  let t = 0;
  const counters = { quantileArrays: 0, pathModes: [0, 0, 0, 0] };
  source = source.replace('const s = arr.slice().sort((x, y) => x - y);',
    'counters.quantileArrays++; const s = arr.slice().sort((x, y) => x - y);');
  const api = vm.runInNewContext(strip(source) + '\n({ NetMatch, quantile })', {
    THREE, counters, G: {}, on() {}, emit() {}, PLAYER: { gravity: 25 }, WEAPONS: {},
    performance: { now: () => t * 1000 } });
  const nm = new api.NetMatch({ myId: 'self', isHost: false, hostId: 'p0' }, {});
  for (let i = 0; i < 7; i++) nm.byNid.set(i, { owner: 'p' + i, remote: true,
    net: { buf: [], err: new THREE.Vector3(), tp: -1, has: false } });
  const pathAt = nm._pathAt;
  nm._pathAt = function (...args) { const mode = pathAt.apply(this, args); counters.pathModes[mode]++; return mode; };
  return { nm, counters, quantile: api.quantile, setTime: time => { t = time; } };
}
function netState(nm) {
  return { stats: { ...nm.stats }, peers: Array.from(nm.peers, ([id, p]) => [id, {
    ...fields(p, ['off', 'delay', 'rate', 'init', 'lastTs', 'prevTs', 'want', 'tr']),
    events: Array.from(p.events, e => Array.from(e)), late: p.win && Array.from(p.win.late), gap: p.win && Array.from(p.win.gap) }]),
    actors: Array.from(nm.byNid, ([id, a]) => { const n = a.net; return [id, {
      ...fields(n, ['tp', 'has', 'prevT', 'ready']), buf: Array.from(n.buf, s => ({ ...s })),
      cur: n.cur && { ...n.cur }, err: n.err.toArray(), errV: n.errV?.toArray(), prevRaw: n.prevRaw?.toArray() }]; }) };
}
const nets = [netRuntime(netSrc.before), netRuntime(netSrc.after)];
const queues = Array.from({ length: 7 }, () => []), lastDue = new Array(7).fill(0);
const trace = crypto.createHash('sha256');
let packets = 0;
for (let frame = 0; frame < 6000; frame++) {
  const time = 100 + frame / 60;
  if (frame % 3 === 0) for (let peer = 0; peer < 7; peer++) {
    const n = frame / 3;
    const ts = Math.round((time + peer * 0.012 - (n % 211 === 0 ? 0.1 : 0)) * 1000) / 1000;
    const f = 1 | (n % 13 < 8 ? 16 : 0);
    const a = [peer, Math.sin(n * 0.03) * 10, 2 + Math.cos(n * 0.04), Math.cos(n * 0.03) * 10,
      Math.cos(n * 0.03) * 6, -Math.sin(n * 0.04) * 0.8, -Math.sin(n * 0.03) * 6,
      n * 0.02, n * 0.015, Math.sin(n * 0.03) * 0.4, f, 100 - n % 40, 100 - n % 70,
      n % 100, (n % 20) / 20, n * 3, Math.floor(n / 250), 0, 0, 1, 0];
    const due = Math.max(lastDue[peer], frame + 1 + Math.floor(Math.abs(Math.sin(n * 0.37 + peer)) * 5) + (n % 173 === 0 ? 20 : 0));
    lastDue[peer] = due;
    queues[peer].push({ due, d: { k: 't', ts, a: [a], ...(n % 23 === 0 ? { e: [[ts, 'bm', n]] } : {}) } });
  }
  for (const r of nets) r.setTime(time);
  for (let peer = 0; peer < 7; peer++) while (queues[peer].length && queues[peer][0].due <= frame) {
    const { d } = queues[peer].shift();
    for (const r of nets) r.nm._tick('p' + peer, d);
    packets++;
  }
  for (const r of nets) {
    for (const p of r.nm.peers.values()) r.nm._advance(p, 1 / 60);
    for (const a of r.nm.byNid.values()) r.nm._sample(a, time, 1 / 60);
    r.nm._playEvents();
  }
  const a = netState(nets[0].nm), b = netState(nets[1].nm);
  assert.deepEqual(a, b, 'network frame ' + frame); trace.update(JSON.stringify(a));
}
assert(nets[0].nm.stats.extrap > 0 && nets[0].nm.stats.snaps > 7);
const tickArrayCounts = nets.map(r => r.counters.quantileArrays);
// Empty, single, duplicate and non-finite values retain native numeric-sort semantics too.
for (const arr of [[], [1], [2, 1, 2, -0, 0], [NaN, 2, Infinity, -Infinity, -3], Array.from({ length: 60 }, (_, i) => (i * 17) % 29)]) {
  for (const q of [0, 0.9, 0.95, 1]) {
    const before = arr.slice();
    assert.equal(nets[0].quantile(arr, q), nets[1].quantile(arr, q, []));
    assert.deepEqual(arr, before);
  }
}
const network = { frames: 6000, peers: 7, packets,
  baseline: { ...nets[0].counters, quantileArrays: tickArrayCounts[0] },
  fixed: { ...nets[1].counters, quantileArrays: tickArrayCounts[1] }, additionalQuantileEdgeCases: 20,
  persistentScratchArrays: nets[1].nm.peers.size, maximumScratchLength: Math.max(...Array.from(nets[1].nm.peers.values(), p => p.win.sorted.length)),
  quantileAndPlaybackAndActorSampleStatesEqual: true, stateSha256: trace.digest('hex') };
const result = { baseCommit: base, baselineMatchesMainAt: '43539687b87070c3a950ce55b18a679423c5413f',
  sourceSha256: { gyro: gyroSrc.hashes, netmatch: netSrc.hashes }, gyro, network,
  scope: 'Actual classes in Node VM, synthetic sensor/packet events and vendored Three.js; no real browser, device, WebSocket, FPS or GC timing measurement.' };
console.log(JSON.stringify(result, null, 2));
