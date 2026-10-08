import test from 'node:test';
import assert from 'node:assert/strict';

test('#1032: hidden online guest explicitly leaves without waiting for another RAF/fixed tick', async () => {
  const priorDocument = globalThis.document;
  let visibility = null;
  const fakeDocument = {
    hidden: false,
    addEventListener(name, fn) { if (name === 'visibilitychange') visibility = fn; },
  };
  globalThis.document = fakeDocument;
  try {
    const mod = await import(new URL('../runtime/clock.mjs?issue1032-background-guest', import.meta.url));
    const calls = [];
    const G = {
      netm: {},
      net: {
        state: 'match', isHost: false, _s3HiddenGuestLeft: false,
        leave(silent) { calls.push(['leave', silent]); this.state = 'offline'; },
      },
      game: { netMatchAborted(reason) { calls.push(['abort', reason]); } },
    };
    mod.installClock({ G });
    class Game { _loop() {} }
    mod.installGame(Game);
    assert.equal(typeof visibility, 'function');

    fakeDocument.hidden = true;
    visibility();
    assert.deepEqual(calls, [
      ['leave', true],
      ['abort', 'Disconnected while backgrounded'],
    ]);
    assert.equal(G.net._s3HiddenGuestLeft, true);

    visibility();
    assert.equal(calls.length, 2, 'one visibility transition cannot double-disconnect');
  } finally {
    globalThis.document = priorDocument;
  }
});
