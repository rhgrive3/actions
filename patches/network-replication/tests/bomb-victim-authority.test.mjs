import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './robustness-fixture.mjs';

function damageActor(actor) {
  actor.damage = function (damage) {
    this.hp -= damage;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return !this.alive;
  };
  actor.netLife = 0;
  actor._netLifeStartedAt = 1000;
  return actor;
}

function addActors(f, nm, attacker, victim) {
  f.bind(nm, [attacker, victim]);
  f.G.actors = [attacker, victim];
}

function ghostBomb(f, attacker, { bornLocal = 999.5, age = 1 } = {}) {
  const bomb = f.projectiles.ghostBomb(attacker, 'bomb', 0, 0.6, 0, 0, 0, 0);
  bomb._netBornLocal = bornLocal;
  bomb.age = age;
  return bomb;
}

test('bomb damage follows the victim owner view when attack and victim positions disagree', async () => {
  const attackerView = await fixture();
  const victimView = await fixture();
  try {
    const sent = [];
    const shooterSession = attackerView.makeSession('p1', 'p1');
    shooterSession.tr.sendTo = (to, data) => sent.push({ to, data });
    const shooterNet = attackerView.makeNetMatch(shooterSession);
    const shooter = damageActor(attackerView.makeActor({ nid: 1, owner: 'p1', remote: false, team: 0, roller: false }));
    const remoteVictim = damageActor(attackerView.makeActor({ nid: 2, owner: 'p2', remote: true, team: 1, roller: false }));
    addActors(attackerView, shooterNet, shooter, remoteVictim);
    remoteVictim.pos.set(0, 0.6, 5); // attack owner sees the victim inside the blast
    attackerView.G.projectiles.applyHit(shooter, remoteVictim, 30, 'bomb');
    assert.equal(remoteVictim.hp, 100, 'shooter-side bomb geometry cannot damage a remote victim');
    assert.deepEqual(sent, [], 'bomb authority does not send a shooter-side damage packet');
    attackerView.G.projectiles.applyHit(shooter, remoteVictim, 30, 'shooter');
    assert.equal(sent.length, 1, 'non-bomb shooter hits still use the existing packet route');

    const victimNet = victimView.makeNetMatch(victimView.makeSession('p2', 'p1'));
    const remoteAttacker = damageActor(victimView.makeActor({ nid: 1, owner: 'p1', remote: true, team: 0, roller: false }));
    const localVictim = damageActor(victimView.makeActor({ nid: 2, owner: 'p2', remote: false, team: 1, roller: false }));
    addActors(victimView, victimNet, remoteAttacker, localVictim);
    localVictim.pos.set(0, 0.6, 9); // victim owner sees the same explosion outside the blast
    victimView.projectiles._explodeBomb(ghostBomb(victimView, remoteAttacker));
    assert.equal(localVictim.hp, 100, 'victim outside its own bomb radius takes no damage');
    localVictim.pos.set(0, 0.6, 5); // opposite view: victim owner is inside while attacker may be outside
    victimView.projectiles._explodeBomb(ghostBomb(victimView, remoteAttacker));
    assert.ok(localVictim.hp < 100, 'victim inside its own bomb radius takes damage');
  } finally {
    attackerView.G.netm?.dispose();
    victimView.G.netm?.dispose();
  }
});

test('bomb ghost keeps native LOS and damage bands and does not replay damage into a later life', async () => {
  const f = await fixture();
  try {
    class CharacterStub {
      constructor() { this.root = { position: new f.THREE.Vector3(), rotation: { y: 0 } }; }
      setVisible() {}
      setHurt() {}
    }
    f.G.physics.groundProbe = () => ({ hit: false });
    const spawned = new f.Actor({ team: 1, name: 'spawn-life', CharacterClass: CharacterStub });
    spawned.spawnAt(new f.THREE.Vector3(), 0);
    assert.equal(spawned.netLife, 1);
    assert.ok(Number.isFinite(spawned._netLifeStartedAt), 'the installed spawn path records recipient life time');

    const nm = f.makeNetMatch(f.makeSession('p2', 'p1'));
    const attacker = damageActor(f.makeActor({ nid: 1, owner: 'p1', remote: true, team: 0, roller: false }));
    const victim = damageActor(f.makeActor({ nid: 2, owner: 'p2', remote: false, team: 1, roller: false }));
    addActors(f, nm, attacker, victim);
    victim.pos.set(0, 0.6, 2);

    f.G.physics.los = () => false;
    f.projectiles._explodeBomb(ghostBomb(f, attacker));
    assert.equal(victim.hp, 100, 'blocked line of sight prevents victim-owner damage');

    f.G.physics.los = () => true;
    f.projectiles._explodeBomb(ghostBomb(f, attacker));
    assert.equal(victim.hp, 0, 'native close-blast damage remains unchanged');

    victim.alive = true; victim.hp = 100; victim.netLife++;
    victim._netLifeStartedAt = 1001;
    f.projectiles._explodeBomb(ghostBomb(f, attacker, { bornLocal: 999.5, age: 1 }));
    assert.equal(victim.hp, 100, 'an explosion timestamp before the current life cannot hit after respawn');

    f.projectiles._explodeBomb(ghostBomb(f, attacker, { bornLocal: 1000.5, age: 1 }));
    assert.equal(victim.hp, 0, 'the same blast geometry applies after the current life has begun');
  } finally { f.G.netm?.dispose(); }
});

test('one ordered bomb birth is replayed once, old bomb hit packets are ignored, and shooter hits still work', async () => {
  const f = await fixture();
  try {
    const nm = f.makeNetMatch(f.makeSession('p2', 'p1'));
    const attacker = damageActor(f.makeActor({ nid: 1, owner: 'p1', remote: true, team: 0, roller: false }));
    const victim = damageActor(f.makeActor({ nid: 2, owner: 'p2', remote: false, team: 1, roller: false }));
    addActors(f, nm, attacker, victim);
    nm.peers.set('p1', { tr: 1000, off: 0, _lastEventSeq: 0 });

    const birth = Object.assign([999.5, 'b', attacker.nid, 'bomb', 0, 0.6, 0, 0, 0, 0, 60000, 7], {
      _netTick: 60000,
      _netSeq: 7,
    });
    nm._play('p1', birth);
    nm._play('p1', birth);
    assert.equal(f.projectiles.bombs.filter((bomb) => bomb.ghost).length, 1, 'duplicate event sequence cannot create a second bomb');
    assert.equal(f.projectiles.bombs.find((bomb) => bomb.ghost)._netBornLocal, 999.5, 'birth timestamp maps through the peer clock offset');

    nm.onMessage('p1', { k: 'hit', v: victim.nid, a: attacker.nid, d: 100, w: 'bomb', l: victim.netLife, h: 1 });
    assert.equal(victim.hp, 100, 'legacy shooter-authority bomb hit packets cannot duplicate recipient damage');

    nm.onMessage('p1', { k: 'hit', v: victim.nid, a: attacker.nid, d: 30, w: 'shooter', l: victim.netLife, h: 1 });
    assert.equal(victim.hp, 70, 'non-bomb shooter-authoritative hits retain their existing route');
  } finally { f.G.netm?.dispose(); }
});
