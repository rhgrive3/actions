import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptBotWeakWeaponCombat } from '../bot-weak-weapon-combat-adapter.mjs';
import { getBlasterArchetype, BLASTER_ARCHETYPES } from '../runtime/bot-ai-blaster.mjs';
import { supportsChargeKeep } from '../runtime/bot-ai-charger.mjs';
import { botScorePaintCandidate } from '../runtime/bot-turf-paint.mjs';
import { createBotSpecialContext } from '../runtime/bot-special-context.mjs';
import { driveMeleeSpecial } from '../runtime/bot-special-melee.mjs';
import { driveRangedSpecial } from '../runtime/bot-special-ranged.mjs';
import { sendOutboundTick, queueOutboundEvent, outboundQueueStatus } from '../../network-replication/outbound-prefix.mjs';
import { admitPaintAuthority, consumePaintAuthority, PAINT_AUTHORITY_TAG, DEATH_PAINT_SPEC } from '../../network-replication/paint-authority.mjs';
import { deathBlastPlan } from '../runtime/death-blast.mjs';
import { adaptQueueNetworkUi } from '../../reliability/queue-network-ui-adapter.mjs';
import { fixture } from './source-fixture.mjs';

function vec(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
    clone() { return vec(this.x, this.y, this.z); },
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
    length() { return Math.hypot(this.x, this.y, this.z); },
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
    normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; },
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); },
    toArray() { return [this.x, this.y, this.z]; },
  };
}

const replaceOnce = (code, from, to, label) => {
  const idx = code.indexOf(from);
  if (idx < 0) throw new Error(`missing anchor: ${label}`);
  if (code.indexOf(from, idx + 1) >= 0) throw new Error(`ambiguous anchor: ${label}`);
  return code.slice(0, idx) + to + code.slice(idx + from.length);
};

test('CPU-4: bot-weak-weapon-combat-adapter reuses this._weakCombatCtx scratch and rejects double apply', () => {
  const src = [
    "if (hpFrac < 0.34 && family !== 'roller' && a.lastDamage < 0.8) {}",
    "        if (!it.fire && !a.weaponRunner.charging) wantPitch += botCoverBomb(this, a, dist, a.ink, selectedSubCost(a, SUB), dt);",
    "      this.sweep += dt * (family === 'charger' ? 0.8 : 2.1);",
    "",
  ].join('\n');
  const out = adaptBotWeakWeaponCombat('src/game/bots.js', src, replaceOnce);
  assert.match(out, /this\._weakCombatCtx/);
  assert.match(out, /botWeakWeaponCombat\(this, G, a, dt, move, _wctx\)/);
  assert.throws(() => adaptBotWeakWeaponCombat('src/game/bots.js', out, replaceOnce), /repeated bots\.js transform/);
});

test('CPU-4: getBlasterArchetype WeakMap caches weapon objects and handles non-objects safely', () => {
  assert.equal(getBlasterArchetype(null), BLASTER_ARCHETYPES.hot);
  assert.equal(getBlasterArchetype(undefined), BLASTER_ARCHETYPES.hot);
  const w = { id: 's3-blaster-lightshort', fireInterval: 0.33, range: 9 };
  assert.equal(getBlasterArchetype(w), BLASTER_ARCHETYPES.clash);
  // Mutating id after caching proves WeakMap hit returns the cached archetype
  w.id = 's3-blaster-long';
  assert.equal(getBlasterArchetype(w), BLASTER_ARCHETYPES.clash);
  const w2 = { id: 's3-blaster-long', range: 16 };
  assert.equal(getBlasterArchetype(w2), BLASTER_ARCHETYPES.long);
});

test('CPU-4: supportsChargeKeep evaluates archetype early return before weapon WeakMap cache', () => {
  const stdWeapon = { id: 'charger', scoped: false };
  assert.equal(supportsChargeKeep(stdWeapon, 'standard'), true);
  // Same weapon object with disallowed archetype must still return false
  assert.equal(supportsChargeKeep(stdWeapon, 'bamboo'), false);
  assert.equal(supportsChargeKeep(stdWeapon, 'pencil'), false);
  assert.equal(supportsChargeKeep(stdWeapon, 'standardScope'), false);
  assert.equal(supportsChargeKeep(stdWeapon, 'longScope'), false);
  // Cached weapon-level result still returns true for standard
  stdWeapon.scoped = true;
  assert.equal(supportsChargeKeep(stdWeapon, 'standard'), true);

  const scopedWeapon = { id: 's3-charger-normalscope', scoped: true };
  assert.equal(supportsChargeKeep(scopedWeapon, 'standard'), false);
  assert.equal(supportsChargeKeep(null, 'standard'), false);
});

