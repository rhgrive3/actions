import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const EXTRA = `
  export { installRankedCombat } from './patches/splatoon3/runtime/ranked/combat.mjs';
  export { kitBombContact } from './patches/splatoon3/runtime/kit-subs.mjs';
  export { damageAt } from './inkwave-public/src/game/inkFlight.js';
`;

async function rig({ mode = 'turf', wallOffset = null, decayed = false,
  ghost = false, remote = false, barrierZ = null, deviceZ = 0 } = {}) {
  // adaptBuildSource is the production build's source chain plus the ranked
  // projectile adapter. Keep the real runtime and projectile implementation.
  const f = await fixture({ fullRuntime: true, realProjectiles: true,
    adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource, extraExports: EXTRA });
  f.installRankedCombat({ ...f.installedRuntime, G: f.G });
  const owner = f.make('shooter'), attacker = f.make('shooter');
  owner.team = 0; attacker.team = 1;
  owner.pos.set(30, 0, 30); attacker.pos.set(40, 0, 40);
  owner.weapon = { ...owner.weapon, sub: 'sprinkler' };
  owner.weaponRunner.reset();
  attacker.s3.loadout[2].main = 'runSpeed';
  attacker.remote = remote;
  f.G.actors = [owner, attacker];

  const system = f.G.projectiles;
  const clearWorld = (_from, _to, hit) => { hit.hit = false; return hit; };
  f.G.physics.segment = clearWorld;
  system.throwBomb(owner);
  const device = system.bombs.at(-1);
  assert.ok(device, 'the production throw path creates a native Sprinkler');
  f.kitBombContact(f.SUB, device, { hit: true,
    point: new f.THREE.Vector3(0, 0, deviceZ), normal: new f.THREE.Vector3(0, 1, 0) });
  assert.equal(device.s3Mode, 'sprinkling');

  const match = f.G.match = { mode, state: 'playing', actors: [owner, attacker],
    rankedBarrierHits: [], playing: () => true };
  if (mode === 'rainmaker') match.ranked = { rule: { state: { pos: [0, device.pos.y - 1, barrierZ],
    carrier: null, barrier: { active: true, balance: 0, max: 1000 } } } };

  const p = system._new();
  Object.assign(p, { owner: attacker, team: attacker.team, type: 'round', wid: 'shooter',
    s3Weapon: attacker.weapon, ghost });
  p.pos.set(0, device.pos.y, deviceZ - 0.9);
  p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, 30);
  assert.equal(system.inkFlight.configure(p, 'shooter', 0, 0.125), true);
  // configure sets calibrated hit radius and ghost damage; restore the test lane.
  p.pos.set(0, device.pos.y, deviceZ - 0.9);
  p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, 30);
  const startZ = p.pos.z;
  f.G.physics.segment = (from, to, hit) => {
    hit.hit = false;
    if (wallOffset === null) return hit;
    const plane = startZ + wallOffset;
    if (from.z <= plane && to.z >= plane) {
      hit.hit = true;
      const t = (plane - from.z) / (to.z - from.z);
      hit.point.copy(from).lerp(to, t);
      hit.dist = from.distanceTo(hit.point);
      hit.normal.set(0, 0, -1); hit.face = 0; hit.block = 0;
    }
    return hit;
  };
  if (decayed) {
    p.inkFrame = p.inkProfile.damage.startFrame + 4;
    p.age = p.inkFrame / 60;
    p.inkPhase = 2;
  }
  return { f, system, device, owner, attacker, match, p, startZ };
}

test('profile-guided shooter damages a native Sprinkler with decayed frame damage', async () => {
  const { f, system, device, p } = await rig({ decayed: true });
  const before = device.s3DeviceHP ?? 120;
  assert.equal(system._step(p, 1 / 60), true);
  const expected = f.damageAt(p.inkProfile, p.age);
  assert.ok(expected > 0 && expected < p.inkProfile.damage.max);
  assert.ok(device.s3DeviceHP < before, 'the real profile head reaches the deployed device');
  assert.ok(Math.abs((before - device.s3DeviceHP) - expected) < 1e-9,
    'native device damage uses the profile damage at the actual hit frame');
});

test('native Sprinkler wins before a later world wall, while a nearer world wall wins first', async () => {
  const fartherWall = await rig({ wallOffset: 0.4 });
  const beforeFar = fartherWall.device.s3DeviceHP ?? 120;
  assert.equal(fartherWall.system._step(fartherWall.p, 1 / 60), true);
  assert.ok(fartherWall.device.s3DeviceHP < beforeFar);
  assert.ok(!fartherWall.p.fidelityWallDrop, 'a later wall cannot divert the device hit');

  const nearerWall = await rig({ wallOffset: 0.05 });
  const beforeNear = nearerWall.device.s3DeviceHP ?? 120;
  assert.equal(nearerWall.system._step(nearerWall.p, 1 / 60), false);
  assert.equal(nearerWall.device.s3DeviceHP ?? 120, beforeNear);
  assert.ok(nearerWall.p.fidelityWallDrop, 'the earlier solid wall retains native wall-drop');
});

