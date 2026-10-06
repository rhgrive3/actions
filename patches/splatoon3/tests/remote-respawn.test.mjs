import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
for (const [cause, expected] of [['shooter', 8.5], ['water', 7], ['fall', 5.5]]) {
  test(`remote ${cause} splat uses the same cause timing as its owner`, async () => {
    const f = await fixture(), victim = f.make();
    victim.remote = true; victim.net = { buf: [], tp: 0 };
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, victim, null, cause);
    assert.equal(victim.respawnTimer, expected);
    assert.equal(victim.alive, false);
    assert.equal(victim.stats.deaths, 1);
    // Repeated packets cannot restart the countdown or count another death.
    victim.respawnTimer -= .25;
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, victim, null, cause);
    assert.equal(victim.respawnTimer, expected - .25);
    assert.equal(victim.stats.deaths, 1);
  });
}

test('proxy respawn clears real wall Surge charge and roll armor like owner reset', async () => {
  const f = await fixture(), proxy = f.make();
  proxy.remote = true; proxy.net = { buf: [], tp: 0 };
  proxy._updateClimb = () => {}; proxy._ledgePop = () => {};
  proxy.form = 'squid'; proxy.climbing = true; proxy.intent.squid = true; proxy.intent.jump = true;
  f.G.actors = [proxy];
  for (let i = 0; i < 6; i++) { f.G.time += 1 / 60; proxy.update(1 / 60); }
  assert.ok(proxy.s3.surge?.charge > 0, 'charge created through actual Actor movement');
  proxy.s3.actions.roll = { armorTime: .3, armorHP: 100 }; proxy.s3.roll = proxy.s3.actions.roll;
  f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, proxy, null, 'shooter');
  f.NetMatch.prototype._remoteRespawn.call({}, proxy);
  assert.equal(proxy.alive, true); assert.equal(proxy.net.spawnPending, true);
  assert.equal(proxy.s3.surge, null); assert.equal(proxy.s3.roll, null);
  assert.equal(proxy.s3.actions, undefined); assert.equal(proxy.anim.surgeCharge, 0);
});
