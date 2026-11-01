import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptBotNavigation } from '../bot-navigation-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { LEGACY_KELPLINE_TRENCH } from './bot-navigation-legacy-layout.fixture.mjs';

const exports = `
export { BotBrain } from './inkwave-public/src/game/bots.js';
export { NavGraph } from './inkwave-public/src/game/nav.js';
export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
export { botTravelForm, botGoalAllowed, rememberBotGoalFailure } from './patches/local-quality/bot-navigation.mjs';`;
async function world(layout = 'kelpline') {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, productionComposition: true, adaptRuntime: adaptBuildSource, extraExports: exports });
  const { G } = f;
  const definition = typeof layout === 'string' ? f.MAP_LAYOUTS[layout] : layout;
  G.level = new f.Level(definition, f.map3ArtColliders(definition));
  G.physics = new f.Physics(G.level);
  G.nav = new f.NavGraph(G.level, G.physics);
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = 0; } _pushQuad() {} }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 2048, maxDensity: 4, cell: .25 });
  G.match.mode = 'turf';
  let seed = 142;
  f.setRandom(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
  f.bot = (weapon = 'shooter', team = 0) => {
    const a = f.make(weapon); a.isBot = true; a.team = team; a._integrate = f.Actor.prototype._integrate;
    a.specialReady = () => false; a.bot = new f.BotBrain(a); a.bot.think = 0;
    return a;
  };
  f.step = (actors, hz = 60) => {
    G.time += 1 / hz;
    for (const a of actors) { a.bot.update(1 / hz); a.update(1 / hz); }
    G.projectiles.update(1 / hz);
  };
  return f;
}

for (const hz of [30, 60, 120]) test(`legacy Kelpline: actual Actor/Brain leaves the dry trench beneath the bridge at ${hz}Hz`, async () => {
  const f = await world(LEGACY_KELPLINE_TRENCH), a = f.bot(); a.pos.set(0, -2, 0);
  assert.equal(a.bot._wet(0, 0, -2), false);
  assert.equal(a.bot._wet(30, 0, -2), true, 'open sea is still unsafe');
  let left = false, upper = false;
  for (let i = 0; i < hz * 30; i++) {
    f.step([a], hz);
    assert(a.alive && Number.isFinite(a.pos.length()), 'ordinary collision and water rules remain active');
    left ||= Math.hypot(a.pos.x, a.pos.z) > 7;
    upper ||= a.pos.y > -.5;
  }
  assert(left && upper, 'routes out through the real trench ramps');
});

test('negative control: the former sea-height test strands the same actual Actor for 10 seconds', async () => {
  const f = await world(LEGACY_KELPLINE_TRENCH), a = f.bot(); a.pos.set(0, -2, 0);
  a.bot._wet = (x, z, y) => { const gy = f.G.level.groundHeight(x, z, y + .6); return gy === -Infinity || gy < f.PLAYER.fallDeathY; };
  for (let i = 0; i < 600; i++) f.step([a]);
  assert.deepEqual(Array.from(a.pos.toArray()), [0, -2, 0]);
});

test('legacy Kelpline: seven live bots spread from under the real bridge instead of staying at its centre', async () => {
  const f = await world(LEGACY_KELPLINE_TRENCH);
  const actors = Array.from({ length: 7 }, (_, i) => { const a = f.bot('shooter', 0); a.pos.set((i - 3) * .4, -2, 0); return a; });
  const escaped = new Set();
  for (let i = 0; i < 1800; i++) { f.step(actors); actors.forEach((a, j) => { if (Math.hypot(a.pos.x, a.pos.z) > 7) escaped.add(j); }); }
  assert.equal(escaped.size, 7);
  console.log(JSON.stringify({ scenario: 'legacy Kelpline seven bots / 30 seconds / CPU 60Hz', escaped: escaped.size }));
});