test('an enemy capsule nearer than a Sprinkler receives the profile head hit first', async () => {
  const { f, system, device, p, startZ } = await rig();
  const victim = f.make('shooter');
  victim.team = 0; victim.pos.set(0, 0, startZ);
  f.G.actors.push(victim);
  const hp = victim.hp, deviceHP = device.s3DeviceHP ?? 120;
  assert.equal(system._step(p, 1 / 60), true);
  assert.ok(victim.hp < hp, 'the source capsule sweep applies damage to the nearer actor');
  assert.equal(device.s3DeviceHP ?? 120, deviceHP, 'the farther device receives no duplicate hit');
});

test('ghost and remote-owned profile heads stop visually without local Sprinkler authority', async () => {
  for (const options of [{ ghost: true }, { remote: true }]) {
    const { system, device, p } = await rig(options);
    const before = device.s3DeviceHP ?? 120;
    assert.equal(system._step(p, 1 / 60), true, 'the visual head still stops at the native device');
    assert.equal(device.s3DeviceHP ?? 120, before);
  }
});

test('Rainmaker shield and native Sprinkler use nearest-hit ordering on the real head step', async () => {
  const deviceFirst = await rig({ mode: 'rainmaker', barrierZ: 1.3 });
  const before = deviceFirst.device.s3DeviceHP ?? 120;
  assert.equal(deviceFirst.system._step(deviceFirst.p, 1 / 60), true);
  assert.ok(deviceFirst.device.s3DeviceHP < before, 'the nearer Sprinkler candidate wins');
  assert.equal(deviceFirst.match.rankedBarrierHits.length, 0, 'the farther shield receives no hit');

  const shieldFirst = await rig({ mode: 'rainmaker', barrierZ: -0.5 });
  const shieldHP = shieldFirst.device.s3DeviceHP ?? 120;
  assert.equal(shieldFirst.system._step(shieldFirst.p, 1 / 60), true);
  assert.equal(shieldFirst.device.s3DeviceHP ?? 120, shieldHP, 'the farther Sprinkler receives no hit');
  assert.equal(shieldFirst.match.rankedBarrierHits.length, 1, 'the nearer shield receives one hit');
});

test('a guest profile hit sends its decayed native damage in the Sprinkler proposal', async () => {
  async function networkRig(myId) {
    const f = await fixture({ fullRuntime: true, realProjectiles: true,
      adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource, extraExports: EXTRA });
    f.installRankedCombat({ ...f.installedRuntime, G: f.G });
    const owner = f.make('shooter'), attacker = f.make('shooter');
    Object.assign(owner, { nid: 301, owner: 'defender', netLife: 3 });
    Object.assign(attacker, { nid: 302, owner: 'attacker', netLife: 7, team: 1 });
    owner.pos.set(30, 0, 30); attacker.pos.set(40, 0, 40);
    const nm = new f.NetMatch({ myId, hostId: 'defender', isHost: myId === 'defender',
      tr: { broadcast() {}, sendTo() {} } }, { id: 'native-profile-device' });
    nm.bind({ actors: [owner, attacker], state: 'playing', time: 180 });
    f.G.netm = nm; f.G.match = nm.match; f.G.actors = [owner, attacker];
    f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
    return { f, owner, attacker, nm, system: f.G.projectiles };
  }

  const host = await networkRig('defender');
  host.owner.weapon = { ...host.owner.weapon, sub: 'sprinkler' };
  host.owner.weaponRunner.reset();
  host.system.throwBomb(host.owner);
  const target = host.system.bombs.at(-1);
  host.f.kitBombContact(host.f.SUB, target, { hit: true,
    point: new host.f.THREE.Vector3(0, 0, 0), normal: new host.f.THREE.Vector3(0, 1, 0) });
  const birth = JSON.parse(JSON.stringify(host.nm.out.find(event => event[1] === 'b')));
  assert.ok(birth, 'the host records the real Sprinkler birth');

  const guest = await networkRig('attacker');
  guest.nm._play('defender', birth);
  const ghost = guest.system.bombs.find(bomb => bomb.owner === guest.owner);
  assert.ok(ghost?.ghost, 'the guest receives a visual device ghost');
  guest.f.kitBombContact(guest.f.SUB, ghost, { hit: true,
    point: new guest.f.THREE.Vector3(0, 0, 0), normal: new guest.f.THREE.Vector3(0, 1, 0) });

  const p = guest.system._new();
  Object.assign(p, { owner: guest.attacker, team: guest.attacker.team, type: 'round',
    wid: 'shooter', s3Weapon: guest.attacker.weapon });
  p.pos.set(0, ghost.pos.y, -0.9); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, 30);
  assert.equal(guest.system.inkFlight.configure(p, 'shooter', 0, 0.125), true);
  p.pos.set(0, ghost.pos.y, -0.9); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, 30);
  p.inkFrame = p.inkProfile.damage.startFrame + 4;
  p.age = p.inkFrame / 60; p.inkPhase = 2;
  const outBefore = guest.nm.out.length;
  assert.equal(guest.system._step(p, 1 / 60), true);
  const proposals = guest.nm.out.slice(outBefore).filter(event => event[1] === 'ac'
    && event[5]?.phase === 'nativeObjectHit');
  assert.equal(proposals.length, 1, 'one real projectile contact sends one device proposal');
  assert.equal(proposals[0][5].damage, guest.f.damageAt(p.inkProfile, p.age));
  assert.ok(proposals[0][5].damage < p.inkProfile.damage.max);
  assert.equal(ghost.s3DeviceHP, 120, 'the guest does not apply remote device damage locally');
});
