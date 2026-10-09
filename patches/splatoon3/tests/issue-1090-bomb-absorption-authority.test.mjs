import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const ABSORB = 'special:inkvac-absorb';
const ACTIVATE = 'special:inkvac';
const json = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

async function setup(t, { sub = 'suction', legacy = false } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    adaptRuntime: (rel, source) => {
      if (!legacy || rel !== 'patches/splatoon3/runtime/kit-ink-vac.mjs') return source;
      const needle = 'const limit = proposalDamageLimit(actor, payload);';
      assert.equal(source.split(needle).length, 2);
      return source.replace(needle, 'const limit = proposalWeaponDamage(actor.weapon);');
    } });
  const api = f.installedRuntime;
  const make = (weapon, nid, owner, remote, team) => Object.assign(f.make(weapon), { nid, owner, remote, team });
  const vac = make('charger', 1, 'P', false, 0), proxy = make('charger', 1, 'P', true, 0);
  const shooter = make('shooter', 2, 'Q', false, 1), remote = make('shooter', 2, 'Q', true, 1);
  for (const a of [shooter, remote]) a.weapon = { ...a.weapon, sub };
  const session = myId => ({ myId, isHost: true, _members: new Map() });
  const ownerNet = new f.NetMatch(session('P'), {}), shooterNet = new f.NetMatch(session('Q'), {});
  t.after(() => { for (const net of [ownerNet, shooterNet]) net.unsubs.forEach(fn => fn()); });
  ownerNet.bind({ actors: [vac, remote] });
  vac.special = vac.weapon.specialCost; vac._startSpecial();
  const activation = ownerNet.out.find(e => e[1] === 'ev' && e[2] === ACTIVATE);
  assert.ok(activation, 'native successful activation produced a wire event');
  shooterNet.bind({ actors: [proxy, shooter] });
  shooterNet._play('P', json(activation));
  assert.ok(api.inkVacState(proxy)?.remote);
  f.G.actors = [proxy, shooter];
  proxy.pos.set(0, 0, 0); proxy.aimDir.set(0, 0, 1);
  shooter.pos.set(0, 0, 20); shooter.aimDir.set(0, 0, -1); shooter.aimYaw = Math.PI;
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  const system = f.G.projectiles;
  function throwBomb({ local = false, ghost = false, renderHz = 60 } = {}) {
    f.G.netm = local ? ownerNet : shooterNet;
    f.G.actors = [local ? vac : proxy, shooter];
    vac.pos.copy(proxy.pos); vac.aimDir.copy(proxy.aimDir);
    const before = shooterNet.out.length;
    system.throwBomb(shooter);
    const bomb = system.bombs.at(-1);
    // Keep the actual throw's identity/descriptor and native integration. Move
    // its flight start only to isolate first-contact absorption from aim tuning.
    bomb.pos.set(0, 1, 20); bomb.vel.set(0, 0, -600); bomb.mesh.position.copy(bomb.pos);
    bomb.ghost = ghost;
    let accumulator = 0;
    for (let frame = 0; frame < 4 && system.bombs.includes(bomb); frame++) {
      accumulator += 1 / renderHz;
      while (accumulator + 1e-10 >= 1 / 60) {
        system._updateBombs(1 / 60); accumulator -= 1 / 60;
      }
    }
    assert.equal(system.bombs.includes(bomb), false, 'native first contact consumes the bomb');
    assert.equal(bomb.s3InkVacAbsorbed, true);
    const packet = shooterNet.out.slice(before).find(e => e[1] === 'ev' && e[2] === ABSORB);
    return { bomb, packet: packet ? json(packet) : null };
  }
  function receive(packet, from = 'Q') { f.G.netm = ownerNet; ownerNet._play(from, json(packet)); }
  return { f, api, vac, proxy, shooter, remote, ownerNet, shooterNet, system, throwBomb, receive,
    state: api.inkVacState(vac) };
}