test('combat uses the path for an enemy on another floor; same-floor close combat still closes distance', async () => {
  const f = await world('tidewater'), a = f.bot('roller'), enemy = f.make('shooter');
  enemy.team = 1; a.pos.set(0, 0, 0); enemy.pos.set(0, 4, 1);
  // Isolate the tactical decision: verified path goes east, target is north.
  f.G.physics.los = () => true;
  a.bot._pathTo = () => { a.bot.path = [0]; a.bot.pi = 0; a.bot.repath = 10; };
  a.bot._steer = () => new f.THREE.Vector3(1, 0, 0);
  a.bot._edgeGuard = () => {};
  a.bot.update(1 / 60);
  assert.equal(a.bot.target, enemy);
  assert(a.intent.move.x > .1 && Math.abs(a.intent.move.z) < 1e-8, 'takes the route, rather than charging underneath');
  enemy.pos.y = 0; a.bot.think = 0; a.bot.mvMag = 0;
  a.bot.update(1 / 60);
  assert(a.intent.move.z > .1 && Math.abs(a.intent.move.x) < 1e-8, 'ordinary roller approach remains');
  f.G.physics.los = () => false; a.bot.think = 0; a.bot.mvMag = 0;
  a.bot.update(1 / 60);
  assert(a.intent.move.x > .1 && Math.abs(a.intent.move.z) < 1e-8, 'lost sight returns to routing during target memory');
});

test('failed/empty paint routes and dry refill scans respect their retry timers', async () => {
  const f = await world('tidewater'), a = f.bot(); a.pos.set(0, 0, 0);
  f.G.nav.validIds = [];
  a.bot._perceive = () => {};
  let goals = 0, refills = 0;
  const pick = a.bot._pickPaintGoal.bind(a.bot), refill = a.bot._pickRefill.bind(a.bot);
  a.bot._pickPaintGoal = () => { goals++; pick(); };
  a.bot._pickRefill = () => { refills++; refill(); };
  for (let i = 0; i < 120; i++) a.bot.update(1 / 60);
  assert(goals >= 2 && goals <= 4, `bounded failed-goal scans: ${goals}`);
  a.ink = 0; a.bot.repath = 0;
  for (let i = 0; i < 120; i++) a.bot.update(1 / 60);
  assert(refills >= 1 && refills <= 2, `bounded refill scans: ${refills}`);
  console.log(JSON.stringify({ scenario: 'no available route, 120 ticks each', paintGoalScans: goals, refillScans: refills, formerScansPerMode: 120 }));
});

test('goal shortlist tries a reachable alternative and never repeats the same failed ID in one decision', async () => {
  const f = await world('tidewater'), a = f.bot(); a.pos.set(0, 0, 0);
  const nodes = [{ id: 0, x: 8, y: 0, z: 0, zone: -1 }, { id: 1, x: -8, y: 0, z: 0, zone: -1 }];
  f.G.nav.nodes = nodes; f.G.nav.validIds = [0, 1];
  let i = 0; f.setRandom(() => (++i % 4 < 2 ? .1 : .9));
  const tried = [];
  a.bot._pathTo = pos => { const id = pos.x > 0 ? 0 : 1; tried.push(id); return id === 1; };
  a.bot._pickPaintGoal();
  assert(tried.includes(1), 'reachable alternative selected');
  assert(tried.length <= 2 && new Set(tried).size === tried.length);
  f.rememberBotGoalFailure(a.bot, f.G.nav, 0);
  assert.equal(f.botGoalAllowed(a.bot, f.G.nav, nodes[0]), false);
  a.bot.t += 9;
  assert.equal(f.botGoalAllowed(a.bot, f.G.nav, nodes[0]), true, 'temporary failure expires');
  a.bot.reset(); assert.equal(a.bot._failedGoals, null);
});

test('legacy Kelpline grate bridge is crossed in human form using actual ground/collision', async () => {
  const f = await world(LEGACY_KELPLINE_TRENCH), a = f.bot(); a.pos.set(14, 0, -5);
  assert(a.bot._pathTo(new f.THREE.Vector3(14, 0, 5)));
  a.bot.mode = 'refill'; a.bot.repath = 100; a.ink = 2;
  let crossed = false, touchedGrate = false;
  for (let i = 0; i < 600; i++) {
    f.step([a]);
    if (a.pos.z > -3 && a.pos.z < 3) assert(a.pos.y > -.2, 'does not swim through the bridge');
    if (a.ground.grate) { touchedGrate = true; assert.equal(a.intent.squid, false); }
    if (a.pos.z > 3.2) { crossed = true; break; }
  }
  assert(crossed && touchedGrate, 'walks over the real grate support');
});

