// Big Bubbler (issue 177 kit work) against the ACTUAL composed public runtime:
// the immutable inkwave-public sources adapted by patches/splatoon3/adapter.mjs
// plus the real Actor, Projectiles and config objects. Only wall collision and
// audio are stubbed, exactly as the other composed-runtime tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import {
  installKitBigBubbler, bigBubblerDomes, bigBubblerSnapshot, barrierProjectile,
  BIG_BUBBLER_RAW, BIG_BUBBLER_CALIBRATION, hermite2d, clearBigBubblers,
} from '../runtime/kit-big-bubbler.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || `${ROOT}inkwave-public`;
const DT = 1 / 60;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// Represents the composed profile the parent owns: the kit id, its registry entry
// and the base cost. This lane does not edit install.mjs or profile.json.
async function composed(bigBubbler) {
  const f = await fixture();
  const scene = new f.THREE.Scene();
  f.G.scene = scene;
  f.G.projectiles = new f.Projectiles(scene);
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  f.G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, hit) => { hit.hit = true; hit.y = 0; return hit; };
  f.SPECIALS.bubbler = { id: 'bubbler', name: 'Big Bubbler', blurb: 'Deploy a damageable ink dome.', cost: 180 };
  const api = { ...f, Actor: f.Actor, Projectiles: f.Projectiles, THREE: f.THREE, G: f.G,
    PLAYER: f.PLAYER, emit: f.emit, SPECIALS: f.SPECIALS };
  installKitBigBubbler(api, { ...f.profile, kits: { bigBubbler: bigBubbler || {} } });
  clearBigBubblers('test-setup');
  return { f, api, scene, kit: api };
}

function roller(f, x = 0, z = 0, yaw = 0) {
  const a = f.make('roller');
  a.pos.set(x, 0, z); a.yaw = yaw; a.aimYaw = yaw;
  a.weapon = { ...a.weapon, special: 'bubbler' };
  return a;
}
function activate(f, a) {
  a.special = a.specialCost();
  a.intent.special = true;
  f.tick(a);
}
function step(f, ticks) { for (let i = 0; i < ticks; i++) f.G.projectiles.update(DT); }
function aim(a, dir, point) { a.aimDir.copy(dir); a.aimYaw = Math.atan2(dir.x, dir.z); a.aimPitch = 0; a.aimPoint.copy(point); }

// ---------------------------------------------------------------------------
test('the pinned Hermit2DSmooth curves evaluate through their pinned endpoints', () => {
  close(hermite2d(BIG_BUBBLER_RAW.radiusCurve, 0), 0.1940299, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.radiusCurve, 1), 1.0, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.ascendCurve, 0), 0.0, 1e-9);
  close(hermite2d(BIG_BUBBLER_RAW.ascendCurve, 1), 1.0, 1e-9);
  let previous = -1;
  for (let i = 0; i <= 40; i++) {
    const v = hermite2d(BIG_BUBBLER_RAW.radiusCurve, i / 40);
    assert.ok(v >= previous - 1e-9, 'the pinned radius curve is monotonic');
    previous = v;
  }
});

test('activating the special deploys a stationary dome with the pinned durability', async () => {
  const { f } = await composed();
  const a = roller(f, 0, 0, 0); f.G.actors = [a];
  activate(f, a);
  assert.equal(bigBubblerDomes().length, 1);
  const dome = bigBubblerDomes()[0];
  assert.equal(dome.team, 0);
  assert.equal(dome.hp, BIG_BUBBLER_RAW.maxHp);
  assert.equal(dome.hpMax, BIG_BUBBLER_RAW.maxHp);
  assert.equal(dome.fieldHp, BIG_BUBBLER_RAW.maxFieldHp);
  close(dome.pos.z, BIG_BUBBLER_CALIBRATION.deployDistance, 1e-9);
  close(dome.pos.x, 0, 1e-9);
  // the native activation still owns the gauge, the stat and the form change
  assert.equal(a.special, 0);
  assert.equal(a.stats.specials, 1);
  assert.equal(a.specialActive, null, 'no renamed slam/storm state is used');
  assert.equal(a.invuln, 0, 'the special is not invulnerability');
  // stationary while it runs
  const anchor = dome.pos.clone();
  step(f, 90);
  close(dome.pos.distanceTo(anchor), 0, 1e-12);
});

test('radius grows on the pinned curve, arms on the pinned frame and stays under the cap', async () => {
  const { f } = await composed();
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  assert.equal(dome.ignited, false);
  const first = dome.radius;
  step(f, 20);
  assert.ok(dome.radius > first, 'the dome grows');
  assert.ok(dome.radius <= BIG_BUBBLER_RAW.maxRadius + 1e-9);
  step(f, 80);                                 // 100 ticks: past IgnitionFrame (15)
  assert.equal(dome.ignited, true);
  assert.ok(dome.emitterY > 0, 'the emitter rises');
  assert.ok(dome.radius <= BIG_BUBBLER_RAW.maxRadius + 1e-9);
  assert.ok(Math.abs(dome.radius - BIG_BUBBLER_RAW.maxRadius) < 1e-6, 'full radius is the pinned MaxRadius');
});

