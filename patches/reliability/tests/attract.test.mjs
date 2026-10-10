import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptInput } from '../input-adapter.mjs';
import { adaptNet } from '../net-adapter.mjs';
import { adaptResults } from '../results-adapter.mjs';
import { adaptMobile } from '../mobile-adapter.mjs';
import { adaptTouchEdges } from '../touch-edge-adapter.mjs';
import { adaptIntro } from '../intro-adapter.mjs';
import { adaptStart } from '../start-adapter.mjs';
import { adaptAttract } from '../attract-adapter.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Focused lifetime test for the menu-attract auto-reset in Game._updateAttract. It exercises the
// actual composed methods (gameplay overlays + the reliability overlays in adapter.mjs order,
// then this overlay LAST) using the reviewer's composed-Game fixture (the boot()/deferred()
// harness defined by start.test.mjs) instead of a second invented fixture.

const REL = 'src/main.js';
const RAW = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');

// Compose the reliability overlays in adapter.mjs order (… start, attract) but keep this overlay
// explicit so both the pre-fix tree (UNGUARDED) and the fixed tree (GUARDED) can be exercised;
// calling adaptReliability and then adaptAttract again would double-apply the anchor and fail
// closed. The shipped dispatcher itself is checked by the last test.
const GAMEPLAY = adaptTouchLayout(REL, adaptSource(REL, RAW));
const UNGUARDED = [adaptInput, adaptNet, adaptResults, adaptMobile, adaptTouchEdges, adaptIntro, adaptStart]
  .reduce((code, adapt) => adapt(REL, code), GAMEPLAY);
const GUARDED = adaptAttract(REL, UNGUARDED);

const ANCHOR = '      this._fade(1, 400).then(() => { this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600); });';
// A deliberately incomplete guard that captures only Game.match. The awaiting-fade scenarios below
// prove this is insufficient, which is why the shipped overlay captures Game._matchFlow too.
const MATCH_ONLY = UNGUARDED.replace(ANCHOR, [
  '      const resetMatch = this.match;',
  '      this._fade(1, 400).then(() => {',
  '        if (this.match !== resetMatch) return;',
  '        this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600);',
  '      });',
].join('\n'));

function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `missing section ${start}`);
  return source.slice(at, until);
}

// Reuse the reviewer fixture: load the boot()/deferred() harness (everything start.test.mjs
// defines before its own first test) into a vm and expose those two helpers. This is the same
// fixture the independent review used to reproduce the race, reused rather than duplicated.
const FIXTURE_URL = new URL('./start.test.mjs', import.meta.url);
const fixtureCode = fs.readFileSync(FIXTURE_URL, 'utf8')
  .split("test('negative proof:")[0]
  .replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(fileURLToPath(FIXTURE_URL)).href));
const sandbox = { assert, fs, vm, URL, adaptSource, adaptTouchLayout, adaptStart, adaptResults, adaptIntro, adaptBuildSource };
vm.runInNewContext(`${fixtureCode}\nglobalThis.bootReview = boot; globalThis.deferredReview = deferred;`, sandbox);
const { bootReview } = sandbox;

// Boot the reviewer fixture against a composed main module, then graft on the real composed
// _updateAttract (the shared fixture predates attract mode) and arm a guaranteed auto-reset.
function spawn(source, held = ['fade']) {
  const h = bootReview(source, held);
  const method = section(source, '  _updateAttract(dt) {', '  // ---------------------------------------------------------------------------------------- match flow');
  h.game._updateAttract = vm.runInContext(`({ ${method} })._updateAttract`, h.context);
  h.game.attractT = 111;
  h.game.shotT = 100;
  h.game.rig.mode = 'orbit';
  h.G.paint.coverage = () => [0, 0];
  return h;
}

async function drain() { for (let i = 0; i < 10; i += 1) await Promise.resolve(); }