for (const hz of [30, 60, 120]) test(`MAP3 Kelpline: actual BotBrain recovers from the grate landing and walks onto the optional grate at ${hz}Hz`, async () => {
  const f = await world('kelpline'), a = f.bot();
  const follow = async (from, to, requireGrate) => {
    a.spawnAt(new f.THREE.Vector3(...from), 0);
    // Establish real floor contact before asking the brain to choose travel form.
    a.update(1 / hz);
    assert(a.bot._pathTo(new f.THREE.Vector3(...to)), 'actual MAP3 route exists');
    a.bot.mode = 'refill'; a.bot.refillUntil = .95; a.bot.repath = 100; a.ink = 2;
    let reached = false, touchedGrate = false;
    for (let i = 0; i < hz * 35; i++) {
      f.step([a], hz);
      assert(a.alive && Number.isFinite(a.pos.y), 'real collision and water rules stay active');
      if (a.ground.grate) {
        touchedGrate = true;
        assert.equal(a.intent.squid, false, 'brain keeps human form over the real MAP3 grate');
        assert(a.pos.y > 3.4, 'human remains on its upper support');
      }
      if (Math.hypot(a.pos.x - to[0], a.pos.z - to[2]) < 1.5 && Math.abs(a.pos.y - to[1]) < .2) {
        reached = true; break;
      }
    }
    assert(reached, `actual BotBrain reaches ${to} from ${from}; stopped at ${a.pos.toArray()}`);
    if (requireGrate) assert(touchedGrate, 'scenario contacted an actual grate, rather than a nearby solid bypass');
  };
  await follow([-26, 0, -25], [-26, 3.6, -16], false);
  await follow([-26, 3.6, -20], [-26, 3.6, -26], true);
});

const wallLayout = paint => ({ bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, spawnPads: [[-3, 0, -3], [3, 0, 3]], spawnBarrier: 0, half: [], single: [
  { kind: 'box', min: [-5, -1, -5], max: [5, 0, 5] },
  { kind: 'box', min: [-2, 0, 0], max: [2, 2, 1], paint },
] });
test('dry/enemy/nonpaintable walls reject squid approach; friendly paint permits it and human jump remains', async () => {
  for (const paintable of [true, false]) {
    const f = await world(wallLayout(paintable)), a = f.bot(); a.pos.set(0, 0, -.5);
    f.G.nav.nodes = [{ id: 0, x: 0, y: 2, z: .5, nb: [] }];
    a.bot.path = [0]; a.bot.pi = 0;
    const tryForm = () => { a.intent.squid = true; a.intent.jump = true; a.intent.move.set(0, 0, 1); f.botTravelForm(a.bot); return a.intent.squid; };
    assert.equal(tryForm(), false, 'bare or unpaintable wall');
    assert.equal(a.intent.jump, true, 'ordinary human jump stays available');
    f.G.paint.splat(new f.THREE.Vector3(0, .8, 0), 1.5, 0, { instant: true, seed: .5 });
    assert.equal(tryForm(), paintable, 'live own ink, not a cached ownership flag');
    f.G.paint.splat(new f.THREE.Vector3(0, .8, 0), 1.5, 1, { instant: true, seed: .5 });
    assert.equal(tryForm(), false, 'enemy repaint is observed immediately');
  }
});

test('waypoint recovery cannot skip a wall or change floors; open same-floor recovery is allowed', async () => {
  const f = await world(wallLayout(false)), a = f.bot(); a.pos.set(0, 0, -1);
  a.bot.path = [0, 1]; a.bot.pi = 0;
  f.G.nav.nodes = [{ id: 0, x: 0, y: 0, z: -.5 }, { id: 1, x: 0, y: 0, z: 2 }];
  assert.equal(a.bot._skipWaypointSafe(), false);
  f.G.nav.nodes[1] = { id: 1, x: 3, y: 0, z: -1 };
  assert.equal(a.bot._skipWaypointSafe(), true);
  f.G.nav.nodes[1].y = 2;
  assert.equal(a.bot._skipWaypointSafe(), false);
});

test('guarded transformer rejects partial/repeated inputs and composes with the native owners', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js', import.meta.url), 'utf8');
  assert.equal(adaptBotNavigation('other.js', 'unchanged', replaceOnce), 'unchanged');
  assert.throws(() => adaptBotNavigation('src/game/bots.js', '', replaceOnce), /conflict/);
  const composed = adaptBuildSource('src/game/bots.js', raw);
  assert.match(composed, /nativeOrdinaryJumpInput\(this,G\)/);
  assert.match(composed, /nativePaintGoalIds\(this, G\)/);
  assert.throws(() => adaptBotNavigation('src/game/bots.js', composed, replaceOnce), /conflict/);
});