test('the pinned TimeDamage collapses the canopy and releases its scene resources', async () => {
  const { f, scene } = await composed();
  const a = roller(f); f.G.actors = [a];
  const sceneBefore = scene.children.length;
  activate(f, a);
  const dome = bigBubblerDomes()[0];
  assert.ok(scene.children.length > sceneBefore, 'the dome owns real scene objects');
  const disposals = [];
  const geometry = dome.shell.geometry, material = dome.shell.material;
  const disposeGeometry = geometry.dispose.bind(geometry), disposeMaterial = material.dispose.bind(material);
  geometry.dispose = () => { disposals.push('geometry'); disposeGeometry(); };
  material.dispose = () => { disposals.push('material'); disposeMaterial(); };
  for (let i = 0; i < 60 * 30 && bigBubblerDomes().length; i++) f.G.projectiles.update(DT);
  assert.equal(bigBubblerDomes().length, 0, 'the pinned TimeDamage ends the dome');
  assert.equal(scene.children.length, sceneBefore, 'the dome leaves the scene');
  assert.deepEqual(disposals.sort(), ['geometry', 'material'], 'GPU resources are disposed once');
});

test('an enemy round is consumed at the dome surface instead of reaching the actor behind it', async () => {
  // The pinned TimeDamage burn is isolated in its own test, so the exact
  // canopy delta here is attributable to the intercepted round alone.
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  const owner = roller(f, 0, 0, 0);
  const shooter = f.make('shooter'); shooter.team = 1; shooter.pos.set(0, 0, -8);
  const victim = f.make('shooter'); victim.team = 1; victim.pos.set(0, 0, 9);
  f.G.actors = [owner, shooter, victim];
  activate(f, owner);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  aim(shooter, new f.THREE.Vector3(0, 0, 1), new f.THREE.Vector3(0, 1.05, 0));
  const hp = dome.hp, victimHp = victim.hp;
  f.G.projectiles.fireShooter(shooter, shooter.weapon, 0);
  assert.equal(f.G.projectiles.list.length, 1, 'a real native round is in flight');
  for (let i = 0; i < 60 && f.G.projectiles.list.length; i++) f.G.projectiles.update(DT);
  assert.equal(f.G.projectiles.list.length, 0, 'the round was consumed by the dome');
  assert.equal(victim.alive, true, 'the actor behind the dome is untouched');
  assert.equal(victim.hp, victimHp);
  assert.equal(dome.hp, hp - shooter.weapon.damage * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit);
});

test('the barrier answers the first-entry distance for the native chronology', async () => {
  const { f } = await composed();
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const dome = bigBubblerDomes()[0];
  const sys = f.G.projectiles;
  assert.equal(typeof sys.kitBarrier, 'function', 'the documented hook target exists');
  const from = new f.THREE.Vector3(0, 1.05, -8);
  // native _step integrates prev -> pos, so the record needs a real segment that
  // actually spans the dome rather than a sub-step that stops short of it.
  const round = { pos: new f.THREE.Vector3(0, 1.05, 8), prev: from.clone(),
    vel: new f.THREE.Vector3(0, 0, 50), age: 0, straight: 0.07, grav: 28, drag: 0.8,
    size: 0.15, damage: 36, team: 1, life: 1.2, type: 'shot' };
  const hp = dome.hp;
  const start = round.pos.clone();
  const hit = sys.kitBarrier(round);
  assert.ok(hit, 'a first-entry record is returned');
  // the hook consumes the round at the surface, so the original segment has to
  // be measured before calling it
  const span = start.z - round.prev.z;
  close((hit.point.z - round.prev.z) / span, hit.distance, 1e-9);           // parametric first entry
  close(hit.point.distanceTo(dome.pos), dome.radius + round.size, 1e-9);   // exactly on the shell
  close(hit.point.y, 1.05, 1e-9);                                          // same height, no re-aim
  assert.ok(round.pos.distanceTo(hit.point) < 1e-12, 'the round stops at the surface');
  assert.equal(hit.target, 'canopy');
  assert.equal(dome.hp, hp - 36 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit);
  // a friendly round, and a round that starts inside, are not intercepted
  round.team = 0; assert.equal(barrierProjectile(round), false);
  round.team = 1; round.pos.set(dome.pos.x, dome.pos.y, dome.pos.z); round.prev.copy(round.pos);
  assert.equal(barrierProjectile(round), false, 'a round already inside may leave');
});

test('the documented native adapter anchor is present and unique in the composed source', () => {
  const source = fs.readFileSync(`${UPSTREAM}/src/game/weapons.js`, 'utf8');
  const anchor = '      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;';
  assert.equal(source.split(anchor).length - 1, 1, 'the parent hook has one exact anchor');
  assert.ok(source.includes('return dead;'), 'the consuming branch is the native one');
});

