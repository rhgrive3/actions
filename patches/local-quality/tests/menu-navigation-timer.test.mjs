import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { adaptQualitySource, qualityIdentity, replaceOnce } from '../adapter.mjs';
import { adaptMenuNavigationTimer } from '../menu-navigation-timer-adapter.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { menuNavigationFixture as fixture } from './menu-navigation-fixture.mjs';
const ROOT = new URL('../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const composed = adaptQualitySource('src/ui/menus.js', read('inkwave-public/src/ui/menus.js'));

test('#950 raw negative: stale title timer overwrites a newer settings screen', () => {
  const f = fixture({ baseline: true }); f.show('title'); f.m._titleGo(); f.m.show('settings', { wipe: false });
  f.advance(200); f.mid(); assert.equal(f.m.current, 'main'); assert.deepEqual(f.calls, ['title', 'settings', 'main']);
});
test('#950 raw negative: disposed title timer reopens the menu API', () => {
  const f = fixture({ baseline: true }); f.show('title'); f.m._titleGo(); f.m.dispose(); f.advance(200); f.mid();
  assert.equal(f.m._scr.name, 'main'); assert.deepEqual(f.calls, ['title', 'main']);
});
test('#950 title keeps the 350ms admission guard and exactly one 200ms confirmation', () => {
  const f = fixture(); f.m.show('title', { wipe: false }); f.m._titleGo(); assert.equal(f.navTimer(), undefined);
  f.advance(350); f.m._titleGo(); f.m._titleGo(); assert.equal(f.sounds.length, 2);
  const timer = f.navTimer(); assert.ok(timer); f.advance(199); assert.equal(f.m.current, 'title');
  f.advance(1); assert.equal(f.m.current, 'main'); assert.equal(f.m._qualityNavigationTimer, null);
  f.mid(); assert.deepEqual(f.calls, ['title', 'main']); f.archive.get(timer[0]).fn(); f.mid();
  assert.deepEqual(f.calls, ['title', 'main']);
});
for (const name of ['settings', 'main', null]) test(`#950 newer ${name} navigation cancels title timer, including an already queued callback`, () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); const [id, timer] = f.navTimer();
  f.m.show(name, { wipe: false }); assert.equal(f.timers.has(id), false); assert.equal(f.m._leavingTitle, false);
  timer.fn(); f.advance(500); f.mid(); assert.equal(f.m.current, name); assert.deepEqual(f.calls, ['title', name]);
});
test('#950 title reentry and forced same-screen replacement retire old callbacks without retiring a new one', () => {
  for (const force of [false, true]) {
    const f = fixture(); f.show('title'); f.m._titleGo(); const old = f.navTimer()[1];
    if (!force) f.m.show('main', { wipe: false });
    f.m.show('title', { wipe: false, force }); f.advance(350); f.m._titleGo(); const current = f.m._qualityNavigationTimer;
    old.fn(); assert.equal(f.m.current, 'title'); assert.equal(f.m._qualityNavigationTimer, current); assert.equal(f.m._leavingTitle, true);
    f.advance(200); f.mid(); assert.equal(f.m.current, 'main');
  }
});
test('#950 redundant/invalid show does not discard a valid title confirmation', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); const id = f.m._qualityNavigationTimer;
  f.m.show('title'); f.m.show('unknown'); assert.equal(f.m._qualityNavigationTimer, id);
  f.advance(200); f.mid(); assert.equal(f.m.current, 'main');
});
test('#950 disposal cancels a zero-valued timer id, blocks queued confirmation and direct navigation', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); const [id, timer] = f.navTimer(); assert.equal(id, 0);
  f.m.dispose(); assert.equal(f.timers.has(id), false); const token = f.m._swapToken;
  timer.fn(); f.m._titleGo(); f.m.show('main', { force: true }); f.mid(); f.advance(500);
  assert.equal(f.m._scr, null); assert.equal(f.m.el.removed, true); assert.equal(f.m._swapToken, token); assert.deepEqual(f.calls, ['title']);
});
test('#950 pending native wipe callback cannot re-enter after disposal', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); f.advance(200); f.m.dispose(); f.mid();
  assert.equal(f.m._scr, null); assert.deepEqual(f.calls, ['title']);
});
test('#950 raw negative: old mode pick enters setup after leaving and reentering mode', () => {
  const f = fixture({ baseline: true }); f.show('mode'); f.modeCard().accept();
  f.m.show('main', { wipe: false }); f.m.show('mode', { wipe: false }); f.advance(260); f.mid();
  assert.equal(f.m.current, 'setup');
});
for (const reduced of [false, true]) test(`#950 normal mode selection stays once-only with ${reduced ? '0ms reduced-motion' : '260ms'} delay`, () => {
  const f = fixture({ reduced }); f.show('mode'); const card = f.modeCard('boss'); card.accept(); card.accept();
  assert.equal(f.settings.length, 1); assert.equal(f.m._setup.mode, 'boss');
  if (!reduced) { f.advance(259); assert.equal(f.m.current, 'mode'); }
  f.advance(reduced ? 0 : 1); f.mid(); assert.equal(f.m.current, 'setup');
  assert.deepEqual(f.calls, ['mode', 'setup']); assert.deepEqual([...f.m._stack], ['mode', 'setup']);
});
for (const action of ['leave', 'reenter', 'force', 'dispose']) test(`#950 ${action} retires mode timer and its stale selection callback`, () => {
  const f = fixture(); f.show('mode'); const card = f.modeCard(); card.accept(); const [id, timer] = f.navTimer();
  if (action === 'dispose') f.m.dispose();
  else { if (action !== 'force') f.m.show('main', { wipe: false }); if (action === 'reenter' || action === 'force') f.m.show('mode', { wipe: false, force: true }); }
  const before = f.calls.slice(), mode = f.m.current;
  assert.equal(f.timers.has(id), false); timer.fn(); card.accept(); f.advance(500); f.mid();
  assert.equal(f.m.current, mode); assert.deepEqual(f.calls, before); assert.equal(f.settings.length, 1);
  if (action === 'reenter' || action === 'force') { f.modeCard('boss').accept(); f.advance(260); f.mid(); assert.equal(f.m.current, 'setup'); }
});
test('#950 repeated title/main/mode cycles keep only one navigation owner and zero pending after disposal', () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) {
    f.show('title'); f.m._titleGo(); f.advance(200); f.mid(); f.show('mode'); f.modeCard().accept(); f.advance(260); f.mid();
    assert.equal(f.m._qualityNavigationTimer, null); assert.equal(f.navTimer(), undefined);
  }
  f.m.dispose(); f.advance(1000); assert.equal(f.timers.size, 0);
});
test('#950 build-only identity includes the transform and rejects missing or duplicated native anchors', () => {
  const file = 'patches/local-quality/menu-navigation-timer-adapter.mjs';
  assert.ok(BUILD_ONLY_PATCH_MODULES.has(file));
  assert.equal(qualityIdentity()['menu-navigation-timer-adapter.mjs'], crypto.createHash('sha256').update(read(file)).digest('hex'));
  assert.equal(adaptMenuNavigationTimer('other.js', 'no change', replaceOnce), 'no change');
  assert.throws(() => adaptMenuNavigationTimer('src/ui/menus.js', '', replaceOnce), /expected exactly one connection/);
  assert.throws(() => adaptMenuNavigationTimer('src/ui/menus.js', composed, replaceOnce), /expected exactly one connection/);
});

