import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combatWorld } from './combat-integration-fixture.mjs';
import { MAX_HIT_DAMAGE } from '../net-hit-payload-adapter.mjs';
import { WEAPONS, SUB, SPECIALS } from '../../../inkwave-public/src/config.js';
import { KIT_SUBS } from '../../splatoon3/runtime/kit-subs.mjs';
import { trizookaSpecialWeapon } from '../../splatoon3/runtime/kit-trizooka.mjs';
import { exhaleDamage } from '../../splatoon3/runtime/kit-ink-vac.mjs';

const profile = JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json', import.meta.url)));
const cases = [
  ['slam', profile.specials.slam.damageMax],
  ['trizooka', trizookaSpecialWeapon().directDamage],
  ['trizooka', trizookaSpecialWeapon(57).splashDamageMax],
  ['inkVac', exhaleDamage()],
  ['suction', KIT_SUBS.suction.damageMax],
  ['curling', KIT_SUBS.curling.damageDirectHit],
];
const rawCauses = [...Object.keys(WEAPONS), ...Object.keys(SUB), ...Object.keys(SPECIALS), 'shot', 'slosh', 'blast', 'drop'];
const priorPolicy = (rel, source) => rel !== 'src/net/netmatch.js' ? source : source
  .replace(/const IW_HIT_MAX_DAMAGE = \d+;/, 'const IW_HIT_MAX_DAMAGE = 180;')
  .replace(/const IW_HIT_CAUSES = new Set\([^\n]+\);/, `const IW_HIT_CAUSES = new Set(${JSON.stringify(rawCauses)});`);

async function pair(t, counterfactual = false) {
  const a = await combatWorld('A', { network: true });
  const b = await combatWorld('B', { network: true, ...(counterfactual ? { transformSource: priorPolicy } : {}) });
  t.after(() => { a.dispose(); b.dispose(); });
  // A larger controlled HP pool keeps these admission assertions independent
  // of delayed lethal/splat presentation. Actor.damage itself remains real.
  b.victim.hp = 10000;
  return { a, b };
}
function send(a, b, amount, cause, change = packet => packet, from = 'A') {
  a.G.projectiles.applyHit(a.attacker, a.victim, amount, cause);
  const packet = a.wire.filter(row => row.data.k === 'hit').at(-1).data;
  b.deliver(from, change({ ...packet }));
  return packet;
}

test('raw-config counterfactual discards every legitimate composed-only hit before victim HP and ack', async t => {
  const { a, b } = await pair(t, true);
  for (const [cause, amount] of cases) {
    assert.ok(Number.isFinite(amount) && amount > 0, cause);
    send(a, b, amount, cause);
  }
  assert.equal(b.victim.hp, 10000);
  assert.equal(b.wire.filter(row => row.data.k === 'hit_ack').length, 0);
});

test('real sender and victim owner admit profile and kit hits exactly once', async t => {
  const { a, b } = await pair(t);
  let damage = 0;
  for (const [cause, amount] of cases) {
    const packet = send(a, b, amount, cause);
    damage += Math.floor(amount * 10 + 1e-8) / 10;
    assert.ok(Math.abs(b.victim.hp - (10000 - damage)) < 1e-8, cause);
    b.deliver('A', packet);
    assert.ok(Math.abs(b.victim.hp - (10000 - damage)) < 1e-8, cause + ' duplicate');
  }
  const acks = b.wire.filter(row => row.data.k === 'hit_ack');
  assert.equal(acks.length, cases.length);
});

test('expanded authored envelope still rejects forged, malformed, stale-life and unknown claims before replay admission', async t => {
  const { a, b } = await pair(t);
  const valid = send(a, b, 36, 'shooter', packet => ({ ...packet, d: MAX_HIT_DAMAGE + 1 }));
  const invalid = [
    { d: -1 }, { d: null }, { d: '220' }, { d: 0 }, { d: Infinity },
    { w: 'unregistered-special' }, { w: '__proto__' }, { w: null }, { l: valid.l + 1 },
  ];
  for (const fields of invalid) b.deliver('A', { ...valid, ...fields });
  b.deliver('unrelated-peer', valid);
  assert.equal(b.victim.hp, 10000);
  assert.equal(b.wire.length, 0);
  // Reusing the genuine sequence succeeds: rejected payloads cannot burn it.
  b.deliver('A', valid);
  assert.equal(b.victim.hp, 9964);
  assert.equal(b.wire.filter(row => row.data.k === 'hit_ack').length, 1);
});