test('CPU-4: botScorePaintCandidate reads paint.counts directly and falls back to coverage()', () => {
  let coverageCalls = 0;
  const makeG = (withCounts) => ({
    level: { faces: new Array(10).fill({}) },
    match: { mode: 'turf', time: 100, duration: 180 },
    paint: withCounts
      ? { counts: [120, 80], turfTotal: 1000, coverage() { coverageCalls++; return [0.12, 0.08]; } }
      : { coverage() { coverageCalls++; return [0.12, 0.08]; } },
    actors: [
      { id: 1, team: 0, alive: true, pos: { x: 0, y: 0, z: 0 } },
      { id: 2, team: 1, alive: true, get pos() { throw new Error('enemy pos should not be read'); } },
    ],
  });
  const actor = { id: 1, team: 0, pos: { x: 0, y: 0, z: 0 }, weapon: { kind: 'shooter' } };
  const node = { x: 10, y: 0, z: 10 };
  const st = { own: 0.1, enemy: 0.3, empty: 0.6 };

  const s1 = botScorePaintCandidate({}, makeG(true), actor, node, 10, 0.5, st, 1.0);
  assert.equal(coverageCalls, 0, 'counts/turfTotal avoids coverage() call');
  const s2 = botScorePaintCandidate({}, makeG(false), actor, node, 10, 0.5, st, 1.0);
  assert.equal(coverageCalls, 1, 'falls back to coverage() when counts unavailable');
  assert.equal(s1, s2, 'direct counts calculation matches coverage() fallback exactly');
});

test('CPU-4: bot-special-context safePath checks all 3 lateral offsets without array allocation', () => {
  const probed = [];
  const actor = {
    alive: true, team: 0, pos: vec(0, 0, 0), aimYaw: 0, aimPitch: 0,
    weapon: { special: 'ultraStamp' }, netLife: 1,
  };
  const intent = { fire: false, sub: false, jump: false, squid: false, booyah: false, move: vec() };
  const world = {
    level: { groundHeight(x, z) { probed.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100]); return 0; } },
    physics: { los: () => true, segment: () => ({ hit: false }) },
  };
  const ctx = createBotSpecialContext(actor, intent, 1 / 60, null, { world, brain: {} });
  assert.equal(ctx.safePath(vec(0, 0, 0.4), 0.4, 0.5), true);
  assert.equal(probed.length, 3);
  assert.deepEqual(probed.map(p => p[0]).sort((a, b) => a - b), [-0.5, 0, 0.5]);
});

