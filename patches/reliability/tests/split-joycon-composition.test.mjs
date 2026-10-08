import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const INPUT_REL = 'src/core/input.js';
const PLAYER_REL = 'src/game/player.js';
const inputSource = adaptBuildSource(INPUT_REL, fs.readFileSync(path.join(ROOT, 'inkwave-public', INPUT_REL), 'utf8'));
const playerSource = adaptBuildSource(PLAYER_REL, fs.readFileSync(path.join(ROOT, 'inkwave-public', PLAYER_REL), 'utf8'));

const nativeButtons = (length = 17) => Array.from({ length }, () => ({ pressed: false, touched: false, value: 0 }));
const button = value => ({ pressed: value > 0.3, touched: value > 0, value });
const joycon = (index, side, axes, held = {}) => {
  const product = side === 'L' ? '2006' : '2007';
  const buttons = nativeButtons(17);
  for (const [index, value] of Object.entries(held)) buttons[Number(index)] = button(value);
  return { index, id: `Joy-Con (${side}) (STANDARD GAMEPAD Vendor: 057e Product: ${product})`, connected: true,
    mapping: 'standard', axes, buttons, timestamp: 1 };
};
const standardPad = (index, id = `standard-${index}`, axes = [0, 0, 0, 0], held = {}) => {
  const buttons = nativeButtons(17);
  for (const [buttonIndex, value] of Object.entries(held)) buttons[Number(buttonIndex)] = button(value);
  return { index, id, connected: true, mapping: 'standard', axes, buttons, timestamp: 1 };
};

async function boot() {
  let pads = [];
  const inputListeners = new Map(), inputContext = vm.createContext({ console, performance });
  const listen = (name, fn) => inputListeners.set(name, [...(inputListeners.get(name) || []), fn]);
  const unlisten = (name, fn) => inputListeners.set(name, (inputListeners.get(name) || []).filter(item => item !== fn));
  inputContext.addEventListener = listen; inputContext.removeEventListener = unlisten;
  inputContext.screen = { orientation: { addEventListener: listen, removeEventListener: unlisten } };
  inputContext.window = { addEventListener: listen, removeEventListener: unlisten };
  inputContext.document = { addEventListener: listen, removeEventListener: unlisten, hidden: false, hasFocus: () => true, pointerLockElement: null };
  inputContext.navigator = { getGamepads: () => pads, userAgent: 'composition fixture', maxTouchPoints: 0 };
  const inputDeps = new Map();
  const inputModule = new vm.SourceTextModule(inputSource, { context: inputContext, identifier: path.join(ROOT, 'inkwave-public', INPUT_REL) });
  await inputModule.link((spec, from) => {
    if (spec === './ctx.js') return stubModule(inputContext, inputDeps, spec, 'export const G = { settings: {} };');
    if (spec === './device.js') return stubModule(inputContext, inputDeps, spec, 'export const touchPrimary = false;');
    if (spec === './mobile.js') return stubModule(inputContext, inputDeps, spec, 'export class MobileInput { constructor() {} }');
    const file = spec.startsWith('../../patches/') ? path.join(ROOT, 'patches', spec.slice('../../patches/'.length)) : path.resolve(path.dirname(from.identifier), spec);
    if (!file.startsWith(path.join(ROOT, 'patches') + path.sep)) throw new Error(`unexpected input dependency: ${spec}`);
    return fileModule(inputContext, inputDeps, file);
  });
  await inputModule.evaluate();
  const input = new inputModule.namespace.Input({});

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
  }
  const G = { settings: { aimAssist: 0, sensitivity: 1, padSensitivity: 1, invertY: false }, rig: { mapK: 0 }, actors: [] };
  const playerContext = vm.createContext({ console, performance });
  const playerDeps = {
    three: `export class Vector3 { constructor(...v) { return new globalThis.Vector3(...v); } }`,
    '../core/ctx.js': 'export const G = globalThis.G; export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); export const lerp=(a,b,t)=>a+(b-a)*t; export const angleDiff=(a,b)=>((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;',
    '../config.js': 'export const PLAYER = { radius: 0.4, squidHeight: 0.4, height: 1.8 };',
    './physics.js': 'export class Physics {} export class Hit {}',
  };
  playerContext.Vector3 = Vector3;
  playerContext.G = G;
  const playerDepsCache = new Map();
  const playerModule = new vm.SourceTextModule(playerSource, { context: playerContext, identifier: path.join(ROOT, 'inkwave-public', PLAYER_REL) });
  await playerModule.link(spec => {
    if (spec === '../../patches/splatoon3/runtime/weapons-fidelity.mjs') {
      return stubModule(playerContext, playerDepsCache, spec, 'export function updateShotGuide() {} export function projectShotGuide() {}');
    }
    // Input-pair tests do not enter menus. The production controller now imports
    // menu takeover hooks, which belong to their separately tested lifecycle.
    if (spec === '../../patches/reliability/menu-takeover.mjs') {
      return stubModule(playerContext, playerDepsCache, spec,
        'export function cancelMenuGameplay() {} export function rearmMenuGameplay() {}');
    }
    if (!(spec in playerDeps)) throw new Error(`unexpected player dependency: ${spec}`);
    return stubModule(playerContext, playerDepsCache, spec, playerDeps[spec]);
  });
  await playerModule.evaluate();
  const actor = { team: 0, intent: { move: new Vector3(), fire: false, jump: false, squid: false, sub: false, special: false },
    canSuperJump: () => false };
  const rig = { yaw: 0, pitch: 0 };
  const controller = new playerModule.namespace.PlayerController(actor, rig, input);
  controller._assistTarget = () => null;
  controller.computeAim = () => {};
  return { input, actor, rig, controller, setPads(next) { pads = next; }, event(name, value = {}) { for (const fn of inputListeners.get(name) || []) fn(value); } };
}

