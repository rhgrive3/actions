import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const close = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
async function setup(points = 0) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [
    { kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] },
    { kind: 'box', min: [-10, 3, -10], max: [10, 4, 0] },
  ] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  const a = f.make('blaster'); delete a._integrate;
  if (points) {
    a.s3.loadout = Array.from({ length: 3 }, (_, i) => ({ main: points === 57 || i === 0 ? 'actionIntensify' : 'none', subs: Array(3).fill(points === 57 ? 'actionIntensify' : 'none') }));
    a.setWeapon('blaster');
  }
  a.pos.set(0, 4, -1.2); a.vel.set(0, 0, 0); a.intent.move.set(0, 0, 1); a.grounded = true;
  const hit = f.G.physics.groundProbe(a.pos.x, a.pos.y, a.pos.z, .4, .35, f.PLAYER.footRadius, a.ground, false);
  assert.equal(hit.hit, true); a.groundN.copy(hit.normal); a._surface();
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 5.05, 100);
  return { ...f, a };
}

async function runLedge(hz, jumping, points = 0) {
  const f = await setup(points), { a } = f, r = a.weaponRunner, clock = new f.FixedClock();
  const rows = [], shots = []; let frame = 0, seed = 1102;
  f.setRandom(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; });
  const push = f.G.projectiles._push;
  f.G.projectiles._push = function (p) {
    shots.push({ frame, grounded: a.grounded, spread: r.spread, active: r.s3BlasterJumpState(a.weapon).active, velocity: Array.from(p.vel.toArray()) });
    return push.call(this, p);
  };
  for (let render = 0; render < hz * 3; render++) clock.advance(1 / hz, dt => {
    a.intent.jump = jumping && frame === 0;
    a.intent.fire = frame > 5 && !a.grounded;
    a.character.root.position.copy(a.pos);
    a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 100));
    f.G.time += dt; a.update(dt);
    const state = r.s3BlasterJumpState(a.weapon);
    rows.push([a.pos.y, a.pos.z, a.grounded, a.s3JumpSerial || 0, r.spread, state.active, state.frames, state.bias]);
    frame++;
  });
  return { f, rows, shots };
}

test('#1102 native walk off a real platform keeps 0-degree gameplay/HUD spread without a jump timer', async () => {
  for (const ap of [0, 10, 57]) {
    const { rows, shots } = await runLedge(60, false, ap);
    const falling = rows.filter(row => !row[2]);
    assert.ok(falling.length > 5, 'native support loss creates genuine fall frames');
    assert.ok(rows.some(row => row[2] && row[0] < 1), 'native actor lands on the lower floor');
    for (const row of falling) { assert.equal(row[3], 0); close(row[4], 0); assert.equal(row[5], false); assert.equal(row[6], null); }
    const fallShots = shots.filter(shot => !shot.grounded);
    assert.ok(fallShots.length > 0, 'the real runner emits during the ledge fall');
    for (const shot of fallShots) { close(shot.spread, 0); assert.equal(shot.active, false); close(shot.velocity[0], 0); close(shot.velocity[1], 0); }
  }
});

test('#1102 actual native jump still admits its 10-degree envelope and 50% state, then persists through landing to 70F', async () => {
  const { rows, shots } = await runLedge(60, true);
  const started = rows.find(row => row[5]);
  assert.ok(started); assert.equal(started[3], 1); close(started[4], 10); close(started[6], 0); close(started[7], .5);
  const at25 = rows.find(row => row[6] != null && Math.abs(row[6] - 25) < 1e-6);
  assert.ok(at25); close(at25[7], .5);
  const landing = rows.find(row => row[2] && row[5]);
  assert.ok(landing, 'landing does not erase legitimate recovery');
  assert.ok(rows.some(row => row[6] > 25 && row[7] < .5 && row[7] > 0));
  assert.ok(rows.some(row => row[2] && row[3] === 1 && !row[5] && row[4] === 0));
  assert.ok(shots.some(shot => shot.active && shot.spread === 10));
});

test('#1102 identical fixed-clock native ledge/jump traces and seeded launch vectors at 30/60/120Hz', async () => {
  for (const jumping of [false, true]) {
    const runs = [];
    for (const hz of [30, 60, 120]) { const { rows, shots } = await runLedge(hz, jumping); runs.push({ rows, shots }); }
    assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[1], runs[2]);
  }
});

test('#1102 resets and weapon changes cannot recreate a penalty on unsupported ground', async () => {
  const f = await setup(), { a } = f, r = a.weaponRunner;
  a.intent.jump = true; f.tick(a); a.intent.jump = false;
  assert.ok(r.s3BlasterJumpState(a.weapon).active, 'start from a native admitted jump');
  for (const reset of [() => r.reset(), () => r.onDeath(), () => { a.setWeapon('shooter'); a.setWeapon('blaster'); }]) {
    reset(); a.grounded = false; r.update(1 / 60, { fire: false });
    assert.equal(r.s3BlasterJumpState(a.weapon).active, false);
    close(r.spread, 0);
  }
});

test('#1102 no-jump owner vector is transmitted exactly and a ghost never acquires local jump spread', async () => {
  const f = await setup(), { a } = f, r = a.weaponRunner, ps = f.G.projectiles;
  a.grounded = false; r.update(1 / 60, { fire: false });
  a.nid = 17; a.isLocal = true;
  const nm = new f.NetMatch({ myId: 'owner', isHost: true, _members: new Map([['owner', 'Owner']]) }, {});
  nm.mute = 0; nm.out = []; nm.eventSeq = 0; nm.isMine = () => true;
  f.G.netm = nm;
  let draws = 0; f.setRandom(() => { draws++; return .25; });
  ps.fireBlaster(a, a.weapon, r.spread);
  const owner = ps.list.at(-1), packet = nm.out.find(event => event[1] === 'p');
  assert.ok(packet); assert.equal(draws, 1, 'straight ledge shot samples only its native seed');
  assert.deepEqual(Array.from(owner.vel.toArray()), Array.from(packet.slice(8, 11)));
  r.s3BlasterJumpT = 0; a.weapon.spreadAir = 99;
  ps.ghostProjectile(a, packet);
  const ghost = ps.list.at(-1);
  assert.equal(ghost.ghost, true); assert.equal(ghost.damage, 0);
  assert.deepEqual(Array.from(ghost.vel.toArray()), Array.from(owner.vel.toArray()));
  assert.equal(nm.out.filter(event => event[1] === 'p').length, 1);
});
