import { install } from '/patches/splatoon3/runtime/install.mjs';
import { Level } from '/src/world/level.js';
import { Input } from '/src/core/input.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { inkVacState, INK_VAC_CALIBRATION } from '/patches/splatoon3/runtime/kit-ink-vac.mjs';
import { inkVacActorContact } from '/patches/splatoon3/runtime/kit-ink-vac.mjs';
import { FixedClock } from '/patches/splatoon3/runtime/clock.mjs';
import { hasReceiverTorpedoObservation } from '/patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs';
import { installIssueFiveHotfixA } from '/patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
import { installIssueFiveHotfixB } from '/patches/splatoon3/runtime/issue-five-hotfix-b.mjs';
import { installIssueFiveHotfixC } from '/patches/splatoon3/runtime/issue-five-hotfix-c.mjs';
import { installDisconnectFidelity } from '/patches/splatoon3/runtime/disconnect-fidelity.mjs';
import { installSlosherIntermediatePaint } from '/patches/splatoon3/runtime/slosher-intermediate-paint.mjs';
import { installQuality } from '/patches/local-quality/install.mjs';
import { installWeaponsFidelity } from '/patches/splatoon3/runtime/weapons-fidelity.mjs';
import { installIssueEightFollowup } from '/patches/splatoon3/runtime/issue-eight-followup.mjs';
import { installMainWeaponCatalogRuntime } from '/patches/splatoon3/runtime/main-weapon-catalog.mjs';
import { installWeaponAudioRuntime } from '/patches/splatoon3/runtime/audio/runtime.mjs';

