import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

// Logic-only check of the production music owner with fake media elements. It proves the element
// handoffs and recovery ordering; it is NOT evidence of iOS Safari or Chrome playback.
const MENU = 'menu_the_ika_swing_aoi_kenban.mp3', BATTLE = 'Jet_Arrow.mp3';
const flush = () => new Promise(resolve => setImmediate(resolve));

async function rig({ withCtx = true } = {}) {
  const f = audioFixture(), created = [], windowListeners = [], state = { blocked: false };
  class Audio {
    constructor() {
      Object.assign(this, { currentTime: 0, src: '', preload: '', paused: true, ended: false, error: null, events: new Map(), plays: 0, pauses: 0 });
      created.push(this);
    }
    addEventListener(type, fn) { this.events.set(type, fn); }
    removeEventListener(type, fn) { if (this.events.get(type) === fn) this.events.delete(type); }
    play() {
      this.plays++; this.paused = false;
      if (state.blocked) return Promise.reject(Object.assign(new Error('autoplay blocked'), { name: 'NotAllowedError' }));
      if (state.abort) return Promise.reject(Object.assign(new Error('interrupted by pause()'), { name: 'AbortError' }));
      return Promise.resolve();
    }
    pause() { this.pauses++; this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { created.loads?.push(this.src); }
  }
  const win = {
    addEventListener(type, fn, options) { windowListeners.push({ type, fn, capture: options === true || !!options?.capture }); },
    removeEventListener(type, fn) { const i = windowListeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) windowListeners.splice(i, 1); },
  };
  const document = { hidden: false, hasFocus: () => true, addEventListener() {}, removeEventListener() {} };
  const transform = (rel, code) => rel === 'src/audio/music.js'
    ? adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js', import.meta.url), 'utf8'))
    : code;
  const api = await idleFixture({ transform, globals: { ...f.globals, Audio, window: win, document, addEventListener() {}, removeEventListener() {} } });
  const music = new api.MusicEngine();
  if (withCtx) music._init(f.ctx, f.ctx.createGain());
  const gesture = (type = 'pointerdown', isTrusted = true) => {
    for (const listener of [...windowListeners]) if (listener.type === type) listener.fn({ type, isTrusted });
  };
  const elementFor = (name) => created.filter(el => el.src.endsWith(name));
  const loaded = created.loads = [];
  return { music, f, created, windowListeners, state, gesture, elementFor };
}

test('only trusted gestures unlock both recordings, once', async () => {
  const f = await rig();
  try {
    f.gesture('pointerdown', false);
    assert.equal(f.created.length, 0, 'synthetic events cannot unlock media');
    f.gesture('pointerdown', true);
    assert.equal(f.created.length, 2);
    for (const el of f.created) {
      assert.equal(el.plays, 1); assert.equal(el.pauses, 1); assert.equal(el.paused, true);
      assert.match(el.src, /^data:audio\/wav;base64,/, 'unlock plays a silent clip, never the recording');
      assert.equal(el.preload, 'none');
    }
    assert.equal(f.elementFor(MENU).length + f.elementFor(BATTLE).length, 0, 'no recording is fetched by a gesture');
    assert.deepEqual([...f.music._unlockedFiles.keys()].sort(), ['battle', 'menu']);
    f.gesture('keydown', true); f.gesture('touchend', true);
    assert.equal(f.created.length, 2, 'an unlocked element is not recreated');
  } finally { f.music.dispose(); }
});

test('menu started after an await reuses the element a gesture unlocked', async () => {
  const f = await rig();
  try {
    f.gesture('pointerdown', true);
    const menuElement = f.music._unlockedFiles.get('menu');
    await new Promise(resolve => setTimeout(resolve, 5));   // stands in for the quit-to-menu fade
    f.music.play('menu', { fade: 0 });
    assert.ok(menuElement.src.endsWith(MENU), 'the unlocked element receives the recording only when it plays');
    assert.equal(f.music.current.element, menuElement, 'the unlocked element is the one that plays');
    assert.equal(f.created.length, 2, 'no fresh media element is created after the await');
    assert.equal(menuElement.plays, 2, 'unlock play plus the menu start');
    assert.equal(f.music._unlockedFiles.has('menu'), false);
  } finally { f.music.dispose(); }
});

