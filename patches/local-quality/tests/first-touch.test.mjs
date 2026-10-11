import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adoptCanvasTouch, continueCanvasTouch } from '../first-touch-adapter.mjs';
import { adaptFirstTouch } from '../first-touch-source-adapter.mjs';

test('first canvas touch delegates the original event once; other event paths stay independent', () => {
  const canvas = { ownerDocument: { hidden: false } }, delivered = [];
  const mobile = { canvas, owner: { enabled: true, lastDevice: 'touch' }, visible: true,
    editing: false, mapOpen: false, _destroyed: false, _abort: new AbortController(),
    _ptr: new Map(), _stick: { id: -1 }, _down(event) { delivered.push(event); this._ptr.set(event.pointerId, {}); } };
  const event = { pointerType: 'touch', pointerId: 7, target: canvas };
  assert.equal(adoptCanvasTouch(mobile, event), true);
  assert.equal(delivered[0], event); // no redispatch, preserving native capture authority
  assert.equal(adoptCanvasTouch(mobile, event), false);
  for (const pointerType of ['mouse', '', 'unknown']) {
    assert.equal(adoptCanvasTouch(mobile, { ...event, pointerId: 8, pointerType }), false);
  }
  for (const target of [{}, { parentElement: canvas }]) {
    assert.equal(adoptCanvasTouch(mobile, { ...event, pointerId: 8, target }), false);
  }
  assert.equal(delivered.length, 1);
});

test('canvas bridge never steals menu, editor, map or unavailable input', () => {
  const canvas = { ownerDocument: { hidden: false } };
  const fresh = () => ({ canvas, owner: { enabled: true }, visible: true, editing: false,
    mapOpen: false, _destroyed: false, _abort: new AbortController(), _ptr: new Map(),
    _stick: { id: -1 }, _down() { assert.fail('out-of-scope gesture routed'); } });
  const event = { pointerType: 'touch', pointerId: 7, target: canvas };
  for (const patch of [{ visible: false }, { editing: true }, { mapOpen: true },
    { _destroyed: true }, { owner: { enabled: false } }, { _stick: { id: 7 } }]) {
    assert.equal(adoptCanvasTouch(Object.assign(fresh(), patch), event), false);
  }
  const aborted = fresh(); aborted._abort.abort();
  assert.equal(adoptCanvasTouch(aborted, event), false);
  canvas.ownerDocument.hidden = true;
  assert.equal(adoptCanvasTouch(fresh(), event), false);
});

test('first-touch adapter composes with production overlays and rejects duplicate/drifted routing', () => {
  const rel = 'src/core/mobile.js';
  const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
  const prior = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw)));
  const fixed = adaptFirstTouch(rel, prior);
  assert.match(fixed, /this\.canvas\.addEventListener\('pointerdown'.*signal: sig, passive: false/);
  assert.equal((fixed.match(/root\.addEventListener\('pointerdown'/g) || []).length, 1);
  assert.throws(() => adaptFirstTouch(rel, fixed), /first touch conflict/);
  assert.throws(() => adaptFirstTouch(rel, prior.replace("root.addEventListener('pointerdown'", "root.addEventListener('changed'")), /first touch conflict/);
  assert.equal(adaptFirstTouch('src/core/input.js', 'unchanged'), 'unchanged');
});

test('canvas retains move and cancel routing when transfer of implicit capture fails', () => {
  const canvas = {}, calls = [];
  const mobile = { canvas, _abort: new AbortController(), _ptr: new Map([[7, {}]]),
    _stick: { id: -1 }, _move(e) { calls.push(['move', e.pointerId]); },
    _up(e) { calls.push(['up', e.pointerId]); this._ptr.delete(e.pointerId); } };
  const event = { pointerType: 'touch', pointerId: 7, target: canvas };
  assert.equal(continueCanvasTouch(mobile, event, false), true);
  assert.equal(continueCanvasTouch(mobile, {...event, target: {}}, false), false);
  assert.equal(continueCanvasTouch(mobile, {...event, pointerId: 8}, true), false);
  assert.equal(continueCanvasTouch(mobile, event, true), true);
  assert.equal(continueCanvasTouch(mobile, event, true), false);
  assert.deepEqual(calls, [['move', 7], ['up', 7]]);
});
