// #649 Roller rolling paint must widen with the roller's actual ground speed.
//
// These drive the real adapted WeaponRunner._roller() against a real actor and
// record the paint calls it actually makes, so the numbers below are gameplay
// values taken from the simulation rather than a re-implementation. The reference
// data is bound from the pinned 11.3.0 completion table; nothing is invented here,
// and the unresolved parts (real-device widths, the native Roller reticle
// geometry, the intermediate Nintendo curve) are recorded as unverified instead of
// asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const THREE_PATH = path.join(UPSTREAM, 'vendor/three/build/three.module.js');

// Drives a real rolling actor at a fixed ground speed and returns every paint
// call the roll made, in order. yaw 0 => forward +z, right +x.
async function rollAt(f, speed, frames = 40, dt = 1 / 60) {
  const a = f.make('roller');
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  const calls = [];
  const native = f.G.paint.splat;
  f.G.paint.splat = (centre, radius, team, opts) => {
    calls.push({ x: centre.x, z: centre.z, y: centre.y, radius, team, kind: opts.kind, floorOnly: !!opts.floorOnly });
    return 0.5;
  };
  a.yaw = 0; a.grounded = true; a.ink = 100;
  const r = a.weaponRunner;
  r.update(dt, { fire: true, firePressed: false });
  for (let i = 0; i < frames; i++) {
    a.vel.set(0, 0, speed);
    a.pos.z += speed * dt;
    f.G.time += dt;
    r.update(dt, { fire: true, firePressed: false });
  }
  f.G.paint.splat = native;
  return { actor: a, calls, runner: r };
}
// Outermost lateral extent of a set of paint calls: band centre offset plus the
// native band radius. This is what a rolled-over wall or floor tile sees.
const reach = calls => Math.max(...calls.map(c => Math.abs(c.x))) + calls[0].radius;
const body = calls => calls.filter(c => !c.floorOnly);
const splash = calls => calls.filter(c => c.floorOnly);

// Minimal real PaintSystem with one horizontal floor face and one vertical wall
// face, adapted through the production build adapter. No fake game model.
async function loadPaint() {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  const resolve = (spec, from) => {
    if (spec === 'three') return THREE_PATH;
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  };
  const load = file => {
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    const source = file === path.join(UPSTREAM, 'src/world/paint.js') ? adaptSource('src/world/paint.js', raw) : raw;
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, module);
    return module;
  };
  const paintPath = path.join(UPSTREAM, 'src/world/paint.js');
  const paintModule = load(paintPath);
  await paintModule.link((spec, parent) => load(resolve(spec, parent.identifier)));
  await paintModule.evaluate();
  const ctx = modules.get(path.join(UPSTREAM, 'src/core/ctx.js'));
  const three = modules.get(THREE_PATH);
  return { PaintSystem: paintModule.namespace.PaintSystem, G: ctx.namespace.G, THREE: three.namespace };
}

function makePaint({ PaintSystem, THREE }, { wall }) {
  const n = wall ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const face = {
    origin: new THREE.Vector3(), n,
    u: new THREE.Vector3(1, 0, 0), v: wall ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1),
    su: 20, sv: 20, cu: 0.25, cv: 0.25, nu: 80, nv: 80,
    grid: 0, turf: true, wall, atlas: { pad: 8, ppm: 4, x: 0, y: 0 },
  };
  const block = { aabbMin: { x: -2, y: -2, z: -2 }, aabbMax: { x: 22, y: 22, z: 22 }, faces: [0, -1, -1, -1, -1, -1] };
  const paint = Object.create(PaintSystem.prototype);
  Object.assign(paint, {
    renderer: { getRenderTarget: () => null, getClearColor: c => c, getClearAlpha: () => 1, setRenderTarget() {}, setClearColor() {}, clear() {} },
    level: { faces: [face], blocks: [block], queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 1; out[0] = 0; return out; } },
    grid: new Uint8Array(face.nu * face.nv), dead: new Uint8Array(face.nu * face.nv),
    counts: [0, 0], version: 0, growing: [], clock: 0, frame: 0, _wetUntil: 0,
    quads: 0, rip: new Float64Array(24 * 4), ripP: new Float32Array(24 * 4), _ripS: new Float32Array(24),
    _dryAcc: 0, _dryU: { uDry: { value: 0 } }, dryMesh: { visible: false, geometry: { dispose() {} }, material: { dispose() {} } },
    rt: { dispose() {} }, geo: { dispose() {} }, mat: { dispose() {} },
    _drawQuads() {}, _emitGrowth() {},
    // The installed paint system pools its splat records; the real adapted
    // prototype expects these fields on an Object.create() instance.
    _splatEntryPool: [], _splatGrowthPool: [], _splatPoolsDisposed: false,
    _splatPoolStats: { entryArraysCreated: 0, entryArraysReused: 0, growthRecordsCreated: 0, growthRecordsReused: 0 },
  });
  return paint;
}

