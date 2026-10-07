import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { WEAPONS, SUB, SPECIALS } from '../../../inkwave-public/src/config.js';
import { adaptCombatLife } from '../combat-life-adapter.mjs';
import {
  adaptNetHitPayload, isHitPayloadValid, MAX_HIT_DAMAGE, KNOWN_HIT_CAUSES,
} from '../net-hit-payload-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readSource = (rel) => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');

// Real adapted src/net/netmatch.js; only its platform/module dependencies are stubs.
async function harness({ adapt }) {
  const calls = [];
  const G = { projectiles: { applyHit: (a, v, d, w) => { calls.push({ nid: a.nid, d, w }); v.hp -= d; } } };
  const context = vm.createContext({ console, performance: { now: () => 0 }, G });
  const module = (source) => new vm.SourceTextModule(source, { context });
  const three = module('export class Vector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} }');
  const ctx = module('export const G = globalThis.G; export const emit = () => {}; export const on = () => () => {};');
  const config = module('export const PLAYER = {}, WEAPONS = { shooter: {} }, mapNoBots = () => false;');
  const bots = module('export class BotBrain {}');
  let code = readSource('src/net/netmatch.js');
  if (adapt) { code = adaptCombatLife('src/net/netmatch.js', code); code = adaptNetHitPayload('src/net/netmatch.js', code); }
  const netmatch = module(code);
  await netmatch.link((spec) => ({ three, '../core/ctx.js': ctx, '../config.js': config, '../game/bots.js': bots }[spec]));
  await netmatch.evaluate();
  const nm = new netmatch.namespace.NetMatch({ myId: 'B' }, { map: { id: 'm' } });
  const V = { nid: 1, remote: false, alive: true, team: 0, owner: 'B', netLife: 0, hp: 100 };
  const A = { nid: 2, remote: true, alive: true, team: 1, owner: 'A', netLife: 0, hp: 100 };
  nm.byNid.set(1, V); nm.byNid.set(2, A);
  return { nm, calls };
}

const configMaxDamage = () => {
  let max = 0;
  for (const def of [...Object.values(WEAPONS), ...Object.values(SUB), ...Object.values(SPECIALS)]) {
    for (const [key, value] of Object.entries(def || {})) if (/damage/i.test(key) && typeof value === 'number') max = Math.max(max, value);
  }
  return max;
};

test('#462 bounds are DERIVED from the active config, never invented', () => {
  assert.equal(MAX_HIT_DAMAGE, configMaxDamage());
  assert.equal(MAX_HIT_DAMAGE, 180); // SUB.bomb.damageMax / SPECIALS.slam.damageMax
  assert.ok(MAX_HIT_DAMAGE >= 160 && MAX_HIT_DAMAGE >= 150 && MAX_HIT_DAMAGE >= 125, 'covers charger/roller/blaster');
  for (const cause of [...Object.keys(WEAPONS), ...Object.keys(SUB), ...Object.keys(SPECIALS), 'shot', 'slosh', 'blast', 'drop']) {
    assert.ok(KNOWN_HIT_CAUSES.includes(cause), 'known cause ' + cause);
  }
  assert.ok(!KNOWN_HIT_CAUSES.includes('frobnicate'));
  // A legitimate max-damage hit is accepted; a lie one unit above is not.
  assert.equal(isHitPayloadValid({ d: MAX_HIT_DAMAGE, w: 'bomb' }), true);
  assert.equal(isHitPayloadValid({ d: MAX_HIT_DAMAGE + 1, w: 'bomb' }), false);
});

test('#462 residual adapter: unique anchors, other paths untouched, fails closed on drift', () => {
  const source = readSource('src/net/netmatch.js');
  const adapted = adaptNetHitPayload('src/net/netmatch.js', source);
  assert.notEqual(adapted, source);
  assert.ok(adapted.includes('IW_HIT_CAUSES'));
  assert.equal(adaptNetHitPayload('src/net/session.js', 'untouched'), 'untouched');
  assert.equal(adaptNetHitPayload('src/net/transport.js', 'untouched'), 'untouched');
  assert.throws(() => adaptNetHitPayload('src/net/netmatch.js', ''), /anchor mismatch/);
  assert.throws(() => adaptNetHitPayload('src/net/netmatch.js', source + source), /anchor mismatch/);
  // Composition order independent: after the merged combat-life adapter both anchors are intact.
  const composed = adaptNetHitPayload('src/net/netmatch.js', adaptCombatLife('src/net/netmatch.js', source));
  assert.ok(composed.includes('#462 residual'));
  assert.throws(() => adaptNetHitPayload('src/net/netmatch.js', composed), /anchor mismatch/);
});

