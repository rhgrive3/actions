// The actual composed BotBrain, Actor and catalogue WeaponRunner drive Fire edges.
// Navigation/perception and a dry paint observation are the only controlled inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBotRefillRelease } from '../bot-refill-release-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import fs from 'node:fs';

const DT = 1 / 60;
const HOLD_FAMILIES = ['charger', 'splatling', 'stringer', 'splatana'];

async function setup() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export { BotBrain } from './inkwave-public/src/game/bots.js'; export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';" });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  f.G.physics.segment = (_a,_b,hit) => { hit.hit = false; return hit; };
  return f;
}

function catalogId(f, family) {
  const row = f.MAIN_WEAPON_CATALOG.records.find(r => !r.legacy && r.family === family);
  assert.ok(row, 'missing added catalogue ' + family);
  assert.equal(f.WEAPONS[row.id].kind, 'catalog');
  assert.equal(f.WEAPONS[row.id].behaviorKind, family);
  return row.id;
}

function scenario(f, id, { ink = 90, mode = 'paint' } = {}) {
  f.G.actors.length = 0;
  f.G.projectiles.clear();
  const a = f.make(id);
  a.form = 'kid';
  a.hp = f.PLAYER.hp;
  a.ink = ink;
  a.lastDamage = 99;
  a.lastFire = 99;
  a.groundTeam = 2;
  f.G.paint.sample = () => 0;
  f.G.paint.regionStats = (_x, _y, _z, _r, _team, output) =>
    Object.assign(output || {}, { own: 0, enemy: 0, empty: 1, n: 1 });
  const brain = new f.BotBrain(a, 'normal');
  a.bot = brain;
  brain._perceive = () => {};
  brain._pickPaintGoal = () => { brain.path = null; brain.goalTimer = 1; };
  brain._pickRefill = () => { brain.path = null; brain.repath = 1; };
  brain._steer = () => new f.THREE.Vector3();
  if (mode === 'fight') {
    const enemy = f.make('shooter');
    enemy.team = 1;
    enemy.pos.set(0, 0, 5);
    brain.target = enemy;
    brain.seeTimer = 99;
    brain.react = 0;
    brain._pathTo = () => false;
  }
  const trace = [];
  function step(hz = 60) {
    const dt = 1 / hz;
    f.G.time += dt;
    brain.update(dt);
    a.update(dt);
    trace.push({
      mode: brain.mode, fire: !!a.intent.fire, charging: !!a.weaponRunner.charging,
      catalogFrames: a.weaponRunner.catalogState?.chargeF ?? 0,
      ink: a.ink, shots: f.G.projectiles.list.filter(p => p.owner === a).length,
    });
  }
  return { a, brain, trace, step };
}

function checkBoundedRelease(label, w, hz, maxSeconds = 2.25) {
  const history = w.trace;
  assert.ok(history.some(s => s.fire), label + ' must attempt a legitimate charge');
  assert.ok(history.some((s,i) => i && history[i - 1].fire && !s.fire), label + ' must release Fire');
  assert.ok(history.some(row => row.shots > 0), label + ' must emit at least one real catalogue projectile');
  let uninterrupted = 0, max = 0;
  for (const row of history) {
    uninterrupted = row.charging ? uninterrupted + 1 : 0;
    max = Math.max(max, uninterrupted);
    assert.ok(Number.isFinite(row.ink) && row.ink >= 0 && row.ink <= 100, label + ' ink bounds');
  }
  assert.ok(max <= hz * maxSeconds, label + ' charge never becomes perpetual: ' + max + ' frames');
}

test('all four catalogue charge families fire and release on dry turf with a real Actor', async () => {
  const f = await setup();
  for (const family of HOLD_FAMILIES) {
    const id = catalogId(f, family);
    const w = scenario(f, id);
    for (let i = 0; i < 60 * 4; i++) w.step();
    checkBoundedRelease(id + ' paint', w, 60);
  }
  // Existing charge families keep working, and a hold-to-fire Shooter stays continuous.
  for (const id of ['charger', 'splatling']) {
    const w = scenario(f, id);
    for (let i = 0; i < 240; i++) w.step();
    assert.ok(w.trace.some((s,i) => i && w.trace[i-1].fire && !s.fire), id + ' keeps its release edge');
    assert.ok(w.trace.some(row => row.shots > 0), id + ' keeps its native shot');
  }
  const auto = scenario(f, catalogId(f, 'shooter'));
  for (let i = 0; i < 100; i++) auto.step();
  assert.ok(auto.trace.some(row => row.shots > 0), 'catalogue auto-fire Shooter still emits while Fire is held');
});

test('catalogue bots release in aimed combat, never hold a charged weapon indefinitely', async () => {
  const f = await setup();
  for (const family of HOLD_FAMILIES) {
    const id = catalogId(f, family);
    const w = scenario(f, id, { mode:'fight' });
    for (let i = 0; i < 60 * 4; i++) w.step();
    checkBoundedRelease(id + ' fight', w, 60, 2.25);
  }
});

test('catalogue refill avoids a permanent paid charge on dry ground at low ink', async () => {
  const f = await setup();
  for (const family of HOLD_FAMILIES) {
    const id = catalogId(f, family);
    const w = scenario(f, id, { ink: 8 });
    for (let i = 0; i < 60 * 6; i++) w.step();
    assert.ok(w.trace.some(s => s.mode === 'refill'), id + ' enters refill at low ink');
    const edges = w.trace.filter((s,i) => i && w.trace[i-1].fire && !s.fire).length;
    assert.ok(edges > 0, id + ' refill must produce a Fire-off edge');
    assert.ok(w.trace.every(s => Number.isFinite(s.ink) && s.ink >= 0 && s.ink <= 100), id);
    const charged = w.trace.filter(s => s.charging).length;
    assert.ok(charged < w.trace.length, id + ' cannot hold charge during all refill ticks');
  }
});

test('composed catalogue charge AI runs at 30/60/120Hz without indefinite hold', async () => {
  const f = await setup();
  for (const hz of [30,60,120]) for (const family of HOLD_FAMILIES) {
    const id = catalogId(f, family), w = scenario(f, id);
    for (let i = 0; i < hz * 4; i++) w.step(hz);
    checkBoundedRelease(id + ' @' + hz + 'Hz', w, hz, 2.25);
  }
});

test('puddle adapter builds twice for both modes and fails closed on source drift', () => {
  const raw = fs.readFileSync('inkwave-public/src/game/bots.js', 'utf8');
  const adapted = adaptBotRefillRelease('src/game/bots.js',raw,replaceOnce);
  assert.equal(adapted.split('this._puddleFire(dt)').length - 1, 2);
  assert.ok(adapted.includes('this.a.weapon.behaviorKind || this.a.weapon.kind'));
  assert.ok(adapted.includes("k !== 'stringer' && k !== 'splatana'"));
  assert.throws(() => adaptBotRefillRelease('src/game/bots.js',adapted,replaceOnce));
});
