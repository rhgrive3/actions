import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

const fidelityProfile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));

function emitNativeSlosherVolley(world, actor) {
  const emitter = Object.create(world.Projectiles.prototype);
  Object.assign(emitter, {
    list: [], pool: [], vols: [{ hits: [] }], volI: 0,
    _muzzle: (_actor, out) => out.set(0, 1, 0),
  });
  const net = world.G.netm;
  world.G.netm = null;
  try { world.Projectiles.prototype.fireSlosh.call(emitter, actor, world.WEAPONS.slosher); }
  finally { world.G.netm = net; }
  return emitter.list[0];
}

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
    const disposable = new owner.Projectiles(new owner.THREE.Scene());
    disposable._s3SlosherOwnerGroups = groups;
    disposable.clear();
    assert.equal(groups.size, 0, 'projectile reset releases per-match owner group state');
  } finally {
    shooter.dispose(); owner.dispose();
  }
});

test('host adoption gives a reused Slosher volley id an independent victim budget', async () => {
  const oldOwner = await combatWorld('A', { network: true });
  const newHost = await combatWorld('B', { network: true });
  const victimOwner = await combatWorld('C', { network: true });
  try {
    const oldFidelity = await import('../runtime/weapons-fidelity.mjs?issue627-client-old');
    const hostFidelity = await import('../runtime/weapons-fidelity.mjs?issue627-client-host');
    oldFidelity.installWeaponsFidelity(oldOwner, fidelityProfile);
    hostFidelity.installWeaponsFidelity(newHost, fidelityProfile);
    oldOwner.attacker.setWeapon('slosher');
    newHost.attacker.setWeapon('slosher');
    victimOwner.attacker.setWeapon('slosher');

    oldOwner.victim.owner = 'C'; oldOwner.victim.remote = true;
    newHost.victim.owner = 'C'; newHost.victim.remote = true;
    victimOwner.victim.owner = 'C'; victimOwner.victim.remote = false;
    victimOwner.victim.hp = 100; victimOwner.victim.alive = true; victimOwner.victim.invuln = 1 / 60;

    const oldRound = emitNativeSlosherVolley(oldOwner, oldOwner.attacker);
    assert.equal(oldRound.s3DamageGroupId, '1:1', 'the old owner emitted NID 1, volley counter 1');
    const sendOldHit = () => {
      oldOwner.applyProjectileHit(oldOwner.G.projectiles, oldRound, oldOwner.victim, 30, oldOwner.victim.pos);
      const packet = oldOwner.wire.at(-1).data;
      assert.equal(packet.k, 'hit');
      assert.equal(packet.g, oldRound.s3DamageGroupId);
      victimOwner.net.onMessage('A', packet);
      return packet;
    };

    sendOldHit();
    assert.equal(victimOwner.victim.hp, 100, 'protected contact does not spend the accepted damage budget');
    victimOwner.victim.invuln = 0;
    sendOldHit();
    assert.equal(victimOwner.victim.hp, 70, 'the same volley is accepted after protection ends');
    sendOldHit();
    assert.equal(victimOwner.victim.hp, 70, 'same-owner duplicate hit remains deduplicated');

    newHost.net.s.hostId = 'B'; newHost.net.s.isHost = true;
    newHost.net.onLeave('A', true);
    victimOwner.net.s.hostId = 'B'; victimOwner.net.s.isHost = false;
    victimOwner.net.onLeave('A', false);
    assert.equal(newHost.attacker.owner, 'B', 'the real onLeave path transfers actor ownership to the host');
    assert.equal(newHost.attacker.nid, oldOwner.attacker.nid, 'adoption preserves the actor NID');
    assert.equal(newHost.attacker.remote, false, 'the new host adopts the actor locally');
    assert.equal(victimOwner.attacker.owner, 'B', 'the victim owner recognizes the new authenticated sender');

    const newRound = emitNativeSlosherVolley(newHost, newHost.attacker);
    assert.equal(newRound.s3DamageGroupId, oldRound.s3DamageGroupId,
      'independent client counters emit the same NID and volley counter after handoff');
    const sendNewHit = () => {
      newHost.applyProjectileHit(newHost.G.projectiles, newRound, newHost.victim, 30, newHost.victim.pos);
      const packet = newHost.wire.at(-1).data;
      assert.equal(packet.k, 'hit');
      assert.equal(packet.g, newRound.s3DamageGroupId);
      victimOwner.net.onMessage('B', packet);
    };
    sendNewHit();
    assert.equal(victimOwner.victim.hp, 40, 'a new owner gets an independent budget despite the reused volley id');
    sendNewHit();
    assert.equal(victimOwner.victim.hp, 40, 'the new owner still deduplicates its own repeated hit');

    const groups = victimOwner.G.projectiles._s3SlosherOwnerGroups;
    assert.equal(groups.size, 2, 'the accepted ledgers are scoped to the old and current owner');
    assert.ok([...groups.values()].every(group => Object.prototype.toString.call(group) === '[object WeakMap]'),
      'victim budgets do not retain Actor keys strongly');
    const disposable = new victimOwner.Projectiles(new victimOwner.THREE.Scene());
    disposable._s3SlosherOwnerGroups = groups;
    disposable.clear();
    assert.equal(groups.size, 0, 'native projectile clear releases per-match owner group state');
  } finally {
    oldOwner.dispose(); newHost.dispose(); victimOwner.dispose();
  }
});
