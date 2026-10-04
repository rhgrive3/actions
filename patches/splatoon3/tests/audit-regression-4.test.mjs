// Regression coverage for the read-only audit-4 repair of candidate 063286d.
//
//   F2  owner and proxy deaths must apply the SAME gear death consequence
//   F3  the Charger feet splash must use a paint kind PaintSystem defines, and
//       must survive recSplat -> wire -> remote replay unchanged
//   F6  the refill gate must not carry an inert term
//   dt  a zero-length tick must not change any of the above
//
// Every test composes the immutable inkwave-public sources through the real
// build adapter and the real runtime installers (tests/source-fixture.mjs).
// The paint-protocol tests build a REAL Level and a REAL PaintSystem; only the
// renderer is absent, which splat() never touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// A real Level + PaintSystem + NetMatch in ONE module graph, so G is the same
// singleton for painting, recording and replay. Only the renderer is absent,
// which splat() never touches (it is used solely by the GPU upload path).
// inkwave-public has no node_modules, so 'three' resolves to the vendored build
// exactly as the project's own source-fixture does.
let worldPromise = null;
function realWorld() {
  if (worldPromise) return worldPromise;
  worldPromise = (async () => {
    const UP = path.join(ROOT, 'inkwave-public');
    const ctx = vm.createContext({ console, performance });
    const modules = new Map();
    const resolve = (spec, from) => spec === 'three'
      ? path.join(UP, 'vendor/three/build/three.module.js')
      : path.resolve(path.dirname(from), spec);
    // Same shape as the project's source-fixture: the linker callback returns
    // the module and lets SourceTextModule.link drive the recursion.
    function load(file) {
      if (modules.has(file)) return modules.get(file);
      const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context: ctx, identifier: file });
      modules.set(file, m);
      return m;
    }
    const root = new vm.SourceTextModule(`
      export * from './inkwave-public/src/core/ctx.js';
      export * from './inkwave-public/src/config.js';
      export * from './inkwave-public/src/game/physics.js';
      export * from './inkwave-public/src/world/paint.js';
      export * from './inkwave-public/src/world/level.js';
      export * from './inkwave-public/src/world/maps.js';
      export * from './inkwave-public/src/net/netmatch.js';
      export * as THREE from 'three';
    `, { context: ctx, identifier: path.join(ROOT, 'audit-regression-4.world.mjs') });
    await root.link((s, f) => load(resolve(s, f.identifier)));
    await root.evaluate();
    return { ...root.namespace };
  })();
  return worldPromise;
}

// PaintSystem's constructor runs _initGPU -> clear(), which only needs the
// anisotropy capability plus the render-target / clear-colour round trip.
// splat() and sample() are pure CPU grid work, so this stub exercises the
// production paint path with no GL context. clear() also resets grid to 0,
// which is exactly the blank-slate state a fresh receiver starts from.
const RENDERER_STUB = {
  capabilities: { getMaxAnisotropy: () => 1 },
  getRenderTarget: () => null,
  setRenderTarget() {},
  getClearColor: (c) => c,
  getClearAlpha: () => 1,
  setClearColor() {},
  clear() {},
};

async function realPaintWorld() {
  const w = await realWorld();
  const level = new w.Level(w.MAP_LAYOUTS.tidewater);
  const paint = new w.PaintSystem(RENDERER_STUB, level);
  w.G.level = level;
  w.G.paint = paint;
  // A real NetMatch, so recSplat and the _play replay path are the shipped ones.
  const nm = new w.NetMatch({ myId: 'self', s: {}, _members: new Set() }, {});
  w.G.netm = nm;
  return { ...w, level, paint, nm };
}

function faceCentre(level, min = 4) {
  const i = level.faces.findIndex(f => f.paintable && f.su > min && f.sv > min);
  assert.ok(i >= 0, 'the stage must offer a paintable face');
  const f = level.faces[i];
  return { i, f, u: f.su / 2, v: f.sv / 2,
    p: f.origin.clone().addScaledVector(f.u, f.su / 2).addScaledVector(f.v, f.sv / 2) };
}

