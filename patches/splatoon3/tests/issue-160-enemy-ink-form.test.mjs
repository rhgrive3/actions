import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

const DT = 1 / 60;
const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function installPaintedFloor(f) {
  const V = f.THREE.Vector3;
  const center = new V(0, -0.1, 0), half = new V(20, 0.1, 20);
  const block = { id: 0, solid: true, center, half,
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1],
    aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  const level = { blocks: [block],
    faces: [{ origin: new V(-20, 0, -20), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, spawnBarrier: 0,
    spawnPads: [new V(-18, 0, 0), new V(18, 0, 0)],
    queryBlocks: (_x, _z, _xx, _zz, out) => {
      out.length = 0;
      for (let i = 0; i < level.blocks.length; i++) out.push(i);
      return out;
    } };
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.paint = { sample: (face, u) => face === 0 ? (u < 20 ? 1 : 2) : 0, splat: () => 0 };
  return level;
}

function addOwnWall(f, level) {
  const V = f.THREE.Vector3;
  const center = new V(-0.3, 2.5, 0), half = new V(0.1, 2.5, 5);
  level.blocks.push({ id: 1, solid: true, center, half,
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [2, 1, -1, -1, -1, -1],
    aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) });
  level.faces.push({ origin: new V(-0.4, 0, -5), u: new V(0, 0, 1), v: new V(0, 1, 0) });
  f.G.physics = new f.Physics(level);
  const sample = f.G.paint.sample;
  f.G.paint.sample = (face, u, v) => face === 1 ? 1 : sample(face, u, v);
}

async function nativeActorAt(f, x) {
  const a = f.make();
  // Keep the public Actor's real frame, movement, ground probe, body collision and resource update.
  delete a._integrate;
  delete a._finishFrame;
  delete a._spawnBarrier;
  a.character.update = () => {};
  a.isLocal = true;
  a.pos.set(x, 0, 0);
  a.vel.set(0, 0, 0);
  const ground = f.G.physics.groundProbe(x, 0, 0, 0.4, 0.35, f.PLAYER.footRadius, a.ground, false);
  assert.equal(ground.hit, true, 'the native ground probe finds the actual floor geometry');
  a.grounded = true;
  a.groundN.copy(ground.normal);
  a._surface();
  return a;
}

function tick(f, a, dt = DT) {
  f.G.time += dt;
  a.update(dt);
}

test('Issue 160 baseline: original native Actor retains squid collision on enemy ground', async () => {
  const f = await fixture({ adapt: (_rel, source) => source });
  installPaintedFloor(f);
  const a = await nativeActorAt(f, 1);
  a.form = 'squid'; a.intent.squid = true; a._prevIntent.squid = true;
  const nativeCollide = f.G.physics.collideBody.bind(f.G.physics);
  const collisionForms = [];
  f.G.physics.collideBody = (...args) => {
    collisionForms.push({ height: args[3], skipsGrates: args[6] });
    return nativeCollide(...args);
  };
  tick(f, a);
  assert.equal(a.groundTeam, 2);
  assert.equal(a.form, 'squid', 'unadapted main fails the enemy-ground humanoid expectation');
  assert.deepEqual(collisionForms.at(-1), { height: f.PLAYER.squidHeight, skipsGrates: true },
    'the retained form reaches actual native body and grate collision');
});

test('Issue 160: held Swim exits on enemy ink before native body and grate collision', async () => {
  const f = await fixture({ adaptRuntime: adaptSource });
  installPaintedFloor(f);
  const a = await nativeActorAt(f, 1);
  a.form = 'squid';
  a.submerged = false;
  a.intent.squid = true;
  a._prevIntent.squid = true;
  a._evForm = 'squid';
  a._evSub = true;
  assert.equal(a.groundTeam, 2, 'surface ownership comes from the real floor face UV');

  const sounds = [];
  f.G.audio = { play: (name) => sounds.push(name) };
  const nativeCollide = f.G.physics.collideBody.bind(f.G.physics);
  const collisionForms = [];
  f.G.physics.collideBody = (...args) => {
    collisionForms.push({ height: args[3], skipsGrates: args[6] });
    return nativeCollide(...args);
  };

  const beforeHp = a.hp;
  tick(f, a);
  assert.equal(a.form, 'kid', 'enemy ink invalidates held Swim');
  assert.equal(a.submerged, false);
  assert.equal(a.onEnemy, true);
  assert.deepEqual(collisionForms.at(-1), { height: f.PLAYER.height, skipsGrates: false },
    'the first native body collision on enemy ground uses humanoid dimensions and grate admission');
  close(beforeHp - a.hp, f.profile.resources.enemyInkDps * DT);
  assert.equal(sounds.filter((name) => name === 'squid_out').length, 1);

  for (let i = 0; i < 12; i++) {
    tick(f, a);
    assert.equal(a.form, 'kid', 'held Swim cannot re-enter squid form on enemy ink');
    assert.equal(a.onEnemy, true);
    assert.deepEqual(collisionForms.at(-1), { height: f.PLAYER.height, skipsGrates: false });
  }
  assert.equal(sounds.filter((name) => name === 'squid_out').length, 1,
    'a grounded enemy-ink hold emits no repeating emerge sound');
  assert.equal(sounds.filter((name) => name === 'squid_in').length, 0);
  close(beforeHp - a.hp, f.profile.resources.enemyInkDps * 13 * DT);
});

test('Issue 160: actual floor crossing exits before the next collision and restores on own ink at 30/60/120 Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture({ adaptRuntime: adaptSource });
    installPaintedFloor(f);
    const a = await nativeActorAt(f, -0.1), dt = 1 / hz;
    a.form = 'squid'; a.submerged = true;
    a.intent.squid = true; a._prevIntent.squid = true;
    a.intent.move.set(1, 0, 0);
    a.vel.set(f.profile.player.swimSpeed, 0, 0);
    const resolvedForms = [];
    const nativeResolve = a._resolve;
    a._resolve = function (isSquid, ...args) {
      resolvedForms.push(isSquid);
      return nativeResolve.call(this, isSquid, ...args);
    };

    let entered = false;
    for (let i = 0; i < hz; i++) {
      tick(f, a, dt);
      if (a.pos.x > 0 && a.grounded && a.groundTeam === 2) { entered = true; break; }
    }
    assert.equal(entered, true, `${hz}Hz crossed the real paint boundary`);
    assert.equal(a.form, 'squid', 'the current frame used its pre-movement own-ink sample');
    tick(f, a, dt);
    assert.equal(a.form, 'kid', `${hz}Hz exits after the new ground surface is sampled`);
    assert.equal(resolvedForms.at(-1), false, `${hz}Hz passes humanoid form into native collision`);
    assert.equal(a.onEnemy, true);

    for (let i = 0; i < hz / 4; i++) {
      tick(f, a, dt);
      assert.equal(a.form, 'kid', `${hz}Hz remains humanoid during the held enemy-ink interval`);
      assert.equal(a.groundTeam, 2);
    }

    a.intent.move.set(-1, 0, 0);
    let returned = false;
    for (let i = 0; i < hz * 5; i++) {
      tick(f, a, dt);
      if (a.grounded && a.groundTeam === 1) { returned = true; break; }
    }
    assert.equal(returned, true, `${hz}Hz returned to the actual own-ink side`);
    assert.equal(a.form, 'kid', 'ground recovery is sampled after this frame movement');
    tick(f, a, dt);
    assert.equal(a.form, 'squid', `${hz}Hz held Swim becomes eligible again on own ink`);
    assert.equal(a.submerged, true);
    assert.equal(resolvedForms.at(-1), true);
  }
});

