import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';

const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/bot-special-context-before-84453765.json', import.meta.url)));
const contextPath = 'patches/splatoon3/runtime/bot-special-context.mjs';
const driverPath = 'patches/splatoon3/runtime/canonical-kits.mjs';
assert.equal(frozen.sourceCommit, '84453765039f040cb937f6beb7fdb58d54f169dd');
for (const path of [contextPath, driverPath]) assert.equal(createHash('sha256').update(frozen.sources[path]).digest('hex'), frozen.sourceHashes[path]);
const read = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const strip = source => source.replace(/^import .*;\n/gm, '').replace(/^export \{[^\n]*\n/gm, '').replace(/^export /gm, '');
const ids = ['ultraStamp', 'krakenRoyale', 'reefslider', 'tripleSplashdown', 'trizooka', 'zipcaster',
  'tentaMissiles', 'inkjet', 'booyahBomb', 'killerWail', 'inkVac', 'crabTank', 'bubbler', 'storm',
  'tripleInkstrike', 'tacticooler', 'waveBreaker', 'superChump', 'splattercolorScreen'];

function smallRuntime(old = false) {
  const work = { closures: 0, los: 0, planners: 0 };
  const source = old ? frozen.sources[contextPath] : read(contextPath);
  const context = strip(source).replace(/  ctx\.(aimAt|isAimed|safePath|moveToward) = /g, '  work.closures++; ctx.$1 = ');
  const driver = strip(old ? frozen.sources[driverPath] : read(driverPath));
  const planner = ctx => { work.planners++; return false; };
  return { work, ...Function('work', 'driveMeleeSpecial', 'driveRangedSpecial', 'driveSupportSpecial', context + '\n' + driver +
    '\nreturn {createBotSpecialContext,driveCanonicalBotSpecial,resetBotSpecialMemory};')(work, planner, planner, planner) };
}
const vector = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); return this; } });
function smallWorld(runtime) {
  const actor = { alive: true, isBot: true, team: 0, pos: vector(), weapon: { special: 'trizooka' },
    weaponId: 'shooter', aimYaw: .2, aimPitch: -.1, aimPoint: vector(0, 1.1, 9), netLife: 1, specialReady: () => false };
  const enemy = { alive: true, team: 1, pos: vector(0, 0, 12), vel: vector(.1, 0, 0), form: 'kid' };
  const intent = { move: vector(.3, 0, .8), fire: true, sub: false, jump: false, squid: false, special: true };
  const brain = { target: enemy, seeTimer: 1, aimYaw: .2, aimPitch: -.1 };
  const world = { physics: { los() { runtime.work.los++; return true; } } };
  return { actor, enemy, intent, brain, world, options: { world, brain, move: intent.move, wantYaw: .4, wantPitch: -.2, aimDistance: 6 } };
}
const control = c => c && [c.handled, c.state?.id ?? null, c.wantYaw, c.wantPitch, c.aimDistance, c.aimChanged,
  { ...c.normalIntent }, c.memory.time];
const full = c => c && ({ control: control(c), keys: Object.keys(c), visible: c.visible,
  enemy: c.enemy ? [c.enemy.team, c.enemy.pos.x, c.enemy.pos.y, c.enemy.pos.z] : null,
  distance: c.distance, height: c.height, aligned: c.aligned,
  helpers: ['aimAt', 'isAimed', 'safePath', 'moveToward'].map(k => typeof c[k]) });

