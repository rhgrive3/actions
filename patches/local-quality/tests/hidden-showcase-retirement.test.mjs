import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { retireHiddenStudio } from '../showcase-shadow.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const studioSource = adaptBuildSource('src/game/showcase.js', read('src/game/showcase.js'));
const gameSource = adaptBuildSource('src/main.js', read('src/main.js'));
const classNode = parse(studioSource, { ecmaVersion: 'latest', sourceType: 'module' }).body
  .find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'Showcase').declaration;
const names = ['_clear', 'hide', 'update', '_showPedestal', 'showLocker', 'retireHiddenStudio'];
const methods = names.map(name => {
  const node = classNode.body.body.find(node => node.key.name === name);
  assert.ok(node, 'production Showcase method ' + name);
  return studioSource.slice(node.start, node.end);
}).join('\n');
const PEDESTAL = new Set(['loadout', 'locker']), OVERLAY = new Set(['loadout', 'locker', 'results']);
const Showcase = new Function('THREE', 'retireHiddenStudio', 'PEDESTAL', 'OVERLAY', 'ZERO_M', 'G', 'sameStyle',
  'return class Showcase {\n' + methods + '\n};')(
    THREE, retireHiddenStudio, PEDESTAL, OVERLAY, new THREE.Matrix4(), {}, () => true);

function fixture() {
  const calls = { disposed: 0, created: 0, shadowDisposed: 0, clears: 0, updates: 0, poolDisposed: 0 };
  class Character {
    static requireWeaponOpponentPalette() { return false; }
    constructor() { calls.created++; this.root = new THREE.Group(); }
    dispose() { calls.disposed++; }
    setColor() {}
  }
  const showcase = Object.assign(Object.create(Showcase.prototype), {
    CharacterClass: Character, mode: 'locker', _lastMode: 'locker', _out: 0,
    _warmState: 'done', _warmChar: null, _pflight: 0, _pq: [],
    scene: new THREE.Scene(), chars: [], color: new THREE.Color('#ff00aa'),
    stageL: { group: new THREE.Group() }, stageR: { group: new THREE.Group() },
    fx: { clear() {}, update() {} }, confetti: { clear() {}, update() {} }, sparks: { clear() {}, update() {} },
    contact: { count: 1, setMatrixAt() {}, instanceMatrix: {}, instanceColor: {} },
    decks: [], ui: {}, _tgt: new THREE.Vector3(), t: 0, shotT: 0, fadeIn: 0,
    _anim: () => ({}), _profileStyle: () => ({}), _aimLights() {}, _setColor() {},
    _updateSet() {}, _updateLoadout() { calls.updates++; }, _updateResults() { calls.updates++; },
    _releasePortraitTargets() {},
  });
  const old = new Character();
  showcase.scene.add(old.root); showcase.chars.push(old);
  showcase.stageL.group.visible = true;
  showcase.stageR.group.visible = false;
  const map = new THREE.WebGLRenderTarget(128, 128), mapPass = new THREE.WebGLRenderTarget(128, 128);
  for (const rt of [map, mapPass]) rt.addEventListener('dispose', () => calls.shadowDisposed++);
  showcase.key = { shadow: { map, mapPass } };
  const clear = showcase._clear;
  showcase._clear = function () { calls.clears++; return clear.call(this); };
  showcase._portraitCharacter = { dispose() { calls.poolDisposed++; } };
  return { showcase, calls, old };
}

const SCREENS = new Set(['main', 'mode', 'setup', 'loadout', 'locker', 'settings', 'howto', 'credits', 'online']);
function frameGate(showcase, { baseline = false, screen = 'loadout', current = screen, attract = true, mode = 'menu' } = {}) {
  const begin = gameSource.indexOf('  _frame(dt) {') + '  _frame(dt) {'.length;
  const end = gameSource.indexOf('    const tA = performance.now();', begin);
  assert.ok(begin > 0 && end > begin);
  const body = gameSource.slice(begin, end);
  const native = baseline ? body.replace("      if (artScreen !== 'locker') this.showcase?.retireHiddenStudio?.(dt);\n", '') : body;
  if (baseline) assert.notEqual(native, body, 'inverse removes only the new hidden-stage connection');
  let lockerFrames = 0;
  const G = { mode, time: 0, renderer: {} };
  const owner = { showcase, match: { attract }, menus: { current, _scr: { name: screen }, update() {} },
    input: { pollPad() {}, endFrame() {} }, _padMenus() {} };
  const frame = new Function('G', 'INKWAVE_ART_MENU_SCREENS', 'renderInkwaveLockerStage',
    'return function(dt) {\n' + native + '\nthrow Error("full-world-frame");\n};')(
      G, SCREENS, () => { lockerFrames++; });
  return { run(dt = 1 / 60) { return frame.call(owner, dt); }, get lockerFrames() { return lockerFrames; } };
}

