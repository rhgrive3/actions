// #920: a Turf Map pin starts Super Jump on a completed tap, not on pointerdown, so a cancelled touch / pen
// contact cannot commit the jump. Executes the actual composed DioramaOverlay; the DOM, camera and Actor are
// fixtures (logic evidence only, not a browser or device capture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptPinTap } from '../pin-tap-adapter.mjs';
import { hasCommittedSuperJumpDestination } from '../../splatoon3/runtime/superjump-destination.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const REL = 'src/ui/diorama.js';
const composed = () => adaptQualitySource(REL, adaptReliability(REL, adaptTouchLayout(REL, adaptSource(REL, read(REL)))));

class El {
  constructor() { this.children = []; this.listeners = new Map(); this.names = new Set(); this.style = { setProperty() {} };
    this.classList = { add: (...n) => n.forEach(x => this.names.add(x)), remove: (...n) => n.forEach(x => this.names.delete(x)), toggle: (n, v) => v ? this.names.add(n) : this.names.delete(n) }; }
  addEventListener(type, fn) { const all = this.listeners.get(type) || []; all.push(fn); this.listeners.set(type, all); }
  dispatch(type, e) { for (const fn of this.listeners.get(type) || []) fn({ type, preventDefault() {}, stopPropagation() {}, ...e }); }
  appendChild(c) { this.children.push(c); return c; } insertBefore(c, before) { const i=this.children.indexOf(before); this.children.splice(i<0?this.children.length:i,0,c); return c; } prepend(c) { this.children.unshift(c); } get offsetWidth() { return 1; }
}

async function boot(source = composed()) {
  const jumps = [], G = { actors: [], audio: { play() {} }, teamHex: ['#f80', '#08f'], level: { spawnPads: [new THREE.Vector3(1, 0, 2), new THREE.Vector3(-1, 0, -2)] } };
  const context = vm.createContext({ console, Math, innerWidth: 1000, innerHeight: 700, document: { body: new El() } });
  const values = {
    three: THREE, '../../patches/splatoon3/runtime/superjump-destination.mjs': { hasCommittedSuperJumpDestination }, './ui-util.js': { h: (_tag, _attrs, ...kids) => { const el = new El(); el.children.push(...kids.flat(Infinity).filter(k => k && typeof k === 'object')); return el; }, clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), esc: x => x },
    './ui-icons.js': { keycap: x => x, weaponIcon: x => x, richText: x => x }, '../i18n.js': { t: x => x }, '../core/ctx.js': { G },
  };
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(spec => { const v = { ...(values[spec] || {}) }; if (spec === 'three') Object.assign(v, THREE); return new vm.SyntheticModule(Object.keys(v), function () { for (const [k, x] of Object.entries(v)) this.setExport(k, x); }, { context }); });
  await mod.evaluate();
  const dio = new mod.namespace.DioramaOverlay(new El());
  const ally = (name) => ({ name, team: 0, alive: true, superJumpState: null });
  const allies = [ally('A'), ally('B'), ally('C')];
  const me = { team: 0, canSuperJump: () => true, superJump(target) { jumps.push(target); return true; } };
  G.match = { local: me, attract: false }; G.actors = [me, ...allies];
  dio.on = true; dio.k = 1; allies.forEach((a, i) => { dio.pins[i].target = a; });
  let id = 0;
  const pin = i => dio.pins[i].el;
  return { dio, jumps, allies, me, G, pin,
    down(i, extra = {}) { const e = { pointerType: 'touch', pointerId: ++id, clientX: 300, clientY: 300, ...extra }; pin(i).dispatch('pointerdown', e); return e; },
    send(i, type, e, extra = {}) { pin(i).dispatch(type, { ...e, ...extra }); },
  };
}

test('#920 negative control: native pins start Super Jump on pointerdown and cannot be cancelled', async () => {
  const h = await boot(adaptSource(REL, read(REL)));
  const e = h.down(0); assert.equal(h.jumps.length, 1, 'the jump is already committed before any pointerup');
  h.send(0, 'pointercancel', e); assert.equal(h.jumps.length, 1);
});

