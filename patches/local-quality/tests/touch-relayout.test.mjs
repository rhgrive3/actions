import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTouchRelayout, physicalOrientation, adaptTouchRelayout } from '../touch-relayout.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';

function fixture() {
  const frames = new Map(), cancelled = [], counts = { layout: 0, resync: 0, reset: 0 };
  let sequence = 0;
  const env = { orientation: 0, screen: { orientation: { angle: 0 }, width: 768, height: 1024 },
    innerWidth: 768, innerHeight: 1024,
    requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); } };
  const mobile = { _abort: new AbortController(), _destroyed: false,
    _stick: { active: true, id: 7, x: 120, y: 200, ox: 100, oy: 210 }, _stickR: 50,
    _ptr: new Map([[8, { kind: 'look', x: 600, y: 200 }]]), buttons: { fire: true },
    moveX: .4, moveY: -.2, lookDX: .3,
    gyro: { resync() { counts.resync++; } },
    resetPointers() { counts.reset++; this._ptr.clear(); this._stick.active = false; this.buttons.fire = false; },
    _layoutAll() { counts.layout++; this._stickR = env.innerHeight / 20; },
    _stickUpdate() { const r = Math.max(26, this._stickR || 50); this.moveX = (this._stick.x - this._stick.ox) / r; this.moveY = (this._stick.y - this._stick.oy) / r; } };
  const layout = createTouchRelayout(mobile, env);
  const drain = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); };
  return { env, mobile, frames, cancelled, counts, layout, drain };
}

for (const mode of ['fixed', 'float']) test(`${mode} stick and holds survive a radius-clamped keyboard resize without gyro reset`, () => {
  const f = fixture(), pointer = f.mobile._ptr.get(8); f.mobile.s = { stickMode: mode };
  f.env.innerHeight = 400; f.layout({ type: 'resize' });
  assert.equal(f.mobile.buttons.fire, true);
  assert.equal(f.mobile._ptr.get(8), pointer);
  assert.equal(f.mobile.lookDX, .3);
  assert.equal(f.counts.reset, 0); assert.equal(f.counts.resync, 0);
  f.drain();
  assert.equal(f.mobile._stick.x, 120); assert.equal(f.mobile._stick.y, 200);
  assert(Math.abs(f.mobile.moveX - .4) < 1e-12); assert(Math.abs(f.mobile.moveY + .2) < 1e-12);
  f.mobile._stick.x = 120; f.mobile._stick.y = 200; f.mobile._stickUpdate();
  assert(Math.abs(f.mobile.moveX - .4) < 1e-12); assert(Math.abs(f.mobile.moveY + .2) < 1e-12);
});

test('resize storms and duplicate rotation notifications queue one frame and reset once', () => {
  const f = fixture();
  for (let i = 0; i < 120; i++) f.layout({ type: 'resize' });
  assert.equal(f.frames.size, 1); assert.equal(f.counts.reset, 0);
  f.env.orientation = 90;
  for (const type of ['resize', 'orientationchange', 'change', 'resize']) f.layout({ type });
  assert.equal(f.frames.size, 1);
  assert.equal(f.counts.reset, 1); assert.equal(f.counts.resync, 1);
  assert.equal(f.mobile.buttons.fire, false); assert.equal(f.mobile._ptr.size, 0);
  f.drain(); assert.equal(f.counts.layout, 1);
});

test('destroy abort actually cancels queued layout and rejects further events', () => {
  const f = fixture(); f.layout({ type: 'resize' });
  const id = [...f.frames.keys()][0]; f.mobile._abort.abort();
  assert.deepEqual(f.cancelled, [id]); assert.equal(f.frames.size, 0);
  f.layout({ type: 'resize' }); f.drain();
  assert.equal(f.counts.layout, 0); assert.equal(f.frames.size, 0);
});

test('orientation fallback uses physical screen dimensions, never viewport aspect', () => {
  const f = fixture(); delete f.env.orientation; delete f.env.screen.orientation;
  assert.equal(physicalOrientation(f.env), 'screen:false');
  f.env.innerHeight = 400; assert.equal(physicalOrientation(f.env), 'screen:false');
  f.env.screen.width = 1024; f.env.screen.height = 768;
  assert.equal(physicalOrientation(f.env), 'screen:true');
  f.env.orientation = -90; assert.equal(physicalOrientation(f.env), 'angle:270');
  f.env.orientation = NaN; f.env.screen.orientation = { angle: 180 };
  assert.equal(physicalOrientation(f.env), 'angle:180');
});

test('unknown orientation preserves resize but explicitly notified rotation still neutralizes input', () => {
  const f = fixture(); delete f.env.orientation; f.env.screen = {};
  // Capture unknown state at installation, as on an API-limited browser.
  const layout = createTouchRelayout(f.mobile, f.env);
  layout({ type: 'resize' }); f.drain(); assert.equal(f.counts.reset, 0);
  layout({ type: 'resize' }); // a pending resize must not suppress a real rotation
  layout({ type: 'orientationchange' }); layout({ type: 'change' });
  assert.equal(f.counts.reset, 1); assert.equal(f.counts.resync, 1);
});

test('canonical production composition has one router and layout owner, with bound identities', () => {
  const rel = 'src/core/mobile.js';
  const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
  const before = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw)));
  const fixed = adaptQualitySource(rel, before);
  assert.equal((fixed.match(/const relayout = createTouchRelayout/g) || []).length, 1);
  assert.equal((fixed.match(/window\.addEventListener\('resize'/g) || []).length, 1);
  assert.equal((fixed.match(/root\.addEventListener\('pointerdown'/g) || []).length, 1);
  assert.equal((fixed.match(/this\.canvas\.addEventListener\('pointerdown'/g) || []).length, 1);
  assert.equal(Object.keys(qualityIdentity()).includes('touch-relayout.mjs'), true);
  assert.throws(() => adaptTouchRelayout(rel, fixed), /touch relayout conflict/);
  assert.throws(() => adaptTouchRelayout(rel, before.replace('const relayout = () =>', 'const relayout = unexpected =>')), /touch relayout conflict/);
  assert.equal(adaptTouchRelayout('src/core/gyro.js', 'unchanged'), 'unchanged');
});

test('editor relayout cancels its stale drag without resyncing gyro or losing the draft', () => {
  const f = fixture(), draft = { fire: { x: .8 } };
  f.mobile.editing = true; f.mobile.layout = draft; f.mobile._edit = { pts: new Map([[9, {}]]) };
  f.mobile.resetPointers = function() { f.counts.reset++; this._edit = null; };
  f.layout({ type: 'resize' }); f.drain();
  assert.equal(f.mobile._edit, null); assert.equal(f.mobile.layout, draft);
  assert.equal(f.mobile.editing, true); assert.equal(f.counts.reset, 1);
  assert.equal(f.counts.resync, 0); assert.equal(f.counts.layout, 1);
});
