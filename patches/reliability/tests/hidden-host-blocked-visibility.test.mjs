import test from 'node:test';
import assert from 'node:assert/strict';
import { pair, advanceMillis } from './hidden-host-harness.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

for (const blocker of ['webgl', 'freeze', 'pagehide']) {
  test(`#878 hiding an already ${blocker}-suspended host still ends the shared match`, async () => {
    const p = await pair();
    try {
      const owner = p.host.game.platform.owner, before = p.host.snapshot(), time = p.host.f.G.time;
      owner.block(blocker, true);
      assert.equal(p.host.game.platform.hiddenHostClock, null);
      p.host.hide(true);
      assert.equal(p.host.timerCount(), 1, 'visibility owns a deadline even without a second suspend transition');
      p.frames(11, []);
      assert.equal(p.host.m.state, 'finish'); assert.equal(p.guest.m.state, 'finish');
      assert.equal(p.host.m.time, 0); assert.equal(owner.active, false);
      assert.equal(p.host.snapshot().physics, before.physics); assert.equal(p.host.f.G.time, time);
      p.host.hide(false); owner.block(blocker, false);
      assert.equal(p.host.m.time, 0); assert.equal(p.host.timerCount(), 0);
    } finally { p.close(); }
  });
}

test('#878 repeated hidden intervals settle separately while another blocker remains', async () => {
  const p = await pair();
  try {
    const owner = p.host.game.platform.owner;
    owner.block('webgl', true);
    p.host.hide(true); advanceMillis(1000); p.host.hide(true);
    advanceMillis(1000); p.host.hide(false);
    near(p.host.m.time, 8); assert.equal(owner.active, false); assert.equal(p.host.timerCount(), 0);
    advanceMillis(3000); p.host.hide(false); near(p.host.m.time, 8);
    p.host.hide(true); advanceMillis(1000); p.host.hide(false);
    near(p.host.m.time, 7); assert.equal(p.host.game.platform.hiddenHostClock, null);
    owner.block('webgl', false); near(p.host.m.time, 7);
    p.host.hide(false); near(p.host.m.time, 7);
  } finally { p.close(); }
});

test('#878 a hidden interval remains timed when another blocker is acquired before showing', async () => {
  const p = await pair();
  try {
    p.host.hide(true); advanceMillis(2000);
    const owner = p.host.game.platform.owner; owner.block('webgl', true);
    p.host.hide(false); near(p.host.m.time, 8);
    assert.equal(p.host.timerCount(), 0); assert.equal(owner.active, false);
    advanceMillis(2000); owner.block('webgl', false); near(p.host.m.time, 8);
  } finally { p.close(); }
});

test('#878 blocked visibility never retimes a replacement match or departed host', async () => {
  for (const change of ['match', 'owner']) {
    const p = await pair();
    try {
      const owner = p.host.game.platform.owner; owner.block('webgl', true);
      p.host.hide(true); advanceMillis(2000);
      if (change === 'match') p.host.game.match = new p.host.f.Match({ duration: 90 });
      else p.host.s.hostId = p.guest.s.myId;
      p.host.hide(false); assert.equal(p.host.m.time, 10);
      if (change === 'match') assert.equal(p.host.game.match.time, 90);
      assert.equal(p.host.timerCount(), 0); assert.equal(p.host.game.platform.hiddenHostClock, null);
    } finally { p.close(); }
  }
});