for (const [name, i] of [['teammate', 1], ['base', 3]]) for (const pointerType of ['touch', 'pen']) {
  test(`#920 ${name} pin (${pointerType}): pointerdown alone does not jump; a completed tap jumps exactly once`, async () => {
    const h = await boot(); const e = h.down(i, { pointerType });
    assert.equal(h.jumps.length, 0); assert.equal(h.dio._pinTaps.size, 1);
    h.send(i, 'pointerup', e); h.send(i, 'lostpointercapture', e); h.send(i, 'pointerup', e);
    assert.equal(h.jumps.length, 1);
    if (i === 3) assert.ok(h.jumps[0].equals(h.G.level.spawnPads[0])); else assert.equal(h.jumps[0], h.allies[i]);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) test(`#920 ${name} pin (${pointerType}): ${type} before pointerup leaves no Super Jump, repeats are idempotent`, async () => {
    const h = await boot(); const e = h.down(i, { pointerType });
    h.send(i, type, e); h.send(i, type, e); h.send(i, 'pointerup', e); h.send(i, 'lostpointercapture', e);
    assert.equal(h.jumps.length, 0); assert.equal(h.dio._pinTaps.size, 0);
  });
}

test('#920 a drag past the slop, a changed or dead target, and a closed or half-open map do not jump', async () => {
  const h = await boot();
  let e = h.down(0); h.send(0, 'pointerup', e, { clientX: 360 }); assert.equal(h.jumps.length, 0, 'dragged outside the tap slop');
  e = h.down(0); h.send(0, 'pointerup', e, { clientX: 310, clientY: 296 }); assert.equal(h.jumps.length, 1, 'small drift is still a tap');
  e = h.down(1); h.dio.pins[1].target = h.allies[2]; h.send(1, 'pointerup', e); assert.equal(h.jumps.length, 1, 'the pin now points at another teammate');
  h.dio.pins[1].target = h.allies[1]; e = h.down(1); h.allies[1].alive = false; h.send(1, 'pointerup', e); assert.equal(h.jumps.length, 1, 'target died before release');
  h.allies[1].alive = true; e = h.down(2); h.dio.update(0.016, 0); assert.equal(h.dio.on, false); assert.equal(h.dio._pinTaps.size, 0, 'closing the map clears pending taps');
  h.dio.on = true; h.send(2, 'pointerup', e); assert.equal(h.jumps.length, 1, 'closing the map before release clears the tap');
  e = h.down(2); h.dio.k = 0.3; h.send(2, 'pointerup', e); assert.equal(h.jumps.length, 1, 'the map is no longer fully open at release');
});

test('#920 pointer B is independent of pointer A: its cancel neither cancels nor commits A\'s tap', async () => {
  const h = await boot(); const a = h.down(0), b = h.down(1);
  h.send(1, 'pointercancel', b); assert.equal(h.jumps.length, 0); assert.equal(h.dio._pinTaps.size, 1);
  h.send(0, 'pointercancel', { ...b, pointerId: 999 }); assert.equal(h.dio._pinTaps.size, 1, 'an unrelated pointer id cannot cancel A');
  h.send(1, 'pointerup', b); assert.equal(h.jumps.length, 0, 'B stays cancelled');
  h.send(0, 'pointerup', a); assert.deepEqual(h.jumps, [h.allies[0]]);
  const c = h.down(0), d = h.down(1); h.send(1, 'pointerup', d); h.send(0, 'pointerup', c); assert.equal(h.jumps.length, 3);
});

test('#920 mouse never creates a pending pin tap and the mouse / pad cursor path still calls the same jump owner', async () => {
  const h = await boot(); const e = h.down(0, { pointerType: 'mouse' });
  assert.equal(h.dio._pinTaps?.size ?? 0, 0); h.send(0, 'pointerup', e); assert.equal(h.jumps.length, 0);
  h.dio._jump(0, h.me); assert.deepEqual(h.jumps, [h.allies[0]]);
});

test('#920 an inactive or half-open map accepts no pending tap', async () => {
  const h = await boot(); h.dio.k = 0.5; let e = h.down(0); h.send(0, 'pointerup', e); assert.equal(h.jumps.length, 0);
  h.dio.k = 1; h.dio.on = false; e = h.down(0); h.send(0, 'pointerup', e); assert.equal(h.jumps.length, 0); assert.equal(h.dio._pinTaps?.size ?? 0, 0);
});

test('#920 the pin connections fail closed on upstream drift and double application', () => {
  const raw = read(REL);
  assert.throws(() => adaptPinTap(REL, ''), /conflict/);
  assert.throws(() => adaptPinTap(REL, adaptPinTap(REL, raw)), /conflict/);
  assert.throws(() => adaptPinTap(REL, raw.replace('this.hover = i;\n        this._jump(i, G.match?.local);', 'this.hover = i;\n        this._jump(i, G.match?.local, 1);')), /conflict/);
  assert.equal(adaptPinTap('src/ui/hud.js', 'unchanged'), 'unchanged');
});

for (const pointerType of ['touch', 'pen']) test(`#920 ${pointerType}: leaving the tap slop cancels even when the pointer returns before release`, async () => {
  const h = await boot(), e = h.down(0, { pointerType });
  h.send(0, 'pointermove', e, { clientX: e.clientX + 60 });
  h.send(0, 'pointermove', e);
  h.send(0, 'pointerup', e);
  assert.equal(h.jumps.length, 0, 'an out-and-back drag is not a completed tap');
  assert.equal(h.dio._pinTaps.size, 0);
});

test('#920 move slop is inclusive, pointer-scoped and does not swallow a fresh later tap', async () => {
  const h = await boot(), a = h.down(0), b = h.down(1);
  h.send(0, 'pointermove', a, { clientX: a.clientX + 25 });
  assert.equal(h.dio._pinTaps.has(a.pointerId), false);
  assert.equal(h.dio._pinTaps.has(b.pointerId), true);
  h.send(1, 'pointermove', b, { clientX: b.clientX + 24 });
  h.send(1, 'pointerup', b, { clientX: b.clientX + 24 });
  assert.deepEqual(h.jumps, [h.allies[1]], 'the untouched pointer remains a legal tap at the existing boundary');
  h.send(0, 'pointerup', a); assert.equal(h.jumps.length, 1);
  const next = h.down(0); h.send(0, 'pointerup', next);
  assert.deepEqual(h.jumps, [h.allies[1], h.allies[0]]);
});

function attachMapController(h) {
  const rel = 'src/game/player.js';
  const source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, read(rel)))));
  const start = source.indexOf('  setTurfMap('), end = source.indexOf('  updateMapInput()', start);
  assert.ok(start >= 0 && end > start);
  // Execute the production latch method; only unrelated gameplay cancellation
  // is a spy. Diorama state is intentionally not rendered between events.
  const Controller = new Function('cancelMapGameplay', `return class { cancelForMapTakeover() { cancelMapGameplay(this); } ${source.slice(start, end)} }`)(() => {});
  const c = new Controller(); c.input = { navigationDevice: 'touch' }; c.mapHeld = false;
  c.setTurfMap(true); h.G.match.controller = c;
  return c;
}

