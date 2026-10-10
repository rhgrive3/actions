import test from 'node:test';
import assert from 'node:assert/strict';
import { pair, advanceMillis } from './hidden-host-harness.mjs';

function resultReached(p) {
  assert.equal(p.host.m.state, 'judge'); assert.equal(p.guest.m.state, 'judge');
  assert.ok(p.host.m.result); assert.ok(p.guest.m.result);
  assert.deepEqual(Array.from(p.guest.m.result.coverage), Array.from(p.host.m.result.coverage));
  assert.equal(p.guest.m.result.winner, p.host.m.result.winner);
  assert.equal(p.host.timerCount(), 0);
}

for (const seconds of [14, 120]) test(`#878 permanently hidden host sends its result after ${seconds}s without simulation catch-up`, async () => {
  const p = await pair();
  try {
    const before = p.host.snapshot(), time = p.host.f.G.time;
    p.host.hide(true); p.frames(seconds, [p.guest]);
    resultReached(p);
    assert.equal(p.host.snapshot().physics, before.physics); assert.equal(p.host.f.G.time, time);
    const sends = p.host.snapshot().sends;
    p.frames(10, [p.guest]); p.host.hide(false);
    assert.equal(p.host.snapshot().sends, sends, 'result is not resent on another timer or visibility event');
  } finally { p.close(); }
});

test('#878 hiding during the existing finish animation completes only its remaining delay', async () => {
  const p = await pair();
  try {
    p.host.m.time = 0; p.host.m.setState('finish'); p.host.m.update(1);
    const time = p.host.f.G.time, physics = p.host.snapshot().physics;
    p.host.hide(true); p.frames(1, []);
    assert.equal(p.host.m.state, 'finish'); assert.equal(p.host.m.result, null);
    p.frames(1, []); resultReached(p);
    assert.equal(p.host.snapshot().physics, physics); assert.equal(p.host.f.G.time, time);
  } finally { p.close(); }
});

test('#878 a throttled deadline callback can settle both expired phases once', async () => {
  const p = await pair();
  try {
    p.host.hide(true); advanceMillis(30000); p.host.runTimers(); p.host.runTimers();
    resultReached(p);
  } finally { p.close(); }
});

test('#878 hidden result ownership survives a visibility return behind a remaining blocker', async () => {
  const p = await pair();
  try {
    p.host.hide(true); p.frames(11, []);
    p.host.game.platform.owner.block('webgl', true);
    advanceMillis(2000); p.host.hide(false);
    resultReached(p);
    assert.equal(p.host.game.platform.owner.active, false);
  } finally { p.close(); }
});

test('#878 old hidden result deadline cannot judge after match, owner, pause, mode or result replacement', async () => {
  for (const change of ['match', 'owner', 'paused', 'menu', 'result']) {
    const p = await pair();
    try {
      p.host.hide(true); p.frames(11, []);
      if (change === 'match') p.host.game.match = new p.host.f.Match({ duration: 90 });
      if (change === 'owner') p.host.s.hostId = p.guest.s.myId;
      if (change === 'paused') p.host.m.paused = true;
      if (change === 'menu') p.host.f.G.mode = 'menu';
      if (change === 'result') p.host.m.result = { coverage: [.2, .8], winner: 1 };
      p.frames(10, []);
      assert.equal(p.host.m.state, 'finish', change);
      assert.equal(p.guest.m.result, null, change);
      assert.equal(p.host.timerCount(), 0, change);
    } finally { p.close(); }
  }
});

test('#878 hidden result waits for the same strict native finish-delay boundary', async () => {
  const p = await pair();
  try {
    p.host.hide(true); advanceMillis(10000); p.host.runTimers();
    assert.equal(p.host.m.state, 'finish');
    advanceMillis(p.host.m.finishDelay() * 1000); p.host.runTimers();
    assert.equal(p.host.m.result, null, 'equality is still the native TIME UP presentation');
    advanceMillis(2); p.host.runTimers(); resultReached(p);
  } finally { p.close(); }
});

test('#878 returning during finish retires the timer and preserves elapsed presentation time for RAF', async () => {
  const p = await pair();
  try {
    p.host.hide(true); p.frames(11, []); p.host.hide(false);
    assert.equal(p.host.timerCount(), 0); assert.equal(p.host.m.state, 'finish');
    assert.ok(p.host.m.stateT >= .99 && p.host.m.stateT <= 1.01);
    p.frames(2); resultReached(p);
  } finally { p.close(); }
});

test('#878 synchronous finish listeners cannot transfer an old deadline to a replacement match', async () => {
  for (const resume of [false, true]) {
    const p = await pair();
    try {
      const replacement = new p.host.f.Match({ duration: 90 });
      replacement.state = 'finish'; replacement.stateT = 0;
      const original = p.host.m.setState;
      p.host.m.setState = function (state) {
        const out = original.call(this, state);
        if (state === 'finish') p.host.game.match = replacement;
        return out;
      };
      p.host.hide(true); advanceMillis(30000);
      if (resume) p.host.hide(false); else p.host.runTimers();
      assert.equal(replacement.result, null); assert.equal(replacement.stateT, 0);
      assert.equal(p.host.timerCount(), 0);
    } finally { p.close(); }
  }
});

test('#878 disposal cancels the post-finish result timer', async () => {
  const p = await pair();
  p.host.hide(true); p.frames(11, []);
  assert.equal(p.host.timerCount(), 1);
  p.close(); assert.equal(p.host.timerCount(), 0);
});

for (const resume of [false, true]) test(`#878 synchronous finish disposal fences the retired ${resume ? 'resume' : 'timer'} continuation`, async () => {
  const p = await pair();
  try {
    p.host.f.on('match:state', ({ state }) => { if (state === 'finish') p.host.game.disposePlatform(); });
    p.host.hide(true); advanceMillis(30000);
    if (resume) p.host.hide(false); else p.host.runTimers();
    assert.equal(p.host.game.platform, null);
    assert.equal(p.host.m.state, 'finish'); assert.equal(p.host.m.result, null);
    assert.equal(p.guest.m.result, null); assert.equal(p.host.timerCount(), 0);
    advanceMillis(3000); p.host.runTimers();
    assert.equal(p.host.m.result, null); assert.equal(p.guest.m.result, null);
  } finally { p.close(); }
});

test('#878 synchronous finish platform recreation leaves only the replacement result timer', async () => {
  const p = await pair();
  try {
    const retired = p.host.game.platform;
    p.host.f.on('match:state', ({ state }) => {
      if (state === 'finish') { p.host.game.disposePlatform(); p.host.game._loop(); }
    });
    p.host.hide(true); advanceMillis(10000); p.host.runTimers();
    assert.notEqual(p.host.game.platform, retired);
    assert.equal(p.host.timerCount(), 1);
    assert.equal(retired.hiddenHostResultTimer, null); assert.equal(retired.hiddenHostResult, null);
    advanceMillis(3000); p.host.runTimers(); resultReached(p);
  } finally { p.close(); }
});