test('the composed static gate reproduces a permanently retained locker kid before the new retirement connection', () => {
  const before = fixture(); before.showcase.hide();
  const oldGate = frameGate(before.showcase, { baseline: true });
  for (let i = 0; i < 600; i++) oldGate.run();
  assert.equal(before.showcase._out, .2);
  assert.equal(before.showcase.chars[0], before.old);
  assert.equal(before.old.root.parent, before.showcase.scene);
  assert.equal(before.calls.disposed, 0);
  assert.equal(before.calls.shadowDisposed, 0);

  const after = fixture(); after.showcase.hide();
  const nextGate = frameGate(after.showcase);
  for (let i = 0; i < 600; i++) nextGate.run();
  assert.equal(after.showcase._out, 0);
  assert.equal(after.showcase.chars.length, 0);
  assert.equal(after.old.root.parent, null);
  assert.equal(after.calls.disposed, 1);
  assert.equal(after.calls.clears, 1);
  assert.ok(after.calls.updates > 0 && after.calls.updates < 14, 'only the short native fade ticks behind art');
  assert.equal(after.calls.shadowDisposed, 2);
  assert.equal(after.showcase.key.shadow.map, null);
  assert.equal(after.showcase.key.shadow.mapPass, null);
  assert.equal(after.calls.poolDisposed, 0, 'shared portrait character stays alive');
});

test('quick Locker return preserves the native fade-resume kid and a later return rebuilds normally', () => {
  const f = fixture(), sc = f.showcase;
  sc.hide();
  const gate = frameGate(sc);
  gate.run(.05); gate.run(.05);
  assert.ok(sc._out > 0);
  sc.showLocker({}, f.showcase.color, 'shooter');
  assert.equal(sc.mode, 'locker');
  assert.equal(sc.chars[0], f.old);
  assert.equal(sc._out, 0);
  assert.equal(f.calls.created, 1, 'short return does not instantiate another Character');
  assert.equal(f.calls.shadowDisposed, 0);

  sc.hide();
  for (let i = 0; i < 30; i++) gate.run();
  sc.showLocker({}, f.showcase.color, 'shooter');
  assert.equal(sc.mode, 'locker');
  assert.equal(sc.chars.length, 1);
  assert.notEqual(sc.chars[0], f.old);
  assert.equal(f.calls.created, 2);
  assert.equal(sc.stageL.group.visible, true);
  assert.equal(sc.phase, 'emerge', 'fresh entry retains native choreography');
});

test('a sequence of Locker exits retires exactly the departed characters without idle ticking', () => {
  const f = fixture(), sc = f.showcase, gate = frameGate(sc);
  for (let cycle = 0; cycle < 25; cycle++) {
    sc.hide();
    for (let i = 0; i < 20; i++) gate.run();
    assert.equal(sc.chars.length, 0);
    const updates = f.calls.updates;
    for (let i = 0; i < 30; i++) gate.run();
    assert.equal(f.calls.updates, updates);
    sc.showLocker({}, sc.color, 'shooter');
  }
  assert.equal(f.calls.disposed, 25);
  assert.equal(f.calls.clears, 50, 'one fade clear plus native fresh-entry clear per cycle');
  assert.equal(f.calls.poolDisposed, 0);
});