for (const reopen of [false, true]) test(`#920 native map close${reopen ? '/reopen' : ''} cancels an old pin contact before the next rendered frame`, async () => {
  const h = await boot(), c = attachMapController(h), e = h.down(0);
  c.setTurfMap(false); if (reopen) c.setTurfMap(true);
  assert.equal(h.dio.on, true, 'the previous rendered map is still on');
  h.send(0, 'pointerup', e);
  assert.equal(h.jumps.length, 0, 'controller lifetime owns cancellation before presentation catches up');
  c.setTurfMap(true); const fresh = h.down(0); h.send(0, 'pointerup', fresh);
  assert.equal(h.jumps.length, 1, 'a new map lifetime accepts fresh input');
});

for (const change of ['match', 'viewer', 'controller']) test(`#920 changing ${change} retires the old pointer intent even when the pin object is unchanged`, async () => {
  const h = await boot(); attachMapController(h); const e = h.down(0);
  if (change === 'match') h.G.match = { ...h.G.match };
  if (change === 'viewer') h.G.match.local = { ...h.me };
  if (change === 'controller') h.G.match.controller = { ...h.G.match.controller };
  h.send(0, 'pointerup', e);
  assert.equal(h.jumps.length, 0);
});


const bubblerTarget = (id, serial = 1, team = 0) => ({ kind: 'bubbler', id, serial, team, pos: new THREE.Vector3(2, 0, 3) });
function bubblerTapOwner(h) {
  h.me.superJumpToBubbler = target => { h.jumps.push(target); return true; };
}
for (const pointerType of ['touch', 'pen']) {
  test(`#920 ${pointerType} contact cannot retarget after the Bubbler pin is reassigned`, async () => {
    const h=await boot(); bubblerTapOwner(h);
    const first=bubblerTarget('A'), next=bubblerTarget('B');
    h.dio._ensureBubblerPins([first,next]); const pin=h.pin(4), e=h.down(4,{pointerType});
    h.dio._ensureBubblerPins([next]); pin.dispatch('pointerup',e);
    assert.equal(h.jumps.length,0,'retiring A must not commit the same contact to B');
    assert.equal(h.dio._pinTaps.size,0);
    const fresh=h.down(4,{pointerType}); h.send(4,'pointerup',fresh); assert.deepEqual(h.jumps,[next]);
  });
}
for (const change of ['serial','team']) {
  test(`#920 Bubbler ${change} replacement cancels a pending contact despite the same ID`, async () => {
    const h=await boot(); bubblerTapOwner(h); const first=bubblerTarget('A');
    h.dio._ensureBubblerPins([first]); const e=h.down(4);
    const next={...first,[change]:first[change]+1}; h.dio._ensureBubblerPins([next]); h.send(4,'pointerup',e);
    assert.equal(h.jumps.length,0);
  });
}

