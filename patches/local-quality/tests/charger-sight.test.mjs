// Charger laser sight follows the rendered frame's aim. Real patched Actor + WeaponRunner + Projectiles + Physics on the
// range level (the Practice Range harness realm); 60 Hz ticks, and "render frames" that move the aim point the way
// rig.update() → computeAim() does between the ticks and the draw. Logic-only evidence, not a browser measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rangeRealm, rangeWorld, compose, SRC } from '../../practice-range/tests/harness.mjs';

const read = (rel) => fs.readFileSync(`${SRC}/${rel}`, 'utf8');

async function setup() {
  const R = await rangeRealm();
  const { G, Actor, Character, THREE, Projectiles } = R;
  rangeWorld(R);
  G.projectiles = new Projectiles(G.scene);
  G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0, 60, -300);
  const a = new Actor({ team: 0, name: 'tester', weapon: 'charger', isLocal: true, CharacterClass: Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  a.character.actor = a;
  G.actors = [a]; G.local = a;
  G.match = { actors: [a], local: a, state: 'playing', paused: false, canRespawn: () => true, playing: () => true, opts: {} };
  a.spawnAt(new THREE.Vector3(0, 0.05, 2), 0); a.invuln = 0;
  const P = G.projectiles;
  const aimAt = (yaw, pitch = 0, dist = 30) => {
    a.aimYaw = yaw; a.aimPitch = pitch;
    const cp = Math.cos(pitch);
    a.aimPoint.set(a.pos.x + Math.sin(yaw) * cp * dist, a.pos.y + 1.3 + Math.sin(pitch) * dist, a.pos.z + Math.cos(yaw) * cp * dist);
  };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { G.time += 1 / 60; a.update(1 / 60); P.update(1 / 60); } };
  const sight = () => P.sights.get(a);
  // the ray the shot itself would take right now (fireCharger: _muzzle → _aimFrom)
  const shotDir = () => { const m = P._muzzle(a, new THREE.Vector3()); return P._aimFrom(a, m, new THREE.Vector3()).clone(); };
  const sightDir = () => new THREE.Vector3(0, 0, 1).applyQuaternion(sight().quaternion);
  return { R, G, THREE, a, P, aimAt, tick, sight, shotDir, sightDir };
}

