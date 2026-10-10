import { enemyRevealedOnMap } from '../runtime/map-reveal.mjs';
import { selectedSubCost } from '../runtime/kit-composition.mjs';
import { projectShotGuide } from '../runtime/weapons-fidelity.mjs';
import { hudFrameSnapshot } from '../../local-quality/hud-snapshots.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './score-hud-source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { turfExperience, turfExperienceBreakdown } from '../runtime/results-scoring.mjs';
import { updateHealthBars } from '../runtime/combat-info.mjs';
import { installUi } from '../runtime/ui.mjs';
const ROOT = new URL('../../../', import.meta.url);
const composed = rel => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8')))));
const section = (s, start, end) => { const a = s.indexOf(start), b = s.indexOf(end, a); assert.ok(a >= 0 && b > a); return s.slice(a, b); };
const plain = x => JSON.parse(JSON.stringify(x));

function fighters(f) {
  const a = f.make(), b = f.make(), c = f.make(), enemy = f.make(); enemy.team = 1;
  for (const [i, x] of [a, b, c, enemy].entries()) x.nid = i + 1;
  f.G.actors = [a, b, c, enemy]; return { a, b, c, enemy };
}

test('#236 one authoritative assist list serves stats/Flow/HUD, excluding repeated hits, finisher and invalid teams', async () => {
  const f = await fixture(), { a, b, c, enemy } = fighters(f); let event;
  f.on('splatted', e => { event = e; });
  enemy.damage(10, a, 'shooter'); enemy.damage(10, a, 'shooter'); enemy.damage(10, c, 'shooter');
  f.G.time += 1; enemy.damage(100, b, 'shooter'); f.tick(enemy);
  assert.equal(a.stats.assists, 1); assert.equal(c.stats.assists, 1); assert.equal(b.stats.assists, 0);
  assert.equal(a.stats.splats, 0); assert.equal(b.stats.splats, 1); assert.deepEqual(plain(event.assists.map(x => x.nid)), [1, 3]);
  const code = section(composed('src/ui/hud.js'), '  _onSplatted(', '\n  _assistMark(');
  const Hud = vm.runInNewContext(`class Hud {${code}\n}; Hud`, { tr: x => x, STREAKS: [] });
  const hud = new Hud(), cards = [];
  Object.assign(hud, { _live: () => true, _local: () => a, _now: () => f.G.time, _kills: { dealt: new Map() }, _killCard: (_v, type) => cards.push(type), _assistMark: victim => cards.push({ assist: victim }) });
  hud._onSplatted(event); assert.equal(cards.length, 1); assert.equal(cards[0].assist, enemy, '#561 sends the same accepted assist to its world marker');
  enemy.reset(); enemy.damage(100, b, 'shooter'); f.tick(enemy); assert.equal(a.stats.assists, 1, 'victim respawn clears old hit credits');
  enemy.reset(); enemy.damage(10, a, 'shooter'); f.G.time += f.profile.flow.assistWindow + .01; enemy.damage(100, b, 'shooter'); f.tick(enemy); assert.equal(a.stats.assists, 1, 'expired hit is not a new assist');
  a.reset(); assert.equal(a.stats.assists, 1, 'helper respawn preserves match statistics'); assert.equal(f.make().stats.assists, 0, 'new match actor starts empty');
});

test('#236 actual event packing/replay and result transport preserve assist counts without duplicate replay', async () => {
  const f = await fixture(), p = fighters(f); let event;
  f.on('splatted', e => { event = e; }); p.enemy.damage(10, p.a, 'shooter'); p.enemy.damage(100, p.b, 'shooter'); f.tick(p.enemy);
  const sender = Object.create(f.NetMatch.prototype); sender._rec = row => { sender.row = row; }; f.G.netm = sender;
  sender._onLocalEvent('splatted', event); assert.deepEqual(plain(sender.row[2].assists), [1]);
  const r = await fixture(), q = fighters(r), receiver = Object.create(r.NetMatch.prototype);
  q.enemy.remote = true; q.enemy.net = { buf: [], tp: 0 }; receiver.byNid = new Map(r.G.actors.map(x => [x.nid, x]));
  receiver._playEvent('splatted', sender.row[2]); receiver._playEvent('splatted', sender.row[2]);
  assert.equal(q.a.stats.assists, 1); assert.equal(q.b.stats.splats, 1);
  receiver.s = { isHost: true }; receiver.match = { actors: r.G.actors }; receiver._sendNow = d => { receiver.result = d; };
  receiver.sendResult({ coverage: [.6, .4], winner: 0 }); assert.equal(receiver.result.st[0][6], 1);
  q.a.stats.assists = 0; receiver.s.isHost = false; receiver.match.setState = () => {};
  receiver._result(receiver.result); assert.equal(q.a.stats.assists, 1); assert.equal(q.a.stats.splats, 0);
});