test('public constructor and default driver retain complete context across lifecycle and perception changes', () => {
  const before = smallRuntime(true), after = smallRuntime(), a = smallWorld(before), b = smallWorld(after);
  for (const special of ids) for (const state of ['idle', 'active', 'hidden', 'new-life', 'new-weapon', 'dead', 'respawn']) {
    for (const f of [a, b]) {
      f.actor.weapon.special = special;
      f.actor.alive = state !== 'dead';
      f.actor.specialActive = ['active', 'hidden'].includes(state) ? { id: special } : null;
      f.brain.seeTimer = state === 'hidden' ? 0 : 1;
      if (state === 'new-life') f.actor.netLife++;
      if (state === 'new-weapon') f.actor.weapon = { ...f.actor.weapon };
      f.intent.special = true;
    }
    const x = before.createBotSpecialContext(a.actor, a.intent, 1 / 60, a.enemy, a.options);
    const y = after.createBotSpecialContext(b.actor, b.intent, 1 / 60, b.enemy, b.options);
    assert.deepEqual(full(y), full(x), special + ':' + state);
    if (x) {
      x.aimAt(a.enemy.pos, { height: .7, lead: .3 }); y.aimAt(b.enemy.pos, { height: .7, lead: .3 });
      assert.deepEqual(full(y), full(x)); assert.equal(y.isAimed(.3), x.isAimed(.3));
    }
    assert.deepEqual(full(after.driveCanonicalBotSpecial(b.actor, b.intent, 1 / 60, b.enemy, b.options)),
      full(before.driveCanonicalBotSpecial(a.actor, a.intent, 1 / 60, a.enemy, a.options)));
    assert.deepEqual(intentState({ intent: b.intent }), intentState({ intent: a.intent }));
  }
});

test('only the opted-in inactive tail omits LOS and four context closures, while advancing memory every tick', () => {
  const before = smallRuntime(true), after = smallRuntime(), a = smallWorld(before), b = smallWorld(after);
  for (let i = 0; i < 420; i++) {
    a.intent.special = b.intent.special = true;
    const x = before.driveCanonicalBotSpecial(a.actor, a.intent, 1 / 60, a.enemy, a.options);
    const y = after.driveCanonicalBotSpecial(b.actor, b.intent, 1 / 60, b.enemy, b.options, true);
    assert.deepEqual(control(y), control(x)); assert.deepEqual(intentState({ intent: b.intent }), intentState({ intent: a.intent }));
    assert.equal(y.memory.time, 0);
  }
  assert.deepEqual(before.work, { closures: 1680, los: 420, planners: 0 });
  assert.deepEqual(after.work, { closures: 0, los: 0, planners: 0 });
  // A full/default call still returns the old complete observable snapshot.
  assert.deepEqual(full(after.driveCanonicalBotSpecial(b.actor, b.intent, 1 / 60, b.enemy, b.options)),
    full(before.driveCanonicalBotSpecial(a.actor, a.intent, 1 / 60, a.enemy, a.options)));
  assert.equal(after.work.los, 1); assert.equal(after.work.closures, 4);
  // Beginning a special must use fresh current perception, with the same memory clock.
  a.actor.specialActive = { id: 'trizooka' }; b.actor.specialActive = { id: 'trizooka' };
  assert.deepEqual(full(after.driveCanonicalBotSpecial(b.actor, b.intent, .1, b.enemy, b.options, true)),
    full(before.driveCanonicalBotSpecial(a.actor, a.intent, .1, a.enemy, a.options)));
});

test('fast and full calls preserve invalid-input returns, reset semantics and carrier ordinary inputs', () => {
  const before = smallRuntime(true), after = smallRuntime(), a = smallWorld(before), b = smallWorld(after);
  for (const field of ['remote', 'isLocal', 'isBot', 'alive']) {
    const value = ['isBot', 'alive'].includes(field) ? false : true;
    for (const f of [a, b]) f.actor[field] = value;
    assert.equal(before.driveCanonicalBotSpecial(a.actor, a.intent, .1, a.enemy, a.options), null);
    assert.equal(after.driveCanonicalBotSpecial(b.actor, b.intent, .1, b.enemy, b.options, true), null);
    for (const f of [a, b]) f.actor[field] = !value;
  }
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.equal(before.driveCanonicalBotSpecial(a.actor, a.intent, dt, a.enemy, a.options), null);
    assert.equal(after.driveCanonicalBotSpecial(b.actor, b.intent, dt, b.enemy, b.options, true), null);
  }
  for (const f of [a, b]) f.actor.pos.x = NaN;
  assert.equal(before.driveCanonicalBotSpecial(a.actor, a.intent, .1, a.enemy, a.options), null);
  assert.equal(after.driveCanonicalBotSpecial(b.actor, b.intent, .1, b.enemy, b.options, true), null);
  for (const f of [a, b]) f.actor.pos.x = 0;
  assert.equal(before.driveCanonicalBotSpecial(a.actor, null, .1, a.enemy, a.options), null);
  assert.equal(after.driveCanonicalBotSpecial(b.actor, null, .1, b.enemy, b.options, true), null);
  for (const f of [a, b]) {
    f.actor.nid = 9; f.actor.specialReady = () => true;
    f.world.match = { mode: 'rainmaker', ranked: { rule: { state: { carrier: '9' } } } };
  }
  assert.deepEqual(control(after.driveCanonicalBotSpecial(b.actor, b.intent, .1, b.enemy, b.options, true)),
    control(before.driveCanonicalBotSpecial(a.actor, a.intent, .1, a.enemy, a.options)));
  assert.deepEqual(intentState({ intent: b.intent }), intentState({ intent: a.intent })); assert.equal(b.intent.special, false);
});