test('#649 the pinned reference binding is the one installRollerPaint accepts', async () => {
  const f = await fixture();
  const ref = f.installRollerPaint(f.profile, f.WEAPONS.roller);
  assert.equal(ref.speedMax, 0.132, 'BodyParam.PaintParam.SpeedMax');
  assert.equal(ref.widthHalfMax, 2.8, 'BodyParam.PaintParam.WidthHalfMax');
  assert.equal(ref.speedNormal, 0.108, 'WeaponRollParam.SpeedNormal');
  assert.equal(ref.dashWorld, 0.132 * 60, 'rollSpeed is the world speed of SpeedMax under the *60 conversion');
  assert.equal(ref.maxWidth, 1.9, 'the maximum painted width stays the upstream rollWidth calibration');
  assert.equal(f.rollerPaintReference().dashWorld, f.WEAPONS.roller.rollSpeed);
});

test('#649 a profile that stops matching the pinned conversion refuses to install', async () => {
  const f = await fixture();
  const clone = () => JSON.parse(JSON.stringify(f.profile));
  const broken = clone();
  broken.weapons.roller.rollSpeed = 9.9;
  assert.throws(() => f.installRollerPaint(broken, { ...f.WEAPONS.roller, rollSpeed: 9.9 }),
    /pinned S3-to-world \*60 conversion/);
  const missing = clone();
  delete missing.weaponsFidelityCompletion.weapons.roller.BodyParam.PaintParam.WidthHalfMax;
  assert.throws(() => f.installRollerPaint(missing, f.WEAPONS.roller), /WidthHalfMax/);
  const desynced = clone();
  desynced.weaponsFidelityCompletion.weapons.roller.BodyParam.PaintParam.SpeedMax = 0.2;
  assert.throws(() => f.installRollerPaint(desynced, f.WEAPONS.roller),
    /SpeedMax differs from WeaponRollParam.SpeedDash/);
  assert.throws(() => f.installRollerPaint(clone(), { ...f.WEAPONS.roller, rollWidth: 0 }), /must be positive/);
});

test('#649 increasing roll speed widens the painted footprint deterministically', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const low = (await rollAt(f, w.rollSpeed * 0.25)).calls;
  const normal = (await rollAt(f, w.rollBaseSpeed)).calls;
  const preDash = (await rollAt(f, w.rollSpeed - 1e-3)).calls;
  const dash = (await rollAt(f, w.rollSpeed)).calls;
  assert.ok(low.length > 0 && dash.length > 0, 'rolling actually painted at both ends');
  assert.ok(reach(low) < reach(normal), `early roll must be narrower than settled roll (${reach(low)} < ${reach(normal)})`);
  assert.ok(reach(normal) < reach(preDash), `settled roll must be narrower than just before dash (${reach(normal)} < ${reach(preDash)})`);
  assert.ok(reach(preDash) <= reach(dash) + 1e-9, `pre-dash must not exceed dash width (${reach(preDash)} <= ${reach(dash)})`);
  // The maximum-speed sample reaches the documented maximum half width anchored
  // on the existing calibration; the body band alone would stop far short of it.
  const maxHalf = w.rollWidth * 0.5, bodyEdge = w.rollWidth * 0.33;
  assert.ok(Math.abs(reach(dash) - (maxHalf + 0.62)) < 1e-9, `dash reaches the anchored maximum (${reach(dash)})`);
  assert.ok(reach(body(dash)) < reach(dash), 'the speed gain is not coming from the body band');
  assert.ok(bodyEdge < maxHalf, 'the side splash has somewhere to walk to');
  // Deterministic: identical inputs reproduce identical geometry.
  const again = await rollAt(f, w.rollSpeed);
  assert.deepEqual(again.calls, dash, 'the same actor, weapon and speed paint identically');
});

