import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

let f;
before(async () => { f = await fixture({ productionComposition: true, extraExports: `
  export { RangeHud } from './patches/practice-range/runtime/hud.mjs';
  export { RangeSession } from './patches/practice-range/runtime/session.mjs';` }); });
function node() {
  const classes = new Set();
  return { removed: false, style: {},
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
      toggle(key, on) { on ? classes.add(key) : classes.delete(key); } },
    remove() { this.removed = true; } };
}
function rig() {
  const hud = Object.create(f.RangeHud.prototype), target = { pos: new f.THREE.Vector3() }, floating = node();
  const telemetry = { weapon: 'shooter', speed: 0, zone: null, measure: null };
  const session = { telemetry: () => telemetry, last: null, targets: [], log: [{ amount: 36 }], hud };
  Object.assign(hud, { s: session, _L: { weapon: 'shooter', zone: null }, _cardT: 0, _toastT: 0,
    _float: [{ el: floating, target, t: 0, life: .9, dx: 0 }],
    speed: node(), measureBox: node(), paintBox: node(), card: node(), toastEl: node(), root: node(),
    toast() {} });
  f.G.camera = new f.THREE.PerspectiveCamera(60, 1280 / 720, 1, 100);
  f.G.camera.updateMatrixWorld();
  target.pos.y = -f.PLAYER.height - .35;
  return { hud, target, floating, session };
}

test('range damage numbers hide before the near plane and recover inside the camera frustum', () => {
  const r = rig();
  r.target.pos.z = -.5; r.hud.update(0);
  assert.equal(r.floating.style.opacity, '0', 'a projected near-plane number must not cover the screen');
  r.target.pos.z = -5; r.hud.update(0);
  assert.equal(r.floating.style.opacity, '1'); assert.match(r.floating.style.transform, /translate\(/);
  r.target.pos.z = 5; r.hud.update(0); assert.equal(r.floating.style.opacity, '0');
});

test('range damage numbers never write nonfinite transforms and recover on a finite target position', () => {
  const r = rig(); r.target.pos.z = -5; r.hud.update(0);
  const previous = r.floating.style.transform;
  for (const value of [NaN, Infinity, -Infinity]) {
    r.target.pos.x = value; r.hud.update(0);
    assert.equal(r.floating.style.opacity, '0'); assert.equal(r.floating.style.transform, previous);
  }
  r.target.pos.x = 0; r.hud.update(0); assert.equal(r.floating.style.opacity, '1');
});

test('resetting range targets immediately removes old damage numbers and the previous combo card', () => {
  const r = rig(); r.hud.card.classList.add('is-on'); r.session.last = { amount: 36 };
  f.RangeSession.prototype.resetTargets.call(r.session);
  assert.equal(r.floating.removed, true); assert.equal(r.hud._float.length, 0);
  assert.equal(r.hud.card.classList.contains('is-on'), false); assert.equal(r.session.last, null);
  assert.equal(r.session.log.length, 0);
});

test('target card writes only changed text and HP while restoring external DOM changes', () => {
  const r = rig(); r.hud._float.length = 0;
  let textWrites = 0, styleWrites = 0;
  const text = () => {
    let value = '';
    return { get textContent() { return value; }, set textContent(next) { textWrites++; value = next; } };
  };
  for (const key of ['cName', 'cLast', 'cFrom', 'cCombo', 'cHits', 'cSplat']) r.hud[key] = text();
  const hpNode = () => {
    let transform = '';
    return { style: { get transform() { return transform; }, set transform(value) {
      styleWrites++; transform = value.replace(/scaleX\(([0-9.]+)\)/, (_, n) => `scaleX(${Number(n)})`);
    } } };
  };
  r.hud.cHp = hpNode();
  const combo = { total: 36, hits: 1, done: false, splatT: 0 };
  Object.assign(r.target, { name: 'Target', hp: 64, rangeTarget: { kind: 'normal', combo } });
  r.session.last = { target: r.target, amount: 36, dist: 7 };
  r.hud.update(0);
  assert.equal(r.hud.cLast.textContent, '36.0'); assert.match(r.hud.cFrom.textContent, / 7\.0 m$/);
  const first = [textWrites, styleWrites];
  for (let i = 0; i < 120; i++) r.hud.update(1 / 60);
  assert.deepEqual([textWrites, styleWrites], first, 'stable two-second feedback does not replace text or HP styles');
  r.target.hp = 100; combo.done = true; combo.hits = 3; combo.total = 108; combo.splatT = .25;
  r.hud.update(0);
  assert.equal(r.hud.cHp.style.transform, 'scaleX(1)'); assert.equal(r.hud.cCombo.textContent, '108.0');
  assert.equal(r.hud.cHits.textContent, '3'); assert.match(r.hud.cSplat.textContent, /3 · 0.25 s/);
  r.hud.cLast.textContent = 'external'; r.hud.cHp.style.transform = 'scaleX(0)';
  r.hud.update(0);
  assert.equal(r.hud.cLast.textContent, '36.0'); assert.equal(r.hud.cHp.style.transform, 'scaleX(1)');
  r.hud.cHp = hpNode(); r.hud.update(0); assert.equal(r.hud.cHp.style.transform, 'scaleX(1)');
  r.target.rangeTarget.combo = null; r.session.last.dist = null; r.hud.update(0);
  assert.equal(r.hud.cCombo.textContent, '—'); assert.equal(r.hud.cHits.textContent, '—'); assert.equal(r.hud.cFrom.textContent, '');
  r.hud.clearTargetFeedback();
  const hidden = [textWrites, styleWrites]; r.hud.update(0);
  assert.deepEqual([textWrites, styleWrites], hidden); assert.equal(r.hud.card.classList.contains('is-on'), false);
});
