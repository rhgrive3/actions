// Regression for the queued owner-authenticated InkFlight profile crash.
// Uses the real composed NetMatch -> fidelity packet -> Projectiles ghost path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { validNetworkProjectileCosmetics, validNetworkProjectileInkMeta } from '../snapshot-guard.mjs';

const good = key => ['iw-ink-flight-1', key, 0, 0.5, false];

test('untrusted InkFlight metadata selects only owned profile keys and finite tuple members', async () => {
  const f = await fixture({ productionComposition: true });
  const runner = f.projectiles.inkFlight;
  for (const key of ['shooter', 'dualies', 'splatling']) {
    const meta = good(key);
    const projectile = f.projectiles._new();
    assert.equal(validNetworkProjectileInkMeta(meta), true, key);
    assert.doesNotThrow(() => runner.restore(projectile, meta));
    assert.equal(projectile.inkKey, key, key + ' restores valid profile');
    assert.ok(projectile.inkPlan && Number.isFinite(projectile.inkPlan.first), key);
  }
  for (const key of ['constructor', 'toString', '__proto__', '', 'missing', 17, {}, null]) {
    const meta = good(key), p = f.projectiles._new();
    assert.equal(validNetworkProjectileInkMeta(meta), false, String(key));
    assert.equal(runner.restore(p, meta), false, String(key) + ' must not throw');
    assert.equal(p.inkProfile, null);
    assert.equal(p.inkPlan, null);
  }
  for (const meta of [
    ['iw-ink-flight-1','shooter',-1,.5,false],
    ['iw-ink-flight-1','shooter',2 ** 54,.5,false],
    ['iw-ink-flight-1','shooter',0,NaN,false],
    ['iw-ink-flight-1','shooter',0,Infinity,false],
    ['iw-ink-flight-1','shooter',0,-.1,false],
    ['iw-ink-flight-1','shooter',0,1,false],
    ['iw-ink-flight-1','shooter',0,.5,'false'],
    ['iw-ink-flight-1','shooter',0,.5,false,'extra'],
  ]) {
    assert.equal(validNetworkProjectileInkMeta(meta), false);
    assert.equal(runner.restore(f.projectiles._new(), meta), false);
  }
  for (const meta of [undefined, null, 0, 'legacy', {s3Catalog:{version:1}}]) {
    assert.equal(validNetworkProjectileInkMeta(meta), true, 'non-InkFlight metadata must stay compatible');
  }
});

test('bad authenticated owner packet cannot enter replay FIFO, and a later legal birth still plays', async () => {
  const f = await fixture({ productionComposition: true });
  const nm = f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['p2','P2']]));
  const remote = f.makeActor({ nid:17, owner:'p2', remote:true, roller:false });
  const local = f.makeActor({ nid:1, owner:'me', remote:false, roller:false });
  f.bind(nm, [remote, local]);
  const peer = nm._peer('p2');
  try {
    local.character.getMuzzle = out => out.copy(local.pos).setY(30);
    f.projectiles.fireShooter(local, local.weapon, 0);
    const produced = nm.out.find(e => e[1] === 'p');
    assert.ok(produced && Array.isArray(produced[27]), 'actual Shooter emits source flight metadata');
    const seq = produced.length - 1, tick = seq - 1;
    f.projectiles.clear();
    f.clock.set(1000);
    let accepted = 0;
    for (const key of ['constructor','toString','__proto__','unknown']) {
      const invalid = [...produced];
      invalid[0] = 1000;
      invalid[2] = 17;
      invalid[27] = good(key);
      invalid[tick] = 100;
      invalid[seq] = 1;
      assert.equal(validNetworkProjectileCosmetics(invalid), false, key);
      assert.doesNotThrow(() => nm.onMessage('p2', { k:'t', ts:1000, r:2, u:100, e:[invalid] }), key);
      assert.equal(peer.events.length, 0, key + ' must be rejected before FIFO');
      assert.equal(peer._lastEventSeq || 0, 0, key + ' must not advance replay sequence');
    }
    const valid = [...produced];
    valid[0] = 1000.05;
    valid[2] = 17;
    valid[27] = good('shooter');
    valid[tick] = 103;
    valid[seq] = 2;
    f.clock.advance(.05);
    assert.doesNotThrow(() => nm.onMessage('p2', { k:'t', ts:1000.05, r:2, u:103, e:[valid] }));
    peer.tr = 1000.05; peer.sim = 103;
    assert.doesNotThrow(() => nm._playEvents());
    assert.equal(peer._lastEventSeq, 2);
    const ghosts = f.projectiles.list.filter(p => p.ghost && p.owner === remote);
    assert.equal(ghosts.length, 1, 'valid packet still generates the only authorized remote ghost');
    assert.equal(ghosts[0].inkKey, 'shooter');
    assert.ok(ghosts.every(p => Number.isFinite(p.life) && Number.isFinite(p.pos.x)));
    accepted += ghosts.length;
    assert.equal(accepted, 1);
  } finally { nm.dispose(); }
});
