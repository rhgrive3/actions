import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { fileURLToPath } from 'node:url';
import { checkCompatibility } from '../adapter.mjs';

const EXTRA = `
  export { HUD } from './inkwave-public/src/ui/hud.js';
  export { DioramaOverlay } from './inkwave-public/src/ui/diorama.js';
  export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  export { bigBubblerDomes, bigBubblerRemoteDomes, replayBigBubbler, clearBigBubblers }
    from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
`;
const STEP = 1 / 60;

function domElement(tag) {
  const el = {
    tagName: tag, children: [], style: { setProperty(name, value) { this[name] = value; } },
    attributes: {}, className: '', textContent: '', innerHTML: '', handlers: {},
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    append(...children) { for (const child of children) this.appendChild(child); },
    prepend(child) { child.parentNode = this; this.children.unshift(child); },
    insertBefore(child, before) { child.parentNode = this; const at = this.children.indexOf(before); this.children.splice(at < 0 ? this.children.length : at, 0, child); return child; },
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelector(selector) {
      if (selector === '.iw-bcn__label b') {
        const label = this.querySelector('.iw-bcn__label');
        return label?.children.find(child => String(child?.tagName || '').toLowerCase() === 'b') || null;
      }
      if (selector.includes(' ')) {
        const [parentSelector, childSelector] = selector.trim().split(/\s+/, 2);
        return this.querySelector(parentSelector)?.querySelector(childSelector) || null;
      }
      if (!selector.startsWith('.')) {
        const tag = selector.toUpperCase();
        const visit = node => { for (const child of node?.children || []) { if (String(child?.tagName || '').toUpperCase() === tag) return child; const found = visit(child); if (found) return found; } return null; };
        return visit(this);
      }
      const cls = selector.startsWith('.') ? selector.slice(1) : selector;
      const has = node => String(node?.className || '').split(/\s+/).includes(cls);
      const visit = node => { for (const child of node?.children || []) { if (has(child)) return child; const found = visit(child); if (found) return found; } return null; };
      return visit(this);
    },
    classList: null,
  };
  const classes = () => new Set(String(el.className).split(/\s+/).filter(Boolean));
  el.classList = {
    add(name) { const s = classes(); s.add(name); el.className = [...s].join(' '); },
    remove(name) { const s = classes(); s.delete(name); el.className = [...s].join(' '); },
    toggle(name, force) { const s = classes(), on = force === undefined ? !s.has(name) : !!force; if (on) s.add(name); else s.delete(name); el.className = [...s].join(' '); return on; },
    contains(name) { return classes().has(name); },
  };
  Object.defineProperty(el, 'firstChild', { get() { return this.children[0] || null; } });
  return el;
}

async function boot() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports: EXTRA });
  const { G, THREE, Level, Physics } = f;
  const scene = new THREE.Scene();
  const level = new Level({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -0.5, -100], max: [100, 0, 100] }], half: [],
  });
  Object.assign(G, {
    scene, level, physics: new Physics(level), projectiles: new f.Projectiles(scene),
    settings: { aimAssist: 1, aimAssistMouse: false, sensitivity: 1, padSensitivity: 1 },
    game: { minimap: { w: 100, h: 100, toCanvas(x, z, out) { out.x = (x + 100) / 2; out.y = (z + 100) / 2; } }, mapDef: { name: 'test' }, time: 'day' },
    paint: { sample: () => 1, splat: () => 0 },
    match: { playing: () => true, canRespawn: () => false, local: null },
    actors: [], time: 0,
  });
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  f.context.document = {
    body: domElement('body'), documentElement: domElement('html'),
    createElement: tag => domElement(tag), createTextNode: text => ({ nodeType: 3, textContent: String(text), children: [] }),
  };
  const make = (weapon, team, name, pos, yaw = 0, nid) => {
    const actor = f.make(weapon);
    actor.team = team; actor.name = name; actor.isLocal = true; actor.remote = false;
    actor.nid = nid;
    actor.character.actor = actor;
    actor.spawnAt(new THREE.Vector3(...pos), yaw); actor.aimYaw = yaw; actor.invuln = 0;
    return actor;
  };
  return { ...f, G, THREE, scene, make, close() { G.projectiles.clear(); } };
}

function deploy(f, owner) {
  owner.special = owner.specialCost();
  owner._startSpecial();
  const dome = f.bigBubblerDomes().find(d => d.owner === owner && !d.dead);
  assert.ok(dome, 'the composed Roller activation must deploy a live Big Bubbler');
  return dome;
}

