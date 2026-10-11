import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

async function setup() {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { applyFidelityProjectileHit, fidelityDamage } from './patches/splatoon3/runtime/weapons-fidelity.mjs';" });
  const attacker = f.make('slosher'), victim = f.make();
  attacker.team = 0; victim.team = 1; victim.invuln = 0;
  attacker.owner = 'A'; attacker.nid = 1;
  function volley(mode, groupId = 'owner:1', owner = attacker, target = victim) {
    const group = new WeakMap();
    return { group, hit: amount => mode === 'local'
      ? f.applySlosherVolleyHit(f.G.projectiles, owner, target, group, groupId, amount)
      : f.G.projectiles.applyHit(owner, target, amount, 'slosher', groupId) };
  }
  return { ...f, attacker, victim, volley };
}

for (const mode of ['local', 'owner']) {
  test(`Slosher ${mode}: a zero-quantized increment is admitted exactly once`, async () => {
    const f = await setup(), { victim } = f, { hit, group } = f.volley(mode);
    hit(50.04); assert.equal(victim.hp, 50);
    hit(50.09); assert.equal(victim.hp, 50);
    if (mode === 'local') assert.equal(group.get(victim), 50.09, 'raw credit, not only HP loss, commits the maximum');
    for (const amount of [50.09, 50.04, 50.09, 50.09]) hit(amount);
    assert.equal(victim.hp, 50, 'duplicates cannot retry the already-credited 0.05 increment');
    hit(50.14); assert.equal(victim.hp, 49.9, 'a genuinely larger maximum still tops up');
    for (let i = 0; i < 5; i++) hit(50.14);
    assert.equal(victim.hp, 49.9);
  });

  test(`Slosher ${mode}: quantized-zero first hits and reordered increments preserve the maximum`, async () => {
    const f = await setup();
    for (const [index, amounts] of [[.04, .09, .09, .14], [.14, .09, .04], [.04, .09, .04, .14]].entries()) {
      const target = f.make(); target.team = 1; target.invuln = 0;
      const { hit } = f.volley(mode, `owner:${index + 1}`, f.attacker, target);
      for (const amount of amounts) hit(amount);
      assert.equal(target.hp, 99.9);
    }
  });

  test(`Slosher ${mode}: rejected invulnerable increments remain available`, async () => {
    const f = await setup(), { victim } = f, { hit } = f.volley(mode);
    victim.invuln = 1; hit(50.04); assert.equal(victim.hp, 100);
    victim.invuln = 0; hit(50.04); assert.equal(victim.hp, 50);
    victim.invuln = 1; hit(50.19); assert.equal(victim.hp, 50);
    victim.invuln = 0; hit(50.19); assert.equal(victim.hp, 49.9);
    hit(50.19); assert.equal(victim.hp, 49.9);
  });

  test(`Slosher ${mode}: attacker, victim, owner generation and group credits are independent`, async () => {
    const f = await setup();
    f.volley(mode).hit(.09);
    const other = f.make('slosher'); other.team = 0; other.owner = 'B'; other.nid = 2;
    f.volley(mode, 'owner:1', other).hit(.04);
    assert.equal(f.victim.hp, 100, 'other attackers do not inherit fractional credit');
    f.volley(mode, 'owner:2').hit(.04);
    assert.equal(f.victim.hp, 100, 'new groups do not inherit fractional credit');
    const target = f.make(); target.team = 1; target.invuln = 0;
    f.volley(mode, 'owner:1', f.attacker, target).hit(.04);
    assert.equal(target.hp, 100, 'other victims do not inherit fractional credit');
    f.attacker.owner = 'new-host';
    f.volley(mode, 'owner:1').hit(.04);
    assert.equal(f.victim.hp, 100, 'host adoption does not reuse the old owner credit');
  });
}

test('Slosher pending, dropped and failed sends cannot consume local rounding/volley credit', async () => {
  const f = await setup(), { victim } = f, { hit, group } = f.volley('local');
  let route = 'send', accepts = true;
  const sent = [];
  f.G.netm = { shouldApplyHit: () => route,
    sendHit: (...args) => { sent.push(args); return accepts; } };
  assert.equal(hit(50.04), 'pending');
  accepts = false; hit(50.09); route = 'drop'; hit(50.09);
  assert.equal(group.has(victim), false); assert.equal(victim.hp, 100);
  assert.deepEqual(sent.map(args => args[2]), [50.04, 50.09]);
  f.G.netm = null;
  hit(50.04); hit(50.09); hit(50.09);
  assert.equal(victim.hp, 50, 'later local admission starts with no pending fractional credit');
});

test('real Slosher sender packets preserve the victim-owner maximum across fractional retries', async () => {
  const sender = await combatWorld('A', { network: true }), owner = await combatWorld('B', { network: true });
  try {
    const projectile = { owner: sender.attacker, s3Weapon: { kind: 'slosher' },
      s3DamageGroup: new WeakMap(), s3DamageGroupId: 'A:slosh:1', wid: 'slosher' };
    for (const amount of [50.04, 50.09, 50.09, 50.04, 50.09]) {
      sender.applyProjectileHit(sender.G.projectiles, projectile, sender.victim, amount, sender.victim.pos);
      const packet = sender.wire.at(-1).data;
      assert.equal(packet.k, 'hit'); assert.equal(packet.g, projectile.s3DamageGroupId);
      assert.equal(packet.d, amount, 'transport does not pre-round the cumulative maximum');
      owner.net.onMessage('A', packet);
      assert.equal(owner.victim.hp, 50);
    }
    assert.equal(projectile.s3DamageGroup.has(sender.victim), false, 'pending sender does not own the accepted budget');
  } finally { sender.dispose(); owner.dispose(); }
});

test('source-guided emitted Slosher units keep fractional falloff contacts bounded at 30/60/120Hz', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await setup(), ps = f.G.projectiles;
    f.attacker.aimDir.set(0, 0, 1); f.attacker.aimPoint.set(0, 1, 100);
    ps.fireSlosh(f.attacker, f.attacker.weapon);
    const rounds = ps.list.slice(0, 4), amounts = [50.04, 50.09, 50.09, 50.14];
    assert.equal(rounds.length, amounts.length);
    assert.ok(rounds.every(p => p.s3DamageGroup === rounds[0].s3DamageGroup));
    const clock = new f.FixedClock(); let tick = 0;
    for (let frame = 0; frame < hz / 10; frame++) clock.advance(1 / hz, () => {
      if (tick >= rounds.length) return;
      const p = rounds[tick], amount = amounts[tick++], d = p.fidelitySloshUnit.DamageParam;
      // Invert the existing source-guided high-drop curve to select a contact;
      // no test damage function or new game value replaces fidelityDamage.
      const fall = d.ReduceStartFallDistance + (d.ValueMax - amount * 10) /
        (d.ValueMax - d.ValueMin) * (d.ReduceEndFallDistance - d.ReduceStartFallDistance);
      const point = p.start.clone(); point.y -= fall;
      assert.ok(Math.abs(f.fidelityDamage(p, point) - amount) < 1e-9);
      f.applyFidelityProjectileHit(ps, p, f.victim, 999, point);
      assert.equal(f.victim.hp, tick < 4 ? 50 : 49.9);
    });
    assert.equal(tick, rounds.length);
  }
});

test('local Slosher groups without a wire identity share the same final rounding receipt', async () => {
  const f = await setup(), { hit, group } = f.volley('local', null);
  for (const amount of [50.04, 50.09, 50.09]) hit(amount);
  assert.equal(f.victim.hp, 50); assert.equal(group.get(f.victim), 50.09);
});