function stubModule(context, cache, id, source) {
  if (!cache.has(id)) cache.set(id, new vm.SourceTextModule(source, { context, identifier: `stub:${id}` }));
  return cache.get(id);
}

function fileModule(context, cache, file) {
  const id = path.resolve(file);
  if (!cache.has(id)) cache.set(id, new vm.SourceTextModule(fs.readFileSync(id, 'utf8'), { context, identifier: id }));
  return cache.get(id);
}

async function composedPairTrace(reverse) {
  const h = await boot();
  const left = joycon(2, 'L', [-0.2, -0.8], { 6: 0.8 });
  const right = joycon(7, 'R', [0.25, 0.6], { 7: 0.9 });
  assert.equal(left.buttons.length, 17); assert.equal(left.axes.length, 2);
  assert.equal(right.buttons.length, 17); assert.equal(right.axes.length, 2);
  h.setPads(reverse ? [right, left] : [left, right]);
  h.input.pollPad();
  assert.equal(h.input.pad._inkwaveJoyconPair, true);
  assert.equal(h.input.pad.buttons.length, 22, 'the pair restores Chromium composite button slots');
  assert.equal(h.input.pad.axes.length, 4, 'the pair restores both standard sticks');
  assert.equal(h.input.pad.buttons[6].pressed, true, 'left ZL keeps its composite index');
  assert.equal(h.input.pad.buttons[7].pressed, true, 'right ZR keeps its composite index');
  assert.equal(h.input.padPressed.size, 0, 'initially held pair controls do not create press edges');
  h.controller.update(1 / 60);
  assert.equal(h.actor.intent.squid, false, 'initial held ZL is rebased until release');
  assert.equal(h.actor.intent.fire, false, 'initial held ZR is rebased until release');
  assert.equal(h.rig.yaw, 0, 'initial stick takeover is rebased');

  left.axes.fill(0); right.axes.fill(0);
  left.buttons[6] = button(0); right.buttons[7] = button(0);
  h.input.pollPad();
  left.axes.splice(0, 2, -0.2, -0.8);
  right.axes.splice(0, 2, 0.25, 0.6);
  left.buttons[6] = button(0.8); right.buttons[7] = button(0.9);
  h.input.pollPad();
  assert.equal(h.input.pad._inkwaveJoyconPair, true, 'stick motion keeps the documented standalone shape');
  h.controller.update(1 / 60);
  assert.equal(h.input.lastDevice, 'pad', 'fresh pair input follows existing device auto-selection');
  assert.deepEqual([...h.input.padPressed].sort((a, b) => a - b), [6, 7]);
  return {
    axes: [...h.input.pad.axes],
    move: [h.actor.intent.move.x, h.actor.intent.move.y, h.actor.intent.move.z],
    camera: [h.rig.yaw, h.rig.pitch],
    squid: h.actor.intent.squid,
    fire: h.actor.intent.fire,
  };
}