test('#256 actual CPU paint preserves wall ink/cache updates while awarding only eligible floor area', async () => {
  const f = await fixture(), a = f.make();
  const wall = { turf: false, grid: 0, n: { y: 0 }, nu: 8, nv: 8, cu: .5, cv: .5 }, floor = { ...wall, n: { y: 1 }, turf: true, grid: 64 };
  const paint = Object.create(f.PaintSystem.prototype); Object.assign(paint, { paintFaces: [wall, floor], grid: new Uint8Array(128), dead: new Uint8Array(128), counts: [0, 0], version: 0 });
  const splat = (face, team) => paint._cpuSplat(face, 2, 2, 1, team, .5, 1, 0, 0, 0);
  a.addTurf(splat(wall, 0)); assert.equal(a.stats.turf, 0); assert.equal(a.special, 0); assert.ok(paint.grid.slice(0, 64).some(x => x === 1));
  const version = paint.version; splat(wall, 0); assert.equal(paint.version, version);
  a.addTurf(splat(wall, 1)); assert.equal(a.stats.turf, 0); assert.ok(paint.version > version); assert.deepEqual(plain(paint.coverage()), [0, 0]);
  const floorPoints = splat(floor, 0); assert.ok(floorPoints > 0); a.addTurf(floorPoints); assert.equal(a.special, floorPoints);
  assert.equal(splat(floor, 0), 0); assert.equal(splat(floor, 1), floorPoints);
  assert.equal(splat(wall, 0) + splat(floor, 0), floorPoints, 'combined wall/floor blast scores floor only');
  assert.ok(paint.coverage()[0] > 0 && paint.coverage()[1] === 0, 'weighted judge remains floor-only');
});

for (const won of [true, false]) test(`#295 Turf rank XP stage/cap and native save/result/level path: won=${won}`, async () => {
  const f = await fixture(); const src = composed('src/main.js');
  const code = section(src, '  async _judge() {', '\n  _fade(to, ms)');
  const saves = [], outputs = [], G = { teamHex: ['a', 'b'], teamColors: ['a', 'b'], net: null, netm: null };
  const Game = vm.runInNewContext(`class Game {${code}}; Game`, { G, TEAM_NAMES: ['A','B'], PROGRESSION: f.PROGRESSION, turfExperience: f.turfExperience,
    saveJSON: (_key, p) => saves.push({ ...p }), setTimeout: () => 0 });
  for (const turf of [0, 99, 100, 199, 200, 499, 500, 1000]) for (const splats of [0, 1, 10]) {
    const a = { team: 0, name: 'a', weaponId: 'shooter', stats: { turf, splats, assists: 2, deaths: 0 }, character: { style: {} }, isLocal: true };
    const m = { local: a, actors: [a], state: 'judge', result: { coverage: [.6,.4], winner: won ? 0 : 1 }, setState(s) { this.state = s; } };
    const game = new Game(); Object.assign(game, { match: m, profile: { level: 1, xp: 0, matches: 0, wins: 0, totalTurf: 0 },
      palette: {}, mapDef: { name: 'test' }, rig: { overview() {} }, hud: { judge: () => Promise.resolve(), setVisible() {} },
      showcase: { showResults() {} }, menus: { showResults: data => outputs.push(data), show() {} } });
    await game._judge(); const out = outputs.at(-1), xp = turfExperience(turf, won);
    assert.equal(out.xp.gained, xp.total); assert.equal(out.xp.gained, (won ? 900 : 300) + Math.min(500, Math.floor(turf / 100) * 100));
    assert.equal(turfExperienceBreakdown(turf, won).reduce((n, p) => n + p[1], 0), out.xp.gained);
    let remaining = xp.total, level = 1; while (remaining >= f.PROGRESSION.xpForLevel(level)) remaining -= f.PROGRESSION.xpForLevel(level++);
    assert.equal(saves.at(-1).xp, remaining); assert.equal(saves.at(-1).level, level);
    assert.equal(out.players[0].splats, splats + 2); assert.equal(out.players[0].directSplats, splats); assert.equal(a.stats.splats, splats);
  }
});