test('#649 the roller body keeps its upstream geometry and only the side splash is speed scaled', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  const seen = [];
  for (const speed of [w.rollSpeed * 0.25, w.rollBaseSpeed, w.rollSpeed]) {
    const { calls } = await rollAt(f, speed);
    const bands = body(calls);
    assert.ok(bands.length >= 3 && bands.length % 3 === 0, 'body paint stays a whole number of three-band steps');
    for (let i = 0; i < bands.length; i += 3) {
      const step = bands[i + 1].x - bands[i].x;
      assert.ok(Math.abs(step - w.rollWidth * 0.33) < 1e-9, `body band step is unchanged at ${speed} (${step})`);
      for (const b of bands.slice(i, i + 3)) {
        assert.equal(b.radius, 0.62, 'native band radius is unchanged');
        assert.equal(b.floorOnly, false, 'only the body may paint a wall');
        assert.equal(b.kind, 'roll', 'rolled turf still reads as a straight-edged band');
        assert.ok(Math.abs(b.y - (bands[0].y)) < 1e-12, 'bands share the native roll height');
      }
    }
    const drops = splash(calls);
    assert.equal(drops.length % 2, 0, 'side splashes come in left/right pairs');
    assert.ok(Math.abs(drops[0].x + drops[1].x) < 1e-9, 'side splash pair is symmetric about the roll centre');
    for (const d of drops) { assert.equal(d.kind, 'roll'); assert.equal(d.radius, 0.62, 'splash reuses the native band radius'); }
    seen.push(Math.abs(drops[0].x));
  }
  assert.ok(seen[0] < seen[1] && seen[1] < seen[2], `side splash walks out with speed (${seen.join(' < ')})`);
});

test('#649 a floor-only splat marks no wall face, an ordinary splat still does', async () => {
  const runtime = await loadPaint();
  const floor = makePaint(runtime, { wall: false });
  const wall = makePaint(runtime, { wall: true });
  const opts = { seed: 0.5, kind: 'roll' };
  // A floor face is claimed by the roller band.
  assert.ok(floor.splat(new runtime.THREE.Vector3(2, 0.1, 3), 0.62, 0, { ...opts }) > 0, 'the roller band claims floor');
  // A wall face 0.1 inside the splat is claimed when the splat may mark walls...
  const marked = wall.splat(new runtime.THREE.Vector3(0, 0, -0.1), 0.62, 0, { ...opts });
  assert.ok(marked > 0, 'an unrestricted roller splat still marks a wall face');
  // ...and is skipped when it is a floor-only side splash.
  const skipped = wall.splat(new runtime.THREE.Vector3(0, 0, -0.1), 0.62, 1, { ...opts, floorOnly: true });
  assert.equal(skipped, 0, 'a floor-only roller splat never marks a wall');
  assert.equal(wall.counts[1], 0, 'and credits no wall turf to the roller team');
});

test('#649 the floor-only flag survives the recorded network replay', async () => {
  const f = await fixture();
  const record = (opts) => {
    const nm = { applying: false, mute: 0, out: [], _rec: f.NetMatch.prototype._rec };
    f.NetMatch.prototype.recSplat.call(nm, { x: 1.25, y: 0.35, z: -2.5 }, 0.62, 1, opts);
    return nm.out[0];
  };
  const stretch = { x: 0, y: 0, z: 1 };
  const bodyEvent = record({ seed: 0.5, kind: 'roll', stretch });
  const splashEvent = record({ seed: 0.5, kind: 'roll', stretch, floorOnly: true });
  assert.equal(bodyEvent[13], 0, 'the body band records a wall-capable splat');
  assert.equal(splashEvent[13], 1, 'the side splash records its floor-only flag');
  const seen = [];
  const native = f.G.paint.splat;
  f.G.paint.splat = (c, r, t, o) => { seen.push({ x: c.x, floorOnly: !!o.floorOnly, kind: o.kind }); return 0; };
  const player = { applying: false, byNid: new Map(), _play: f.NetMatch.prototype._play, _trigSideEffects() {} };
  f.NetMatch.prototype._play.call(player, 0, bodyEvent);
  f.NetMatch.prototype._play.call(player, 0, splashEvent);
  f.G.paint.splat = native;
  assert.equal(seen.length, 2, 'both recorded splats replay');
  assert.equal(seen[0].floorOnly, false, 'the replayed body band may still mark a wall');
  assert.equal(seen[1].floorOnly, true, 'the replayed side splash stays floor-only on the remote');
  assert.equal(seen[1].kind, 'roll');
});

test('#649 zero roll speed adds no side splash, and the ratio is clamped to the pinned range', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  assert.equal(f.rollerPaintRatio(0, w), 0, 'a roller that is not moving has no splash ratio');
  assert.equal(f.rollerPaintRatio(-1, w), 0, 'ratio never goes negative');
  assert.equal(f.rollerPaintRatio(w.rollSpeed * 2, w), 1, 'ratio never exceeds the SpeedMax reference');
  assert.ok(Math.abs(f.rollerPaintRatio(w.rollBaseSpeed, w) - 0.108 / 0.132) < 1e-12,
    'settled roll sits exactly at SpeedNormal / SpeedMax');
  assert.equal(f.rollerSideSplashOffset(0, w), w.rollWidth * 0.33, 'a stopped splash stays on the outer body band');
  // Drive the real emitter at zero speed: body bands only.
  const calls = [];
  const actor = f.make('roller');
  actor.yaw = 0;
  const paint = { splat: (centre, radius, team, opts) => { calls.push({ x: centre.x, radius, floorOnly: !!opts.floorOnly }); return 0; } };
  f.rollerRollPaint(actor, w, 0, 0, 1, 1, 0, actor.pos, actor.pos.clone(), paint);
  assert.equal(calls.length, 3, 'zero speed emits the three native body bands and nothing else');
  assert.ok(calls.every(c => !c.floorOnly), 'and no side splash at all');
});

