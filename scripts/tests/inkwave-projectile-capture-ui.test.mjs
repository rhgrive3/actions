import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installProjectileCaptureUiGate, withProjectileCaptureUi } from '../lib/inkwave-projectile-capture-ui.mjs';
import { completeNativeTurfIntro } from '../lib/inkwave-projectile-ci-intro.mjs';
import { atomicIntroFunction, requireAtomicIntro } from '../lib/inkwave-projectile-atomic-intro.mjs';

// DOM/timer unit fixture, not an actual game or real-browser visual test.
function fixture(state = 'playing') {
  let now = 0;
  const timers = [];
  const node = (tag = 'DIV', id = '') => ({ tagName: tag, id, className: '', isConnected: true,
    parentElement: null, width: 1280, height: 720, childElementCount: 0,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    classList: { values: new Set(), contains(v) { return this.values.has(v); } },
    getBoundingClientRect() { return { x: 0, y: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; } });
  const canvas = node('CANVAS', 'game-canvas'), hud = node(), layer = node(), wipeEl = node();
  const nodes = { '#game-canvas': [canvas], '.iw-hud': [hud], '.iw-lineup': [], '.iw-bn--ready, .iw-bn--go': [] };
  const match = { state, stateT: 0, time: 180, attract: false, paused: false,
    local: { isLocal: true }, controller: {}, bossMode: null };
  const renderer = { domElement: canvas, getContext: () => ({ drawingBufferWidth: 1280, drawingBufferHeight: 720 }) };
  const calls = { frames: 0, freeze: 0, unfreeze: 0 };
  const game = { match, frozen: false, _skipRender: false, R: { renderer }, hud: { _visible: true, el: hud },
    menus: { current: null, _scr: null, layer, wipeEl, wipe: { busy: false, running: false } },
    debug: { freeze() { game.frozen = true; calls.freeze++; }, unfreeze() { game.frozen = false; calls.unfreeze++; } },
    _frame(dt) { calls.frames++; match.stateT += dt; if (match.stateT > 4.2) { match.state = 'playing'; match.stateT = 0; } } };
  const G = { mode: 'match', match, renderer, projectiles: {}, game };
  const document = { visibilityState: 'visible', querySelector: s => nodes[s]?.[0] ?? null,
    querySelectorAll: s => nodes[s] ?? [] };
  const window = { __inkwave: game, __G: G };
  const context = vm.createContext({ window, document, innerWidth: 1280, innerHeight: 720,
    getComputedStyle: el => el.style, Date: { now: () => now } });
  const run = fn => vm.runInContext('(' + fn.toString() + ')()', context);
  run(installProjectileCaptureUiGate);
  const read = opts => window.__iwProjectileCaptureUiGate(opts);
  return { node, nodes, canvas, hud, layer, wipeEl, game, G, match, calls, document, window, run, read,
    now: () => now, schedule(at, fn) { timers.push({ at, fn }); },
    tick(ms) { now += ms; for (const t of timers.filter(t => !t.done && t.at <= now)) { t.done = true; t.fn(); } } };
}
const playing = () => window.__G?.mode === 'match' && window.__inkwave?.match === window.__G.match && window.__G.match.state === 'playing';
const admission = () => window.__G?.mode === 'match' && window.__inkwave?.match === window.__G.match && ['intro', 'playing'].includes(window.__G.match.state);
const callback = () => atomicIntroFunction(completeNativeTurfIntro,
  withProjectileCaptureUi(playing, { phase: 'playing', settled: false }),
  withProjectileCaptureUi(admission, { phase: 'admission', allowIntro: true, settled: false }));

test('owned visible renderer and normally visible HUD produce JSON-only receipt without changing game state', () => {
  const f = fixture();
  const receipt = f.read({ requireReady: true });
  assert.equal(receipt.ready, true);
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.failed)), []);
  assert.equal(receipt.renderer.canvasOwner, true);
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.renderer.drawingBuffer)), [1280, 720]);
  assert.equal(f.game.frozen, false); assert.equal(f.game.hud._visible, true); assert.equal(f.calls.frames, 0);
  assert.equal(f.match.time, 180); assert.equal(f.match.state, 'playing');
});