test('battle prime adopts the unlocked recording and runs without a fresh gesture', async () => {
  const f = await rig();
  try {
    f.gesture('pointerdown', true);
    const battleElement = f.music._unlockedFiles.get('battle');
    f.music.preloadFile('battle', { prime: true });
    assert.ok(battleElement.src.endsWith(BATTLE));
    assert.ok(f.created.loads.includes(battleElement.src), 'the adopted element loads the recording');
    assert.equal(f.music._preloadedFile.element, battleElement);
    assert.ok(f.music._preloadedFile.player, 'the WebAudio source is attached once');
    assert.equal(battleElement.plays, 2, 'unlock plus prime');
    assert.equal(f.created.length, 2);
  } finally { f.music.dispose(); }
});

test('a START prime requested before AudioContext exists is applied when audio initializes', async () => {
  const f = await rig({ withCtx: false });
  try {
    f.music.preloadFile('battle', { prime: true });
    assert.equal(f.created.length, 0, 'nothing is created before the context exists');
    assert.equal(f.music._pendingFilePrime, 'battle');
    f.music._init(f.f.ctx, f.f.ctx.createGain());
    assert.equal(f.music._pendingFilePrime, null);
    assert.equal(f.music._preloadedFile?.id, 'battle');
    assert.ok(f.music._preloadedFile.player, 'primed when the context arrives');
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0].plays, 1);
  } finally { f.music.dispose(); }
});

test('autoplay rejection waits for a trusted gesture instead of timed retries', async () => {
  const f = await rig();
  let errors = 0;
  try {
    f.music.onFileError = () => { errors++; };
    f.state.blocked = true;
    f.music.play('menu', { fade: 0 });
    await flush();
    assert.equal(f.music._fileRetryTimer, null, 'no timed retry can succeed without a gesture');
    assert.equal(f.music._fileRetryCount, 0);
    assert.ok(f.music._fileRecovery, 'gesture recovery is armed at once');
    assert.equal(errors, 0, 'a blocked autoplay is not reported as an unavailable recording');
    f.state.blocked = false;
    f.gesture('pointerdown', true);
    assert.equal(f.music._fileRecovery, null);
    assert.equal(f.music.current?.id, 'menu');
    assert.equal(f.music.current.element.plays >= 2, true);
  } finally { f.music.dispose(); }
});

test('gestures during a live match fetch nothing, and dispose releases everything', async () => {
  const f = await rig();
  try {
    f.gesture('pointerdown', true);
    f.music.play('battle', { fade: 0 });
    assert.ok(f.music.current.element.src.endsWith(BATTLE));
    assert.equal(f.music._unlockedFiles.has('battle'), false);
    const menu = f.music._unlockedFiles.get('menu');
    const before = f.created.length;
    for (let i = 0; i < 5; i++) f.gesture('pointerdown', true);
    assert.equal(f.created.length, before, 'no element is created while the battle recording itself is playing');
    assert.equal(f.elementFor(MENU).length, 0, 'the menu recording is not downloaded during the match');
    assert.equal(f.music._unlockedFiles.get('menu'), menu, 'the menu unlock is kept for the quit tap');
    assert.ok(f.windowListeners.length > 0);
    f.music.dispose();
    assert.equal(f.windowListeners.length, 0, 'gesture listeners are removed');
    assert.equal(menu.src, '', 'unused unlocked elements are released');
    assert.equal(f.music._unlockedFiles.size, 0);
  } finally { f.music.dispose(); }
});

test('a refused unlock is forgotten so a later event of the same tap can unlock', async () => {
  const f = await rig();
  try {
    f.state.blocked = true;                     // e.g. iOS refusing activation on pointerdown
    f.gesture('pointerdown', true);
    await flush();
    assert.equal(f.music._unlockedFiles.size, 0, 'refused unlock elements are dropped');
    f.state.blocked = false;                    // the touchend/click of the same tap is accepted
    f.gesture('touchend', true);
    await flush();
    assert.deepEqual([...f.music._unlockedFiles.keys()].sort(), ['battle', 'menu']);
  } finally { f.music.dispose(); }
});

test('the AbortError from the immediate pause() keeps the unlock', async () => {
  const f = await rig();
  try {
    f.state.abort = true;
    f.gesture('pointerdown', true);
    await flush();
    assert.deepEqual([...f.music._unlockedFiles.keys()].sort(), ['battle', 'menu'], 'an interrupted play is still a granted unlock');
  } finally { f.music.dispose(); }
});
