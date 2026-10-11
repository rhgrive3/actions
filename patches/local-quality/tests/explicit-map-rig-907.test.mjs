// #907: map input must drive the live camera's explicit Turf Map state, not only
// PlayerController.mapHeld. Runs the composed Game._frame with a recording CameraRig stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveQuality } from '../../../inkwave-public/src/config.js';
import { updateSplatGhosts } from '../../splatoon3/issue-284-adapter.mjs';
import { compose } from './idle-fixture.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { idleAttractMenuBudget, pausedWorldFrame } from '../idle-resources.mjs';
import { installClock, runSimulation } from '../../splatoon3/runtime/clock.mjs';
import { syncPortraitFrame } from '../portrait-guard.mjs';

const source = adaptRange('src/main.js', adaptNetworkSource('src/main.js', compose('src/main.js')));
const start = source.indexOf('  _frame(dt) {');
const end = source.indexOf('\n  // continuous sounds', start);
assert.ok(start >= 0 && end > start, 'composed installed Game._frame exists');
const makeFrame = (G, document) => new Function('effectiveQuality', 'document', 'updateSplatGhosts', 'G', 'runSimulation', 'pausedWorldFrame', 'idleAttractMenuBudget', 'performance', 'damp', 'clamp', 'THREE', 'syncPortraitFrame',
  `return class Frame {\n${source.slice(start, end)}\n}`)
  (effectiveQuality, document, updateSplatGhosts, G, runSimulation, pausedWorldFrame, idleAttractMenuBudget, performance, (a, b) => b, x => x, {}, syncPortraitFrame);

const vector = () => ({ copy() { return this; }, set() { return this; }, getWorldDirection() { return this; } });
const noop = () => {};

function fixture({ minimap = true, mapHeld = false, menu = null, paused = false, attract = false } = {}) {
  const calls = { setMap: [] };
  const G = {
    time: 0, mode: 'match', level: {}, teamColors: [{}, {}],
    renderer: { info: { reset: noop, render: { calls: 0, triangles: 0 } }, shadowMap: { autoUpdate: false, needsUpdate: false } },
    fx: { update: noop }, env: { theme: 'day', update: noop }, projectiles: { update: noop, updateArc: noop },
    paint: { flush: noop }, camera: { position: vector(), up: vector() }, net: { update: noop },
    settings: { quality: 'high', minimap },
  };
  const match = {
    attract, paused, state: 'playing', local: null,
    controller: { mapHeld, computeAim: noop }, updateController: noop, update: noop,
  };
  const rig = {
    mapOpen: false, mapK: 0, mode: 'orbit', target: null,
    setMap(open) { calls.setMap.push(!!open); this.mapOpen = !!open; }, update: noop, follow: noop,
  };
  const game = new (makeFrame(G, {hidden: false}))();
  Object.assign(game, {
    match, rig, menus: { current: menu, update: noop }, settings: G.settings,
    input: { padPressed: new Set(), _padEpoch: 0, pollPad: noop, endFrame: noop, mobile: null },
    mobile: { touch: null }, showcase: { fullFrame: false, mode: null, update: noop, render: noop },
    levelMat: { userData: { uniforms: { uTime: { value: 0 }, uSeeOn: { value: 0 }, uSeeA: { value: vector() }, uSeeB: { value: vector() } } } },
    R: { render: noop, grade: { uniforms: { uHurt: { value: 0 }, uHurtColor: { value: { copy: noop } } } } },
    decor: { update: noop }, props: { update: noop }, screenfx: { update: noop }, diorama: { update: noop },
    _dioFog: noop, _updateLocalLoops: noop, _updateAmbience: noop, _updateAttract: noop, _padMenus: noop,
    _skipRender: false, fxHooks: null,
  });
  installClock({ G });
  return { game, rig, calls, match, G };
}

const frames = (h, seconds = 0.6, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) h.game._frame(1 / hz); };

for (const minimap of [true, false]) {
  test(`#907 map control held opens the camera's explicit map (minimap ${minimap ? 'on' : 'off'})`, () => {
    const h = fixture({ minimap, mapHeld: true });
    frames(h, 0.1);
    assert.equal(h.rig.mapOpen, true, 'held map control must open rig.mapOpen');
    assert.equal(h.calls.setMap.at(-1), true);
  });

  test(`#907 releasing map control returns the camera to combat (minimap ${minimap ? 'on' : 'off'})`, () => {
    const h = fixture({ minimap, mapHeld: true });
    frames(h, 0.2);
    h.match.controller.mapHeld = false;
    frames(h, 0.1);
    assert.equal(h.rig.mapOpen, false);
    assert.equal(h.calls.setMap.at(-1), false);
  });
}

test('#907 map input does not open the explicit map while a menu, pause or attract owns the screen', () => {
  for (const options of [{ menu: 'pause' }, { paused: true }, { attract: true }]) {
    const h = fixture({ mapHeld: true, ...options });
    frames(h, 0.2);
    assert.equal(h.rig.mapOpen, false, JSON.stringify(options));
  }
});
