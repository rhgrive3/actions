import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const STEP = 1 / 60;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message || 'value'}: ${actual} != ${expected}`);

async function world({ fullRuntime = true, matchOwner = true, lateOwner = false } = {}) {
  const marker = "Object.defineProperty(Match.prototype, Symbol.for('inkwave.tenacity.match-owner.v1'), { value: true });";
  const adaptNative = (rel, source) => {
    const result = adaptBuildSource(rel, source);
    if (!lateOwner || rel !== 'src/game/match.js') return result;
    assert.equal(result.split(marker).length, 2, 'late-owner control has one capability definition');
    return result.replace(marker, `export function claimTenacityOwner() { ${marker} }`);
  };
  const f = await fixture({ fullRuntime, adaptNative, adaptRuntime: adaptBuildSource,
    extraExports: `export { Match${lateOwner ? ', claimTenacityOwner' : ''} } from './inkwave-public/src/game/match.js';` });
  const a = f.make(), enemies = [f.make(), f.make()];
  for (const enemy of enemies) enemy.team = 1;
  const m = matchOwner ? new f.Match({}) : { playing() { return this.state === 'playing'; }, canRespawn() { return false; } };
  Object.assign(m, { mode: 'turf', state: 'playing', time: 180, actors: f.G.actors });
  f.G.match = m;
  // Exercise capability publication after Actor runtime installation as well as
  // the production order (Match module evaluated before the runtime installer).
  if (lateOwner) f.claimTenacityOwner();
  a.s3.loadout = f.emptyLoadout(); a.s3.loadout[0].main = 'tenacity'; a.s3RefreshGear(); a.special = 0;
  const tick = () => { f.G.time += STEP; if (matchOwner) m.update(STEP); else a.update(STEP); };
  return { f, a, m, enemies, tick };
}

// Real Actor activation/hold/throw/lock paths, real Match tick and all runtime
// installers. Only display/collision are the shared fixture's substitutes and
// Storm projectile creation is stubbed: this measures resource ownership only.
test('#469 Tenacity cannot recharge after the real Storm throw animation ends; unlock is exact at 30/60/120 Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const { f, a, tick } = await world();
    f.G.projectiles.throwStorm = () => {};
    a._resolve = () => {};
    a.weapon = { ...a.weapon, special: 'storm' }; a.special = a.specialCost();
    a._startSpecial(); assert.equal(a.specialActive.phase, 'hold');
    for (let i = 0; i < 3; i++) tick();
    close(a.special, 0, 'holding cannot recharge');
    a.intent.sub = true; tick(); a.intent.sub = false; tick();
    assert.equal(a.specialActive.phase, 'throw');
    const clouds = new f.Projectiles(new f.THREE.Scene());
    clouds._spawnCloud({owner:a,team:a.team,pos:a.pos.clone(),dir:new f.THREE.Vector3(0,0,1)});
    const duration = a.stormGaugeLock;
    const clock = new FixedClock(); let cleared = false, unlocked = false, count = 0;
    for (let frame = 0; frame < (duration + .1) * hz; frame++) clock.advance(1 / hz, () => {
      const lockedBefore = a.stormGaugeLock > 0;
      tick(); count++;
      if (!a.specialActive && a.stormGaugeLock > 0) cleared = true;
      if (a.stormGaugeLock > 0) {
        close(a.special, 0, `still spent at tick ${count}`); assert.equal(a.specialReady(), false);
      } else {
        if (lockedBefore) { close(a.special, 3.26 * STEP, 'one award on the unlocked tick'); unlocked = true; }
      }
    });
    assert.ok(cleared, 'post-animation lock was genuinely exercised'); assert.ok(unlocked);
  }
});

test('#647 pending native Slam landing segment blocks both Tenacity owners until landing recovery clears', async () => {
  const { f, a, tick } = await world();
  a.weapon = { ...a.weapon, special: 'slam' }; a.special = a.specialCost();
  f.G.physics.collideBody = (_p, _r, _l, _h, out) => Object.assign(out, { ground: false, wall: false, ceiling: false });
  f.G.physics.groundProbe = (_x, y, _z, up, down, _r, out) => {
    out.hit = y + up >= 0 && y - down <= 0;
    if (out.hit) { out.y = 0; out.normal.set(0, 1, 0); out.block = out.face = -1; out.center = true; out.grate = false; }
    return out;
  };
  a._slamImpact = () => {};
  a._startSpecial(); assert.equal(a.specialActive.id, 'slam');
  for (let n = 0; a.specialActive && n < 180; n++) tick();
  assert.equal(a.specialActive, null); assert.ok(a.s3TidalSlamGaugeFinish); assert.ok(a.hardLand > 0);
  const remaining = a.special; let waited = 0;
  while (a.s3TidalSlamGaugeFinish && waited++ < 60) {
    tick();
    if (a.s3TidalSlamGaugeFinish) close(a.special, remaining, 'landing-owned segment cannot rise');
    else close(a.special, 3.26 * STEP, 'cleared landing starts one fresh award');
  }
  assert.ok(waited < 60); assert.equal(a.s3TidalSlamGaugeFinish, null);
});

test('Tenacity ownership: standalone Actor, standalone Match and complete composition each award only their existing rate', async () => {
  for (const options of [{ matchOwner: false }, { fullRuntime: false }, {}]) {
    const { a, tick, m } = await world(options);
    const rate = options.matchOwner === false ? 3.24 : 3.26;
    for (let i = 0; i < 60; i++) tick();
    close(a.special, rate, JSON.stringify(options));
    a.special = a.specialCost(); tick(); close(a.special, a.specialCost(), 'ready charge stays capped');
    assert.equal(a.specialReady(), true);
    if (options.matchOwner === false) assert.equal(m[Symbol.for('inkwave.tenacity.match-owner.v1')], undefined,
      'loading a marked Match class does not mark plain standalone contexts');
  }
});

test('lock cancel, death/reset and valid recharge preserve current lifecycle ownership', async () => {
  for (const matchOwner of [false, true]) {
    const { a, tick } = await world({ matchOwner });
    const rate = matchOwner ? 3.26 : 3.24;
    a.stormGaugeLock = 2; tick(); close(a.special, 0);
    a.stormGaugeLock = 0; tick(); close(a.special, rate * STEP, 'explicitly cleared lock resumes');
    a.s3TidalSlamGaugeFinish = { id: 'slam', gaugeLandedAtImpact: true, gaugeElapsed: 1 };
    a.hardLand = 1; const before = a.special; tick(); close(a.special, before);
    a.reset(); assert.equal(a.s3TidalSlamGaugeFinish, null); a.stormGaugeLock = 0; a.special = 0;
    a.alive = false; a.respawnTimer = 10; tick(); close(a.special, 0, 'dead actor never awards');
    a.alive = true; tick(); close(a.special, rate * STEP, 'living reset actor resumes once');
  }
});


test('the full installer rejects reinstall without changing passive ownership or leaking to a fresh context', async () => {
  const { f, a, tick } = await world();
  assert.throws(() => f.installS3(f.profile), /already installed/);
  tick(); close(a.special, 3.26 * STEP);
  const standalone = await world({ matchOwner: false });
  standalone.tick(); close(standalone.a.special, 3.24 * STEP);
});


// Source-only instrumentation: publication is delayed without changing either
// award helper. Emitted acceptance runs the production-order tests separately.
test('source ordering control: Match ownership published after Actor installation still defers exactly once', {
  skip: process.env.INKWAVE_BUILT_SITE ? 'Source-only injected ownership export; production ordering is covered by emitted tests' : false,
}, async () => {
  const { a, tick } = await world({ lateOwner: true });
  tick(); close(a.special, 3.26 * STEP);
});

test('composed Match retains its post-roster living-count snapshot in either actor order', async () => {
  for (const reverse of [false, true]) {
    const { f, a, m, tick } = await world();
    const ally = f.make(); ally.team = a.team;
    ally.update = function () { this.alive = false; };
    if (reverse) m.actors.reverse();
    tick(); close(a.special, 3.26 * STEP, 'one post-roster deficit award');
  }
});


test('marked ranked Match modes retain their Actor owner, including zero-clock overtime', async () => {
  for (const mode of ['zones', 'tower', 'rainmaker', 'clams']) for (const overtime of [false, true]) {
    const { a, m, tick } = await world();
    m.mode = mode; m.time = overtime ? 0 : 180;
    // The native follower clock preserves playing while the ranked result owner
    // decides overtime. No clock or winner authority is added by Tenacity.
    m.follower = overtime;
    tick();
    assert.equal(m.state, 'playing'); close(a.special, 3.24 * STEP, `${mode} overtime=${overtime}`);
    a.stormGaugeLock = 2; const before = a.special; tick(); close(a.special, before);
  }
});