const profile = await (await fetch('/patches/splatoon3/profile.json')).json();
const api = install(profile), { G, THREE } = api;
G.settings = { ...DEFAULT_SETTINGS }; G.scene = new THREE.Scene();
if (new URLSearchParams(location.search).has('bootstrap')) {
  installIssueFiveHotfixA(api, profile); installIssueFiveHotfixB(api, profile); installIssueFiveHotfixC(api, profile);
  installDisconnectFidelity(api); installSlosherIntermediatePaint(api, profile); installQuality(profile);
  installWeaponsFidelity(api, profile); installIssueEightFollowup(api); installMainWeaponCatalogRuntime(api, profile);
  installWeaponAudioRuntime(api);
}
G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
G.paint = { sample: () => 1, splat: () => 0 }; G.actors = []; G.time = 0;
G.match = { playing: () => true, canRespawn: () => false };
G.physics = { los: () => true, raycast(_a, _b, _c, h) { h.hit = false; return h; } };
G.projectiles = new api.Projectiles(G.scene);
class Character {
  constructor(actor) { this.actor = actor; this.color = new THREE.Color('#ffffff'); this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
  _owner() { return this.actor; } _runner() { return this.actor.weaponRunner; }
  trigger(...args) { this.events.push(args); }
  getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
  setVisible() {} setHurt() {} setWeapon() {}
}
function make(weapon = 'shooter') {
  const a = new api.Actor({ team: 0, name: 'browser-fixture', weapon, CharacterClass: Character });
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
  G.actors.push(a); return a;
}
const f = { ...api, Level, Input, profile, make, inkVacState, INK_VAC_CALIBRATION, inkVacActorContact, FixedClock, hasReceiverTorpedoObservation };
export async function fixture() { return f; }
const queue = [], rows = [];
export function test(name, fn) { queue.push({ name, fn }); }
const equal = (actual, expected, message) => { if (!Object.is(actual, expected)) throw Error((message || 'equal') + `: ${actual} !== ${expected}`); };
export const assert = { equal, ok(value, message) { if (!value) throw Error(message || 'expected truthy'); },
  notEqual(actual, expected, message) { if (Object.is(actual, expected)) throw Error(message || 'expected different values'); } };
export async function run() {
  for (const { name, fn } of queue.splice(0)) { await fn(); rows.push({ name, status: 'passed' }); }
  return rows;
}

export async function runControls() {
  const input = new Input(document.getElementById('canvas')), mobile = input.mobile;
  assert.ok(mobile.active && mobile.root, 'native touch handlers are installed');
  input.lastDevice = 'touch'; mobile.setVisible(true);
  const ids = ['storm', 'tacticooler', 'waveBreaker', 'splattercolorScreen', 'ultraStamp', 'tripleInkstrike', 'booyahBomb', 'inkVac', 'krakenRoyale'];
  const out = []; let pointer = 1000;
  try {
    for (const hz of [30, 60, 120]) for (const id of ids) for (const boundary of ['pointercancel', 'lostpointercapture']) {
      mobile.reset(); input.endFrame(); G.projectiles.clear(); G.actors = []; G.netm = null; G.time = 0;
      G.match = { state: 'playing', mode: 'turf', time: 180, playing: () => true, canRespawn: () => false };
      G.level = new Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
        spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [
          { kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] }] });
      G.physics = new api.Physics(G.level); G.rig = { yaw: 0, pitch: 0, mapK: 0, gameCam: new THREE.PerspectiveCamera() };
      G.settings.aimAssist = 0; G.settings.aimAssistMouse = false;
      const a = make(); a._resolve = () => {}; a.weapon = { ...a.weapon, special: id, specialCost: 100 };
      a.special = a.specialCost(); a._startSpecial();
      if (id === 'booyahBomb') a._s3AllSpecialState.charge = 1;
      const c = new api.PlayerController(a, G.rig, input);
      const tick = n => { for (let i = 0; i < n; i++) { G.time += 1 / hz; c.update(1 / hz); a.update(1 / hz); input.endFrame(); } };
      const count = () => [G.projectiles.list, G.projectiles.bombs, G.projectiles._s3AllSpecialObjects, G.projectiles._s3SupportCoolerThrows]
        .reduce((n, list) => n + (list || []).filter(x => x.owner === a).length, 0);
      const press = name => {
        const pid = ++pointer;
        mobile._press(name, new PointerEvent('pointerdown', { pointerId: pid, pointerType: 'touch', clientX: 800, clientY: 400 }));
        return pid;
      };
      const end = (pid, type) => mobile.root.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: 'touch', bubbles: true }));
      const fire = ['inkVac', 'krakenRoyale'].includes(id), button = fire ? 'fire' : 'sub';
      if (id === 'krakenRoyale') tick(hz * 2);
      const pid = press(button); tick(1);
      assert.ok(a.intent[button], 'native PlayerController received the held touch button');
      if (id === 'krakenRoyale') tick(Math.ceil(.7 * hz));
      if (id === 'inkVac') {
        for (let i = 0; i < hz * 8 && inkVacState(a)?.phase !== 'exhale'; i++) tick(1);
        assert.equal(inkVacState(a)?.phase, 'exhale'); tick(hz / 2);
      }
      assert.equal(count(), 0); end(pid, boundary);
      assert.ok(input.holdCancelled(button), 'real DOM handler reported cancellation');
      tick(hz / 2);
      assert.equal(count(), 0, `${id} native controller must not convert ${boundary} into an attack`);
      assert.ok(a.specialActive, 'held special remains usable');
      if (id === 'krakenRoyale') assert.equal(a._s3AllSpecialState.phase, 'active');
      const next = press(button); tick(id === 'krakenRoyale' ? Math.ceil(.7 * hz) : 1);
      end(next, 'pointerup');
      if (id === 'krakenRoyale') { tick(1); assert.equal(a._s3AllSpecialState.phase, 'dash'); }
      else if (id === 'inkVac') assert.equal(count(), 1);
      else { tick(hz); assert.ok(count() > 0, 'a new normal release still deploys'); }
      out.push({ kind: 'native-touch-controller', id, hz, boundary, status: 'passed' });
    }
  } finally { input.disposePlatform(); G.rig = null; }
  return out;
}