test('the full six-stage Input.pollPad composition combines recognized L/R axes and triggers in PlayerController', async () => {
  const forward = await composedPairTrace(false), reverse = await composedPairTrace(true);
  assert.deepEqual(forward, reverse, 'Gamepad list order does not select or drop a Joy-Con half');
  assert.deepEqual(forward.axes, [0.8, -0.2, 0.6, -0.25]);
  assert.ok(Math.hypot(forward.move[0], forward.move[2]) > 0.2, 'the left unit moves the player');
  assert.notEqual(forward.camera[0], 0, 'the right unit steers camera yaw');
  assert.notEqual(forward.camera[1], 0, 'the right unit steers camera pitch');
  assert.equal(forward.squid, true, 'left ZL reaches squid input');
  assert.equal(forward.fire, true, 'right ZR reaches fire input');
});

test('only one unambiguous recognized Joy-Con pair is composed; standard pads retain priority', async () => {
  const h = await boot();
  const left = joycon(2, 'L', [0, 0]), right = joycon(7, 'R', [0, 0]);
  const ordinary = standardPad(11, 'unrelated standard controller');
  h.setPads([left, right, ordinary]); h.input.pollPad();
  assert.equal(h.input.pad, ordinary, 'an existing standard controller wins over pair synthesis');

  const combined = standardPad(12, 'Nintendo Charging Grip (STANDARD GAMEPAD Vendor: 057e Product: 200e)');
  combined.buttons = nativeButtons(22);
  h.setPads([combined]); h.input.pollPad();
  assert.equal(h.input.pad, combined, 'an OS-combined Nintendo controller is used as-is');
  assert.equal(h.input.pad._inkwaveJoyconPair, undefined, 'a pre-combined 200e device is not composed a second time');
  assert.equal(combined.buttons.length, 22); assert.equal(combined.axes.length, 4);

  const first = standardPad(20, 'first unrelated pad', [0.7, 0, 0, 0]);
  const second = standardPad(21, 'second unrelated pad', [0, 0, 0.9, 0]);
  h.setPads([first, second]); h.input.pollPad();
  assert.equal(h.input.pad, first, 'arbitrary standard controllers are never merged');

  const partialLeft = joycon(22, 'L', [0, 0], {});
  partialLeft.buttons = partialLeft.buttons.slice(0, 8);
  const fullRight = joycon(23, 'R', [0, 0]);
  h.setPads([partialLeft, fullRight]); h.input.pollPad();
  assert.equal(h.input.pad, partialLeft, 'partial mappings do not qualify as the supported Chromium layout');

  const mixedLeft = joycon(24, 'L', [0]);
  const validRight = joycon(25, 'R', [0, 0]);
  h.setPads([mixedLeft, validRight]); h.input.pollPad();
  assert.equal(h.input.pad._inkwaveJoyconPair, undefined, 'a mixed unsupported shape cannot activate pair composition');
  assert.equal(h.input.pad, mixedLeft);

  h.setPads([left]); h.input.pollPad();
  assert.equal(h.input.pad, left, 'a lone Joy-Con stays a single standard-mapped device');
  const extraLeft = joycon(3, 'L', [0, 0]), extraRight = joycon(9, 'R', [0, 0]);
  h.setPads([left, extraLeft, right, extraRight]); h.input.pollPad();
  assert.equal(h.input.pad, left, 'ambiguous multiple pairs fall back to existing first-standard priority');
});