test('neutral ground and own-ink wall climbing keep their existing Swim eligibility', async () => {
  const neutral = await fixture({ adaptRuntime: adaptSource });
  installPaintedFloor(neutral);
  neutral.G.paint.sample = () => 0;
  const dry = await nativeActorAt(neutral, -1);
  dry.intent.squid = true;
  tick(neutral, dry);
  assert.equal(dry.groundTeam, 0);
  assert.equal(dry.form, 'squid', 'neutral ground remains dry-squid eligible');
  assert.equal(dry.submerged, false);

  const wall = await fixture({ adaptRuntime: adaptSource });
  const level = installPaintedFloor(wall);
  addOwnWall(wall, level);
  const climber = await nativeActorAt(wall, -1);
  climber.intent.squid = true; climber.intent.move.set(1, 0, 0);
  tick(wall, climber);
  assert.equal(climber.form, 'squid');
  assert.equal(climber.climbing, true, 'the actual own-ink wall face still admits climb');
});

test('enemy jump, airborne Swim, fire priority, weapon busy, and Super Jump ownership stay native', async () => {
  const f = await fixture({ adaptRuntime: adaptSource });
  installPaintedFloor(f);
  const jumper = await nativeActorAt(f, 1);
  jumper.form = 'squid'; jumper.intent.squid = true; jumper._prevIntent.squid = true;
  jumper.intent.jump = true;
  const jumpForms = [];
  const nativeResolve = jumper._resolve;
  jumper._resolve = function (isSquid, ...args) {
    jumpForms.push(isSquid);
    return nativeResolve.call(this, isSquid, ...args);
  };
  tick(f, jumper);
  assert.equal(jumper.form, 'kid');
  assert.equal(jumper.grounded, false, 'enemy-ground jump remains available');
  assert.equal(jumpForms.at(-1), false, 'the enemy-ground jump starts with humanoid collision');
  tick(f, jumper);
  assert.equal(jumper.form, 'squid', 'airborne held Swim keeps its existing dry-squid state');
  assert.equal(jumpForms.at(-1), true);

  const local = await nativeActorAt(f, -1);
  local.intent.squid = true;
  tick(f, local);
  assert.equal(local.form, 'squid');
  local.intent.fire = true;
  tick(f, local);
  assert.equal(local.form, 'kid', 'a newer Fire press keeps the existing form priority');

  const busy = await nativeActorAt(f, -1);
  busy.form = 'squid'; busy.intent.squid = true; busy._prevIntent.squid = true;
  busy.weaponRunner.busy = () => true;
  tick(f, busy);
  assert.equal(busy.form, 'kid', 'a busy weapon runner still blocks ordinary Swim entry');

  const jumpAbility = await nativeActorAt(f, 1);
  jumpAbility.intent.squid = true; jumpAbility._prevIntent.squid = true;
  assert.equal(jumpAbility.superJump(new f.THREE.Vector3(5, 0, 0)), true);
  assert.equal(jumpAbility.form, 'squid', 'Super Jump keeps its ability-owned form');
  tick(f, jumpAbility);
  assert.equal(jumpAbility.form, 'squid', 'ground eligibility does not rewrite a Super Jump charge');
  assert.equal(jumpAbility.superJumpState.phase, 'charge');
});