function hudFor(f, actor) {
  const hud = Object.create(f.HUD.prototype);
  hud._map = { cx: 0.5, cy: 0.5, hover: -1, open: true, pressed: -1, pressT: 0, sx: null, sy: null };
  hud._L = {}; hud._mapT = 1; hud.lab = null;
  hud._local = () => actor; hud._snd = () => {}; hud._restart = () => {};
  hud.map = domElement('div'); hud.mapCursor = domElement('div'); hud.mapJumpLine = domElement('div');
  hud.beacons = Array.from({ length: 4 }, (_, i) => hud._makeJumpBeacon(i));
  hud.legendRows = Array.from({ length: 4 }, (_, i) => hud._makeJumpLegendRow(i));
  hud.beaconLayer = domElement('div'); hud.legendList = domElement('div');
  hud.mapLegend = domElement('div');
  for (const el of hud.beacons) hud.beaconLayer.appendChild(el);
  for (const el of hud.legendRows) hud.legendList.appendChild(el);
  hud._bcnP = [];
  return hud;
}

function installDom(f) {
  const camera = new f.THREE.PerspectiveCamera(50, 1280 / 720, 0.1, 250);
  camera.position.set(0, 25, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  f.G.camera = camera;
  const root = domElement('main');
  const diorama = new f.DioramaOverlay(root);
  return diorama;
}

test('#1153 HUD, diorama and Digit5 select separate live friendly domes at their static structure positions', async t => {
  // Native probes must also reject edits to the pinned imported source.
  checkCompatibility(process.env.INKWAVE_UPSTREAM_SOURCE || fileURLToPath(new URL('../../../inkwave-public/', import.meta.url)));
  const f = await boot(); t.after(f.close);
  const ownerA = f.make('roller', 0, 'BubbleA', [0, 0, 0], 0, 10);
  const ownerB = f.make('roller', 0, 'BubbleB', [12, 0, 6], Math.PI / 2, 11);
  const hudViewer = f.make('shooter', 0, 'HUD viewer', [0, 0, 4], 0, 20);
  const padViewer = f.make('shooter', 0, 'Pad viewer', [1, 0, 4], 0, 21);
  const dioViewer = f.make('shooter', 0, 'Diorama viewer', [2, 0, 4], 0, 22);
  f.G.match.local = hudViewer;
  const domeA = deploy(f, ownerA), domeB = deploy(f, ownerB);
  domeB.pos.copy(domeA.pos); // colocated structures must remain separately addressable
  ownerA.pos.set(44, 0, 48); ownerB.pos.set(-40, 0, 45); // deployed positions must not follow owners
  ownerA.alive = false; // an owner's death does not remove the still-live structure
  const targets = f.G.bigBubblerJumpTargets(0);
  assert.equal(targets.length, 2);
  assert.equal(JSON.stringify(targets.map(x => [x.id, x.serial])), JSON.stringify([[domeA.id, domeA.serial], [domeB.id, domeB.serial]]));
  assert.equal(f.G.bigBubblerJumpTargets(1).length, 0, 'enemy-team domes are not map destinations');
  assert.equal(targets[0].pos, domeA.pos, 'the target model carries the dome structure position directly');

  const hud = hudFor(f, hudViewer);
  const hudTargets = hud._beaconTargets();
  assert.equal(hudTargets.length, 6, 'two domes append to the three ally slots and home pad');
  assert.equal(JSON.stringify(hudTargets.slice(4).map(x => [x.kind, x.domeId, x.serial])), JSON.stringify(targets.map(x => ['bubbler', x.id, x.serial])));
  assert.equal(hudTargets[4].x, hudTargets[5].x); assert.equal(hudTargets[4].y, hudTargets[5].y, 'colocated structures share a map coordinate');
  hud._updBeacons(800, 500, STEP);
  assert.equal(hud.beacons.length, 6, 'HUD creates one independently selectable marker and row per live dome');
  assert.notEqual(hud.beacons[4].style.transform, hud.beacons[5].style.transform, 'overlap spreading preserves separate clickable markers');
  hud._jumpTo(4);
  assert.equal(hudViewer.superJumpState.bigBubblerTarget.id, domeA.id, 'HUD marker admission does not route slot 4 to home');
  assert.ok(hudViewer.superJumpState.target.distanceTo(new f.THREE.Vector3(domeA.pos.x, domeA.pos.y, domeA.pos.z)) < 1e-8);
  hudViewer.superJumpState = null; hudViewer.form = 'kid';
  hud._jumpTo(5);
  assert.equal(hudViewer.superJumpState.bigBubblerTarget.id, domeB.id, 'the colocated second HUD marker retains its own activation identity');
  hudViewer.superJumpState = null; hudViewer.form = 'kid';

  const controllerInput = {
    mouse: { dx: 0, dy: 0, left: false, right: false }, pad: null, padPressed: new Set(),
    down: key => key === 'Tab', wasPressed: key => key === 'Digit5', padButton: () => false, padValue: () => 0,
  };
  const controller = new f.PlayerController(padViewer, { yaw: 0, pitch: 0 }, controllerInput);
  f.G.rig = { gameCam: {} };
  controller.update(STEP);
  assert.equal(padViewer.superJumpState.bigBubblerTarget.id, domeA.id, 'Digit5 uses the dome target route, not the base-pad route');
  assert.notDeepEqual(padViewer.superJumpState.target.toArray(), f.G.level.spawnPads[0].toArray());
  padViewer.superJumpState = null; padViewer.form = 'kid';

  const padInput = {
    mouse: { dx: 0, dy: 0, left: false, right: false }, pad: { mapping: 'standard' }, lastDevice: 'pad',
    padPressed: new Set(), down: key => key === 'Tab', wasPressed: () => false,
    padButton: () => false, padValue: () => 0, padStick: (_x, _y, out) => { out.x = out.y = out.mag = 0; }, padAxis: () => 0,
  };
  const padController = new f.PlayerController(padViewer, { yaw: 0, pitch: 0 }, padInput);
  padController.mapHeld = true; padController.navigationEnabled = true;
  f.G.match.controller = padController; f.G.match.local = padViewer; f.G.input = padInput;
  padInput.padPressed.add(5); padController.updatePadMapSelection(true);
  assert.equal(padController.padJumpIndex, 4, 'right shoulder selects the first dynamic target for standard pads');
  hud._local = () => padViewer; hud._updBeacons(800, 500, STEP);
  assert.equal(hud._map.hover, 4, 'the HUD highlights the controller-owned dynamic target');

  f.G.match.local = dioViewer;
  f.G.rig = { dioLook: { x: 0, y: 0 } };
  const diorama = installDom(f);
  diorama.update(STEP, 1);
  assert.equal(diorama.pins.length, 7, 'diorama inserts both dome pins before the self marker');
  assert.equal(JSON.stringify(diorama.pins.slice(4, 6).map(p => [p.bubblerTarget.id, p.bubblerTarget.serial])), JSON.stringify(targets.map(x => [x.id, x.serial])));
  f.G.match.local = padViewer; diorama.update(STEP, 1);
  assert.equal(diorama.hover, 4, 'the diorama highlights the same controller-owned dynamic target');
  padInput.padPressed.add(1); padController.updatePadMapSelection(true);
  assert.equal(padViewer.superJumpState.bigBubblerTarget.id, domeA.id, 'standard pad A confirms the independent Bubbler slot');
  padViewer.superJumpState = null; padViewer.form = 'kid';
  const projected = domeA.pos.clone().setY(domeA.pos.y + 0.1).project(f.G.camera);
  assert.ok(Math.abs(diorama.pins[4].x - (projected.x * 0.5 + 0.5) * 1280) < 1e-7);
  assert.ok(Math.abs(diorama.pins[4].y - (0.5 - projected.y * 0.5) * 720) < 1e-7);
  f.G.match.local = dioViewer;
  diorama._jump(5, dioViewer);
  assert.equal(dioViewer.superJumpState.bigBubblerTarget.id, domeB.id, 'diorama pin 5 selects the second dome identity');

  assert.equal(domeA.dead, false); assert.equal(domeB.dead, false);
  assert.equal(domeA.hp, domeA.hpMax); assert.equal(domeB.hp, domeB.hpMax);
  assert.equal(ownerA.special, 0); assert.equal(ownerB.special, 0);
});

test('#1153 dead-map Digit5 queues only a live Bubbler identity through respawn', async t => {
  const f = await boot(); t.after(f.close);
  const owner = f.make('roller', 0, 'Owner', [0, 0, 0], 0, 41);
  const jumper = f.make('shooter', 0, 'Queued jumper', [0, 0, 5], 0, 42);
  const dome = deploy(f, owner), target = f.G.bigBubblerJumpTargets(0)[0];
  let pressed = new Set(['Digit5']);
  const input = {
    mouse: { dx: 0, dy: 0, left: false, right: false }, pad: null, padPressed: new Set(), pressed,
    lastDevice: 'keyboard', navigationDevice: 'keyboard', down: key => key === 'Tab',
    wasPressed: key => pressed.has(key), padButton: () => false, padValue: () => 0,
  };
  const controller = new f.PlayerController(jumper, { yaw: 0, pitch: 0 }, input);
  controller.navigationEnabled = true; f.G.match.controller = controller;
  jumper.alive = false;
  controller.update(STEP);
  assert.deepEqual({ id: controller.pendingRespawnJump.bubbler.id, serial: controller.pendingRespawnJump.bubbler.serial },
    { id: dome.id, serial: dome.serial }, 'dead map input stores activation identity, not a stale owner point');
  assert.equal(jumper.superJumpState, null);

  jumper.alive = true; jumper.grounded = true; pressed = new Set(); input.pressed = pressed;
  controller.updateRespawnNavigation();
  assert.equal(jumper.superJumpState.bigBubblerTarget.id, dome.id, 'respawn resolves the still-live activation through native admission');
  jumper.superJumpState = null; jumper.form = 'kid'; jumper.alive = false;
  controller.update(STEP); // reopen dead-map navigation
  pressed = new Set(['Digit5']); input.pressed = pressed;
  controller.update(STEP);
  assert.equal(controller.pendingRespawnJump.bubbler.id, dome.id);
  f.clearBigBubblers('test-expiry-before-respawn');
  jumper.alive = true; jumper.grounded = true; pressed = new Set(); input.pressed = pressed;
  controller.updateRespawnNavigation();
  assert.equal(jumper.superJumpState, null, 'an expired queued activation never turns into a jump to its owner');
  assert.equal(controller.pendingRespawnJump, null);
});

test('#1153 charge rejects a collapsed target; an admitted flight keeps its committed static landing point', async t => {
  const f = await boot(); t.after(f.close);
  const owner = f.make('roller', 0, 'Owner', [0, 0, 0], Math.PI, 31);
  const charger = f.make('shooter', 0, 'Charger', [0, 0, 5], 0, 32);
  const aborter = f.make('shooter', 0, 'Aborter', [4, 0, 5], 0, 33);
  const dome = deploy(f, owner);
  owner.pos.set(60, 0, 60);
  const [target] = f.G.bigBubblerJumpTargets(0);
  assert.equal(charger.superJumpToBubbler(target), true);
  const staticPoint = charger.superJumpState.to.clone();
  f.clearBigBubblers('test-collapse-before-takeoff');
  assert.equal(charger.superJumpState.phase, 'charge');
  charger.update(STEP);
  assert.equal(charger.superJumpState, null, 'a collapse during charge cancels safely in place');
  assert.ok(charger.pos.distanceTo(staticPoint) > 1, 'a canceled charge does not teleport');
  assert.equal(charger.superJumpToBubbler(target), false, 'a stale identity cannot be re-admitted');
  assert.equal(aborter.superJumpToBubbler(target), false);
  assert.equal(dome.dead, true);

  const secondDome = deploy(f, owner);
  const current = f.G.bigBubblerJumpTargets(0).find(x => x.id === secondDome.id);
  assert.equal(charger.superJumpToBubbler(current), true);
  for (let i = 0; charger.superJumpState.phase === 'charge' && i < 400; i++) { f.G.time += STEP; charger.update(STEP); }
  assert.equal(charger.superJumpState.phase, 'flight');
  const committed = charger.superJumpState.to.clone();
  assert.ok(committed.distanceTo(secondDome.pos) < 1e-8);
  f.clearBigBubblers('test-collapse-after-takeoff');
  owner.pos.set(-70, 0, -70);
  for (let i = 0; charger.superJumpState && i < 400; i++) { f.G.time += STEP; charger.update(STEP); }
  assert.equal(charger.superJumpState, null);
  assert.ok(charger.pos.distanceTo(committed) < 1e-5, 'takeoff retains the legal committed Bubbler point after expiry');
  assert.notEqual(charger.pos.x, owner.pos.x, 'the completed flight never falls back to the owner');
});

test('#1153 remote Bubbler lifecycle is one static map target and fixed-step jumps match at 30/60/120 Hz', async t => {
  const first = await boot(); t.after(first.close);
  const proxy = first.make('roller', 0, 'Remote owner', [0, 0, 0], 0, 71); proxy.remote = true; proxy.isLocal = false;
  proxy.owner = 'host';
  const local = first.make('roller', 0, 'Local authority duplicate', [0, 0, 0], 0, 71);
  const localDome = deploy(first, local);
  const payload = { domeId: localDome.id, serial: localDome.serial, team: 0,
    pos: [localDome.pos.x, localDome.pos.y, localDome.pos.z], t: 0, hp: localDome.hp, fieldHp: localDome.fieldHp };
  const net = new first.NetMatch({ myId: 'guest', hostId: 'host', isHost: false, _members: new Map([['host', true]]) }, {});
  net.byNid.set(proxy.nid, proxy); first.G.netm = net;
  assert.equal(net.replayKitEvent('kit:bubbler:deploy', { ...payload, actor: proxy }, 'host'), true,
    'the composed NetMatch sender-bound path ingests the host structure event');
  assert.equal(first.G.bigBubblerJumpTargets(0).length, 1, 'duplicate local and replay copies share one map identity');
  assert.equal(first.G.bigBubblerJumpTargets(0)[0].pos, localDome.pos, 'local structure authority wins the duplicate');
  assert.equal(first.bigBubblerRemoteDomes().length, 1);
  const remoteOwner = first.make('roller', 0, 'Second remote owner', [0, 0, 0], 0, 72);
  remoteOwner.remote = true; remoteOwner.isLocal = false; remoteOwner.owner = 'host'; net.byNid.set(remoteOwner.nid, remoteOwner);
  const remotePayload = { domeId: '0:n72:1', serial: 1, team: 0, pos: [25, 0, 25], t: 0, hp: 1, fieldHp: 1 };
  assert.equal(net.replayKitEvent('kit:bubbler:deploy', { ...remotePayload, actor: remoteOwner }, 'host'), true);
  const remoteTarget = first.G.bigBubblerJumpTargets(0).find(d => d.id === remotePayload.domeId);
  assert.ok(remoteTarget, 'a remote-only deploy becomes a selectable teammate target');
  remoteOwner.pos.set(-50, 0, -50);
  const remoteJumper = first.make('shooter', 0, 'Guest jumper', [1, 0, 5], 0, 73);
  assert.equal(remoteJumper.superJumpToBubbler(remoteTarget), true);
  assert.equal(remoteJumper.superJumpState.bigBubblerTarget.id, remotePayload.domeId);
  assert.ok(remoteJumper.superJumpState.target.distanceTo(new first.THREE.Vector3(25, 0, 25)) < 1e-8,
    'guest admission uses the replicated structure point after owner movement');
  remoteJumper.owner = 'guest'; net.bind({ actors: [remoteJumper] });
  for (let i = 0; remoteJumper.superJumpState?.phase === 'charge' && i < 400; i++) {
    first.G.time += STEP; remoteJumper.update(STEP);
  }
  const flight = net.out.find(row => row[1] === 'ev' && row[2] === 'superjump' && row[3].phase === 'flight');
  assert.ok(flight, 'the real owner event recorder forwards the ordinary Super Jump flight event');
  assert.equal(JSON.stringify(flight[3].to), JSON.stringify([25, 0, 25]),
    'the existing peer event commits the replicated Bubbler ground point');
  net.dispose();

  let expected;
  for (const hz of [30, 60, 120]) {
    const f = await boot(); t.after(f.close);
    const owner = f.make('roller', 0, 'Cadence owner', [0, 0, 0], Math.PI, 81);
    const jumper = f.make('shooter', 0, 'Cadence jumper', [0, 0, 8], 0, 82);
    const dome = deploy(f, owner), target = f.G.bigBubblerJumpTargets(0)[0];
    owner.pos.set(55, 0, 55);
    assert.equal(jumper.superJumpToBubbler(target), true);
    const clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 4; frame++) clock.advance(1 / hz, dt => {
      f.G.time += dt; jumper.update(dt);
      rows.push([jumper.pos.toArray(), jumper.superJumpState?.phase || null,
        jumper.superJumpState?.to?.toArray() || null, dome.hp, dome.dead]);
    });
    const result = JSON.stringify(rows);
    if (expected) assert.equal(result, expected, `${hz} Hz render cadence must preserve every fixed simulation tick`);
    else expected = result;
    assert.equal(jumper.superJumpState, null);
    assert.equal(dome.dead, false);
    assert.equal(dome.hp, dome.hpMax, 'reusable jumps do not spend Bubbler durability');
  }
});