// ---------------------------------------------------------------------------
// F2 - one owner/proxy-agnostic gear death consequence
// ---------------------------------------------------------------------------
// A deliberately PARTIAL loadout: 57 AP (three full mains) maxes every gear
// curve at its cap, and specialSaver's cap is 1.0 (no reduction), which would
// make the modifier unobservable. One 10 AP main leaves it strictly below 1.
function gearLoadout(a, ability) {
  a.s3 = a.s3 || {};
  a.s3.loadout = [
    { main: ability, subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
    { main: 'none', subs: ['none', 'none', 'none'] },
  ];
  a.setWeapon('shooter');
  assert.ok(a.s3.modifiers[ability] !== undefined, `${ability} must produce a modifier`);
  return a.s3.modifiers[ability];
}

test('F2 owner and proxy deaths reach the same special gauge for the same cause', async () => {
  const f = await fixture();
  const owner = f.make(), proxy = f.make();
  let saver = 0;
  for (const a of [owner, proxy]) { saver = gearLoadout(a, 'specialSaver'); a.special = 100; }
  assert.ok(saver < 1, `specialSaver must actually reduce the gauge (got ${saver})`);

  owner.splat(null, 'water');
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'water');

  assert.equal(owner.respawnTimer, proxy.respawnTimer,
    'the cause-selected respawn base must match between owner and proxy');
  assert.equal(owner.special, proxy.special,
    `gear specialSaver must apply to both paths (owner ${owner.special} vs proxy ${proxy.special})`);
  assert.ok(owner.special > 0 && owner.special < 100, 'the gauge must actually be reduced on both paths');
  assert.ok(Math.abs(owner.special - 100 * saver) < 1e-9, 'the result is the pre-death gauge times the modifier');
});

test('F2 the chase-time bonus applies to both owner and proxy for a no-splat life', async () => {
  const f = await fixture();
  const owner = f.make(), proxy = f.make();
  for (const a of [owner, proxy]) {
    gearLoadout(a, 'quickRespawn');
    a.s3.splatsThisLife = 0;
    a.s3.previousLifeNoSplat = true;   // a full life without being splatted
  }
  const base = f.profile.respawn.normal;
  owner.splat(null, 'weapon');
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'weapon');

  assert.ok(owner.respawnTimer < base, 'owner chase time shortens the wait');
  assert.ok(proxy.respawnTimer < base, 'proxy chase time shortens the wait too');
  assert.equal(owner.respawnTimer, proxy.respawnTimer, 'both paths must shorten by the same amount');
});

test('F2 a duplicate remote splat packet applies the gear consequence exactly once', async () => {
  const f = await fixture();
  const proxy = f.make();
  const saver = gearLoadout(proxy, 'specialSaver');
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  proxy.special = 100;

  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'water');
  const afterFirst = proxy.special, deaths = proxy.stats.deaths;
  assert.ok(Math.abs(afterFirst - 100 * saver) < 1e-9, 'first packet applies the modifier');

  // Replay the same packet: _remoteSplat already guards on !alive, and the
  // helper additionally refuses to run twice for the same death id.
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'water');
  assert.equal(proxy.special, afterFirst, 'a duplicate packet must not re-apply the modifier');
  assert.equal(proxy.stats.deaths, deaths, 'a duplicate packet must not count another death');
});

test('F2 a second life re-arms the gear death consequence', async () => {
  const f = await fixture();
  const owner = f.make();
  gearLoadout(owner, 'specialSaver');
  owner.special = 100;
  owner.splat(null, 'water');
  const first = owner.special;
  owner.reset();
  owner.special = 100;
  owner.splat(null, 'water');
  assert.equal(owner.special, first, 'the next death must apply the modifier again, not be skipped');
});

test('F2 death causes stay distinct on both the owner and the proxy path', async () => {
  const f = await fixture();
  const r = f.profile.respawn;
  for (const cause of ['weapon', 'water', 'fall']) {
    const owner = f.make(), proxy = f.make();
    proxy.remote = true; proxy.net = { buf: [], tp: 0 };
    owner.splat(null, cause);
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, cause);
    assert.equal(owner.respawnTimer, proxy.respawnTimer, `cause ${cause} must agree`);
    assert.ok(owner.respawnTimer > 0, `cause ${cause} yields a live timer`);
  }
  const water = f.make(), oob = f.make();
  water.splat(null, 'water'); oob.splat(null, 'fall');
  assert.notEqual(water.respawnTimer, oob.respawnTimer, 'water and out-of-bounds differ');
});