test('#220 map threshold is independent of pose and HP-bar visibility; source frame preserves allies', async () => {
  const f = await fixture(), { a, b, enemy } = fighters(f); a.isLocal = true;
  for (const damage of [0, 17.9, 18, 18.1, 20]) for (const form of ['kid', 'swim', 'climb']) {
    enemy.hp = 100 - damage; enemy.anim.form = form;
    assert.equal(f.mapActorVisible(enemy, a), damage >= 18);
  }
  enemy.hp = 100; enemy.s3.revealedUntil = { 0: 3 }; assert.equal(f.mapActorVisible(enemy, a, 100, 2), true); assert.equal(f.mapActorVisible(enemy, a, 100, 3), false);
  enemy.alive = false; assert.equal(f.mapActorVisible(enemy, a), false); enemy.reset(); assert.equal(f.mapActorVisible(enemy, a), false);
  enemy.team = 0; assert.equal(f.mapActorVisible(enemy, a), true); assert.equal(f.mapActorVisible(a, a), true); assert.equal(f.mapActorVisible(b, a), true);
  enemy.team = 1; enemy.hp = 82.1;
  const sender = Object.create(f.NetMatch.prototype); let packet;
  Object.assign(sender, { byNid: new Map([[enemy.nid, enemy]]), out: [], stats: { out: 0 }, s: { isHost: false, tr: { broadcast: d => { packet = d; } } } });
  sender._sendTick(); assert.equal(packet.a[0][11], 82.1, 'network quantization must not reveal 17.9 damage');
});

test('#231 health disclosure respects enemy 3s window, own-ink concealment, LOS, explicit team reveal and ally damage', async () => {
  const f = await fixture(), { a, b, enemy } = fighters(f); enemy.hp = 100; b.hp = 50;
  // #716: the window starts at the observed HP loss (t=10), not at a recovery-clock field.
  f.healthActorVisible(enemy, a, { now: 9.999, visible: true }); enemy.hp = 50;
  for (const age of [0, 2.999, 3, 4]) assert.equal(f.healthActorVisible(enemy, a, { now: 10 + age, visible: true }), age < 3);
  assert.equal(f.healthActorVisible(enemy, a, { now: 11, visible: false }), false);
  for (const hidden of ['submerged', 'climbing']) { enemy[hidden] = true; assert.equal(f.healthActorVisible(enemy, a, { now: 11, visible: true }), false); enemy[hidden] = false; }
  enemy.s3.revealedUntil = { 0: 12 }; assert.equal(f.healthActorVisible(enemy, a, { now: 11, visible: false }), true);
  assert.equal(f.healthActorVisible(enemy, a, { now: 12, visible: false }), false);
  enemy.hp = 100; assert.equal(f.healthActorVisible(enemy, a, { now: 11, visible: true }), false);
  enemy.hp = 1; enemy.alive = false; assert.equal(f.healthActorVisible(enemy, a, { now: 11, visible: true }), false);
  assert.equal(f.healthActorVisible(b, a), true); assert.equal(f.healthActorVisible(a, a), false);
});

test('#231 health-bar DOM is separate from ally/name markers and clears old disclosures', () => {
  class Node { constructor() { this.style = { setProperty(k, v) { this[k] = v; } }; this.children = []; } appendChild(x) { this.children.push(x); this.firstChild ||= x; } setAttribute() {} }
  const before = globalThis.document; globalThis.document = { createElement: () => new Node() };
  try {
    const layer = new Node(), hud = { markerLayer: layer, markers: ['ally'] };
    updateHealthBars(hud, [{ x: 10, y: 20, hp: .5, color: '#f80' }]); assert.equal(layer.children.length, 1);
    assert.equal(hud._healthBars[0].firstChild.style.transform, 'scaleX(0.5)'); assert.deepEqual(hud.markers, ['ally']);
    updateHealthBars(hud, []); assert.equal(hud._healthBars[0].hidden, true);
    updateHealthBars(hud, [{ x: 20, y: 30, hp: .1, color: '#08f' }]); assert.equal(layer.children.length, 1); assert.equal(hud._healthBars[0].hidden, false);
  } finally { globalThis.document = before; }
});

test('public source adapter fails closed for all new connections and retains independent old modules', () => {
  for (const rel of ['src/main.js','src/game/actor.js','src/net/netmatch.js','src/ui/hud.js','src/ui/menus.js','src/world/paint.js']) {
    const source = fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8'); assert.throws(() => adaptSource(rel, adaptSource(rel, source)));
    assert.ok(composed(rel).length > 0);
  }
});


