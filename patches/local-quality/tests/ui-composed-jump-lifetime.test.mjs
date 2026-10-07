import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptUiActorLifetime } from '../ui-actor-lifetime-adapter.mjs';
import { adaptRespawnNavigation } from '../../reliability/respawn-navigation-adapter.mjs';
const rel = 'src/ui/diorama.js';
const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const once = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0 && s.indexOf(a, i + a.length) < 0); return s.slice(0, i) + b + s.slice(i + a.length); };
const owned = adaptRespawnNavigation(rel, raw);
const fixed = adaptUiActorLifetime(rel, owned, once);
function rig(source = fixed) {
  const calls = { eligibility: 0, requests: [], native: 0 };
  const me = { team: 0, canSuperJump() { calls.native++; return true; }, superJump(t) { calls.requests.push(t); return true; } };
  const ally = { team: 0, alive: true }, enemy = { team: 1, alive: true };
  const G = { actors: [me, ally], match: { local: me, attract: false, controller: { a: me,
    canRequestMapJump() { calls.eligibility++; return true; }, requestMapJump(t) { calls.requests.push(t); return true; } } },
    level: { spawnPads: [{ clone() { return this; } }] } };
  const a = source.indexOf('  _jump(i, me) {'), b = source.indexOf('  _flash(i)', a);
  const C = new Function('G', 'return class {' + source.slice(a, b) + '}')(G);
  const d = new C(); Object.assign(d, { on: true, k: 1, pins: Array.from({ length: 5 }, () => ({ target: ally })), _flash() {} });
  return { d, G, me, ally, enemy, calls };
}
test('composed current controller remains the jump owner for a live teammate and base pin', () => {
  const h = rig(); h.d._jump(0, h.me); h.d._jump(3, h.me);
  assert.equal(h.calls.eligibility, 2); assert.deepEqual(h.calls.requests, [h.ally, h.G.level.spawnPads[0]]); assert.equal(h.calls.native, 0);
  h.G.match.controller = null; h.d._jump(0, h.me); assert.equal(h.calls.native, 1); assert.equal(h.calls.requests.length, 3);
});
test('retired or invalid pin is rejected before either controller or native eligibility is called', () => {
  for (const mutation of [h => { h.d.on = false; }, h => { h.d.k = .69; }, h => { h.G.actors = [h.me]; },
    h => { h.d.pins[0].target = h.enemy; }, h => { h.d.pins[0].target = h.me; }, h => { h.d.pins[0] = null; },
    h => { h.G.match.local = {}; }, h => { h.G.match.attract = true; }]) {
    const h = rig(); mutation(h); h.d._jump(0, h.me);
    assert.equal(h.calls.eligibility, 0); assert.equal(h.calls.native, 0); assert.equal(h.calls.requests.length, 0);
  }
  const old = rig(owned); old.G.actors = [old.me]; old.d._jump(0, old.me);
  assert.equal(old.calls.requests.length, 1, 'unprotected current navigation method still calls a retired pin owner');
});
test('native source and already-adapted source both retain the original jump admission body', () => {
  const nativeFixed = adaptUiActorLifetime(rel, raw, once);
  assert.match(nativeFixed, /if \(!me \|\| !me\.canSuperJump \|\| !me\.canSuperJump\(\)\)/);
  assert.ok(fixed.includes('G.match.controller.canRequestMapJump()'));
  assert.ok(fixed.includes('G.match.controller.requestMapJump(target)'));
  assert.throws(() => adaptUiActorLifetime(rel, fixed, once));
});