const invalid = {
  'HUD false': f => { f.game.hud._visible = false; },
  'HUD CSS hidden despite flag': f => { f.hud.style.visibility = 'hidden'; },
  'HUD hidden class despite flag': f => { f.hud.classList.values.add('is-hidden'); },
  'HUD wrong DOM owner': f => { f.nodes['.iw-hud'] = [f.node()]; },
  'lineup remains': f => { f.nodes['.iw-lineup'] = [f.node()]; },
  'startup banner remains': f => { f.nodes['.iw-bn--ready, .iw-bn--go'] = [f.node()]; },
  'menu current remains': f => { f.game.menus.current = 'setup'; },
  'leaving menu DOM remains': f => { f.layer.childElementCount = 1; },
  'wipe busy': f => { f.game.menus.wipe.busy = true; },
  'light wipe running without busy': f => { f.game.menus.wipe.running = true; },
  'wipe DOM active despite idle flags': f => { f.wipeEl.classList.values.add('is-run'); },
  'wrong renderer': f => { f.G.renderer = { ...f.G.renderer }; },
  'UI canvas instead of owned canvas': f => { f.nodes['#game-canvas'] = [f.node('CANVAS')]; },
  'duplicate game canvas ID': f => { f.nodes['#game-canvas'].push(f.node('CANVAS')); },
  'wrong game owner': f => { f.G.game = {}; },
  'disconnected canvas': f => { f.canvas.isConnected = false; },
  'zero canvas width': f => { f.canvas.width = 0; },
  'buffer mismatch': f => { f.canvas.width = 640; },
  'hidden canvas ancestor': f => { f.canvas.parentElement = f.node(); f.canvas.parentElement.style.opacity = '0'; },
  'hidden document': f => { f.document.visibilityState = 'hidden'; },
  'non-native match': f => { f.G.match = {}; },
  'attract mode': f => { f.match.attract = true; },
};
for (const [name, mutate] of Object.entries(invalid)) test(name + ' fails closed and retains failed receipt', () => {
  const f = fixture(); mutate(f);
  assert.equal(f.read().ready, false);
  assert.throws(() => f.read({ requireReady: true }), /Native capture UI\/renderer gate failed/);
  assert.equal(f.window.__iwProjectileCaptureUiReceipt.ready, false);
  assert.ok(f.window.__iwProjectileCaptureUiReceipt.failed.length > 0);
  assert.equal(f.calls.frames, 0);
});

test('HUD, lineup and wrong-renderer negatives prevent the atomic helper from advancing any intro frame', () => {
  for (const name of ['HUD false', 'lineup remains', 'wrong renderer', 'UI canvas instead of owned canvas']) {
    const f = fixture('intro'); invalid[name](f);
    const result = f.run(callback());
    assert.equal(result.admissionReady, false, name);
    assert.equal(f.calls.frames, 0, name);
    assert.equal(f.match.state, 'intro', name);
    assert.equal(f.match.time, 180, name);
  }
});

test('UI wrapper keeps native predicate authoritative and does not consume scenario RNG', () => {
  const f = fixture();
  const deny = withProjectileCaptureUi(() => false, { phase: 'playing' });
  assert.equal(f.run(deny), false);
  const guarded = new Function('return function(){ Math.random=()=>{throw new Error("unexpected RNG draw")}; return (' +
    withProjectileCaptureUi(playing, { phase: 'playing' }).toString() + ')(); }')();
  assert.equal(f.run(guarded), true);
});