test('#950 PR1182 residual: an invalid navigation request must not swallow valid title confirmation', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); f.m.show('unknown');
  f.advance(200); f.mid(); assert.equal(f.m.current, 'main'); assert.deepEqual(f.calls, ['title', 'main']);
});
test('#950 PR1182 residual: cancelled queued title callback cannot reopen repeated-confirm admission', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); const old = f.navTimer()[1];
  f.m.show('main', { wipe: false }); f.m.show('title', { wipe: false }); f.advance(350); f.m._titleGo();
  const sounds = f.sounds.length; old.fn(); f.m._titleGo();
  assert.equal(f.sounds.length, sounds, 'old callback cannot make a live confirmation admissible a second time');
  f.advance(200); f.mid(); assert.deepEqual(f.calls, ['title', 'main', 'title', 'main']);
});
test('#950 PR1182 residual: old Mode selection cannot advance a later visit to Setup', () => {
  const f = fixture(); f.show('mode'); f.modeCard().accept();
  f.m.show('main', { wipe: false }); f.m.show('mode', { wipe: false }); f.advance(260); f.mid();
  assert.equal(f.m.current, 'mode'); assert.deepEqual(f.calls, ['mode', 'main', 'mode']);
});
test('#950 PR1182 residual: native pending wipe cannot resurrect a disposed screen', () => {
  const f = fixture(); f.show('title'); f.m._titleGo(); f.advance(200); f.m.dispose(); f.mid();
  assert.equal(f.m._scr, null); assert.deepEqual(f.calls, ['title']);
});
