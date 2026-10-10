// Executes real gameplay-adapted Player, Input, MobileInput, Actor and weapons.
// DOM display surfaces and collisions are fixtures; input delivery is production code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { installClock, runSimulation, STEP } from '../../splatoon3/runtime/clock.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const IDS = ['jump', 'squid', 'fire', 'sub', 'special'];
const classList = () => { const values=new Set(); return {add(...names){names.forEach(n=>values.add(n));},remove(...names){names.forEach(n=>values.delete(n));},contains(n){return values.has(n);},toggle(n,on=!values.has(n)){if(on)values.add(n);else values.delete(n);return on;}}; };

export async function boot({ adapt = (rel, source) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source)))), weapon = 'dualies' } = {}) {
  const f = await fixture({ adapt }), listeners = new Map(), modules = new Map();
  let pads = [];
  const context = vm.createContext({ console, performance, AbortController, setTimeout, clearTimeout,
    screen: { width: 1000, height: 700, orientation: { angle: 0 } }, innerWidth: 1000, innerHeight: 700,
    localStorage: { getItem: key => key === 'inkwave.settings' ? '{"lang":"en"}' : null },
    navigator: { userAgent: 'input regression', maxTouchPoints: 0, getGamepads: () => pads },
    window: { addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); } },
    document: { documentElement: { classList: classList() }, addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); }, pointerLockElement: null },
  });
  const synthetic = (identifier, values) => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [name, value] of Object.entries(values)) this.setExport(name, value);
  }, { context, identifier });
  function load(file) {
    if (file.startsWith(path.join(UPSTREAM, 'patches') + path.sep)) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file);
    let mod;
    if (rel === 'src/core/ctx.js' || rel === 'src/config.js' || rel === 'src/game/physics.js') mod = synthetic(file, f);
    else if (file === 'three') mod = synthetic(file, { ...f.THREE });
    else {
      const code = adapt(rel, fs.readFileSync(file, 'utf8'));
      mod = new vm.SourceTextModule(code, { context, identifier: file });
    }
    modules.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule("export { Input } from './src/core/input.js'; export { PlayerController } from './src/game/player.js';", {
    context, identifier: path.join(UPSTREAM, 'touch-test-entry.js'),
  });
  await entry.link((spec, from) => load(spec === 'three' ? spec : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const input = new entry.namespace.Input({}), mobile = input.mobile;
  // Mobile constructor skipped installing display DOM on this headless device.
  // Activate its actual control methods with inert display elements.
  mobile.active = true;
  mobile.root = { classList: classList(), querySelectorAll: () => [], setPointerCapture() {} };
  mobile.els = Object.fromEntries([...IDS, 'map'].map(id => [id, { classList: classList() }]));
  input.lastDevice = 'touch';
  const actor = f.make(weapon), rig = { yaw: 0, pitch: 0 };
  const controller = new entry.namespace.PlayerController(actor, rig, input);
  controller.computeAim = () => {}; // Camera-ray rendering is independent of intent delivery.
  f.G.settings = { aimAssist: 0 }; f.G.rig = rig; f.G.actors = [actor];
  actor.canSuperJump = () => false;
  actor.intent.move.set(1, 0, 0);
  const rows = [];
  const game = { input, rig, _padMenus() {}, match: { paused: false,
    updateController(dt) { controller.update(dt); rows.push(Object.fromEntries(IDS.map(id => [id, actor.intent[id]]))); },
    update(dt) { actor.update(dt); },
  } };
  f.G.projectiles.update = () => {};
  f.G.projectiles.throwBomb = () => f.shots.push({ kind: 'bomb' });
  installClock({ G: f.G });
  let pointerId = 0;
  const press = id => { const event = { pointerId: ++pointerId, clientX: 700, clientY: 400, type: 'pointerdown' }; mobile._press(id, event); return event; };
  const release = event => mobile._up({ ...event, type: 'pointerup' });
  return { ...f, input, mobile, actor, controller, rig, game, rows, press, release,
    tap(id) { release(press(id)); },
    frame(dt = STEP) { runSimulation(game, dt); },
    event(name, event) { for (const fn of listeners.get(name) || []) fn(event); },
    pads(next) { pads = next; },
  };
}

const key = code => ({ code, repeat: false, preventDefault() {} });
const pad = () => ({ connected: true, mapping: 'standard', axes: [-1, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) });

export function device(h, name) {
  h.input.locked = true;
  h.mobile.active = name === 'touch';
  const p = pad(), pointers = new Map();
  if (name === 'keyboard') h.event('keydown', key('KeyD'));
  if (name === 'gamepad') h.pads([p]);
  if (name === 'touch') { h.input.lastDevice = 'touch'; h.mobile.moveX = 1; }
  return (action, down) => {
    if (name === 'keyboard') {
      if (action === 'fire') h.event(down ? 'mousedown' : 'mouseup', { button: 0 });
      else h.event(down ? 'keydown' : 'keyup', key(action === 'jump' ? 'Space' : 'KeyE'));
    } else if (name === 'gamepad') {
      const b = p.buttons[action === 'jump' ? 0 : action === 'fire' ? 7 : 5];
      b.pressed = down; b.value = down ? 1 : 0;
    } else if (down) pointers.set(action, h.press(action));
    else { h.release(pointers.get(action)); pointers.delete(action); }
  };
}
