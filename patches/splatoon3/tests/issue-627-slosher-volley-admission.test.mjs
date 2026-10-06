import test from 'node:test';
import assert from 'node:assert/strict';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

test('a Slosher hit rejected by the real Actor leaves the volley budget for a later accepted hit', async () => {
  const w = await combatWorld('A');
  try {
    const { G, attacker, victim } = w;
    G.netm = null;
    victim.owner = 'A';
    victim.hp = 100; victim.alive = true; victim.invuln = 1 / 60;
    const group = new Map();
    const p = { owner: attacker, s3Weapon: { kind: 'slosher' }, damage: 70,
      s3DamageGroup: group, s3DamageGroupId: 'A:slosh:1', wid: 'slosher' };

    w.applyProjectileHit(G.projectiles, p, victim, 70, victim.pos);
    assert.equal(victim.hp, 100, 'the real Actor rejects this invulnerable contact');
    assert.equal(group.has(victim), false, 'rejected damage must not consume the volley maximum');

    victim.invuln = 0;
    w.applyProjectileHit(G.projectiles, p, victim, 70, victim.pos);
    assert.equal(victim.hp, 30, 'the first vulnerable contact still applies the 70 maximum');
    assert.equal(group.get(victim), 70);
    w.applyProjectileHit(G.projectiles, p, victim, 70, victim.pos);
    assert.equal(victim.hp, 30, 'duplicate contacts in one volley do not apply damage twice');

    victim.hp = 100; victim.alive = true;
    const nextVolley = { ...p, s3DamageGroup: new Map(), s3DamageGroupId: 'A:slosh:2' };
    w.applyProjectileHit(G.projectiles, nextVolley, victim, 70, victim.pos);
    assert.equal(victim.hp, 30, 'a fresh volley gets an independent budget');

    const pooled = { ...p };
    const recycled = w.Projectiles.prototype._new.call({ pool: [pooled] });
    assert.equal(recycled, pooled);
    assert.equal(recycled.s3DamageGroup, null, 'pooled rounds drop the prior volley map');
    assert.equal(recycled.s3DamageGroupId, null, 'pooled rounds drop the prior volley identity');
  } finally {
    w.dispose();
  }
});

test('the victim owner commits only accepted Slosher damage for a remote volley', async () => {
  const shooter = await combatWorld('A', { network: true });
  const owner = await combatWorld('B', { network: true });
  try {
    const { G, attacker, victim } = shooter;
    const { victim: ownedVictim } = owner;
    ownedVictim.hp = 100; ownedVictim.alive = true; ownedVictim.invuln = 1 / 60;
    const p = { owner: attacker, s3Weapon: { kind: 'slosher' }, damage: 70,
      s3DamageGroup: new Map(), s3DamageGroupId: 'A:slosh:9', wid: 'slosher' };
    const hit = () => {
      shooter.applyProjectileHit(G.projectiles, p, victim, 70, victim.pos);
      const packet = shooter.wire.at(-1).data;
      assert.equal(packet.k, 'hit');
      assert.equal(packet.g, p.s3DamageGroupId, 'the owner request carries the Slosher volley identity');
      owner.net.onMessage('A', packet);
    };

    hit();
    assert.equal(ownedVictim.hp, 100, 'the victim owner rejects the protected hit');
    ownedVictim.invuln = 0;
    hit();
    assert.equal(ownedVictim.hp, 30, 'the owner accepts the next contact after protection ends');
    hit();
    assert.equal(ownedVictim.hp, 30, 'the owner deduplicates later contacts from that volley');
    const groups = owner.G.projectiles._s3SlosherOwnerGroups;
    assert.equal(groups.size, 1);
    const disposable = { _s3SlosherOwnerGroups: groups, list: [], pool: [], bombs: [], clouds: [], beams: [],
      sights: new Map(), blobs: { count: 0 }, scene: { remove() {} } };
    owner.Projectiles.prototype.clear.call(disposable);
    assert.equal(groups.size, 0, 'projectile reset releases per-match owner group state');
  } finally {
    shooter.dispose(); owner.dispose();
  }
});
