import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { PLAYER as terrainPlayer, DIFFICULTY } from '../../../inkwave-public/src/config.js';
import { INK_DT, INK_HZ, INK_LENGTH_SCALE, INK_PROFILES, advanceInkFrame, damageAt } from '../../../inkwave-public/src/game/inkFlight.js';
import { capsuleEntry } from '../../../inkwave-public/src/game/inkCollision.js';
import { coherentMotionStart, beginActorMotionTick, markActorMotionDiscontinuity } from '../../splatoon3/runtime/actor-motion.mjs';
import { hurtboxRadius, hurtboxHeight } from '../../splatoon3/runtime/player-hurtbox.mjs';
import { withProjectileHitGeometry } from '../../splatoon3/runtime/brella-physics.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const read = rel => fs.readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cmb04-cmb06-unsafe-prefixes.json', import.meta.url)));
const profile = JSON.parse(read('patches/splatoon3/profile.json'));
const defaults = { ...terrainPlayer, ...profile.player };
const subjects = {
  CMB04: ['src/game/inkFlightRuntime.js', 'stepHead'],
  CMB06: ['src/game/bots.js', '_perceive'],
};
function method(id, mode) {
  const [rel, name] = subjects[id], f = fixture[id];
  let source = adaptBuildSource(rel, read('inkwave-public/' + rel));
  if (mode !== 'actual') {
    if (source.includes(f.unsafe)) source = source.replace(f.unsafe, f.native);
    assert.equal(source.split(f.native).length, 2, 'exact unique native scan anchor');
    if (mode === 'unsafe') source = source.replace(f.native, f.unsafe);
  }
  const start = source.indexOf('  ' + name + '(');
  assert.ok(start >= 0);
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start);
  return source.slice(start, end + 4);
}
const actor = (id, x, { z = 0, y = 0, team = 1, form = 'kid', alive = true } = {}) => ({
  id, team, alive, form, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), anim: { form }, color: 0,
});
function flight(mode, setup = () => {}, intervals = [INK_DT]) {
  const target = actor('target', .94, { form: 'squid' });
  const owner = actor('owner', -5, { team: 0 });
  const G = { actors: [target], physics: {}, boss: null };
  const PLAYER = { ...defaults }, hits = [], events = [];
  const p = { pos: new THREE.Vector3(0, .675, -1), prev: new THREE.Vector3(), vel: new THREE.Vector3(0, 0, 120),
    inkCarry: 0, age: 0, life: 3, inkFrame: 0, inkPhase: 0, inkProfile: INK_PROFILES.shooter,
    inkPeak: .675, inkTravel: 0, inkPlayerRadius: INK_PROFILES.shooter.collision.player,
    owner, team: 0, wid: 'shooter', size: INK_PROFILES.shooter.collision.player };
  const runtime = { base: new THREE.Vector3(), point: new THREE.Vector3(), normal: new THREE.Vector3(), worldHit: {},
    stats: { headImpacts: 0 },
    system: { applyHit(_owner, a, damage) { hits.push([a.id, damage, p.pos.toArray()]); } },
    world(from, to) { return { hit: false, dist: from.distanceTo(to) }; },
    emitAlong(_p, length, stop) { events.push(['segment', length, stop]); },
    impact() { events.push(['world']); } };
  setup({ p, target, owner, G, PLAYER, runtime });
  const dependencies = { G, PLAYER, INK_DT, INK_HZ, INK_LENGTH_SCALE, EPS: 1e-9, advanceInkFrame, damageAt,
    capsuleEntry, coherentMotionStart, hurtboxRadius, hurtboxHeight, withProjectileHitGeometry,
    sourceLengthWorld() {}, beginFidelityWallDrop() { return false; },
    advanceFidelityWallDrop() { throw Error('unexpected wall drop'); }, emit(kind) { events.push([kind]); } };
  const step = new Function(...Object.keys(dependencies), `return ({${method('CMB04', mode)}}).stepHead;`)(...Object.values(dependencies));
  let retired = false;
  for (const dt of intervals) { retired = step.call(runtime, p, dt); if (retired) break; }
  return { hits, events, retired, pos: p.pos.toArray(), travel: p.inkTravel, impacts: runtime.stats.headImpacts };
}
function perception(mode, setup = () => {}) {
  const local = actor('local', 0, { team: 0 }), enemy = actor('enemy', 21, { y: 2 ** -22 });
  const rays = [], rng = [], G = { actors: [enemy], physics: { los(_from, to) { rays.push(to.toArray()); return true; } } };
  const brain = { a: local, diff: { ...DIFFICULTY.normal }, target: null, react: 0, seeTimer: 0, lostTimer: 0,
    repath: 10, acqT: 10, acqSignY: 0, acqSignP: 0,
    _range: () => 30, _fatLos: () => true, _dryLine: () => true };
  setup({ brain, enemy, G, local, rays });
  const math = Object.create(Math); math.random = () => { rng.push(.25); return .25; };
  const perceive = new Function('G', '_v', '_v2', 'Math', `return ({${method('CMB06', mode)}})._perceive;`)(G, new THREE.Vector3(), new THREE.Vector3(), math);
  brain._perceive = perceive;
  perceive.call(brain);
  return { target: brain.target?.id ?? null, direct: brain._combatDirectTarget?.id ?? null, rays, rng,
    state: [brain.react, brain.seeTimer, brain.lostTimer, brain.repath, brain.acqT, brain.acqSignY, brain.acqSignP] };
}