test('native wall-clock HUD reveal and lineup removal precede all synchronous intro frames', async () => {
  const f = fixture('intro'); f.game.hud._visible = false; f.nodes['.iw-lineup'] = [f.node()];
  f.schedule(3000, () => { if (f.match.state === 'intro') f.game.hud._visible = true; });
  f.schedule(3500, () => { f.nodes['.iw-lineup'] = []; });
  const hostReceipt = {};
  const result = await requireAtomicIntro({ evaluate: async fn => f.run(fn) }, callback(), 10000, {
    now: f.now, setTimer: () => 0, clearTimer: () => {}, receipt: hostReceipt,
    sleep: async ms => { assert.equal(f.calls.frames, 0); f.tick(ms); },
  });
  assert.equal(f.now(), 3500); assert.equal(result.playingReady, true);
  assert.equal(result.intro.frames, 253); assert.equal(f.match.time, 180);
  assert.equal(f.window.__iwProjectileCaptureUiAdmission.native.state, 'intro');
  assert.equal(f.window.__iwProjectileCaptureUiAdmission.hud.flag, true);
  assert.equal(f.window.__iwProjectileCaptureUiPlaying.native.state, 'playing');
  assert.equal(hostReceipt.outcome, 'accepted');
});

test('negative control reproduces timer being outrun by original immediate intro', () => {
  const f = fixture('intro'); f.game.hud._visible = false;
  f.schedule(3000, () => { if (f.match.state === 'intro') f.game.hud._visible = true; });
  f.run(completeNativeTurfIntro); f.tick(3000);
  assert.equal(f.match.state, 'playing'); assert.equal(f.game.hud._visible, false);
  assert.equal(f.read().ready, false);
});

test('permanently missing HUD expires original deadline with no synthetic intro or forced display', async () => {
  const f = fixture('intro'); f.game.hud._visible = false; const receipt = {};
  await assert.rejects(requireAtomicIntro({ evaluate: async fn => f.run(fn) }, callback(), 750, {
    now: f.now, setTimer: () => 0, clearTimer: () => {}, receipt, sleep: async ms => f.tick(ms),
  }), /deadline expired/);
  assert.equal(f.calls.frames, 0); assert.equal(f.game.hud._visible, false);
  assert.equal(f.match.state, 'intro'); assert.equal(receipt.outcome, 'failed');
});

test('playing may emit GO, but settled capture must await native banner removal', () => {
  const f = fixture(); f.nodes['.iw-bn--ready, .iw-bn--go'] = [f.node()];
  assert.equal(f.run(withProjectileCaptureUi(playing, { phase: 'playing', settled: false })), true);
  assert.equal(f.read({ phase: 'settled' }).ready, false);
  f.schedule(1800, () => { f.nodes['.iw-bn--ready, .iw-bn--go'] = []; });
  f.tick(1800); assert.equal(f.read({ phase: 'settled' }).ready, true);
});

test('harness integrates gate before atomic intro, before freeze, and both screenshot paths without removing original predicates', () => {
  const s = fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs', import.meta.url), 'utf8');
  assert.ok(s.includes('await page.addInitScript(installProjectileCaptureUiGate)'));
  assert.ok(s.includes("withProjectileCaptureUi(admissionReady,{phase:'admission',allowIntro:true,settled:false})"));
  assert.ok(s.includes("withProjectileCaptureUi(playingReady,{phase:'playing',settled:false})"));
  assert.ok(s.includes("await requireNativePhase(() => window.__iwProjectileCaptureUiGate({phase:'settled'}).ready === true"));
  assert.ok(s.indexOf("phase:'before-freeze'") < s.indexOf('g.debug.freeze(); g.debug.freezeBots();'));
  assert.ok(s.includes("runtime.captureUi = await page.evaluate(() => window.__iwProjectileCaptureUiGate({phase:'before-screenshot',requireReady:true}))"));
  assert.ok(s.includes("runtime.cropCaptureUi = await page.evaluate(() => window.__iwProjectileCaptureUiGate({phase:'before-crop',requireReady:true}))"));
  assert.ok(!s.includes("{ timeout: 30000 }).catch(() => {})"));
  assert.equal((s.match(/const deadline = Date.now\(\) \+ NATIVE_BOOT_TIMEOUT_MS/g) || []).length, 1);
  assert.ok(s.includes('captureUi:window.__iwProjectileCaptureUiReceipt??null'));
});