for (const hz of [30, 60, 120]) test('hidden fade matches native teardown time and then parks at ' + hz + 'Hz', () => {
  const before = fixture(), after = fixture();
  before.showcase.hide(); after.showcase.hide();
  let beforeDisposed = -1, afterDisposed = -1;
  for (let frame = 1; frame <= hz; frame++) {
    before.showcase.update(1 / hz);
    after.showcase.retireHiddenStudio(1 / hz);
    if (beforeDisposed < 0 && before.calls.disposed) beforeDisposed = frame;
    if (afterDisposed < 0 && after.calls.disposed) afterDisposed = frame;
    assert.equal(after.showcase._out, before.showcase._out);
    assert.equal(after.showcase.t, before.showcase.t);
    assert.equal(after.calls.updates, before.calls.updates);
  }
  assert.ok(beforeDisposed > 0);
  assert.equal(afterDisposed, beforeDisposed, 'native fade/clear boundary remains exact');
  const count = after.calls.updates;
  for (let frame = 0; frame < hz * 5; frame++) after.showcase.retireHiddenStudio(1 / hz);
  assert.equal(after.calls.updates, count, 'idle static menu never updates the retired stage');
});

test('zero-time and frozen frames do not advance hidden fades or force a fresh Locker entry', () => {
  const f = fixture(), sc = f.showcase;
  sc.hide();
  const gate = frameGate(sc);
  for (let i = 0; i < 120; i++) gate.run(0);
  assert.equal(sc._out, .2);
  assert.equal(f.calls.updates, 0);
  assert.equal(f.calls.disposed, 0);
  assert.equal(f.calls.shadowDisposed, 0);
  sc.showLocker({}, sc.color, 'shooter');
  assert.equal(sc.chars[0], f.old);
  assert.equal(sc._out, 0);
  assert.equal(f.calls.created, 1);
});

test('shader warm-up and live portrait owners keep their shadow attachments until safe', () => {
  const f = fixture(), sc = f.showcase;
  sc.hide(); sc._warmState = 'busy';
  const warm = { root: new THREE.Group(), dispose() { assert.fail('warm-up owner was destroyed'); } };
  sc._warmChar = warm;
  for (let i = 0; i < 30; i++) sc.retireHiddenStudio(1 / 60);
  assert.equal(sc._out, .2);
  assert.equal(sc._warmChar, warm);
  assert.equal(f.calls.clears, 0);
  assert.equal(f.calls.shadowDisposed, 0);
  sc._warmChar = null; sc._warmState = 'done';
  const blockers = [['_portraitJob', { cbs: [() => {}] }], ['_portraitTask', { id: 1 }], ['_pflight', 1],
    ['_portraitActiveCharacter', {}], ['_portraitPreparedCharacter', {}], ['_pq', [{ cbs: [() => {}] }]]];
  for (const [key, value] of blockers) {
    sc[key] = value;
    for (let i = 0; i < 30; i++) sc.retireHiddenStudio(1 / 60);
    assert.equal(f.calls.shadowDisposed, 0, key + ' keeps the shared portrait lights valid');
    sc[key] = key === '_pq' ? [] : key === '_pflight' ? 0 : null;
  }
  sc._pq = [{ cbs: [] }];
  sc.retireHiddenStudio(1 / 60);
  assert.equal(f.calls.shadowDisposed, 2, 'cancelled no-waiter jobs do not pin shadow maps');
  assert.equal(f.calls.poolDisposed, 0);
});

test('visible Locker, room, results and real match frames retain their original owners', () => {
  for (const mode of ['locker', 'loadout', 'results', 'hub', 'lobby']) {
    const f = fixture(); f.showcase.mode = mode; f.showcase._out = .2;
    f.showcase.retireHiddenStudio(1 / 60);
    assert.equal(f.showcase.chars[0], f.old, mode);
    assert.equal(f.calls.updates, 0, mode);
    assert.equal(f.calls.shadowDisposed, 0, mode);
  }
  const locker = fixture(); locker.showcase.hide();
  const gate = frameGate(locker.showcase, { screen: 'locker' });
  gate.run();
  assert.equal(gate.lockerFrames, 1);
  assert.equal(locker.calls.clears, 0, 'visible locker keeps its own renderer/update path');
  for (const opts of [{ screen: 'lobby' }, { screen: 'results' }, { mode: 'match', attract: false }]) {
    const f = fixture(); f.showcase.hide();
    assert.throws(() => frameGate(f.showcase, opts).run(), /full-world-frame/);
    assert.equal(f.calls.clears, 0);
  }
});