test('CPU-4: aimStampThrow short-TTL cache honors velocity, delay, clock rollback, and isAimed(.065)', () => {
  let aimAtCalls = 0;
  let aimedFlag = true;
  const level = { groundHeight: () => 0 };
  const physics = { los: () => true, segment: () => ({ hit: false }) };
  const actor = {
    alive: true, team: 0, grounded: true, pos: vec(0, 0, 0),
    aimYaw: 0, aimPitch: 0, _s3AllSpecialState: { id: 'ultraStamp', t: 1.0, duration: 5.0, throwAt: 1.6 },
  };
  const enemy = { alive: true, team: 1, pos: vec(0, 0, 10), vel: { x: 0, y: 0, z: 0 } };
  const memory = {};
  const makeCtx = (time) => ({
    special: 'ultraStamp', state: actor._s3AllSpecialState, actor, enemy, visible: true,
    distance: 10, height: 0, dt: 1 / 60, time, memory, world: { level, physics },
    intent: { fire: false, sub: false, jump: false, squid: false, special: false },
    move: vec(),
    aimAt(p) { aimAtCalls++; this._lastAim = { x: p.x, y: p.y, z: p.z }; return true; },
    isAimed(tol) { this._lastTol = tol; return aimedFlag; },
    safePath: () => true,
    moveToward: () => true,
  });

  // First call populates cache
  const ctx1 = makeCtx(10.0);
  driveMeleeSpecial(ctx1);
  assert.equal(aimAtCalls, 1);
  assert.ok(memory._stampThrowCache);
  const firstPoint = { ...ctx1._lastAim };

  // Within 0.08s: cache hit still calls aimAt(cachedPoint)
  const ctx2 = makeCtx(10.04);
  driveMeleeSpecial(ctx2);
  assert.equal(aimAtCalls, 2);
  assert.deepEqual(ctx2._lastAim, firstPoint);
  assert.equal(memory._stampThrowCache.t, 10.0, 'cache timestamp unchanged on hit');

  // Velocity change > 0.35 invalidates cache
  enemy.vel.x = 2.0;
  const ctx3 = makeCtx(10.05);
  driveMeleeSpecial(ctx3);
  assert.equal(memory._stampThrowCache.t, 10.05, 'velocity delta invalidated cache');
  assert.notEqual(ctx3._lastAim.x, firstPoint.x);

  // Delay change > 0.04 invalidates cache
  actor._s3AllSpecialState.throwAt = 2.2;
  const ctx4 = makeCtx(10.06);
  driveMeleeSpecial(ctx4);
  assert.equal(memory._stampThrowCache.t, 10.06, 'delay delta invalidated cache');

  // Clock rollback invalidates cache
  const ctx5 = makeCtx(10.01);
  driveMeleeSpecial(ctx5);
  assert.equal(memory._stampThrowCache.t, 10.01, 'clock rollback invalidated cache');

  // Verify cache hit still checks ctx.isAimed(.065) on stamp release path
  actor._s3AllSpecialState.throwAt = undefined;
  actor._s3AllSpecialState.duration = 2.0; // remaining = 1.0 < 1.35 -> shouldThrow = true
  memory.stampAimThrow = true;
  aimedFlag = false;
  const ctx6 = makeCtx(10.02);
  driveMeleeSpecial(ctx6);
  assert.equal(ctx6.intent.sub, true, 'cache hit with isAimed=false holds sub');
  aimedFlag = true;
  const ctx7 = makeCtx(10.03);
  driveMeleeSpecial(ctx7);
  assert.equal(ctx7.intent.sub, false, 'cache hit with isAimed=true releases sub');
});

test('CPU-4: aimCrabCannon calls aim() on cache hit only when ok === true', () => {
  let aimCalls = 0;
  const level = { groundHeight: () => 0 };
  const physics = { los: () => true };
  const state = { id: 'crabTank', t: 1.0, nextCannon: 0 };
  const actor = {
    alive: true, team: 0, hp: 100, lastDamage: 5, yaw: 0, aimYaw: 0,
    pos: vec(0, 0, 0), _s3AllSpecialState: state, weapon: { range: 16 },
  };
  const enemy = { alive: true, team: 1, hp: 30, pos: vec(0, 0, 8) };
  const memory = {};
  const run = (time) => {
    aimCalls = 0;
    const c = {
      special: 'crabTank', state, actor, enemy, visible: true,
      distance: 8, height: enemy.pos.y, dt: 1 / 60, time, memory,
      world: { level, physics },
      intent: { fire: false, sub: false, special: false, squid: false, jump: false, booyah: false },
      move: vec(),
      aimAt() { aimCalls++; return true; },
      isAimed: () => true,
      moveToward: () => true,
    };
    driveRangedSpecial(c);
    return c;
  };

  run(5.0);
  assert.equal(memory._crabCannonCache.ok, true);
  assert.equal(aimCalls, 2);
  run(5.03);
  assert.equal(memory._crabCannonCache.t, 5.0);
  assert.equal(aimCalls, 2, 'ok===true cache hit calls aim()');

  // Force cached failure (ok === false) and verify aim() is NOT called for cannon on cache hit
  memory._crabCannonCache.ok = false;
  const cFail = run(5.04);
  assert.equal(aimCalls, 1, 'ok===false cache hit skips cannon aim() (only initial ZR aim runs)');
  assert.equal(cFail.intent.sub, false);
});