test('HUD observation distinguishes own and ancestor opacity without native writes', () => {
  const f = fixture('intro'), parent = f.node(); f.hud.parentElement = parent; parent.style.opacity = '.5';
  f.hud.style.opacity = '0';
  const timing = Object.freeze({ duration: 350, localTime: 0, progress: 0, iterations: 1, activeDuration: 350 });
  const animation = Object.freeze({ id: 'fade', transitionProperty: 'opacity', playState: 'running', pending: true,
    currentTime: 0, startTime: null, playbackRate: 1, effect: Object.freeze({ target: f.hud, getComputedTiming: () => timing }) });
  f.hud.getAnimations = options => { assert.equal(options.subtree, false); return [animation]; };
  const before = JSON.stringify({ style: f.hud.style, parent: parent.style, match: f.match, calls: f.calls });
  const r = f.read({ phase: 'admission', allowIntro: true, settled: false });
  assert.equal(r.ready, false); assert.ok(r.failed.includes('hud'));
  assert.equal(r.hud.observation.ancestors[0].opacity, '0');
  assert.equal(r.hud.observation.ancestors[1].opacity, '.5');
  assert.equal(r.hud.observation.animations[0].currentTime, 0);
  assert.equal(r.hud.observation.animations[0].timing.duration, 350);
  assert.equal(r.hud.observation.animations[0].targetIsHud, true);
  assert.equal(JSON.stringify({ style: f.hud.style, parent: parent.style, match: f.match, calls: f.calls }), before);
  assert.equal(animation.playState, 'running'); assert.equal(animation.currentTime, 0);
});

test('admission first/recent history remains bounded and detached from returned receipts', () => {
  const f = fixture('intro'); let last;
  for(let i=0;i<100;i++){ f.tick(250); last=f.read({phase:'admission',allowIntro:true,settled:false}); }
  const h=f.window.__iwProjectileCaptureUiHistory;
  assert.equal(h.admissionCount,100); assert.equal(h.first.length,4); assert.equal(h.recent.length,8); assert.equal(h.omitted,88);
  assert.deepEqual(Array.from(h.first,x=>x.attempt),[1,2,3,4]);
  assert.deepEqual(Array.from(h.recent,x=>x.attempt),[93,94,95,96,97,98,99,100]);
  last.hud.observation.ancestors[0].opacity='tampered';
  assert.equal(h.recent[7].hud.observation.ancestors[0].opacity,'1');
  f.read({phase:'capture'});assert.equal(h.admissionCount,100);
  assert.doesNotThrow(()=>JSON.parse(JSON.stringify(h)));
});

test('ancestor and animation observation caps preserve complete original visibility gate', () => {
  const f=fixture();let node=f.hud;
  for(let i=0;i<20;i++){node.parentElement=f.node();node=node.parentElement;}
  node.style.opacity='0';
  f.hud.getAnimations=()=>Array.from({length:30},()=>({currentTime:Infinity,playState:'running',effect:{target:f.hud,getComputedTiming:()=>({duration:Infinity})}}));
  const r=f.read();assert.equal(r.ready,false);assert.ok(r.failed.includes('hud'));
  assert.equal(r.hud.observation.ancestors.length,16);assert.equal(r.hud.observation.ancestorsTruncated,true);
  assert.equal(r.hud.observation.animations.length,16);assert.equal(r.hud.observation.animationsTotal,30);
  assert.equal(r.hud.observation.animationsTruncated,true);assert.equal(r.hud.observation.animations[0].currentTime,'Infinity');
  assert.doesNotThrow(()=>JSON.parse(JSON.stringify(r)));
});

test('absent or failing animation APIs remain explicitly unobserved without changing readiness', () => {
  const f=fixture();let r=f.read();assert.equal(r.ready,true);assert.equal(r.hud.observation.animationsAvailable,false);
  f.hud.getAnimations=()=>{throw Error('unavailable');};r=f.read();assert.equal(r.ready,true);
  assert.match(r.hud.observation.errors[0],/animations: unavailable/);
  f.hud.style.opacity='0';assert.throws(()=>f.read({phase:'admission',requireReady:true}),/Native capture UI/);
  assert.equal(f.window.__iwProjectileCaptureUiHistory.first[0].ready,false);
  assert.ok(f.window.__iwProjectileCaptureUiHistory.first[0].failed.includes('hud'));
});
