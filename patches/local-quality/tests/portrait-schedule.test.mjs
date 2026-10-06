import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptPortraitSchedule, releasePortraitTargets, PORTRAIT_SCHEDULE } from '../portrait-schedule.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const raw = read('src/game/showcase.js');
const compose = code => adaptQualitySource('src/game/showcase.js',
  adaptReliability('src/game/showcase.js', adaptTouchLayout('src/game/showcase.js', adaptSource('src/game/showcase.js', code))));
const built = compose(raw);

function section(code, from, to) {
  const at = code.indexOf(from), end = code.indexOf(to, at);
  assert.ok(at >= 0 && end > at, `native source span ${from}`);
  return code.slice(at, end);
}

test('full production composition retires owned portrait GPU targets on hide/clear (issue 834 residual)', () => {
  // Native baseline reproduces the gap: _clear retires stage Characters but
  // never touches the portrait render targets.
  assert.ok(!section(raw, '  _clear() {', '\n  _anim()').includes('_prt'));
  assert.ok(raw.includes('this._prt = new THREE.WebGLRenderTarget'));
  // Production composition wires the lifecycle release without changing tile
  // identity, cache keys, or the Character settle path.
  assert.ok(built.includes("import { releasePortraitTargets } from '../../patches/local-quality/portrait-schedule.mjs'"));
  assert.ok(built.includes('releasePortraitTargets(this);\n    if (!this.mode) return;'));
  assert.ok(built.includes('releasePortraitTargets(this);\n    for (const c of this.chars)'));
  assert.ok(built.includes('for (let i = 0; i < 14; i++)'));
  assert.ok(built.includes('this._pcache.set(job.key, cv)'));
});

test('releasePortraitTargets retires only owned portrait targets', () => {
  let disposed = 0;
  const owned = { _prt: { dispose() { disposed++; } }, _prt8: { dispose() { disposed++; } } };
  assert.equal(releasePortraitTargets(owned), true);
  assert.equal(disposed, 2);
  assert.equal(owned._prt, null); assert.equal(owned._prt8, null);
  // Idempotent: already-released or absent targets are a no-op.
  assert.equal(releasePortraitTargets(owned), false);
  assert.equal(releasePortraitTargets({}), false);
  assert.equal(releasePortraitTargets(null), false);
  // Live/shared battle resources are never touched: only _prt/_prt8 fields.
  const live = { _rt: { dispose() { throw new Error('must not dispose live target'); } }, scene: { x: 1 }, chars: [] };
  assert.equal(releasePortraitTargets(live), false);
  assert.ok(live._rt);
});

test('per-frame portrait generation counter observes without changing cadence', () => {
  // Native one-job-per-frame cadence is preserved: render() still calls
  // _portraitStep() once per frame; the counter only records spend.
  assert.ok(built.includes('  render() {\n    this._qualityFrameId = (this._qualityFrameId || 0) + 1;\n    if (this._pq.length) this._portraitStep();'));
  assert.ok(built.includes('if (qualitySpend) this._qualityPortraitSpent = (this._qualityPortraitSpent || 0) + 1;'));
  assert.equal(PORTRAIT_SCHEDULE.maxUncachedPerFrame, 1);
  // Cache-hit path returns before _renderPortrait and never spends.
  const step = section(built, '  _portraitStep() {', '\n  _renderPortrait(req)');
  assert.ok(step.indexOf('const hit = this._pcache.get(key)') < step.indexOf('qualitySpend'));
});

test('portrait run restores live scene and preserves tile identity', () => {
  // The composed _renderPortraitRun still isolates/restores the shared scene,
  // disposes only the temporary portrait Character, and delivers canvases via
  // the native copy path: no live/shared battle resource is retired.
  const run = section(built, '  _renderPortraitRun(req, S, kind, r) {', '\n  // Compile every showcase shader');
  assert.ok(run.includes('for (const o of hidden) o.visible = true;'));
  assert.ok(run.includes('this.scene.remove(c.root); c.dispose?.();'));
  assert.ok(run.includes('r.shadowMap.needsUpdate = true; // the pedestal render after us needs its own shadow pass'));
});

test('portrait adapter fails closed on drift or double application', () => {
  assert.throws(() => adaptPortraitSchedule('src/game/showcase.js', built), /patch conflict/);
  assert.throws(() => adaptPortraitSchedule('src/game/showcase.js',
    raw.replace('  hide() {', '  hide2() {')), /patch conflict/);
  assert.equal(adaptPortraitSchedule('src/ui/menus.js', 'code'), 'code');
  for (const rel of ['src/game/actor.js', 'src/game/weapons.js', 'src/game/match.js']) {
    const source = read(rel);
    assert.equal(adaptQualitySource(rel, source) === source || adaptPortraitSchedule(rel, source) === source, true);
  }
});
