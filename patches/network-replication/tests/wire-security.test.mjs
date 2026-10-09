// #1178/#1179: exercise the actual composed network and Boss methods, not
// a reimplementation of their validation rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { bossWorld } from '../../local-quality/tests/boss-hit-fixture.mjs';

test('#1178 malformed owner snapshots cannot poison interpolation or transforms', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
  f.bind(nm, [a]);
  f.tick(nm, 'p2', 1000.05, { a: [f.packActor(a, { x: 2, vx: 1 })] });
  assert.equal(a.net.buf.length, 1);
  const attacks = [
    s => { s[4] = 'bad'; },
    s => { s[1] = null; },
    s => { s[2] = Infinity; },
    s => { s[7] = '9'; },
    s => { s[11] = -Infinity; },
    s => { s[10] = 0x200000; },
    s => { s.length = 11; },
    s => { s[16] = 1.25; },
    s => { s[6] = 100001; },
    s => { s[14] = NaN; },
  ];
  for (let i = 0; i < attacks.length; i++) {
    const s = f.packActor(a, { x: 6 });
    attacks[i](s);
    f.tick(nm, 'p2', 1000.10 + i * 0.05, { a: [s] });
    assert.equal(a.net.buf.length, 1, `malformed snapshot ${i} was buffered`);
  }
  // Same owner may recover with the next valid sample without a teleport/NaN.
  f.tick(nm, 'p2', 1001, { a: [f.packActor(a, { x: 3, vx: 1 })] });
  assert.equal(a.net.buf.length, 2);
  for (let i = 0; i < 60; i++) {
    f.clock.advance(1 / 60); nm.update(1 / 60);
    assert.ok(Number.isFinite(a.net.cur?.x ?? 0));
    assert.ok(Number.isFinite(a.pos.x));
    assert.ok(Number.isFinite(a.pos.y));
  }
});

test('#1178 actor snapshot ownership is still required', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2'], ['p3', 'P3']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
  f.bind(nm, [a]);
  f.tick(nm, 'p3', 1000.05, { a: [f.packActor(a, { x: 100 })] });
  assert.equal(a.net.buf.length, 0);
  f.tick(nm, 'p2', 1000.06, { a: [f.packActor(a, { x: 2 })] });
  assert.equal(a.net.buf.length, 1);
});

test('#1179 malformed Boss and crablet hits cannot heal or poison health', async () => {
  const f = await bossWorld();
  const crab = { id: 7, hp: 40, dead: false };
  f.boss.crabs.set(7, crab);
  const bad = [-100, 0, '-Infinity', Infinity, -Infinity, NaN, null, {}, [], '12', 2001];
  for (let i = 0; i < bad.length; i++) {
    const packet = f.hit({ q: i + 1, d: bad[i] });
    f.nm.onMessage('guest', packet);
    const crabPacket = f.hit({ q: i + 100, c: 7, d: bad[i], w: 'crab' });
    f.nm.onMessage('guest', crabPacket);
    assert.equal(f.boss.hp, 10000, `boss mutated by ${String(bad[i])}`);
    assert.equal(crab.hp, 40, `crablet mutated by ${String(bad[i])}`);
  }
  assert.ok(Number.isFinite(f.boss.hp));
  assert.ok(Number.isFinite(crab.hp));
  const good = f.hit({ q: 200, d: 30 });
  f.nm.onMessage('guest', good);
  assert.equal(f.boss.hp, 9970);
  f.nm.onMessage('guest', f.hit({ q: 201, c: 7, w: 'crab', d: 10 }));
  assert.equal(crab.hp, 30);
});

test('#1179 defense in depth also rejects invalid direct Boss damage calls', async () => {
  const f = await bossWorld();
  const attack = f.actor;
  for (const d of [-Infinity, Infinity, NaN, 0, -50, '-Infinity']) {
    assert.equal(f.boss.applyDamage(attack, d, false, null), 0);
    assert.equal(f.boss.hp, 10000);
  }
  assert.equal(f.boss.applyDamage(attack, 25, false, null), 25);
  assert.equal(f.boss.hp, 9975);
});