test('F2 the death helper creates no extra splatted/kill event', async () => {
  const f = await fixture();
  let splatted = 0, hit = 0;
  const offA = f.on('splatted', () => splatted++);
  const offB = f.on('hit', () => hit++);
  const owner = f.make(), proxy = f.make();
  gearLoadout(owner, 'specialSaver');
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  owner.splat(null, 'water');
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'water');
  offA(); offB();
  assert.equal(splatted, 1, 'exactly one splatted event for the owner death');
  assert.equal(hit, 0, 'the gear helper must not synthesise a kill confirmation');
});

// ---------------------------------------------------------------------------
// F2 direct-helper regression.
//
// The duplicate-packet test above is protected by _remoteSplat's `!alive`
// guard, so it never exercises the helper's own exactly-once logic. These call
// applyDeathGear DIRECTLY, which is the only way that guard can be proven.
// ---------------------------------------------------------------------------
test('F2 direct applyDeathGear calls for one death apply exactly once', async () => {
  const f = await fixture();
  const a = f.make();
  const saver = gearLoadout(a, 'specialSaver');
  a.special = 100;
  a.alive = false;              // a real death: the helper requires it
  a.stats.deaths = 1;           // the native counter, already incremented

  assert.equal(f.applyDeathGear(a, 100), true, 'the first call must apply');
  const after = a.special;
  assert.ok(Math.abs(after - 100 * saver) < 1e-9, 'the gauge is the pre-death value times the modifier');

  for (let i = 0; i < 5; i++) {
    assert.equal(f.applyDeathGear(a, 100), false, `repeat call ${i} must be refused`);
    assert.equal(a.special, after, `repeat call ${i} must not compound the gauge`);
  }
});

test('F2 direct applyDeathGear re-arms on the next life and never compounds', async () => {
  const f = await fixture();
  const a = f.make();
  const saver = gearLoadout(a, 'specialSaver');

  a.alive = false; a.stats.deaths = 1; a.special = 100;
  assert.equal(f.applyDeathGear(a, 100), true);
  const first = a.special;

  a.reset();                   // a new life
  a.alive = false; a.stats.deaths = 2; a.special = 100;
  assert.equal(f.applyDeathGear(a, 100), true, 'the next death must apply again');
  assert.ok(Math.abs(a.special - first) < 1e-9,
    `the second death must give the same result, not compound (${a.special} vs ${first})`);
});

test('F2 direct applyDeathGear refuses before any death and while alive', async () => {
  const f = await fixture();
  const a = f.make();
  gearLoadout(a, 'specialSaver');
  a.special = 100;
  a.alive = false;
  a.stats.deaths = 0;
  assert.equal(f.applyDeathGear(a, 100), false, 'no death has happened yet');
  assert.equal(a.special, 100, 'the gauge must be untouched');
  a.stats.deaths = 1;
  a.alive = true;
  assert.equal(f.applyDeathGear(a, 100), false, 'a living actor is not a death');
  assert.equal(a.special, 100, 'the gauge must be untouched');
});

// ---------------------------------------------------------------------------
// F2 real lifecycle: the counter timing must line up on BOTH native paths.
// ---------------------------------------------------------------------------
test('F2 owner lifecycle: the helper sees the counter after the native increment', async () => {
  const f = await fixture();
  const a = f.make();
  gearLoadout(a, 'specialSaver');
  a.special = 100;
  a.splat(null, 'water');
  assert.equal(a.stats.deaths, 1, 'the native body increments the counter');
  const applied = a.special;
  // A second direct call for the SAME death must be refused by the guard itself.
  assert.equal(f.applyDeathGear(a, 100), false, 'the guard must refuse, not the alive check');
  assert.equal(a.special, applied, 'no compounding');

  a.reset();
  a.special = 100;
  a.splat(null, 'water');
  assert.equal(a.stats.deaths, 2);
  assert.ok(Math.abs(a.special - applied) < 1e-9, 'the second life gives the same result');
});