test('CPU-4: aimBooyah caches ok/point/pitch and respects clock expiry and rollback', () => {
  let aimCalls = 0;
  const level = { groundHeight: () => 0 };
  const physics = { los: () => true };
  const state = { id: 'booyahBomb', charge: 1, phase: 'ready', t: 1.0, held: { sub: false } };
  const actor = { alive: true, team: 0, pos: vec(0, 0, 0), _s3AllSpecialState: state };
  const enemy = { alive: true, team: 1, pos: vec(0, 0, 14) };
  const memory = {};
  const run = (time) => {
    aimCalls = 0;
    const c = {
      special: 'booyahBomb', state, actor, enemy, visible: true,
      distance: 14, height: 0, dt: 1 / 60, time, memory,
      world: { level, physics },
      intent: { fire: false, sub: false, special: false, squid: false, jump: false, booyah: false },
      move: vec(),
      aimAt() { aimCalls++; return true; },
      isAimed: () => true,
    };
    driveRangedSpecial(c);
    return c;
  };

  run(2.0);
  assert.equal(memory._booyahCache.ok, true);
  assert.equal(aimCalls, 1);
  run(2.05);
  assert.equal(memory._booyahCache.t, 2.0);
  assert.equal(aimCalls, 1);
  // Cached failure returns false without calling aim()
  memory._booyahCache.ok = false;
  const cFail = run(2.06);
  assert.equal(aimCalls, 0);
  assert.equal(cFail.intent.sub, false);
  // Clock rollback invalidates cache and recomputes ok=true
  run(1.9);
  assert.equal(memory._booyahCache.t, 1.9);
  assert.equal(memory._booyahCache.ok, true);
});

test('CPU-4: hookPoint uses isolated m._hookCache, checks mainRange, and avoids redundant groundHeight', () => {
  let raycastCalls = 0;
  let groundCalls = 0;
  const level = { groundHeight() { groundCalls++; return 0; } };
  const physics = {
    raycast(origin, dir, maxD, hit) {
      raycastCalls++;
      hit.hit = true;
      hit.point.set(0, 0, 14);
      hit.normal.set(0, 1, 0);
      return hit;
    },
  };
  const state = { id: 'zipcaster', phase: 'ready', inkFuel: 100, t: 1, nextHookAt: 0 };
  const actor = {
    alive: true, team: 0, grounded: true, pos: vec(0, 0, 0),
    aimPoint: vec(0, 0, 14), _s3AllSpecialState: state,
    weapon: { range: 10 },
  };
  const enemy = { alive: true, team: 1, pos: vec(0, 0, 20) };
  const memory = {};
  const run = (time) => driveRangedSpecial({
    special: 'zipcaster', state, actor, enemy, visible: true,
    distance: 20, height: 0, dt: 1 / 60, time, memory,
    world: { level, physics },
    intent: { fire: false, sub: false, special: false, squid: false, jump: false, booyah: false },
    move: vec(),
    aimAt: () => true,
    isAimed: () => false,
  });

  run(1.0);
  assert.equal(raycastCalls, 1);
  // floor reuse eliminates the redundant groundHeight inside safeFloor(c, scratch, floor):
  // 1 for scratch floor + 1 for contact.point safeFloor = 2 total (previously 3)
  assert.equal(groundCalls, 2);
  assert.ok(memory._hookCache && memory._hookCache.hit === true);
  assert.ok(memory.rangedHookPoint);

  // Within 0.08s: cache hit skips raycast & groundHeight
  run(1.04);
  assert.equal(raycastCalls, 1);
  assert.equal(groundCalls, 2);

  // Changing mainRange invalidates _hookCache
  actor.weapon.range = 12;
  run(1.05);
  assert.equal(raycastCalls, 2);

  // Failure must not pollute m.rangedHookPoint
  const prevHook = memory.rangedHookPoint.clone();
  physics.raycast = (o, d, m, hit) => { raycastCalls++; hit.hit = false; return hit; };
  run(1.20);
  assert.equal(memory._hookCache.hit, false);
  assert.deepEqual(memory.rangedHookPoint.toArray(), prevHook.toArray(), 'failed hookPoint does not overwrite rangedHookPoint');
});

test('CPU-5: outbound-prefix skips sync on empty queue and preserves 512KiB guard on non-empty queue', () => {
  const sent = [];
  const n = {
    out: [],
    s: { match: null, tr: { broadcast(w) { sent.push(w); return true; }, close() {} }, _closed() {} },
    match: {},
  };
  n.s.match = n;
  assert.equal(sendOutboundTick(n, { k: 't' }, (_n, m) => m, null), true);
  assert.equal(sent.length, 1);
  assert.equal(outboundQueueStatus(n).rows, 0);
  assert.equal(outboundQueueStatus(n).bytes, 0);

  // Mutated oversized payload on non-empty queue must still abort via sync
  const big = ['s', 'x'.repeat(520 * 1024)];
  queueOutboundEvent(n, ['s', 'ok'], null);
  n.out[0] = big;
  assert.equal(sendOutboundTick(n, { k: 't' }, (_n, m) => m, null), false);
  assert.equal(outboundQueueStatus(n).failed, true);
});

