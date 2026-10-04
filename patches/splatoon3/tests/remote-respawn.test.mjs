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