// Host-context deferred for the gates this test swaps in. A promise created in the fixture's outer
// vm sandbox and awaited by an inner vm context does not consistently re-enter the microtask queue
// under the test runner; a host-owned promise matches how start.test.mjs drives its own gates.
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('ordinary uncontested attract auto-reset is delivered identically with the guard', async () => {
  const before = spawn(UNGUARDED), after = spawn(GUARDED);
  for (const h of [before, after]) { h.game._updateAttract(0); h.gates.fade.resolve(); await drain(); }
  assert.deepEqual(after.calls, before.calls);
  assert.equal(after.game.match.attract, true);
  assert.equal(after.G.mode, 'menu');
  assert.equal(after.count('palette'), 1);
  assert.equal(after.count('start'), 1);
  assert.equal(after.count('fadeOut'), 1);
  assert.equal(after.count('attractShot'), 1);
});

test('guard preserves the auto-reset palette/restart/fade delivery and captures both identities', () => {
  assert.equal(adaptAttract(REL, UNGUARDED), GUARDED);
  assert.ok(GUARDED.includes('this._fade(1, 400).then(() => {'));
  assert.ok(GUARDED.includes('this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600);'));
  assert.ok(GUARDED.includes('this.attractT = -999;'));
  assert.ok(GUARDED.includes('const resetMatch = this.match, resetFlow = this._matchFlow;'));
  assert.ok(GUARDED.includes('if (this.match !== resetMatch || this._matchFlow !== resetFlow) return;'));
  // Same number of fade-ins as upstream: the guard adds a check, not a fade or a timer.
  assert.equal(GUARDED.split('this._fade(1, 400)').length, UNGUARDED.split('this._fade(1, 400)').length);
  assert.equal((GUARDED.match(/resetMatch/g) || []).length, 2);
  assert.equal((GUARDED.match(/resetFlow/g) || []).length, 2);
});
// ------------------------------------------------------------------------------------------------
// Race regressions against the actual composed Game methods.
//
// A stale auto-reset must not fire once any newer operation owns the menu/match, even while that
// newer operation is still awaiting its own fade on the very same original attract match (a
// match-only guard is blind to that window; only the operation owner changes).
// ------------------------------------------------------------------------------------------------

// Arm the auto-reset on the current attract match, then return the fade gate the reset scheduled on
// and the original match. The caller swaps h.gates.fade so the newer operation's `_fade(1, …)` waits
// on a fresh host-owned deferred instead of the gate the stale reset already holds.
function arm(h) {
  const initial = h.game.match;
  h.game._updateAttract(0);
  assert.equal(h.count('attractShot'), 0, 'the auto-reset only schedules its fade-out');
  const oldGate = h.gates.fade;
  h.gates.fade = deferred();
  assert.notEqual(h.gates.fade, oldGate, 'the newer operation must get its own fade gate');
  return { initial, oldGate };
}

test('guarded: a startup awaiting fade on the same original match survives the stale reset', async () => {
  for (const online of [false, true]) {
    const h = spawn(GUARDED);
    const { initial, oldGate } = arm(h);
    const pending = h.start(online);
    const flow = h.game._matchFlow;
    const paletteAt = h.count('palette');
    assert.equal(h.game.match, initial, 'new startup is still awaiting fade on the original attract');
    oldGate.resolve(); await drain();
    assert.equal(h.game.match, initial, 'stale reset skipped: original match untouched');
    assert.equal(h.game._matchFlow, flow, 'stale reset skipped: reserved operation intact');
    assert.equal(h.count('palette'), paletteAt, 'no palette restart delivered by the stale reset');
    h.gates.fade.resolve(); await pending;
    assert.equal(h.G.mode, 'match', 'the reserved startup entered its own match');
    assert.equal(h.game.match.attract, false);
    assert.equal(h.game._matchFlow, flow);
    assert.equal(initial.disposed, 1, 'only the legitimate startup disposed the original attract');
  }
});

