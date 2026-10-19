import assert from 'node:assert/strict';
import test from 'node:test';
import { pair, advanceMillis } from './hidden-host-harness.mjs';

test('#878 OS-frozen host timers cannot strand a visible guest at zero', async () => {
  const p = await pair();
  try {
    p.host.hide(true);
    const before = p.host.snapshot();
    // Keep the WebSocket open but run neither host RAF nor ANY host timeout.
    p.frames(30, [p.guest], { timers: false });
    assert.equal(p.host.m.state, 'playing');
    assert.equal(p.host.snapshot().physics, before.physics);
    assert.equal(p.guest.s.state, 'error');
    assert.equal(p.guest.snapshot().aborted, 1);
    assert.equal(p.guest.game.match, null);
    assert.equal(p.guest.m.result, null, 'a follower must not fabricate a score');
    p.guest.nm.onMessage(p.host.s.myId, { k:'st', s:'playing', t:10 });
    assert.equal(p.guest.game.match, null, 'late host traffic cannot restore this battle');
  } finally { p.close(); }
});

test('#878 ordinary hidden-host results arrive before the guest connection deadline', async () => {
  const p = await pair();
  try {
    p.host.hide(true); p.frames(30);
    assert.equal(p.guest.m.state, 'judge');
    assert.ok(p.guest.m.result);
    assert.equal(p.guest.snapshot().aborted, 0);
  } finally { p.close(); }
});

test('#878 a guest already waiting in finish is also bounded if the result never arrives', async () => {
  const p = await pair();
  try {
    p.host.m.time = 0; p.host.m.setState('finish'); p.host.hide(true);
    p.frames(10, [p.guest], { timers: false });
    assert.equal(p.guest.s.state, 'error');
    assert.equal(p.guest.snapshot().aborted, 1);
  } finally { p.close(); }
});

test('#878 positive clock correction and match replacement retire a stale guest wait', async () => {
  for (const change of ['clock', 'match', 'host', 'paused', 'offline']) {
    const p = await pair();
    try {
      p.guest.m.time = 0;
      p.frames(1, [p.guest], { timers: false });
      assert.ok(p.guest.game.platform.guestEndWait);
      if (change === 'clock') p.guest.m.time = 90;
      if (change === 'match') p.guest.game.match = new p.guest.f.Match({ duration:90, mode:'turf' });
      if (change === 'host') { p.guest.s.hostId = p.guest.s.myId; p.guest.m.follower = false; }
      if (change === 'paused') p.guest.m.paused = true;
      if (change === 'offline') p.guest.s.state = 'offline';
      p.frames(10, [p.guest], { timers: false });
      assert.equal(p.guest.snapshot().aborted, 0, change);
      assert.equal(p.guest.game.platform.guestEndWait, null, change);
    } finally { p.close(); }
  }
});


test('#878 pending No Contest also exits when the frozen host cannot announce its end', async () => {
  const p=await pair();
  try {
    for(const c of [p.host,p.guest]){c.m.s3NoContest=true;c.nm.s3NoContestRemaining=6;}
    p.host.hide(true);p.frames(20,[p.guest],{timers:false});
    assert.equal(p.guest.snapshot().aborted,1);
    assert.equal(p.guest.m.result,null,'no ordinary winner is invented for a cancelled battle');
  } finally {p.close();}
});


test('#878 suspending the guest grants queued host traffic a fresh recovery window on resume', async () => {
  const p=await pair();
  try {
    p.host.hide(true);p.guest.m.time=0;
    p.frames(1,[p.guest],{timers:false});
    assert.ok(p.guest.game.platform.guestEndWait);
    p.guest.hide(true);advanceMillis(120000);p.guest.hide(false);p.guest.frame();
    assert.equal(p.guest.snapshot().aborted,0,'guest background time cannot consume a visible recovery allowance');
    p.frames(1,[p.guest],{timers:false});
    assert.equal(p.guest.snapshot().aborted,0);
    p.frames(9,[p.guest],{timers:false});
    assert.equal(p.guest.snapshot().aborted,1,'the fresh window is still bounded');
  } finally {p.close();}
});
