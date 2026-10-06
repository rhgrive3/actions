import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installClock, installGame } from '../runtime/clock.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const matchSource = fs.readFileSync(`${root}/inkwave-public/src/game/match.js`, 'utf8');
const netMatchSource = fs.readFileSync(`${root}/inkwave-public/src/net/netmatch.js`, 'utf8');
const configSource = fs.readFileSync(`${root}/inkwave-public/src/config.js`, 'utf8');
const finalCountdown = Number(configSource.match(/finalCountdown:\s*([\d.]+)/)?.[1]);
assert.ok(Number.isFinite(finalCountdown), 'read the countdown threshold from native config');

// Compile the exact clock block extracted by the production adapter so the
// fixtures exercise native Match event/state semantics rather than a retyped timer.
const adaptedMatch = adaptSource('src/game/match.js', matchSource);
const clockBody = adaptedMatch.match(/  _s3AdvanceClock\(dt\) \{([\s\S]*?)\n  \}\n\n  update\(dt\) \{/)?.[1];
assert.ok(clockBody, 'production adapter exposes the native Match clock block');
assert.equal((adaptedMatch.match(/_s3AdvanceClock\(dt\)/g) || []).length, 2, 'normal Match.update delegates to the extracted clock method');
const setStateBody = matchSource.match(/  setState\(s\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(setStateBody, 'native Match.setState anchor exists');
const hostStateBody = netMatchSource.match(/  _hostState\(d\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(hostStateBody, 'native NetMatch._hostState anchor exists');
const hostHook = netMatchSource.match(/on\('match:state', (\(\{ state, match: m \}\) => \{ if \(m === this\.match && this\.isHost\) this\._sendNow\(\{ k: 'st', s: state, t: r2\(m\.time\) \}\); \})\)\)/)?.[1];
assert.ok(hostHook, 'native owner state broadcast anchor exists');

function makeMatch({ time = 180, paused = false, follower = false, lastCount = 99, duration = 180 } = {}) {
  const events = [];
  let stateListener = () => {};
  const emit = (name, value) => {
    events.push({ name, value });
    if (name === 'match:state') stateListener(value);
  };
  const clock = new Function('emit', 'MATCH', `return function(dt) {${clockBody}\n}`)(emit, { finalCountdown });
  const setState = new Function('emit', `return function(s) {${setStateBody}\n}`)(emit);
  const match = { state: 'playing', stateT: 0, time, duration, paused, follower, attract: false,
    lastMinuteFired: false, lastCount, setState, _s3AdvanceClock: clock };
  return { match, events, onState(fn) { stateListener = fn; } };
}

function nativeOwnerStateListener(netm) {
  const factory = new Function('r2', `return function() { return (${hostHook}); }`)(n => Math.round(n * 100) / 100);
  return factory.call(netm);
}

function nativeRemoteState(netm, message) {
  const receive = new Function(`return function(d) {${hostStateBody}\n}`)();
  return receive.call(netm, message);
}

function installFakeBrowser(nowRef) {
  const original = Object.fromEntries(['document', 'performance', 'requestAnimationFrame'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map();
  const doc = { hidden: false, addEventListener(name, fn) { listeners.set(name, fn); } };
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: doc });
  Object.defineProperty(globalThis, 'performance', { configurable: true, writable: true, value: { now: () => nowRef.value } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: () => 0 });
  return {
    doc,
    visibility(hidden) { doc.hidden = hidden; listeners.get('visibilitychange')?.(); },
    restore() {
      for (const [name, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test('hidden host reconciles native Match time once on restore and broadcasts one terminal state', () => {
  const owner = makeMatch({ time: 5 });
  const guest = makeMatch({ time: 5, follower: true, lastCount: 5 });
  const guestNetm = { match: guest.match, isHost: false };
  const sent = [];
  const netm = { match: owner.match, isHost: true, _sendNow(message) { sent.push(message); } };
  owner.onState(nativeOwnerStateListener(netm));
  const G = { netm };
  installClock({ G });
  const now = { value: 1000 };
  const browser = installFakeBrowser(now);
  let loopCalls = 0, timerUpdates = 0, accumulatorResets = 0;
  class Game {
    constructor() { this.match = owner.match; this.timer = { update() { timerUpdates++; } }; this.s3Clock = { reset() { accumulatorResets++; } }; }
    _loop() { loopCalls++; return 'foreground'; }
  }
  try {
    installGame(Game);
    const game = new Game();
    game._loop(); // active game, foreground
    browser.visibility(true);
    game._loop();
    guest.match._s3AdvanceClock(6); // the visible follower continues while the host tab is hidden
    assert.equal(guest.match.time, 0);
    assert.equal(guest.match.state, 'playing');
    now.value = 2250;
    game._loop(); // repeated hidden RAF does not restart the monotonic interval
    now.value = 7000;
    browser.visibility(false);
    assert.equal(owner.match.time, 0);
    assert.equal(owner.match.state, 'finish');
    assert.deepEqual(sent, [{ k: 'st', s: 'finish', t: 0 }]);
    assert.equal(owner.events.filter(x => x.name === 'match:state').length, 1);
    assert.equal(owner.events.some(x => x.name === 'match:count' && x.value.n > 0), false);
    nativeRemoteState(guestNetm, sent[0]);
    nativeRemoteState(guestNetm, sent[0]);
    assert.equal(guest.match.state, 'finish');
    assert.equal(guest.events.filter(x => x.name === 'match:state').length, 1);
    assert.equal(loopCalls, 1, 'no hidden simulation or catch-up loop ran');
    game._loop();
    assert.equal(loopCalls, 2, 'ordinary foreground simulation resumes once');
    assert.equal(timerUpdates, 2);
    assert.equal(accumulatorResets, 2);
    game._loop();
    assert.equal(sent.length, 1, 'late frames do not rebroadcast finish');
  } finally { browser.restore(); }
});

test('5, 20, and 120 hidden seconds subtract from the host clock with monotonic elapsed time', () => {
  for (const elapsedSeconds of [5, 20, 120]) {
    const owner = makeMatch({ time: elapsedSeconds + 42 });
    const netm = { match: owner.match, isHost: true };
    installClock({ G: { netm } });
    const now = { value: 1000 };
    const browser = installFakeBrowser(now);
    class Game { constructor() { this.match = owner.match; this.timer = { update() {} }; } _loop() {} }
    try {
      installGame(Game); const game = new Game(); game._loop();
      browser.visibility(true); game._loop();
      now.value += elapsedSeconds * 1000;
      browser.visibility(false);
      assert.ok(Math.abs(owner.match.time - 42) < 1e-9, `${elapsedSeconds}s interval is accounted once`);
      assert.equal(owner.match.state, 'playing');
    } finally { browser.restore(); }
  }
});

test('hidden guest advances only its local clock; one late owner finish is idempotent', () => {
  const guest = makeMatch({ time: 4, follower: true, lastCount: 4 });
  const netm = { match: guest.match, isHost: false };
  const G = { netm };
  installClock({ G });
  const now = { value: 500 };
  const browser = installFakeBrowser(now);
  class Game { constructor() { this.match = guest.match; this.timer = { update() {} }; } _loop() {} }
  try {
    installGame(Game);
    const game = new Game(); game._loop();
    browser.visibility(true); game._loop();
    now.value = 5500; browser.visibility(false);
    assert.equal(guest.match.time, 0);
    assert.equal(guest.match.state, 'playing', 'follower does not author its own finish');
    const guestNetm = { match: guest.match, isHost: false };
    nativeRemoteState(guestNetm, { s: 'finish', t: 0 });
    nativeRemoteState(guestNetm, { s: 'finish', t: 0 });
    assert.equal(guest.match.state, 'finish');
    assert.equal(guest.events.filter(x => x.name === 'match:state').length, 1);
    assert.equal(guest.match.time, 0);
  } finally { browser.restore(); }
});

test('past-deadline restore emits no late positive countdown and role change skips stale host time', () => {
  const late = makeMatch({ time: 2.25, lastCount: 3 });
  late.match._s3AdvanceClock(10);
  assert.equal(late.match.time, 0);
  assert.equal(late.match.state, 'finish');
  assert.equal(late.events.some(x => x.name === 'match:count'), false);

  const owner = makeMatch({ time: 10 });
  const session = { hostId: 'host-a', myId: 'host-a' };
  const netm = { match: owner.match, isHost: true, s: session };
  installClock({ G: { netm } });
  const now = { value: 0 };
  const browser = installFakeBrowser(now);
  class Game { constructor() { this.match = owner.match; this.timer = { update() {} }; } _loop() {} }
  try {
    installGame(Game); const game = new Game(); game._loop();
    browser.visibility(true); game._loop();
    now.value = 5000; netm.isHost = false; session.hostId = 'host-b'; browser.visibility(false);
    assert.equal(owner.match.time, 10, 'a former host does not subtract time owned by a reconnect');
    assert.equal(owner.match.state, 'playing');
  } finally { browser.restore(); }
});

test('offline paused match remains frozen across hidden visibility', () => {
  const offline = makeMatch({ time: 75, paused: true });
  installClock({ G: {} });
  const now = { value: 100 };
  const browser = installFakeBrowser(now);
  class Game { constructor() { this.match = offline.match; this.timer = { update() {} }; } _loop() {} }
  try {
    installGame(Game); const game = new Game(); game._loop();
    browser.visibility(true); game._loop();
    now.value = 90000; browser.visibility(false);
    offline.match._s3AdvanceClock(90);
    assert.equal(offline.match.time, 75);
    assert.equal(offline.match.state, 'playing');
  } finally { browser.restore(); }
});

test('Practice Range-like offline Match ignores a stale NetMatch from another Match', () => {
  const range = makeMatch({ time: 75 });
  const priorOnline = makeMatch({ time: 40 });
  const netm = { match: priorOnline.match, isHost: true };
  installClock({ G: { netm } });
  const now = { value: 100 };
  const browser = installFakeBrowser(now);
  class Game { constructor() { this.match = range.match; this.timer = { update() {} }; } _loop() {} }
  try {
    installGame(Game); const game = new Game(); game._loop();
    browser.visibility(true); game._loop();
    now.value = 30100; browser.visibility(false);
    assert.equal(range.match.time, 75);
    assert.equal(priorOnline.match.time, 40);
    assert.equal(range.match.state, 'playing');
  } finally { browser.restore(); }
});