test('guarded: a completed new startup is not disposed by the stale reset', async () => {
  for (const online of [false, true]) {
    const h = spawn(GUARDED);
    const { oldGate } = arm(h);
    const pending = h.start(online);
    h.gates.fade.resolve(); await pending;
    const newMatch = h.game.match;
    const paletteAt = h.count('palette');
    assert.equal(h.G.mode, 'match'); assert.equal(newMatch.attract, false);
    oldGate.resolve(); await drain();
    assert.equal(h.game.match, newMatch, 'the playing match is untouched');
    assert.equal(newMatch.disposed, 0, 'stale reset skipped before disposing the playing match');
    assert.equal(h.count('palette'), paletteAt, 'no palette restart delivered');
    assert.equal(h.G.mode, 'match');
  }
});
test('negative proof: raw and unguarded stale reset disposes the newly playing match', async () => {
  for (const [name, source] of [['raw', RAW], ['unguarded', UNGUARDED]]) {
    for (const online of [false, true]) {
      const h = spawn(source);
      const { oldGate } = arm(h);
      const pending = h.start(online);
      h.gates.fade.resolve(); await pending;
      const newMatch = h.game.match;
      assert.equal(h.G.mode, 'match');
      assert.equal(newMatch.attract, false);
      assert.equal(newMatch.disposed, 0);
      oldGate.resolve(); await drain();
      assert.equal(newMatch.disposed, 1, `${name} ${online ? 'online' : 'offline'}: stale reset disposed the playing match`);
      assert.notEqual(h.game.match, newMatch);
      assert.equal(h.game.match.attract, true, `${name}: stale reset reinstalled an attract match`);
    }
  }
});

test('negative proof: match-only guard is insufficient while a startup awaits fade on the same match', async () => {
  for (const [name, source] of [['unguarded', UNGUARDED], ['match-only', MATCH_ONLY]]) {
    for (const online of [false, true]) {
      const h = spawn(source);
      const { initial, oldGate } = arm(h);
      const pending = h.start(online);
      const flow = h.game._matchFlow;
      assert.equal(h.game.match, initial, 'startup still awaiting fade on the original match');
      const paletteAt = h.count('palette');
      oldGate.resolve(); await drain();
      assert.notEqual(h.game.match, initial, `${name}: stale reset replaced the original attract match`);
      assert.equal(h.game.match.attract, true);
      assert.notEqual(h.game._matchFlow, flow, `${name}: stale _startAttract invalidated the reserved operation`);
      assert.equal(h.count('palette'), paletteAt + 1, `${name}: stale reset delivered its palette restart`);
      h.gates.fade.resolve(); await pending;
      assert.equal(h.G.mode, 'menu', `${name}: reserved startup was cancelled instead of entering its match`);
      assert.equal(h.game.match.attract, true);
    }
  }
});

test('negative proof: raw stale reset fires while a startup awaits fade on the same match', async () => {
  for (const online of [false, true]) {
    const h = spawn(RAW);
    const { initial, oldGate } = arm(h);
    const pending = h.start(online);
    assert.equal(h.game.match, initial);
    oldGate.resolve(); await drain();
    assert.notEqual(h.game.match, initial, 'raw stale reset replaced the original attract mid-startup');
    assert.equal(h.game.match.attract, true);
    h.gates.fade.resolve(); await pending;
    assert.equal(h.G.mode, 'match', 'raw startup eventually completes, but only after the spurious reset ran');
  }
});

test('guarded: a stale reset does not clobber a menu return (quit / room departure)', async () => {
  const h = spawn(GUARDED);
  const { initial, oldGate } = arm(h);
  const pending = h.game.quitToMenu();
  const flow = h.game._matchFlow;
  oldGate.resolve(); await drain();
  assert.equal(h.game._matchFlow, flow, 'quit reservation intact');
  assert.equal(h.game.match, initial, 'original match untouched while quit awaits its fade');
  h.gates.fade.resolve(); await pending;
  assert.equal(h.G.mode, 'menu');
  assert.equal(h.game.match.attract, true);
  assert.equal(h.game.menus.current, 'main', 'the returned menu was shown');
  assert.equal(h.count('music'), 1, 'menu music started');
  assert.equal(h.count('fadeOut'), 1, 'menu fade-in delivered');
  assert.equal(h.count('palette'), 1, 'exactly one palette restart');
  assert.equal(initial.disposed, 1, 'only the legitimate menu return disposed the original attract');
});

