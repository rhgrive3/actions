import test from 'node:test';
import assert from 'node:assert/strict';
import { specialEvidenceFixture } from './special-evidence-fixture.mjs';

const f = await specialEvidenceFixture({ completeBootstrap: true });
function world(phase) {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.camera = new THREE.PerspectiveCamera();
  G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-40, -.5, -40], max: [40, 0, 40] }] });
  G.physics = new f.Physics(G.level);
  const owner = f.make(), local = f.make();
  Object.assign(owner, { nid: 7, owner: 'A', remote: true });
  Object.assign(local, { nid: 8, owner: 'me', isLocal: true });
  G.match = { state: phase, mode: 'turf', duration: 180, time: 90, actors: G.actors,
    local, playing() { return this.state === 'playing'; }, canRespawn: () => false,
    removeActor(actor) { const i = this.actors.indexOf(actor); if (i >= 0) this.actors.splice(i, 1); } };
  const session = { myId: 'me', hostId: 'me', isHost: true, _members: new Set(['me', 'A']),
    tr: { broadcast() { return true; }, sendTo() { return true; } } };
  const n = new f.NetMatch(session, { id: 'bootstrap-replica-retirement', mode: 'turf', map: 'reef' });
  n.bind(G.match); G.netm = n;
  return { owner, local, n };
}

for (const phase of ['intro', 'playing', 'finish']) for (const id of ['beakon', 'splashWall', 'inkMine', 'torpedo', 'waveBreaker', 'splattercolorScreen', 'inkVac']) {
  test(`complete bootstrap ${phase} disconnect policy retires ${id} without changing local devices`, () => {
    const w = world(phase), { G } = f;
    try {
      w.local.weapon = { ...w.local.weapon, sub: 'beakon' };
      const localDevice = G.projectiles.throwBomb(w.local); assert.ok(localDevice && !localDevice.ghost);
      let replica;
      if (['beakon', 'splashWall', 'inkMine', 'torpedo'].includes(id)) {
        w.owner.weapon = { ...w.owner.weapon, sub: id };
        const p = { v: 1, subId: id, phase: 'spawn', seq: 1, eventSeq: 1, life: 0, sourceLife: 0,
          x: 12, y: 0, z: 0, vx: 0, vy: 0, vz: 0, seed: 1, charge: 0, subPowerAP: 0 };
        w.n._play('A', [1, 'ac', 'sub', 7, 0, p]);
        replica = G.projectiles._s3SubObjects.find(o => o.owner === w.owner); assert.ok(replica?.ghost);
      } else if (id !== 'inkVac') {
        w.owner.weapon = { ...w.owner.weapon, special: id };
        w.n._play('A', [1, 'ac', 'special', 7, 0, { id, kind: id === 'waveBreaker' ? 'wave' : 'screen',
          action: 'deploy', activation: 1, object: 1, seed: 1, pos: [12, 0, 0], target: [12, 0, 1],
          phase: 'active', age: 0, landedAt: 0,
          duration: id === 'waveBreaker' ? 6 : 10, radius: id === 'waveBreaker' ? 20 : 15,
          specialPowerAP: 0, hp: id === 'waveBreaker' ? 480 : 0 }]);
        replica = G.projectiles._s3AllSpecialObjects.find(o => o.owner === w.owner); assert.ok(replica?.remote);
      } else {
        w.owner.weapon = { ...w.owner.weapon, special: 'inkVac' };
        w.n.replayKitEvent(f.INK_VAC_EVENTS.activation, { actor: w.owner, kit: 'inkVac', serial: 1, charge: 0 }, 'A');
        assert.ok(f.inkVacState(w.owner));
      }
      w.n.onLeave('A', false);
      if (phase === 'intro') assert.equal(w.n.byNid.has(7), false, 'pre-match departure removes the roster entry');
      else {
        assert.equal(w.owner.owner, null, 'production bootstrap deactivates the human rather than adopting a bot');
        assert.equal(w.owner.alive, false);
      }
      if (replica) assert.equal(replica.dead, true, 'post-install onLeave replacement must still retire catalogue replicas');
      else assert.ok(f.inkVacState(w.owner) === null, 'held replica resources retire at the actual disconnect boundary');
      assert.equal(localDevice.dead, false); assert.ok(G.projectiles._s3SubObjects.includes(localDevice));
    } finally { w.n.dispose(); G.netm = null; }
  });
}