test('#649 roll speed, dash timing, contact width and ink consumption are untouched', async () => {
  const f = await fixture();
  const w = f.WEAPONS.roller;
  assert.equal(w.rollSpeed, 7.92);
  assert.ok(Math.abs(w.rollBaseSpeed - 6.48) < 1e-12);
  assert.equal(w.rollDashTime, 1.5);
  assert.equal(w.rollInkPerMeter, 0.7575757575757576);
  const a = f.make('roller');
  f.installRollerPaint(f.profile, f.WEAPONS.roller);
  a.grounded = true;
  const r = a.weaponRunner;
  r.rolling = true;
  r.rollT = 0;
  assert.equal(r.moveSpeed(), w.rollBaseSpeed, 'normal roll speed target is unchanged');
  r.rollT = w.rollDashTime - 1e-4;
  assert.equal(r.moveSpeed(), w.rollBaseSpeed, 'still normal roll just before the 90F dash');
  r.rollT = w.rollDashTime;
  assert.equal(r.moveSpeed(), w.rollSpeed, 'the 90F dash still switches to rollSpeed');
  r.rollT = 0;
  a.vel.set(0, 0, w.rollSpeed);
  a.pos.set(0, 0, 0);
  r.lastRollPos = a.pos.clone();
  a.pos.z += 1;
  const ink0 = a.ink;
  r.update(1 / 60, { fire: true, firePressed: false });
  assert.ok(a.ink < ink0, 'rolling still consumes ink per metre');
  r.reset();
  assert.equal(r.moveSpeed(), f.PLAYER.runSpeed, 'reset returns to run speed');
  // The contact-damage width expression (#578) is not coupled to the paint width.
  const contact = fs.readFileSync(path.join(UPSTREAM, 'src/game/weapons.js'), 'utf8');
  assert.match(contact, /lat < w\.rollWidth \/ 2 \+ 0\.35/);
});

test('#649 30/60/120 Hz render schedules produce the same painted footprint trace', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    f.installRollerPaint(f.profile, f.WEAPONS.roller);
    const a = f.make('roller');
    a.yaw = 0; a.grounded = true; a.ink = 100;
    const calls = [];
    f.G.paint.splat = (c, r, t, o) => { calls.push([+c.x.toFixed(9), +c.z.toFixed(9), r, o.floorOnly ? 1 : 0]); return 0; };
    const r = a.weaponRunner;
    r.update(1 / 60, { fire: true, firePressed: true });
    const clock = new FixedClock();
    for (let frame = 0; frame < 150 / 60 * hz; frame++) {
      clock.advance(1 / hz, dt => {
        a.vel.set(0, 0, f.WEAPONS.roller.rollSpeed);
        a.pos.z += f.WEAPONS.roller.rollSpeed * dt;
        f.G.time += dt;
        r.update(dt, { fire: true });
      });
    }
    assert.equal(clock.ticks, 150, `${hz} Hz tick count`);
    traces.push(calls);
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});

test('#649 the installed paint system carries exactly the guarded floor-only connection', async () => {
  const installed = adaptSource('src/world/paint.js', fs.readFileSync(path.join(UPSTREAM, 'src/world/paint.js'), 'utf8'));
  assert.match(installed, /const floorOnly = !!opts\.floorOnly;/);
  assert.match(installed, /if \(floorOnly && f\.wall\) continue;/);
  assert.equal((installed.match(/floorOnly/g) || []).length, 3, 'the floor-only option stays one guarded connection');
  assert.equal(installed.split('floorOnly && f.wall').length - 1, 1, 'wall faces are skipped only when the option is set');
  const net = adaptSource('src/net/netmatch.js', fs.readFileSync(path.join(UPSTREAM, 'src/net/netmatch.js'), 'utf8'));
  assert.match(net, /o\.stretchAmt \?\? 1\) : 0, o\.floorOnly \? 1 : 0\]\);/, 'the wire records the floor-only flag');
  assert.match(net, /if \(e\[13\]\) opts\.floorOnly = true;/, 'the replay restores the floor-only flag');
});