test('inactive fast calls keep memory identity and reset on equipment, life, death and explicit reset', () => {
  const before = smallRuntime(true), after = smallRuntime(), a = smallWorld(before), b = smallWorld(after);
  const call = () => [before.driveCanonicalBotSpecial(a.actor, a.intent, .1, a.enemy, a.options),
    after.driveCanonicalBotSpecial(b.actor, b.intent, .1, b.enemy, b.options, true)];
  let [x, y] = call(); x.memory.marker = y.memory.marker = 7;
  [x, y] = call(); assert.equal(x.memory.marker, 7); assert.equal(y.memory.marker, 7);
  for (const change of [f => { f.actor.weapon = { ...f.actor.weapon }; }, f => { f.actor.netLife++; },
    f => { f.actor.weaponId = 'charger'; }, f => { f.actor.weapon.special = 'inkjet'; }]) {
    change(a); change(b); [x, y] = call();
    assert.deepEqual(y.memory, x.memory); assert.equal(y.memory.marker, undefined);
    x.memory.marker = y.memory.marker = 7;
  }
  for (const f of [a, b]) f.actor.alive = false;
  assert.deepEqual(call(), [null, null]);
  for (const f of [a, b]) f.actor.alive = true;
  [x, y] = call(); assert.deepEqual(y.memory, x.memory); assert.equal(y.memory.marker, undefined);
  x.memory.marker = y.memory.marker = 7;
  before.resetBotSpecialMemory(a.actor); after.resetBotSpecialMemory(b.actor);
  [x, y] = call(); assert.deepEqual(y.memory, x.memory); assert.equal(y.memory.marker, undefined);
});

async function game(old) {
  return fixture({ fullRuntime: true, productionComposition: true,
    adaptRuntime: (rel, source) => old ? frozen.sources[rel] || source : source,
    extraExports: `export { BotBrain } from './inkwave-public/src/game/bots.js';
      export { driveCanonicalBotSpecial } from './patches/splatoon3/runtime/canonical-kits.mjs';` });
}
function setup(f, special, ready, active) {
  f.G.actors.length = 0; f.G.time = 0; f.shots.length = 0;
  const a = f.make('shooter'), enemy = f.make('shooter'), ally = f.make('shooter');
  a.weapon = { ...a.weapon, special }; a.isBot = true; a.isLocal = false; a.remote = false;
  a.nid = 1; enemy.nid = 2; ally.nid = 3; enemy.team = 1; ally.team = 0;
  a.pos.set(0, 0, 0); enemy.pos.set(0, 0, 12); ally.pos.set(3, 0, 2);
  a.specialReady = () => ready; a.invuln = enemy.invuln = 0;
  a.specialActive = active ? { id: special, t: 1, duration: 10 } : null;
  a._s3AllSpecialState = active ? { id: special, phase: 'ready', t: 1, duration: 10,
    direction: new f.THREE.Vector3(0, 0, 1), held: {}, charge: 1, beams: 3 } : null;
  const brain = new f.BotBrain(a); a.bot = brain;
  Object.assign(brain, { target: enemy, seeTimer: 1, mode: 'fight', aimYaw: 0, aimPitch: -.03, path: null });
  f.G.level = { blocks: [], native: false, groundHeight: () => 0, spawnPads: [new f.THREE.Vector3(-20, 0, -20), new f.THREE.Vector3(20, 0, 20)] };
  f.G.nav = { nodes: [{ x: 0, y: 0, z: 10 }] }; brain.goal = 0;
  f.G.match = { mode: 'turf', playing: () => true, canRespawn: () => false };
  const work = { los: 0 };
  f.G.physics = { los: () => { work.los++; return true; }, segment: () => ({ hit: false }), raycast(from, dir, length, out = {}) {
    out.hit = dir.y < 0; out.point ||= new f.THREE.Vector3(); out.normal ||= new f.THREE.Vector3();
    out.point.copy(from).setY(0); out.normal.set(0, 1, 0); return out;
  } };
  f.G.paint = { sample: () => 1, splat: () => 0, regionStats: (_x, _y, _z, _r, _team, out = {}) => Object.assign(out, { n: 1, own: 0, enemy: 1, empty: 0 }) };
  return { a, enemy, brain, work, options: { world: f.G, brain, move: a.intent.move, wantYaw: .1, wantPitch: -.2, aimDistance: 12 } };
}
const intentState = a => [a.intent.fire, a.intent.sub, a.intent.jump, a.intent.squid, a.intent.special,
  !!a.intent.booyah, [a.intent.move.x, a.intent.move.y, a.intent.move.z]];
