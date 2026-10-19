import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Assert against the *shipped* adapter composition, not a duplicate handwritten
// match transition. Native loading awaits both audio preflight and stage assets.
const source = readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
const built = adaptBuildSource('src/main.js', source);
const clockSource = readFileSync(new URL('../../splatoon3/runtime/clock.mjs', import.meta.url), 'utf8');

function method(start, end) {
  const lo = built.indexOf(start), hi = built.indexOf(end, lo + start.length);
  assert(lo >= 0 && hi > lo, 'transition exists in production composition');
  return built.slice(lo, hi);
}

const transitions = [
  ['offline', '  async startMatch(o = {}, flow = null) {', '\n  // ---- online (src/net/session.js'],
  ['online', '  async startNetMatch(cfg, nm) {', '\n  // Compile every shader variant'],
];
// Use the real continuation predicate. An always-true stub misses intentional
// match ownership transfers and let a broken ordinary startup pass before.
const beginFlow = new Function('G', 'return ({' +
  method('  _beginMatchFlow() {', '\n  async _startMenuMatch(') +
  '})._beginMatchFlow;');

for (const [label, start, end] of transitions) {
  test(label + ': outgoing bots and weapon loops stop before asynchronous fade/audio/stage load', () => {
    const body = method(start, end);
    const freeze = body.indexOf('    // Freeze the outgoing round before any asynchronous loading starts.');
    const fade = body.indexOf('    await this._fade(1, 350);');
    const dispose = body.indexOf('    if (this.match) this.match.dispose();', fade);
    const detach = body.indexOf('    this.match = G.match = flow.match = null;', dispose);
    const clear = body.indexOf('    G.projectiles.clear();', dispose);
    assert(freeze >= 0 && freeze < fade, 'simulation is stopped before the first awaited fade');
    assert(fade >= 0 && dispose > fade, 'visuals remain until the fade finishes');
    assert(detach > dispose && detach < clear, 'both stale owners detach before native async build');

    let resets = 0, disposal = 0, updates = 0;
    const old = {
      paused: false,
      actors: [{ weaponRunner: { reset() { resets++; } } }, { weaponRunner: { reset() { resets++; } } }],
      dispose() { disposal++; },
      update() { updates++; },
    };
    const G = { match: old };
    const game = { match: old };

    // Evaluate precisely the transition fragment compiled from the current
    // source. No DOM, WebGL, sound device, or native asset download required.
    new Function('G', body.slice(freeze, fade)).call(game, G);
    assert.equal(old.paused, true);
    assert.equal(resets, 2, 'continuous weapon sound handles are reset');
    assert.equal(disposal, 0, 'visible actors survive until the fade');

    const flow = beginFlow(G).call(game);
    new Function('G', 'flow', body.slice(dispose, clear)).call(game, G, flow);
    assert.equal(disposal, 1);
    assert.equal(game.match, null);
    assert.equal(G.match, null);
    assert.equal(flow.current(), true, 'intentional disposal must not cancel its own startup');
    game.match?.update(1 / 60);
    assert.equal(updates, 0, 'the old match cannot tick or fire during native loading');

    // First launch (no outgoing attract match) is also safe.
    const first = { match: null };
    G.match = null;
    const firstFlow = beginFlow(G).call(first);
    new Function('G', body.slice(freeze, fade)).call(first, G);
    new Function('G', 'flow', body.slice(dispose, clear)).call(first, G, firstFlow);
    assert.equal(first.match, null);
    assert.equal(G.match, null);
    assert.equal(firstFlow.current(), true);

    // A dispose listener can synchronously replace the match. The old flow
    // must leave that replacement intact rather than detaching its owners.
    const replacement = { actors: [], dispose() {} };
    game.match = G.match = old;
    const interruptedFlow = beginFlow(G).call(game);
    old.dispose = () => { game.match = G.match = replacement; beginFlow(G).call(game); };
    new Function('G', 'flow', body.slice(dispose, clear)).call(game, G, interruptedFlow);
    assert.equal(game.match, replacement);
    assert.equal(G.match, replacement);
    assert.equal(interruptedFlow.current(), false);
  });
}

test('paused attract update and pending demo reset cannot spawn bots during native loading', () => {
  assert.match(clockSource, /if \(m\.attract && !m\.paused\) game\._updateAttract\(simDt\);/);
  assert.match(built, /this\.match !== resetMatch \|\| this\._matchFlow !== resetFlow/);
  assert.match(built, /if \(!this\.match\?\.attract \|\| this\.match\.paused\) return;/);
});
