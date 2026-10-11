import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installUi } from '../runtime/ui.mjs';
import { installHealthBarHud } from '../runtime/health-bars.mjs';

class Node {
  constructor() {
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.children = []; this.parent = null; this.clientWidth = 1280; this.clientHeight = 720;
  }
  setAttribute() {}
  appendChild(child) { child.parent = this; this.children.push(child); this.firstChild ||= child; return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
}
async function rig(t) {
  const f = await fixture({ productionComposition: true, extraExports: `
    export * from './patches/splatoon3/runtime/combat-info.mjs';
    export * from './patches/splatoon3/runtime/private-tracking.mjs';` });
  const viewer = f.make(), enemy = f.make(), ally = f.make();
  viewer.team = ally.team = 0; enemy.team = 1; viewer.isLocal = true;
  for (const [i, actor] of [viewer, enemy, ally].entries()) {
    actor.nid = i + 1; actor.owner = `owner-${i}`; actor.netLife = 1;
    actor.pos.set(0, 0, i === 1 ? 20 : 0); actor.invuln = 0;
    actor.character.root.visible = true;
    actor.character.getHeadPosition = out => out.copy(actor.pos).add(new f.THREE.Vector3(0, 1.7, 0));
  }
  const { G, THREE, PLAYER } = f;
  G.mode = 'match'; G.camera = new THREE.PerspectiveCamera(60, 1280 / 720, .1, 100);
  G.camera.position.set(0, 2, 30); G.camera.lookAt(0, 1, 0); G.camera.updateMatrixWorld();
  G.match = { local: viewer, actors: [viewer, enemy, ally], state: 'playing', mode: 'turf', playing: () => true };
  G.actors = G.match.actors; G.teamHex = ['orange', 'blue'];
  const doc = { createElement: () => new Node() }, previous = globalThis.document;
  globalThis.document = doc; t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  class HUD {
    constructor() { this.el = new Node(); this.markerLayer = new Node(); this.el.appendChild(this.markerLayer); this._visible = true; this._t = 0; }
    update(dt) { this._t += dt; }
    dispose() { this.el.remove(); }
  }
  class Menus { _fitAll() {} }
  // Match production install.mjs order: the canonical frame renderer is wrapped
  // by the compatibility overlay. DOM and the underlying HUD are test doubles.
  installUi({ HUD, Menus });
  installHealthBarHud({ HUD, G, THREE, PLAYER }, { document: doc });
  const hud = new HUD();
  const render = (canonical = true) => {
    const frame = canonical ? { healthMarkers: f.buildHealthMarkers({ match: G.match }, G, PLAYER, THREE) } : {};
    hud.update(1 / 60, frame); return frame;
  };
  const visibleBars = () => (hud._healthBars || []).filter(bar => !bar.hidden).length +
    [...(hud._s3HealthBars?.values() || [])].filter(record => record.node.style.display !== 'none').length;
  return { ...f, viewer, enemy, ally, hud, render, visibleBars };
}

test('#716 production health frame has one bar per eligible actor, never a second independent overlay', async t => {
  const f = await rig(t); f.render();
  f.enemy.hp = 60; f.enemy.lastDamage = 0; f.ally.hp = 40;
  assert.equal(f.render().healthMarkers.length, 2);
  assert.equal(f.visibleBars(), 2, 'enemy and ally each get exactly one bar');
  f.enemy.climbing = true;
  assert.equal(f.render().healthMarkers.length, 1);
  assert.equal(f.visibleBars(), 1, 'the second layer must not reveal a climbing enemy');
  f.enemy.climbing = false; f.enemy.lastDamage = 3;
  assert.equal(f.render().healthMarkers.length, 1);
  assert.equal(f.visibleBars(), 1, 'the authoritative damage age owns expiry');
  f.enemy.netLife++; f.enemy.hp = 80; f.enemy.lastDamage = .25;
  assert.equal(f.render().healthMarkers.length, 2);
  assert.equal(f.visibleBars(), 2, 'an injured first sample of a new life uses the canonical damage age');
});

test('#716 composed bars preserve private Thermal Ink and team reveal without leaking them to teammates', async t => {
  const f = await rig(t); f.viewer.s3.loadout[1].main = 'thermalInk';
  f.applyMainDirectHit({ applyHit: (a, b, amount, id) => b.damage(amount, a, id) }, f.viewer, f.enemy, 10, 'shooter');
  f.G.physics.los = () => false;
  assert.ok(f.thermalTrackingRecord(f.enemy, f.viewer));
  assert.equal(f.render().healthMarkers.length, 1); assert.equal(f.visibleBars(), 1);
  f.G.match.local = f.ally;
  assert.equal(f.render().healthMarkers.length, 0); assert.equal(f.visibleBars(), 0);
  f.G.match.local = f.viewer; f.enemy.submerged = true; f.enemy.anim.form = 'swim';
  assert.equal(f.render().healthMarkers.length, 0); assert.equal(f.visibleBars(), 0);
  f.enemy.s3.revealedUntil = { 0: 1 };
  assert.equal(f.render().healthMarkers.length, 1); assert.equal(f.visibleBars(), 1);
  f.G.time = 1;
  assert.equal(f.render().healthMarkers.length, 0); assert.equal(f.visibleBars(), 0);
});

test('#716 adopting an empty canonical frame retires a previous fallback layer and actor records', async t => {
  const f = await rig(t); f.render(false);
  f.enemy.hp = 50; f.enemy.lastDamage = 0; f.render(false);
  const layer = f.hud._s3HealthLayer;
  assert.equal(f.visibleBars(), 1); assert.ok(layer.parent);
  f.enemy.climbing = true;
  assert.equal(f.render().healthMarkers.length, 0);
  assert.equal(f.visibleBars(), 0);
  assert.equal(layer.parent, null);
  assert.equal(f.hud._s3HealthLayer, null);
  assert.equal(f.hud._s3HealthBars.size, 0);
  f.hud.dispose();
});
