import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

for (const [label, velocity] of [['forward', 4.32], ['backward', -4.32], ['stationary', 0]]) {
  test(`#312 native ${label} Shooter birth replays its inherited velocity once`, async () => {
    const f = await fixture(), nm = f.makeNetMatch(f.makeSession());
    const a = f.makeActor({ nid: 0, owner: 'me', roller: false });
    a.character.getMuzzle = out => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, .3));
    a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 100));
    a.weapon = f.WEAPONS.shooter; a.yaw = 0; a.vel.set(0, 0, velocity); f.bind(nm, [a]);
    try {
      f.projectiles.fireShooter(a, a.weapon, 0);
      const owner = f.projectiles.list[0], expected = Array.from(owner.vel.toArray());
      assert.ok(Math.abs(expected[2] - (a.weapon.projSpeed + velocity * 2)) < 1e-9);
      const packet = JSON.parse(JSON.stringify(nm.out.find(e => e[1] === 'p')));
      assert.deepEqual(packet.slice(8, 11), expected, 'real recorder publishes post-inheritance velocity');
      assert.equal(packet.length, 32, 'wire envelope stays unchanged');
      f.projectiles.clear(); a.remote = true; a.owner = 'p2'; a.vel.set(0, 0, velocity * 3);
      nm.peers.set('p2', { tr: packet[0] });
      nm._play('p2', packet); nm._play('p2', packet);
      assert.equal(f.projectiles.list.length, 1, 'duplicate birth is admitted once');
      const ghost = f.projectiles.list[0];
      assert.equal(ghost.ghost, true);
      assert.deepEqual(Array.from(ghost.vel.toArray()), expected, 'remote actor velocity never applies a second inheritance');
    } finally { nm.dispose(); }
  });
}