test('enemy-ground form eligibility also applies to remote actors and leaves death/respawn lifecycle intact', async () => {
  const f = await fixture({ adaptRuntime: adaptSource });
  installPaintedFloor(f);

  const remote = await nativeActorAt(f, 1);
  remote.isLocal = false;
  remote.remote = true;
  remote.form = 'squid'; remote.intent.squid = true; remote._prevIntent.squid = true;
  const remoteCollision = [];
  const nativeCollide = f.G.physics.collideBody.bind(f.G.physics);
  f.G.physics.collideBody = (...args) => {
    remoteCollision.push({ height: args[3], skipsGrates: args[6] });
    return nativeCollide(...args);
  };
  tick(f, remote);
  assert.equal(remote.form, 'kid', 'remote actors use the same grounded enemy-ink form rule');
  assert.deepEqual(remoteCollision.at(-1), { height: f.PLAYER.height, skipsGrates: false });
  assert.equal(remote.anim.form, 'kid', 'the remote actor visual state follows native humanoid collision');

  const life = await nativeActorAt(f, 1);
  life.form = 'squid'; life.intent.squid = true; life._prevIntent.squid = true;
  let deadCollisionCount = 0;
  f.G.physics.collideBody = (...args) => { deadCollisionCount++; return nativeCollide(...args); };
  life.splat(null);
  tick(f, life);
  assert.equal(life.alive, false);
  assert.equal(life.form, 'squid', 'the dead actor does not run ordinary form selection');
  assert.equal(deadCollisionCount, 0, 'the dead actor does not enter native movement collision');
  life.respawn();
  assert.equal(life.alive, true);
  assert.equal(life.form, 'kid', 'native respawn reset still starts in kid form');
  assert.equal(life.superJumpState, null);
});