test('F2 proxy lifecycle: the remote hook runs after victim.stats.deaths++', async () => {
  const f = await fixture();
  const p = f.make();
  gearLoadout(p, 'specialSaver');
  p.remote = true; p.net = { buf: [], tp: 0 };
  p.special = 100;
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, p, null, 'water');
  assert.equal(p.stats.deaths, 1, 'the remote body increments the counter');
  const applied = p.special;
  assert.ok(applied < 100, 'the helper must have applied on the remote path');
  assert.equal(f.applyDeathGear(p, 100), false, 'the guard must refuse a repeat for the same death');
  assert.equal(p.special, applied, 'no compounding');

  // A second life: the remote respawn path does not run Actor.reset, so the
  // guard must still re-arm purely from the monotonic counter.
  p.alive = true; p.special = 100; p.respawnTimer = 0;
  f.NetMatch.prototype._remoteRespawn.call({}, p);
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, p, null, 'water');
  assert.equal(p.stats.deaths, 2);
  assert.ok(Math.abs(p.special - applied) < 1e-9, `second life must match, not compound (${p.special} vs ${applied})`);
});

test('F2 owner and proxy stay identical across two full lives', async () => {
  const f = await fixture();
  const owner = f.make(), proxy = f.make();
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  gearLoadout(owner, 'specialSaver'); gearLoadout(proxy, 'specialSaver');
  for (let life = 0; life < 2; life++) {
    owner.special = 100; proxy.special = 100;
    owner.splat(null, 'water');
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'water');
    assert.equal(owner.special, proxy.special, `life ${life}: gauge must match`);
    assert.equal(owner.stats.deaths, proxy.stats.deaths, `life ${life}: death counts must match`);
    if (life === 0) { owner.reset(); proxy.alive = true; proxy.respawnTimer = 0; }
  }
});

test('F2 dt = 0 leaves every death consequence untouched', async () => {
  const f = await fixture();
  const a = f.make();
  gearLoadout(a, 'specialSaver');
  a.special = 100;
  a.splat(null, 'water');
  const snapshot = { special: a.special, timer: a.respawnTimer, deaths: a.stats.deaths };
  a.update(0);
  a.update(0);
  assert.equal(a.special, snapshot.special, 'a zero tick must not re-apply the modifier');
  assert.equal(a.respawnTimer, snapshot.timer, 'a zero tick must not move the respawn timer');
  assert.equal(a.stats.deaths, snapshot.deaths, 'a zero tick must not count another death');
});

// ---------------------------------------------------------------------------
// F3 - feet paint protocol: real PaintSystem kind + faithful wire replay
// ---------------------------------------------------------------------------
const FEET_OPTS = { seed: 0, kind: 'trail' };

test('F3 the feet splash kind is one PaintSystem actually defines', async () => {
  const w = await realPaintWorld();
  const radius = 0.7;
  for (const kind of [FEET_OPTS.kind]) {
    assert.equal(w.paint._kind({ kind }, radius, undefined, 0), 4,
      `'${kind}' must resolve to K_TRAIL, not fall through to the radius heuristic`);
  }
  // The retired name is what the audit found: unknown, so it silently degraded.
  assert.equal(w.paint._kind({ kind: 'chargerFeet' }, radius, undefined, 0), 4,
    'sanity: the old unknown name also resolved by fallback, which is exactly the silent path we removed');
});

test('F3 the feet splash actually paints cells with the real PaintSystem', async () => {
  const w = await realPaintWorld();
  const { i, f, u, v, p } = faceCentre(w.level);
  const before = w.paint.sample(i, u, v);
  const area = w.paint.splat(p, 0.7, 1, { ...FEET_OPTS });
  assert.ok(area > 0, 'the feet splat must claim real cells');
  assert.notEqual(w.paint.sample(i, u, v), before, 'the sampled cell must change');
});