test('frame order: camera update → computeAim → sight sync → render', () => {
  const main = compose('src/main.js', read('src/main.js'));
  const frame = main.slice(main.indexOf('  _frame(dt) {'), main.indexOf('  _dynRes(dt)') > main.indexOf('  _frame(dt) {') ? main.indexOf('  _dynRes(dt)') : undefined);
  const rig = frame.indexOf('this.rig.update(worldDt);'), aim = frame.indexOf('m.controller.computeAim?.();', rig);
  const sync = frame.indexOf('G.projectiles.syncSights?.();', aim), render = frame.indexOf('this.R.render()', sync);
  assert.ok(rig > 0 && aim > rig && sync > aim && render > sync, JSON.stringify({ rig, aim, sync, render }));
  assert.equal(main.split('G.projectiles.syncSights?.()').length - 1, 1);
  const weapons = compose('src/game/weapons.js', read('src/game/weapons.js'));
  assert.equal(weapons.split('this._placeSight(a, s);').length - 1, 1, 'tick path uses the shared placement');
  assert.match(weapons, /\n {2}_placeSight\(a, s\) \{\n {4}const m = this\._muzzle\(a, _v\.set\(0, 0, 0\)\);\n {4}const dir = this\._aimFrom\(a, m, _dir\);/);
});

test('a camera move between the tick and the draw: the sight is re-placed on the new aim (negative control first)', async () => {
  const w = await setup();
  const { a, P, aimAt, tick, sight, shotDir, sightDir } = w;
  aimAt(0, 0.05);
  a.intent.fire = true; tick(30);
  assert.ok(a.weaponRunner.charging && sight()?.visible, 'charging charger shows its sight');
  // render frame: the camera turned 12° after the last tick; computeAim moved the aim point
  aimAt(12 * Math.PI / 180, 0.05);
  assert.ok(sightDir().angleTo(shotDir()) > 0.15, 'without the presentation pass the sight still shows the tick-time aim');
  P.syncSights();
  assert.ok(sightDir().angleTo(shotDir()) < 1e-6, 'synced sight lies on the shot ray of this frame');
  assert.ok(sight().position.distanceTo(P._muzzle(a, new w.THREE.Vector3())) < 1e-9, 'from the current muzzle');
  a.intent.fire = false; tick(1);
});

test('every frame interval: 120 Hz (no tick between draws) and low FPS (several ticks per draw) never show an old aim', async () => {
  const w = await setup();
  const { a, P, aimAt, tick, shotDir, sightDir } = w;
  aimAt(0, 0); a.intent.fire = true; tick(30);
  // 120 Hz: two draws per tick, the aim keeps moving on every draw
  let yaw = 0;
  for (let i = 0; i < 24; i++) {
    if (i % 2 === 0) tick(1);
    yaw += 1.5 * Math.PI / 180; aimAt(yaw, 0.02 * Math.sin(i));
    P.syncSights();
    assert.ok(sightDir().angleTo(shotDir()) < 1e-6, `120 Hz draw ${i}`);
  }
  // 15 FPS: four ticks then one draw after a fast flick
  for (let i = 0; i < 6; i++) {
    tick(4); yaw -= 20 * Math.PI / 180; aimAt(yaw, -0.1);
    P.syncSights();
    assert.ok(sightDir().angleTo(shotDir()) < 1e-6, `15 FPS draw ${i}`);
  }
  a.intent.fire = false; tick(1);
});

test('the released shot converges on the last sight target across the release gap; an uncharged sight stays hidden', async () => {
  const w = await setup();
  const { a, P, aimAt, tick, sight, shotDir, sightDir, THREE } = w;
  aimAt(0.3, 0.04); a.intent.fire = true; tick(70);
  aimAt(0.42, 0.06); P.syncSights();
  const seen = sightDir(), seenOrigin = sight().position.clone(), target = a.aimPoint.clone();
  assert.ok(seen.angleTo(target.clone().sub(seenOrigin).normalize()) < 1e-6, 'last visible ray points at its current target');
  let actual = null;
  const off = w.R.on('weapon:fire', event => { if (event.actor === a && event.weapon === 'charger') actual = event; });
  let fired = null;
  const fire = P.fireCharger;
  P.fireCharger = function (actor, ...rest) { if (actor === a) fired = shotDir(); return fire.call(this, actor, ...rest); };
  try {
    a.intent.fire = false; tick(1);
    assert.equal(fired,null,'existing release gap does not emit on its first tick');
    P.syncSights();
    assert.equal(sight().visible,false,'release gap has no charging sight to re-place');
    tick(1);
  } finally { P.fireCharger = fire; off(); }
  assert.ok(fired, 'the charger fired on release');
  assert.ok(actual, 'actual finite-flight release publishes its launch ray');
  assert.ok(actual.dir.angleTo(fired) < 1e-6, 'actual release uses the synchronous owner ray');
  assert.ok(actual.dir.angleTo(target.clone().sub(actual.muzzle).normalize()) < 1e-6, 'moving muzzle still converges on the displayed target');
  // A hidden sight from before the gap has a different origin after the pose advances.
  // Equal directions would be incorrect parallax evidence for these two rays.
  assert.ok(actual.muzzle.distanceTo(seenOrigin) > 1e-6, 'the real release gap advances the muzzle pose');
  tick(2);
  assert.equal(a.weaponRunner.charging, false);
  P.syncSights();
  assert.equal(sight().visible, false, 'the presentation pass never revives a released sight');
  void THREE;
});