test('CMB04 negative control: old prefilter loses an installed squid edge hit with a standard shooter head', () => {
  const reference = flight('native'), unsafe = flight('unsafe');
  assert.equal(defaults.radius + .25, .63);
  assert.equal(defaults.s3SwimHurtRadius, .675);
  assert.equal(reference.hits.length, 1);
  assert.equal(unsafe.hits.length, 0);
  assert.notDeepEqual(unsafe, reference);
});
test('CMB04 actual composed flight retains the native squid edge hit', () => {
  assert.deepEqual(flight('actual'), flight('native'));
  assert.equal(flight('actual').hits[0][1], 36);
});
test('CMB04 actor contact is preserved at 30, 60 and 120 Hz update intervals', () => {
  for (const intervals of [[2 * INK_DT], [INK_DT], [INK_DT / 2, INK_DT / 2]]) {
    assert.deepEqual(flight('actual', undefined, intervals), flight('native', undefined, intervals));
    assert.equal(flight('actual', undefined, intervals).hits.length, 1);
  }
});
test('CMB04 exact native capsule boundaries, custom shapes, and invalid inputs retain outcomes', () => {
  const cases = [
    ['squid inside', f => { f.target.pos.x = .96 - 1e-6; }],
    ['squid tangent', f => { f.target.pos.x = .96; }],
    ['squid outside', f => { f.target.pos.x = .96 + 1e-6; }],
    ['human inside', f => { f.target.form = 'kid'; f.target.pos.x = .635 - 1e-6; }],
    ['custom enlarged human', f => { f.target.form = 'kid'; f.PLAYER.s3HumanoidHurtRadius = 1.4; f.PLAYER.s3HumanoidHurtHeight = 3; f.target.pos.x = 1.5; }],
    ['zero projectile radius', f => { f.p.inkPlayerRadius = 0; f.target.pos.x = .65; }],
    ['NaN projectile radius', f => { f.p.inkPlayerRadius = NaN; }],
    ['NaN actor position', f => { f.target.pos.x = NaN; }],
    ['Infinity actor position', f => { f.target.pos.x = Infinity; }],
  ];
  for (const [label, setup] of cases) assert.deepEqual(flight('actual', setup), flight('native', setup), label);
});
test('CMB04 coherent moving targets and discontinuity fallback use actual motion records', () => {
  for (const discontinuity of [false, true]) {
    const setup = ({ target }) => {
      target.pos.x = .1; beginActorMotionTick([target]); target.pos.x = .94;
      if (discontinuity) markActorMotionDiscontinuity(target);
      assert.equal(!!coherentMotionStart(target), !discontinuity);
    };
    assert.deepEqual(flight('actual', setup), flight('native', setup));
  }
});
test('CMB04 live actor order, friendly/dead/owner/ghost filters, and world tie remain native', () => {
  for (const setup of [
    ({ G, target }) => { G.actors.push(actor('later', -.94, { form: 'squid' })); },
    ({ target }) => { target.team = 0; target.submerged = true; },
    ({ target }) => { target.alive = false; },
    ({ p, target }) => { p.owner = target; },
    ({ p }) => { p.ghost = true; },
    ({ target, runtime, p, PLAYER }) => {
      const from = p.pos.clone(), to = from.clone().addScaledVector(p.vel, INK_DT);
      const t = capsuleEntry(from, to, target.pos, hurtboxRadius(target, PLAYER), hurtboxHeight(target, PLAYER), p.inkPlayerRadius);
      runtime.world = () => ({ hit: true, dist: from.distanceTo(to) * t });
    },
  ]) assert.deepEqual(flight('actual', setup), flight('native', setup));
});
test('CMB04 actor eligibility callbacks retain the native live-roster iterator', () => {
  const setup = ({ G, target }) => {
    target.pos.x = 20; let appended = false;
    Object.defineProperty(target, 'alive', { get() {
      if (!appended) { appended = true; G.actors.push(actor('appended', .94, { form: 'squid' })); }
      return true;
    } });
  };
  assert.deepEqual(flight('actual', setup), flight('native', setup));
  assert.equal(flight('actual', setup).hits[0][0], 'appended');
});
test('CMB06 negative control: old squared rejection loses the native rounded awareness-boundary candidate', () => {
  assert.equal(DIFFICULTY.normal.awareness, 21);
  const v = new THREE.Vector3(21, 2 ** -22, 0), origin = new THREE.Vector3();
  assert.equal(v.distanceToSquared(origin), 441.00000000000006);
  assert.equal(v.distanceTo(origin), 21);
  const reference = perception('native'), unsafe = perception('unsafe');
  assert.equal(reference.target, 'enemy'); assert.equal(unsafe.target, null);
  assert.equal(reference.rays.length, 1); assert.equal(unsafe.rays.length, 0);
  assert.equal(reference.rng.length, 4); assert.equal(unsafe.rng.length, 0);
});
test('CMB06 actual composed perception retains the rounded awareness-boundary candidate', () => {
  assert.deepEqual(perception('actual'), perception('native'));
});
test('CMB06 awareness, nonfinite and custom vector distance semantics remain native', () => {
  const cases = [
    ['inside', ({ enemy }) => { enemy.pos.set(20.99, 0, 0); }],
    ['outside', ({ enemy }) => { enemy.pos.set(21.01, 0, 0); }],
    ['NaN', ({ enemy }) => { enemy.pos.x = NaN; }],
    ['Infinity', ({ enemy }) => { enemy.pos.x = Infinity; }],
    ['NaN awareness', ({ brain }) => { brain.diff.awareness = NaN; }],
    ['negative awareness', ({ brain }) => { brain.diff.awareness = -21; }],
    ['infinite awareness', ({ brain }) => { brain.diff.awareness = Infinity; }],
    ['custom distance', ({ enemy }) => { enemy.pos.set(100, 0, 0); enemy.pos.distanceTo = () => 5; }],
  ];
  for (const [label, setup] of cases) assert.deepEqual(perception('actual', setup), perception('native', setup), label);
});
test('CMB06 native candidate order, retained target, equal scores, swim, dead and team filters remain intact', () => {
  for (const setup of [
    ({ G }) => { G.actors = [actor('first', 4), actor('tie', -4), actor('far', 10)]; },
    ({ G, brain }) => { const old = actor('old', 6); brain.target = old; G.actors = [old, actor('new', 3)]; },
    ({ G }) => { const swim = actor('swim', 10); swim.anim.form = 'swim'; G.actors = [actor('dead', 2, { alive: false }), actor('friend', 1, { team: 0 }), swim]; },
    ({ G }) => { G.actors = [actor('hidden', 2), actor('visible', 4)]; G.physics.los = (_a, b) => b.x !== 2; },
  ]) assert.deepEqual(perception('actual', setup), perception('native', setup));
});
test('CMB06 LOS callbacks retain native live-roster scanning and perception reentry behavior', () => {
  const setup = ({ G, brain }) => {
    G.actors = [actor('initial', 8)]; let entered = false;
    G.physics.los = () => {
      if (!entered) {
        entered = true; G.actors.push(actor('appended', 2));
        brain._perceive();
        brain.repath = 7;
      }
      return true;
    };
  };
  assert.deepEqual(perception('actual', setup), perception('native', setup));
  assert.equal(perception('actual', setup).target, 'appended');
});