const memoryState = (c, actors) => JSON.stringify(c.memory, (_key, value) => {
  const index = actors.indexOf(value); return index >= 0 ? { actor: index } : value;
});

test('actual 19-special policies and the composed ordinary BotBrain tail match the frozen pre-change runtime', async () => {
  const before = await game(true), after = await game(false);
  for (const special of ids) for (const mode of ['uncharged', 'ready', 'active']) for (const hz of [30, 60, 120]) {
    const x = setup(before, special, mode === 'ready', mode === 'active');
    const y = setup(after, special, mode === 'ready', mode === 'active');
    for (let tick = 0; tick < 8; tick++) {
      for (const [f, s] of [[before, x], [after, y]]) {
        f.G.time += 1 / hz;
        s.enemy.pos.x = tick * .05;
        s.brain.seeTimer = tick === 4 ? 0 : 1;
        s.a.intent.fire = tick % 3 !== 0; s.a.intent.sub = tick % 4 === 0;
        s.a.intent.jump = tick === 2; s.a.intent.squid = tick === 3; s.a.intent.special = true;
        s.a.intent.move.set(.2, 0, .7);
      }
      const a = before.driveCanonicalBotSpecial(x.a, x.a.intent, 1 / hz, x.enemy, x.options);
      const b = after.driveCanonicalBotSpecial(y.a, y.a.intent, 1 / hz, y.enemy, y.options, true);
      const label = `${special}/${mode}/${hz}/${tick}`;
      assert.deepEqual(control(b), control(a), label);
      assert.deepEqual(intentState(y.a), intentState(x.a), label);
      assert.equal(memoryState(b, after.G.actors), memoryState(a, before.G.actors), label);
    }
  }
  // Exercise the real composed caller and admitted native shooter, not just a
  // copied dispatcher call. Inactive contexts must not alter ordinary fire.
  for (const hz of [30, 60, 120]) {
    const x = setup(before, 'trizooka', false, false), y = setup(after, 'trizooka', false, false);
    for (let tick = 0; tick < hz; tick++) {
      for (const [f, s] of [[before, x], [after, y]]) {
        f.G.time += 1 / hz; s.a.intent.fire = tick < hz * .75;
        s.brain._tail(1 / hz, new f.THREE.Vector3(.2, 0, .8), .15, -.1, 12, true);
        s.a.update(1 / hz);
      }
      assert.deepEqual(intentState(y.a), intentState(x.a));
      assert.deepEqual([y.a.ink, y.a.hp, y.a.aimYaw, y.a.aimPitch, [y.a.aimPoint.x, y.a.aimPoint.y, y.a.aimPoint.z], y.a.weaponRunner.cooldown],
        [x.a.ink, x.a.hp, x.a.aimYaw, x.a.aimPitch, [x.a.aimPoint.x, x.a.aimPoint.y, x.a.aimPoint.z], x.a.weaponRunner.cooldown]);
      assert.equal(JSON.stringify(after.shots), JSON.stringify(before.shots));
    }
    assert.ok(after.shots.length > 0, 'native shooter actually fired at ' + hz + ' Hz');
    assert.equal(x.work.los - y.work.los, hz, 'the real composed caller saves one inactive LOS per tick');
  }
});
