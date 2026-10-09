// #908: actual composed Actor + WeaponRunner + S3 runtime wrappers (stage geometry, renderer, audio stubbed). Logic-only
// allocation-identity and equivalence checks; not a browser allocation profile and not an S3 comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../adapter.mjs';
import { adaptActorWeaponInput } from '../actor-weapon-input-adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const composed = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
const KINDS = ['shooter', 'blaster', 'charger', 'roller', 'dualies', 'slosher', 'splatling'];

// Scripted trigger / sub / squid pattern, identical for both builds (60 Hz ticks).
const script = i => ({ fire: (i % 150 < 60 && !(i >= 190 && i < 225)) || (i >= 300 && i % 7 < 3), sub: i >= 200 && i < 215, squid: i >= 240 && i < 270 });

async function run(weapon, { baseline }) {
  const f = await fixture({ adapt: (rel,source)=>{
    const full=composed(rel,source);
    if(!baseline||rel!=='src/game/actor.js')return full;
    const call='this.weaponRunner.update(dt, this._weaponInput)';
    assert.equal(full.split(call).length-1,1,'one allocation-only counterfactual hook');
    return full.replace(call,'this.weaponRunner.update(dt, { ...this._weaponInput })');
  } });
  f.setRandom(() => 0.5);
  const bombs = []; f.G.projectiles.throwBomb = actor => bombs.push(actor.ink);
  f.G.projectiles.fireSlosh = () => f.shots.push({ kind: 'slosher' });
  const a = f.make(weapon), r = a.weaponRunner, seen = new Set(), trace = [];
  const update = r.update;
  r.update = function (dt, inp) { seen.add(inp); trace.push([inp.fire, inp.firePressed, inp.sub, inp.subReleased, Object.keys(inp).join()]); return update.call(this, dt, inp); };
  for (let i = 0; i < 420; i++) {
    if(i===200)a.ink=100; // Exercise admitted sub use independently of each main weapon's sourced consumption.
    Object.assign(a.intent, script(i));
    f.tick(a);
    trace.push([a.ink, r.charge, r.charging, r.cooldown, r.streaming, r.rolling, a.fireBuffer, r.aimingSub]);
  }
  f.restoreRandom();
  return { seen, trace, shots: f.shots.map(s => JSON.stringify(s)), bombs, a };
}

for (const weapon of KINDS) test(`#908 ${weapon}: one reusable input object per actor, identical weapon behaviour to the allocating build`, async () => {
  const before = await run(weapon, { baseline: true }), after = await run(weapon, { baseline: false });
  assert.ok(before.seen.size > 300, 'negative control: baseline allocates a new payload on (nearly) every live tick');
  assert.equal(after.seen.size, 1, 'patched: the same input object is reused for every steady-state tick');
  assert.deepEqual(after.trace, before.trace);
  assert.deepEqual(after.shots, before.shots);
  assert.deepEqual(after.bombs, before.bombs);
  assert.ok(before.shots.length > 0, 'the script actually fires');
  assert.ok(before.bombs.length > 0, 'the script actually throws the sub');
  assert.deepEqual(Object.keys([...after.seen][0]), ['fire', 'firePressed', 'sub', 'subReleased'], 'wrappers keep receiving the same four fields');
});

test('#908 inputs are owned per actor (nested/wrapped calls never share a scratch object); fields are rewritten every tick', async () => {
  const f = await fixture({ adapt: composed });
  const a = f.make('shooter'), b = f.make('shooter');
  assert.notEqual(a._weaponInput, b._weaponInput);
  const seen = [];
  for (const actor of [a, b]) { const u = actor.weaponRunner.update; actor.weaponRunner.update = function (dt, inp) { seen.push([inp, { ...inp }]); return u.call(this, dt, inp); }; }
  a.intent.fire = true; f.tick(a); b.intent.fire = false; f.tick(b); a.intent.fire = false; f.tick(a);
  assert.equal(seen[0][0], a._weaponInput); assert.equal(seen[1][0], b._weaponInput); assert.equal(seen[2][0], a._weaponInput);
  assert.equal(seen[0][1].fire, true); assert.equal(seen[1][1].fire, false); assert.equal(seen[2][1].fire, false);
  assert.equal(seen[0][1].firePressed, true); assert.equal(seen[2][1].firePressed, false, 'a stale firePressed never leaks into the next tick');
});

test('#908 adapter connects exactly once and fails closed on drift', () => {
  const raw = fs.readFileSync('inkwave-public/src/game/actor.js', 'utf8'), base = adaptReliability('src/game/actor.js', adaptTouchLayout('src/game/actor.js', adaptSource('src/game/actor.js', raw)));
  assert.equal(adaptActorWeaponInput('src/game/match.js', 'x', replaceOnce), 'x');
  const out = adaptActorWeaponInput('src/game/actor.js', base, replaceOnce);
  assert.ok(!/weaponRunner\.update\(dt, \{/.test(out));
  assert.throws(() => adaptActorWeaponInput('src/game/actor.js', out, replaceOnce));
  assert.throws(() => adaptActorWeaponInput('src/game/actor.js', base.replace('subReleased: subReleased && !isSquid });', 'subReleased });'), replaceOnce));
});