test('CPU-5: queue-network-ui-adapter patches 64KB frame check with 21845-char fast path', () => {
  const sample = [
    "// WebSocket link",
    "export class Transport {",
    "  broadcast(obj) { return this._raw('b|' + JSON.stringify(obj), obj?.[OUTBOUND_RECEIPT]); }",
    "  sendTo(id, obj) { return this._raw('s|' + id + '|' + JSON.stringify(obj)); }",
    "  _raw(s, receipt) {",
    "    if (s.length > 64 * 1024 || outboundUtf8Encoder.encode(s).byteLength > 64 * 1024) { if (receipt) receipt.reason='frame-too-large'; return false; }",
    "    return true;",
    "  }",
    "}",
  ].join('\n');
  const out = adaptQueueNetworkUi('src/net/transport.js', sample);
  assert.match(out, /s\.length > 65536 \|\| \(s\.length > 21845 && utf8ByteLength\(s\) > 65536\)/);

  // Verify exact boundary semantics:
  // 21845 * 3 = 65535 <= 65536 (never exceeds 64KB even for 3-byte UTF-8 chars)
  // 21846 * 3 = 65538 > 65536 (must call utf8ByteLength and reject)
  let encoderCalls = 0;
  const check = (s) => s.length > 65536 || (s.length > 21845 && ((encoderCalls++, Buffer.byteLength(s, 'utf8')) > 65536));
  assert.equal(check('あ'.repeat(21845)), false);
  assert.equal(encoderCalls, 0, 'short frames <= 21845 chars skip UTF-8 byte length scan');
  assert.equal(check('あ'.repeat(21846)), true);
  assert.equal(encoderCalls, 1, 'multibyte frames > 64KB are still rejected');
});

test('CPU-5: paint-authority reuses cached deathPlans fingerprint and falls back on standalone consume', () => {
  const pos = { x: 2, y: 0, z: 3 };
  const seed = 42;
  const plan = deathBlastPlan(pos, seed, DEATH_PAINT_SPEC);
  const victim = { nid: 2, owner: 'p2', team: 0, remote: true, netLife: 1, pos: { ...pos } };
  const attacker = { nid: 1, owner: 'p1', team: 1 };
  const nm = {
    cfg: { id: 'm1' },
    s: { _members: new Set(['p2']) },
    byNid: new Map([[1, attacker], [2, victim]]),
  };
  const makeEvent = (idx) => {
    const row = plan[idx];
    const proof = [PAINT_AUTHORITY_TAG, 'death', 2, 0, 1, 1, pos.x, pos.y, pos.z, seed, 1, idx];
    const e = [0, 's', row.x, row.y, row.z, row.radius, 1, row.seed, 0, 0, 0, 0, 0, -1, [0, 0, 0, 0, proof]];
    e._netTick = 1; e._netSeq = idx + 1;
    return e;
  };

  // Admit + consume droplets 0 and 1
  const e0 = makeEvent(0);
  const e1 = makeEvent(1);
  assert.equal(admitPaintAuthority(nm, 'p2', e0), true);
  consumePaintAuthority(nm, e0);
  assert.equal(admitPaintAuthority(nm, 'p2', e1), true);
  consumePaintAuthority(nm, e1);
  // Duplicate droplet 0 rejected
  assert.equal(admitPaintAuthority(nm, 'p2', e0), false);

  // Standalone consumePaintAuthority on fresh nm (no deathPlans cache) falls back cleanly
  const nm2 = { cfg: { id: 'm2' }, s: { _members: new Set(['p2']) }, byNid: new Map([[1, attacker], [2, victim]]) };
  consumePaintAuthority(nm2, e0);
  assert.equal(admitPaintAuthority(nm2, 'p2', e0), false, 'standalone consume recorded droplet mask via fallback fingerprint');
  assert.equal(admitPaintAuthority(nm2, 'p2', e1), true);
});