test('actors walk into the dome and friendly rounds fired from inside leave it', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  const owner = roller(f, 0, 0, 0);
  const enemy = f.make('shooter'); enemy.team = 1; enemy.pos.set(0, 0, 3);
  f.G.actors = [owner, enemy];
  activate(f, owner);
  const dome = bigBubblerDomes()[0];
  step(f, 60);
  const position = enemy.pos.clone(), enemyHp = enemy.hp;
  step(f, 60);
  assert.ok(enemy.pos.distanceTo(position) < 1e-12, 'the dome pushes nobody');
  assert.equal(enemy.hp, enemyHp, 'standing inside is not damage');
  assert.equal(enemy.invuln, 0, 'the dome grants no invulnerability');
  assert.equal(enemy.alive, true);
  const hp = dome.hp;
  aim(owner, new f.THREE.Vector3(0, 0, 1), new f.THREE.Vector3(0, 1.05, 0));
  f.G.projectiles.fireShooter(owner, owner.weapon, 0);
  const inFlight = f.G.projectiles.list.length;
  assert.equal(inFlight, 1);
  f.G.projectiles.update(DT);
  assert.equal(f.G.projectiles.list.length, inFlight, 'the friendly round survives the dome');
  assert.equal(dome.hp, hp, 'no friendly round was intercepted');
});

test('the exposed emitter is damageable and its destruction collapses the dome', async () => {
  const { f } = await composed({ timeDamageIntervalSeconds: 1e9 });
  const owner = roller(f, 0, 0, 0);
  const shooter = f.make('shooter'); shooter.team = 1; shooter.pos.set(0, 7.5, -8);
  f.G.actors = [owner, shooter];
  activate(f, owner);
  const dome = bigBubblerDomes()[0];
  step(f, 90);
  assert.ok(dome.emitterY > 8, 'the emitter is above the canopy shell');
  aim(shooter, new f.THREE.Vector3(0, 0, 1), new f.THREE.Vector3(dome.pos.x, 7.5 + 1.05, dome.pos.z));
  const canopyHp = dome.hp;
  let shots = 0;
  while (bigBubblerDomes().length && shots < 12) {
    f.G.projectiles.fireShooter(shooter, shooter.weapon, 0);
    shots++;
    for (let i = 0; i < 30 && f.G.projectiles.list.length; i++) f.G.projectiles.update(DT);
  }
  assert.equal(bigBubblerDomes().length, 0, 'destroying the emitter collapses the structure');
  assert.equal(dome.fieldHp, 0, 'the emitter absorbed the pinned MaxFieldHp budget');
  assert.equal(dome.hp, canopyHp, 'the canopy was not the target');
});

test('the owner dying leaves the deployed structure; match disposal erases it', async () => {
  const { f, scene } = await composed();
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  const sceneAfterDeploy = scene.children.length;
  a.splat(null, 'weapon');
  assert.equal(a.alive, false);
  assert.equal(bigBubblerDomes().length, 1, 'owner death does not erase the structure');
  a.reset();
  assert.equal(bigBubblerDomes().length, 1, 'reset is the respawn path and is not an erase by default');
  assert.ok(scene.children.length > 0);
  f.G.projectiles.clear();
  assert.equal(bigBubblerDomes().length, 0, 'match disposal erases every dome');
  assert.ok(scene.children.length < sceneAfterDeploy, 'and releases its scene objects');
});

test('reset erasure is an explicit calibration, not the default', async () => {
  const { f } = await composed({ eraseOnOwnerReset: true });
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  assert.equal(bigBubblerDomes().length, 1);
  a.reset();
  assert.equal(bigBubblerDomes().length, 0);
});

test('a zero timestep freezes the structure', async () => {
  const { f } = await composed();
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  step(f, 10);
  const dome = bigBubblerDomes()[0];
  const radius = dome.radius, t = dome.t, hp = dome.hp;
  for (let i = 0; i < 10; i++) f.G.projectiles.update(0);
  assert.equal(dome.radius, radius, 'pause does not grow the dome');
  assert.equal(dome.t, t);
  assert.equal(dome.hp, hp, 'pause does not burn the canopy');
});

test('the net snapshot is plain serializable state, not live objects', async () => {
  const { f } = await composed();
  const a = roller(f); f.G.actors = [a]; activate(f, a);
  step(f, 20);
  const snapshot = bigBubblerSnapshot();
  assert.equal(snapshot.length, 1);
  assert.equal(JSON.parse(JSON.stringify(snapshot))[0].team, 0);
  for (const key of ['id', 'team', 't', 'pos', 'radius', 'emitterY', 'hp', 'fieldHp', 'ignited']) {
    assert.ok(key in snapshot[0], `snapshot carries ${key}`);
  }
  assert.equal(Array.isArray(snapshot[0].pos), true);
  assert.equal(snapshot[0].ignited, true, '20 ticks is past the pinned IgnitionFrame');
  assert.ok(snapshot[0].radius > 0 && snapshot[0].radius <= BIG_BUBBLER_RAW.maxRadius);
});