test('negative control: UNPATCHED netmatch applies an implausible forged hit', async () => {
  const { nm, calls } = await harness({ adapt: false });
  nm.onMessage('C', { k: 'hit', v: 1, a: 2, d: 9999, w: 'shot' });
  assert.equal(calls.length, 1, 'old code accepts the hit');
  assert.equal(calls[0].d, 9999, 'old code trusts client damage past any bound');
  nm.onMessage('C', { k: 'hit', v: 1, a: 2, d: NaN, w: 'frobnicate' });
  assert.equal(calls.length, 2, 'old code even accepts NaN/unknown cause');
});

test('patched pipeline rejects malformed/unknown-cause claims and keeps valid hits exactly once', async () => {
  const { nm, calls } = await harness({ adapt: true });
  const hit = (over = {}) => nm.onMessage('A', { k: 'hit', v: 1, a: 2, l: 0, h: 1, d: 36, w: 'shooter', ...over });
  hit(); assert.equal(calls.length, 1, 'valid hit applies');
  assert.equal(calls[0].d, 36); assert.equal(calls[0].w, 'shooter');
  hit({ h: 2, d: MAX_HIT_DAMAGE + 1 }); assert.equal(calls.length, 1, 'oversized damage rejected');
  hit({ h: 3, d: -5 }); assert.equal(calls.length, 1, 'negative damage rejected');
  hit({ h: 4, d: 0 }); assert.equal(calls.length, 1, 'zero damage rejected');
  hit({ h: 5, d: NaN }); assert.equal(calls.length, 1, 'NaN damage rejected');
  hit({ h: 6, d: Infinity }); assert.equal(calls.length, 1, 'Infinity damage rejected');
  hit({ h: 7, d: 30, w: 123 }); assert.equal(calls.length, 1, 'non-string cause rejected');
  hit({ h: 8, d: 30, w: '' }); assert.equal(calls.length, 1, 'empty cause rejected');
  hit({ h: 9, d: 30, w: 'frobnicate' }); assert.equal(calls.length, 1, 'unknown cause rejected');
  assert.equal(calls.length, 1, 'rejected claims never reached applyHit');
});

test('every genuine authored cause and the real max damage still apply', async () => {
  const { nm, calls } = await harness({ adapt: true });
  let h = 0;
  for (const w of ['shooter', 'dualies', 'splatling', 'roller', 'charger', 'blaster', 'slosher', 'bomb', 'slam', 'drop', 'blast']) {
    nm.onMessage('A', { k: 'hit', v: 1, a: 2, l: 0, h: ++h, d: MAX_HIT_DAMAGE, w });
  }
  assert.equal(calls.length, 11, 'all authored causes accepted at the derived ceiling');
  assert.deepEqual(calls.map(c => c.d), Array(11).fill(MAX_HIT_DAMAGE));
});

test('sender authenticity from PR #452 is preserved (not duplicated) by this adapter', async () => {
  const { nm, calls } = await harness({ adapt: true });
  nm.onMessage('C', { k: 'hit', v: 1, a: 2, l: 0, h: 1, d: 36, w: 'shooter' });
  assert.equal(calls.length, 0, 'non-owner sender rejected');
  nm.onMessage('A', { k: 'hit', v: 1, a: 2, l: 0, h: 1, d: 36, w: 'shooter' });
  assert.equal(calls.length, 1, 'owner sender accepted');
});

test('the relay-authenticated frame sender is the value NetMatch checks', async () => {
  const { nm, calls } = await harness({ adapt: true });
  const frame = 'm|C|' + JSON.stringify({ k: 'hit', v: 1, a: 2, l: 0, h: 1, d: 36, w: 'shooter' });
  const k = frame.indexOf('|', 2);
  nm.onMessage(frame.slice(2, k), JSON.parse(frame.slice(k + 1)));
  assert.equal(calls.length, 0, 'forged frame sender does not damage the local victim');
});