test('Chromium standalone button slots return to their two-hand composite positions', async () => {
  const h = await boot();
  const left = joycon(2, 'L', [0, 0], { 0: 1, 4: 1, 8: 1, 16: 1 });
  const right = joycon(7, 'R', [0, 0], { 2: 1, 5: 1, 8: 1, 16: 1 });
  h.setPads([left, right]); h.input.pollPad();
  assert.equal(h.input.pad._inkwaveJoyconPair, true);
  assert.equal(h.input.pad.buttons[14].pressed, true, 'left horizontal d-pad action maps to composite d-pad left');
  assert.equal(h.input.pad.buttons[18].pressed, true, 'left SL maps to the left-side grip shoulder');
  assert.equal(h.input.pad.buttons[4].pressed, true, 'left L maps to the grip L shoulder');
  assert.equal(h.input.pad.buttons[17].pressed, true, 'left capture remains an extra composite button');
  assert.equal(h.input.pad.buttons[0].pressed, true, 'right face action maps to composite B');
  assert.equal(h.input.pad.buttons[21].pressed, true, 'right SR maps to the right-side grip shoulder');
  assert.equal(h.input.pad.buttons[5].pressed, true, 'right R maps to the grip R shoulder');
  assert.equal(h.input.pad.buttons[16].pressed, true, 'right Home stays the composite meta button');
});

test('disconnect, reconnect, and member disconnect events rebase composite held controls', async () => {
  const h = await boot();
  const left = joycon(2, 'L', [0, 0]), right = joycon(7, 'R', [0, 0]);
  h.setPads([left, right]); h.input.pollPad();
  left.buttons[6] = button(0.8); right.buttons[7] = button(0.9);
  h.input.pollPad(); h.controller.update(1 / 60);
  assert.deepEqual([...h.input.padPressed].sort((a, b) => a - b), [6, 7]);
  assert.equal(h.actor.intent.squid, true); assert.equal(h.actor.intent.fire, true);

  h.setPads([right]); h.input.pollPad(); h.controller.update(1 / 60);
  assert.equal(h.input.pad, right, 'one disconnected half degrades to the connected half');
  assert.equal(h.input.padPressed.size, 0, 'the remaining held trigger does not create an edge');
  assert.equal(h.input.padValue(7), 0, 'the held trigger is blocked across handoff');
  assert.equal(h.actor.intent.fire, false, 'disconnect cannot preserve a held fire action');

  h.setPads([left, right]); h.input.pollPad(); h.controller.update(1 / 60);
  assert.equal(h.input.pad._inkwaveJoyconPair, true);
  assert.equal(h.input.padPressed.size, 0, 'reconnect does not synthesize trigger edges');
  assert.equal(h.input.padValue(6), 0); assert.equal(h.input.padValue(7), 0);

  h.event('gamepaddisconnected', { gamepad: right });
  h.input.pollPad();
  assert.equal(h.input.padPressed.size, 0, 'disconnect of either composite member rebases the pair');
  assert.equal(h.input.padValue(7), 0);

  left.axes.fill(0); right.axes.fill(0);
  left.buttons[6] = button(0); right.buttons[7] = button(0); h.input.pollPad();
  left.buttons[6] = button(0.8); right.buttons[7] = button(0.9); h.input.pollPad(); h.controller.update(1 / 60);
  assert.deepEqual([...h.input.padPressed].sort((a, b) => a - b), [6, 7], 'fresh presses work after both controls release');
  assert.equal(h.actor.intent.squid, true); assert.equal(h.actor.intent.fire, true);
});

test('touch gyro routing and keyboard ownership stay available with a composed pair connected', async () => {
  const h = await boot();
  const left = joycon(2, 'L', [0, 0]), right = joycon(7, 'R', [0, 0]);
  h.setPads([left, right]); h.input.pollPad();
  const touch = { active: true, root: {}, moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, mapOpen: false,
    down: () => false, wasPressed: () => false,
    gyro: { enabled: true, consume(out) { out.yaw = 0.12; out.pitch = 0.06; return out; }, discard() {} } };
  h.input.mobile = touch; h.input.lastDevice = 'touch'; h.controller.update(1 / 60);
  assert.equal(h.rig.yaw, 0.12); assert.equal(h.rig.pitch, 0.06);

  touch.active = false;
  h.event('keydown', { code: 'KeyW', repeat: false, preventDefault() {} });
  h.controller.update(1 / 60);
  assert.equal(h.input.lastDevice, 'kbm');
  assert.ok(h.actor.intent.move.z > 0, 'keyboard movement still owns the player while a pair is neutral');
});
