import test from 'node:test';
import assert from 'node:assert/strict';
import {installMenuQuality} from '../menu.mjs';

// Minimal DOM: one scroll host candidate (`list`) between the focused row and
// the screen root. The real cursor geometry is irrelevant here; the native
// pass is stubbed to switch the ring on.
function rig(env) {
  const node = (name, extra = {}) => ({ name, parentElement: null, parentNode: null, children: [], style: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c) { return this.appendChild(c); }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0, clientWidth: 100, clientHeight: 100, scrollWidth: 100, scrollHeight: 400, ...extra });
  const ui = node('ui'), root = node('root'), list = node('list'), row = node('row', { isConnected: true, dataset: {} });
  root.parentElement = ui; list.parentElement = root; row.parentElement = list;
  root.contains = (e) => e === row;
  const ring = node('ring'); ui.appendChild(ring);
  function Menus() {}
  Menus.prototype._updateCursor = function () { this._cur.on = true; };
  Menus.prototype.show = function () {}; Menus.prototype.update = function () {}; Menus.prototype.dispose = function () {};
  installMenuQuality(Menus, env);
  const m = new Menus();
  Object.assign(m, { el: ui, cursorEl: ring, wipeEl: null, _focus: row, _input: 'kbm', _scr: { el: root }, _cur: { on: false, x: { x: 0 }, y: { x: 0 }, w: { x: 10 }, h: { x: 10 } } });
  return { m, ring, list, ui };
}

test('ring host cache re-walks ancestors when the viewport changes (responsive overflow switch)', () => {
  const overflow = new Map();
  const env = { innerWidth: 1280, innerHeight: 720, performance: { now: () => 0 },
    getComputedStyle: (e) => ({ overflowY: overflow.get(e.name) || 'visible', overflowX: 'visible', position: 'static', opacity: '1' }) };
  const { m, ring, list, ui } = rig(env);
  m._updateCursor(1 / 60);
  assert.equal(ring.parentNode, ui, 'no scroller yet: the ring stays home');
  // a media query turns the list into a scroller at a narrower viewport
  overflow.set('list', 'auto');
  m._updateCursor(1 / 60);
  assert.equal(ring.parentNode, ui, 'same viewport and selection: the cached walk is reused');
  env.innerWidth = 844; env.innerHeight = 390;
  m._updateCursor(1 / 60);
  assert.equal(ring.parentNode, list, 'viewport change invalidates the cache and the ring anchors in the new scroller');
});
