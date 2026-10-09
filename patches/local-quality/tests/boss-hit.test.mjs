import test from 'node:test';
import assert from 'node:assert/strict';
import { bossWorld } from './boss-hit-fixture.mjs';
test('admission-disabled negative control permits spoof/healing; guarded native boss health and credit apply once', async () => {
  const raw = await bossWorld(false);raw.nm.onMessage('spoof', raw.hit());assert.equal(raw.boss.hp, 9970);
  raw.nm.onMessage('spoof', raw.hit({ d: -50 }));assert.equal(raw.boss.hp, 9970); // defense in depth still holds when transport is bypassed
  const f = await bossWorld();f.nm.onMessage('guest', f.hit());
  assert.equal(f.boss.hp, 9970);assert.equal(f.actor.stats.bossDmg, 30);assert.equal(f.boss.log.recv, 1);
  f.boss.hit(f.actor, 30, null, "shooter", null);assert.equal(f.boss.hp, 9970);
  for (const sender of ['guest', 'spoof']) f.nm.onMessage(sender, f.hit());
  assert.equal(f.boss.hp, 9970);assert.equal(f.actor.stats.bossDmg, 30);assert.equal(f.boss.log.recv, 1);
  f.nm.onMessage('guest', f.hit({ q: 2, weak: 1 }));assert.equal(f.actor.stats.weakHits, 1);
  assert.equal(f.boss.hp, 9940);
});
test('malformed and stale messages never mutate boss health, receive logs, credit or admission sequence', async () => {
  const f = await bossWorld();
  for (const bad of [{ d: -1 },{ d: 0 },{ d: NaN },{ d: Infinity },{ weak: 2 },{ c: -2 },{ c: 99 },{ c: NaN },{ l: 1 },{ l: 3 },{ q: 0 },{ q: 1.5 },{ m: 'old-match' },{ a: 999 },{ w: Infinity },{ q: undefined }]) {
    f.nm.onMessage('guest', f.hit(bad));assert.equal(f.boss.hp, 10000);assert.equal(f.boss.log.recv, 0);assert.equal(f.actor.stats.bossDmg, undefined);
  }
  f.nm.onMessage('guest', f.hit());assert.equal(f.boss.hp, 9970);
  f.nm.onMessage('guest', f.hit({ q: 0 }));assert.equal(f.boss.hp, 9970);
});
test('accepted owner life supersedes rendered life; ownership handoff and new-match scope reject late hits', async () => {
  const f = await bossWorld();f.nm.onMessage('guest', f.hit());
  f.actor.net.lastLife = 3;
  f.nm.onMessage('guest', f.hit({ q: 2 }));assert.equal(f.boss.hp, 9970);
  f.nm.onMessage('guest', f.hit({ q: 2, l: 3 }));assert.equal(f.boss.hp, 9940);
  f.actor.owner = 'new-owner';f.nm.onMessage('guest', f.hit({ q: 3, l: 3 }));assert.equal(f.boss.hp, 9940);
  f.nm.onMessage('new-owner', f.hit({ q: 1, l: 3 }));assert.equal(f.boss.hp, 9910);
  f.nm.cfg.id = 'match-b';f.nm.onMessage('new-owner', f.hit({ q: 2, l: 3 }));assert.equal(f.boss.hp, 9910);
  f.nm.onMessage('new-owner', f.hit({ q: 2, l: 3, m: 'match-b' }));assert.equal(f.boss.hp, 9880);
  f.actor.owner = 'host';f.actor.remote = false;f.nm.onMessage('guest', f.hit({ q: 3, l: 3, m: 'match-b' }));assert.equal(f.boss.hp, 9880);
});
test('native crablet damage, storm batching and body cap preserve legitimate behavior', async () => {
  const f = await bossWorld();const crab = { id: 7, hp: 40, dead: false };f.boss.crabs.set(7, crab);
  f.nm.onMessage('guest', f.hit({ c: 7, d: 40, w: 'crab' }));assert.equal(crab.hp, 0);assert.equal(f.actor.stats.splats, 1);
  f.nm.onMessage('guest', f.hit({ c: 7, d: 40, w: 'crab' }));assert.equal(f.actor.stats.splats, 1);
  f.nm.onMessage('guest', f.hit({ q: 2, d: 1.25, w: 'storm' }));assert.equal(f.boss.hp, 9998.75);
  f.nm.onMessage('guest', f.hit({ q: 3, d: 2500 }));assert.equal(f.boss.hp, 9998.75); // over-limit payload must not reserve admission
  f.nm.onMessage('guest', f.hit({ q: 3, d: 2000 }));assert.equal(f.boss.hp, 7998.75);assert.equal(f.actor.stats.bossDmg, 2001.25);
});
test('native sender includes only boss metadata; normal player hit routing and authority remain separate', async () => {
  const f = await bossWorld();let received;
  f.nm._hit = (d, from) => { received = [d, from]; };const player = { k: 'hit', a: 1, v: 2, d: 25 };
  f.nm.onMessage('guest', player);assert.equal(received[0], player);assert.equal(received[1], 'guest');
  let sent;const guest = new f.NetMatch({ myId: 'guest', hostId: 'host', isHost: false, tr: { sendTo(to,d) { sent = [to,d]; } } }, { id: 'match-a' });
  guest.match = { boss: { log: { sent: 0, sentDmg: 0 } } };
  f.actor.remote = false;guest.sendBossHit(f.actor, 12.5, true, 'shooter');
  assert.equal(sent[0], 'host');assert.equal(sent[1].m, 'match-a');assert.equal(sent[1].l, 2);assert.equal(sent[1].q, 1);assert.equal(sent[1].weak, 1);
  f.actor.remote = true;f.nm._peer('guest').lastHit = 99;f.nm.onMessage('guest', sent[1]);
  assert.equal(f.boss.hp, 9987.5);assert.equal(f.nm._peer('guest').lastHit, 99);
  sent = null;guest.sendBossHit(f.actor, 12.5, false, 'shooter');assert.equal(sent, null);
});

test('#1179 direct Boss methods reject nonnumeric, negative, nonfinite and unauthorized damage without HP/credit mutation', async () => {
  const f = await bossWorld();
  const crab = { id: 7, hp: 40, dead: false };
  f.boss.crabs.set(7, crab);
  const start = {hp:f.boss.hp, crab:crab.hp, recv:f.boss.log.recv};
  const bad = [-20, 0, '-Infinity', '30', Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, NaN, null, {}, [], 2001];
  for (const d of bad) {
    f.boss.remoteHit(f.hit({ d }));
    f.boss.remoteHit(f.hit({ d, c: 7 }));
    f.boss.applyDamage(f.actor, d, false, null);
    f.boss._hitCrab(f.actor, crab, d, true);
    assert.equal(f.boss.hp, start.hp, `Boss HP corrupted by ${String(d)}`);
    assert.equal(crab.hp, start.crab, `Crab HP corrupted by ${String(d)}`);
  }
  f.boss.remoteHit(f.hit({d:30,c:99}));
  f.actor.alive = false;f.boss.remoteHit(f.hit({d:30}));
  assert.equal(f.boss.hp, start.hp);
  assert.equal(f.boss.log.recv, start.recv);
  f.actor.alive = true;
  f.boss.remoteHit(f.hit({d:30}));
  assert.equal(f.boss.hp, 9970);
  assert.equal(f.actor.stats.bossDmg, 30);
  f.boss.remoteHit(f.hit({d:40,c:7}));
  assert.equal(crab.hp, 0);
  assert.equal(Number.isFinite(crab.hp) && Number.isFinite(f.boss.hp), true);
});