test('#1090 old main-only receiver reproduces 180 -> 36 native bomb credit', async t => {
  const r = await setup(t, { legacy: true });
  const { packet } = r.throwBomb();
  assert.equal(packet[3].damage, 180);
  r.receive(packet);
  close(r.state.absorbedDamage, r.remote.weapon.damage);
  assert.notEqual(r.state.absorbedDamage, packet[3].damage);
});

test('#1090 native Splat and Suction Bombs credit the same amount locally and over native JSON', async t => {
  for (const sub of ['bomb', 'suction']) {
    const r = await setup(t, { sub });
    const { packet } = r.throwBomb();
    assert.equal(packet[3].sub, sub);
    assert.equal(packet[3].damage, r.f.SUB[sub].damageMax);
    assert.deepEqual(packet[3].actor, { n: r.shooter.nid });
    assert.deepEqual(packet[3].target, { n: r.vac.nid });
    r.receive(packet);
    const credit = r.state.absorbedDamage;
    close(credit, r.f.SUB[sub].damageMax);
    r.receive(packet); close(r.state.absorbedDamage, credit);
    const local = await setup(t, { sub });
    assert.equal(local.throwBomb({ local: true }).packet, null);
    close(local.state.absorbedDamage, credit);
    close(local.state.charge, r.state.charge);
  }
});

test('#1090 mismatched/unknown sub descriptors fail before consuming the valid proposal key', async t => {
  const r = await setup(t);
  const { packet } = r.throwBomb();
  for (const sub of ['bomb', 'curling', 'inkVac', '__proto__', null, 1, {}, []]) {
    const invalid = json(packet); invalid[3].sub = sub;
    r.receive(invalid); close(r.state.charge, 0);
  }
  const noRegistryDamage = r.f.SUB.suction.damageMax;
  r.f.SUB.suction.damageMax = NaN;
  r.receive(packet); close(r.state.charge, 0);
  r.f.SUB.suction.damageMax = noRegistryDamage;
  r.receive(packet); close(r.state.absorbedDamage, 180);
});

test('#1090 native peer, target, serial, amount and ghost boundaries remain authoritative', async t => {
  const r = await setup(t);
  const { packet } = r.throwBomb();
  r.receive(packet, 'foreign'); close(r.state.charge, 0);
  for (const change of [p => { p.actor.n = 99; }, p => { p.target.n = 99; },
    p => { p.serial++; }, p => { p.damage = 221; }, p => { p.damage = -1; }, p => { p.damage = '180'; }]) {
    const invalid = json(packet); change(invalid[3]); r.receive(invalid); close(r.state.charge, 0);
  }
  r.remote.alive = false; r.receive(packet); close(r.state.charge, 0); r.remote.alive = true;
  r.receive(packet); close(r.state.absorbedDamage, 180);
  const ghost = await setup(t);
  assert.equal(ghost.throwBomb({ ghost: true }).packet, null);
  close(ghost.state.charge, 0); close(ghost.api.inkVacState(ghost.proxy).charge, 0);
});

test('#1090 old main proposals retain the main cap and sub proposals use the local registry cap once', async t => {
  const r = await setup(t);
  const { packet } = r.throwBomb();
  const main = json(packet); delete main[3].sub; main[3].key += '-main';
  r.receive(main); close(r.state.absorbedDamage, 36);
  const bounded = json(packet); bounded[3].damage = 220;
  r.receive(bounded); close(r.state.absorbedDamage, 36 + r.f.SUB.suction.damageMax);
  r.receive(bounded); close(r.state.absorbedDamage, 216);
});


test('#1090 fixed-step bomb absorption is identical at 30/60/120 Hz presentation schedules', async t => {
  const traces = [];
  for (const renderHz of [30, 60, 120]) {
    const r = await setup(t, { sub: 'bomb' });
    const { bomb, packet } = r.throwBomb({ renderHz });
    r.receive(packet);
    traces.push([packet[3].sub, packet[3].damage, bomb.age, r.state.absorbedDamage, r.state.charge]);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});