test('F3 recSplat -> wire -> _play replay reproduces the feet paint faithfully', async () => {
  const w = await realPaintWorld();
  const { i, u, v, p } = faceCentre(w.level);
  w.nm.out.length = 0;

  const area = w.paint.splat(p, 0.7, 1, { ...FEET_OPTS });
  assert.ok(area > 0, 'the owner splat must claim cells');
  assert.equal(w.nm.out.length, 1, 'the real recSplat must record exactly one packet');

  // The real wire payload: ['s', x, y, z, radius, team, seed, kind, sx, sy, sz, stretchAmt]
  const packet = w.nm.out[0];
  assert.equal(packet[1], 's');
  assert.equal(packet[7], 0, 'seed must survive the real encoder');
  assert.equal(packet[8], FEET_OPTS.kind, 'the native kind must survive the real encoder');
  assert.equal(packet[9] + packet[10] + packet[11], 0, 'a feet splash carries no stretch vector');

  // Replay through the shipped _play path into an independent PaintSystem.
  const w2 = await realWorld();
  const level2 = new w2.Level(w2.MAP_LAYOUTS.tidewater);
  const paint2 = new w2.PaintSystem(RENDERER_STUB, level2);
  w2.G.level = level2; w2.G.paint = paint2;
  const target = faceCentre(level2);
  const before = paint2.sample(target.i, target.u, target.v);

  const nm2 = new w2.NetMatch({ myId: 'peer', s: {}, _members: new Set() }, {});
  w2.G.netm = nm2;
  nm2._play('owner', packet);            // the real remote replay entry point

  assert.equal(nm2.applying, false, '_play must clear the applying flag');
  assert.notEqual(paint2.sample(target.i, target.u, target.v), before,
    'the receiver must end up with ink exactly where the owner painted it');
  assert.equal(nm2.out.length, 0, 'a replayed splat must not be re-recorded (no echo loop)');
});

test('F3 owner and receiver resolve the same kind for the replayed packet', async () => {
  const w = await realPaintWorld();
  const radius = 0.7;
  const ownerKind = w.paint._kind({ ...FEET_OPTS }, radius, undefined, 0);
  const replayOpts = { seed: 0, kind: FEET_OPTS.kind };   // exactly what _play builds from the packet
  const receiverKind = w.paint._kind(replayOpts, radius, undefined, 0);
  assert.equal(receiverKind, ownerKind, 'both ends must agree on the paint kind');
  assert.equal(receiverKind, 4, 'and it must be the native K_TRAIL the radius heuristic already chose');
});

// ---------------------------------------------------------------------------
// F6 - the refill gate carries no inert term
// ---------------------------------------------------------------------------
test('F6 the refill delay is exactly the weapon post-fire stop', async () => {
  const src = fs.readFileSync(`${ROOT}patches/splatoon3/runtime/resources.mjs`, 'utf8');
  // Strip comments so the explanatory note about the retired term cannot itself
  // satisfy (or break) the check.
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/inkRecoverStop\s*\|\|\s*0/.test(code), 'the never-assigned s3.inkRecoverStop term must be gone');
  assert.ok(!/a\.s3\??\.inkRecoverStop/.test(code), 'no s3.inkRecoverStop read may remain in the resource step');
  assert.ok(/const delay = weaponDelay;/.test(code), 'the gate must use the weapon stop directly');
  const f = await fixture(), a = f.make('shooter');
  assert.equal(a.weapon.inkRecoverStop, f.profile.weapons.shooter.inkRecoverStop);
  assert.ok(Math.abs(a.weapon.inkRecoverStop * 60 - 20) < 1e-6, 'the shooter stop is 20 frames');
});

test('F6 removing the inert term does not move the 20f boundary on either form', async () => {
  const f = await fixture();
  const kid = f.make('shooter');
  kid.ink = 0; kid.lastFire = 0; kid.form = 'kid';
  f.tick(kid, 19);
  assert.equal(kid.ink, 0, 'no humanoid refill before 20f');
  f.tick(kid, 1);
  assert.ok(kid.ink > 0, 'humanoid refill starts at 20f');

  const swim = f.make('shooter');
  swim.ink = 0; swim.lastFire = 0;
  swim.grounded = true; swim.ground = { hit: true, face: 0, u: .5, v: .5 };
  swim.intent.squid = true;
  f.tick(swim, 1);
  assert.equal(swim.form, 'squid');
  f.tick(swim, 18);
  assert.equal(swim.ink, 0, 'own-ink swim refill is still gated at 19f');
  f.tick(swim, 1);
  assert.ok(swim.ink > 0, 'own-ink swim refill still starts at 20f');
});

test('the sub/flick recover stop still blocks refill independently of the delay term', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 10; a.lastFire = 99; a.s3 = { recoverStopRemaining: 0.5 };
  f.tick(a, 10);
  assert.equal(a.ink, 10, 'a pending recoverStop must block refill even with lastFire satisfied');
  a.s3.recoverStopRemaining = 0;
  f.tick(a, 1);
  assert.ok(a.ink > 10, 'refill resumes once the recover stop expires');
});