test('#220/#231 actual Game HUD frame keeps map damage, enemy health visibility, ally markers and own vignette separate', async () => {
  const f = await fixture(), { a, b, enemy } = fighters(f); a.isLocal = true; b.name = 'ally'; enemy.name = 'enemy';
  f.G.camera = new f.THREE.PerspectiveCamera(60, 800 / 600, .1, 100); f.G.camera.position.set(0, 2, 10); f.G.camera.lookAt(0, 1, 0); f.G.camera.updateMatrixWorld();
  f.G.actors = [a, b, enemy]; a.character.root.position.set(-2, 0, 0); b.character.root.position.set(2, 0, 0);
  b.hp = enemy.hp = f.PLAYER.hp;
  const source = composed('src/main.js'), code = section(source, '  _updateHud(dt) {', '\n  // ---------------------------------------------------------------------------------------- touch / gyro');
  const Game = vm.runInNewContext(`class Game {${code}}; Game`, { G: f.G, PLAYER: f.PLAYER, SUB: f.SUB, THREE: f.THREE, selectedSubCost, projectShotGuide, hudFrameSnapshot, enemyRevealedOnMap,
    mapActorVisible: f.mapActorVisible, buildHealthMarkers: f.buildHealthMarkers, innerWidth: 800, innerHeight: 600, t: x => x });
  const game = new Game(); let frame;
  Object.assign(game, { match: { local: a, actors: f.G.actors, time: 150, duration: 180, state: 'playing', teamSummary: () => [{},{}] },
    settings: { minimap: true }, minimap: { update() {}, toCanvas(x, z, out) { out.x = x; out.y = z; }, w: 100, h: 100, canvas: {} },
    _hintT: 0, _hints: {}, _lowInkFlash: 0, input: {}, hud: { update: (_dt, f) => { frame = f; } } });
  game._updateHud(1 / 60); b.hp = enemy.hp = 50; game._updateHud(1 / 60);
  assert.equal(frame.hp, 1); assert.equal(frame.map.players.length, 3); assert.equal(frame.healthMarkers.length, 2);
  assert.deepEqual(plain(frame.markers.map(x => x.name)), ['ally']);
  enemy.submerged = true; enemy.anim.form = 'swim'; game._updateHud(1 / 60); assert.equal(frame.map.players.length, 3); assert.equal(frame.healthMarkers.length, 1);
  enemy.submerged = false; enemy.anim.form = 'kid'; f.G.physics.los = () => false; game._updateHud(1 / 60); assert.equal(frame.healthMarkers.length, 1);
  f.G.physics.los = () => true; enemy.hp = 100; game._updateHud(1 / 60); assert.equal(frame.map.players.length, 2); assert.equal(frame.healthMarkers.length, 1);
  b.pos.z = 20; b.character.root.position.z = 20; game._updateHud(1 / 60); assert.equal(frame.healthMarkers.length, 0, 'offscreen allies retain name arrows without a health leak');
});

test('#231 remote health samples start the same damage window once and respawn clears disclosure', async () => {
  const f = await fixture(), { a, enemy } = fighters(f); enemy.remote = true;
  enemy.net = { ready: true, err: new f.THREE.Vector3(), prevGrounded: true, prevVy: 0, cur: {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0,
    f: f.NET_FLAGS.alive | f.NET_FLAGS.grounded, hp: 50, ink: 100, sp: 0, turf: 0, ch: 0, lock: 0,
  } };
  const nm = Object.create(f.NetMatch.prototype);
  // #716: the replicated HP loss is observed as a drop from the full-HP baseline; repeats do not refresh it.
  enemy.hp = 100; assert.equal(f.healthActorVisible(enemy, a, { visible: true }), false, 'full-HP baseline has no window');
  nm.applyRemote(enemy, 1 / 60);
  assert.equal(enemy.hp, 50); assert.equal(f.healthActorVisible(enemy, a, { visible: true }), true);
  nm.applyRemote(enemy, 3); assert.equal(f.healthActorVisible(enemy, a, { now: 3, visible: true }), false, 'repeated same sample does not restart the window');
  enemy.s3.revealedUntil = { 0: 99 }; nm._remoteRespawn(enemy);
  assert.equal(enemy.lastDamage, 99); assert.equal(enemy.s3.revealedUntil, undefined); assert.equal(f.healthActorVisible(enemy, a, { visible: true }), false);
});


test('production UI installer owns health rendering exactly once, even when menu fitting already exists', () => {
  class Node { constructor() { this.children = []; this.style = { setProperty() {} }; } appendChild(x) { this.children.push(x); this.firstChild ||= x; } setAttribute() {} }
  const old = globalThis.document; globalThis.document = { createElement: () => new Node() };
  try {
    class HUD { constructor() { this.markerLayer = new Node(); this.calls = 0; } update() { this.calls++; return 7; } }
    class Menus { _fitAll() {} }
    const api = { HUD, Menus }; installUi(api); const update = HUD.prototype.update; installUi(api); assert.equal(HUD.prototype.update, update);
    const hud = new HUD(); assert.equal(hud.update(1 / 60, { healthMarkers: [{ x: 10, y: 20, hp: .5 }] }), 7);
    assert.equal(hud.calls, 1); assert.equal(hud.markerLayer.children.length, 1);
    hud.update(1 / 60, {}); assert.equal(hud._healthBars[0].hidden, true);
  } finally { globalThis.document = old; }
});