test('negative proof: unguarded stale reset cancels a menu return (quit / room departure)', async () => {
  const h = spawn(UNGUARDED);
  const { initial, oldGate } = arm(h);
  const pending = h.game.quitToMenu();
  const flow = h.game._matchFlow;
  oldGate.resolve(); await drain();
  assert.notEqual(h.game.match, initial, 'stale reset replaced the original attract');
  assert.notEqual(h.game._matchFlow, flow, 'quit reservation invalidated by the stale reset');
  h.gates.fade.resolve(); await pending;
  assert.equal(h.game.menus.current, null, 'menu return aborted before showing the main menu');
  assert.equal(h.count('music'), 0, 'menu music never started');
  // The stale reset already faded its own attract back in; quit never reached its own menu fade-in.
  assert.equal(h.count('attractShot'), 1, 'the stale reset reinstalled its attract shot');
  assert.equal(h.count('fadeOut'), 1, 'only the stale reset faded in; the menu return did not');
});

test('guarded: a stale reset does not fire after the original attract was cancelled or replaced', async () => {
  // cancelled: the original attract is dropped while the reset fade is still pending.
  const cancelled = spawn(GUARDED);
  cancelled.game._updateAttract(0);
  const cancelledGate = cancelled.gates.fade;
  cancelled.game.match = null;
  cancelledGate.resolve(); await drain();
  assert.equal(cancelled.game.match, null, 'no attract match recreated by the stale reset');
  assert.equal(cancelled.count('palette'), 0, 'no palette restart for a cancelled attract');

  // replaced: a legitimate reset already installed a replacement attract on the same operation.
  const replaced = spawn(GUARDED);
  const first = replaced.game.match;
  replaced.game._updateAttract(0);
  const replacedGate = replaced.gates.fade;
  replaced.game._startAttract();
  const second = replaced.game.match;
  assert.notEqual(second, first);
  const paletteAt = replaced.count('palette');
  replacedGate.resolve(); await drain();
  assert.equal(replaced.game.match, second, 'stale reset did not clobber the replacement attract');
  assert.equal(replaced.count('palette'), paletteAt, 'no palette restart delivered');
  assert.equal(first.disposed, 1, 'the replacement reset disposed the first attract');
});

test('fail-closed: the overlay refuses a missing, duplicated, repeated or misordered anchor', () => {
  assert.throws(() => adaptAttract(REL, GAMEPLAY), /operation owner/, 'start overlay must run first');
  assert.throws(() => adaptAttract(REL, UNGUARDED + '\n  _beginMatchFlow() {\n'), /operation owner/, 'duplicated operation owner');
  assert.throws(() => adaptAttract(REL, UNGUARDED.replace(ANCHOR, '// anchor removed')), /attract conflict/, 'missing anchor');
  assert.throws(() => adaptAttract(REL, UNGUARDED.replace(ANCHOR, `${ANCHOR}\n${ANCHOR}`)), /attract conflict/, 'duplicated anchor');
  assert.throws(() => adaptAttract(REL, GUARDED), /attract conflict/, 're-applying the overlay must fail closed');
});

test("unrelated modules pass through byte-for-byte", () => {
  const code = `export const marker = '${ANCHOR}';`;
  for (const rel of ['src/net/session.js', 'src/ui/hud.js', 'src/main.jsx', 'src\\main.js', 'main.js']) {
    assert.equal(adaptAttract(rel, code), code, rel);
  }
});

test('the shipped dispatcher applies this overlay after the operation owner, exactly once', () => {
  const shipped = adaptReliability(REL, GAMEPLAY);   // gameplay + every reliability overlay in adapter.mjs order
  assert.ok(shipped.includes('const resetMatch = this.match, resetFlow = this._matchFlow;'));
  assert.ok(shipped.includes('if (this.match !== resetMatch || this._matchFlow !== resetFlow) return;'));
  assert.equal(shipped.split('this._fade(1, 400).then').length - 1, 1, 'one auto-reset continuation remains');
  // It is already applied in the real tree, so re-applying the overlay must fail closed.
  assert.throws(() => adaptAttract(REL, shipped), /attract conflict/);
});