test('#920 captured pointerup from a removed higher-index Bubbler never dereferences a missing pin', async () => {
  const h=await boot(); bubblerTapOwner(h);
  h.dio._ensureBubblerPins(['A','B','C'].map(id=>bubblerTarget(id)));
  const pin=h.pin(6), e=h.down(6,{pointerType:'pen'}); h.dio._ensureBubblerPins([]);
  assert.doesNotThrow(()=>pin.dispatch('pointerup',e)); assert.equal(h.jumps.length,0); assert.equal(h.dio._pinTaps.size,0);
});

test('#920 refreshed snapshots of the same Bubbler remain tappable and cancellation remains pointer-local', async () => {
  const h=await boot(); bubblerTapOwner(h);
  h.dio._ensureBubblerPins([bubblerTarget('A'),bubblerTarget('B')]);
  const first=h.down(4), second=h.down(5,{pointerType:'pen'}), same=bubblerTarget('A');
  h.dio._ensureBubblerPins([same,bubblerTarget('B',2)]);
  h.send(5,'pointerup',second); assert.equal(h.jumps.length,0); assert.equal(h.dio._pinTaps.size,1);
  h.send(4,'pointerup',first); assert.deepEqual(h.jumps,[same]);
  h.send(4,'pointerup',first); assert.equal(h.jumps.length,1);
});

for(const team of [0,1])test(`#779 Diorama base pin position and completed touch use team ${team}'s separate home point`,async()=>{
 const h=await boot(); h.me.team=team; h.me.alive=true; h.me.pos=new THREE.Vector3();
 h.G.actors=[h.me]; h.G.level.homeSuperJumpPoints=[new THREE.Vector3(-3,0,-5),new THREE.Vector3(3,0,5)];
 const camera=h.G.camera=new THREE.PerspectiveCamera(60,1000/700,.1,100);
 camera.position.set(0,20,15);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 h.dio.update(1/60,1);
 const home=h.G.level.homeSuperJumpPoints[team], screen=home.clone();screen.y+=.1;screen.project(camera);
 assert.ok(Math.abs(h.dio.pins[3].x-(screen.x*.5+.5)*1000)<1e-8,'base marker uses home');
 assert.ok(Math.abs(h.dio.pins[3].y-(.5-screen.y*.5)*700)<1e-8,'base marker uses home');
 const e=h.down(3);h.send(3,'pointerup',e);assert.equal(h.jumps.length,1);assert.ok(h.jumps[0].equals(home));
 assert.notEqual(h.jumps[0],home);assert.ok(!h.jumps[0].equals(h.G.level.spawnPads[team]));
});