test('CPU-4 & CPU-6: bot-special-support covered() and practice-range hud/session/sparring optimizations', async () => {
  const f = await fixture({
    productionComposition: true,
    extraExports: `
      export { driveSupportSpecial } from './patches/splatoon3/runtime/bot-special-support.mjs';
      export { RangeHud } from './patches/practice-range/runtime/hud.mjs';
      export { RangeSession } from './patches/practice-range/runtime/session.mjs';
      export { SparringBots } from './patches/practice-range/runtime/sparring.mjs';
    `,
  });

  // 0. bot-special-support covered() detects existing support objects without allocation
  const supActor = { alive: true, grounded: true, team: 0, pos: new f.THREE.Vector3(0, 0, 0), aimYaw: 0, specialReady: () => true };
  const supWorld = {
    time: 10,
    level: { groundHeight: () => 0, spawnPads: [] },
    physics: { los: () => true },
    actors: [supActor],
    projectiles: {
      _s3SupportCoolers: [{ team: 0, expires: 20, pos: new f.THREE.Vector3(0, 0, 3) }],
    },
  };
  const supIntent = { fire: false, sub: false, special: false, squid: false, jump: false };
  f.driveSupportSpecial({
    special: 'tacticooler', state: null, actor: supActor, enemy: { alive: true, team: 1, pos: new f.THREE.Vector3(0, 0, 12) },
    visible: true, distance: 12, height: 0, dt: 1 / 60, memory: {}, world: supWorld, intent: supIntent, move: new f.THREE.Vector3(),
    aimAt: () => true, isAimed: () => true,
  });
  assert.equal(supIntent.special, false, 'covered tacticooler suppresses duplicate special activation');

  // 1. session.telemetry(out) reuses out, while telemetry() allocates fresh object
  const fakeSession = Object.create(f.RangeSession.prototype);
  fakeSession.local = {
    pos: { x: 0, y: 0, z: 10 }, vel: { x: 3, y: 0, z: 4 }, weaponId: 'shooter', form: 'kid',
  };
  const fresh1 = fakeSession.telemetry();
  const fresh2 = fakeSession.telemetry();
  assert.notEqual(fresh1, fresh2);
  const scratch = {};
  const reused1 = fakeSession.telemetry(scratch);
  const reused2 = fakeSession.telemetry(scratch);
  assert.equal(reused1, scratch);
  assert.equal(reused2, scratch);
  assert.equal(reused1.speed, 5);
  assert.equal(reused1.zone, fresh1.zone);

  // 2. session._updatePads caches groundHeight per pad on same level
  let ghCalls = 0;
  f.G.level = { groundHeight() { ghCalls++; return 0; } };
  fakeSession.local.alive = true;
  fakeSession.local.superJumpState = null;
  fakeSession.local.pos = { x: 0, y: 0, z: 0 };
  fakeSession.pads = { defs: [{ id: 'p0', kind: 'resupply', x: 0, z: 0 }], update() {} };
  fakeSession.hud = { padPrompt() {} };
  fakeSession._updatePads(1 / 60);
  fakeSession._updatePads(1 / 60);
  fakeSession._updatePads(1 / 60);
  assert.equal(ghCalls, 1, 'static pad groundHeight cached across ticks');

  // 3. sparring.readout(true) skips behaviors/weapons arrays and reuses scratch
  const sp = new f.SparringBots({ local: {}, time: 0 });
  sp.bots = [{ sparring: { behavior: 'static' }, weaponId: 'shooter' }];
  const full = sp.readout();
  assert.deepEqual(full.behaviors, ['static']);
  assert.deepEqual(full.weapons, ['shooter']);
  const light1 = sp.readout(true);
  const light2 = sp.readout(true);
  assert.equal(light1, light2, 'light readout reuses scratch object');
  assert.equal(light1.bots, 1);
  assert.equal('behaviors' in light1, false);
  assert.equal('weapons' in light1, false);

  // 4. hud.mjs: Object.create(RangeHud.prototype) mock defense + skip sparring readout when bots empty
  const hud = Object.create(f.RangeHud.prototype);
  let readoutCalls = 0;
  const cls = () => ({ toggle() {}, contains: () => false, remove() {} });
  Object.assign(hud, {
    s: {
      sparring: { bots: [], readout() { readoutCalls++; return { bots: 0 }; } },
      telemetry: () => ({ weapon: 'shooter', speed: 0, zone: 'paint', measure: null }),
      paintStats: () => ({ own: 25, total: 400 }),
      last: null,
    },
    _L: { weapon: 'shooter', zone: 'paint' },
    _cardT: 99, _toastT: 99, _float: [],
    spar: { hidden: false, textContent: '' },
    speed: { textContent: '' },
    measureBox: { classList: cls() },
    paintBox: { classList: cls(), innerHTML: '', title: '' },
    card: { classList: cls() },
    toastEl: { classList: cls() },
  });
  hud.update(1 / 60);
  assert.equal(readoutCalls, 0, 'empty sparring bots skips readout()');
  assert.equal(hud.spar.hidden, true);
  assert.match(hud.paintBox.innerHTML, /25\.0 m²/, 'mock paintBox without append falls back to innerHTML');
});
