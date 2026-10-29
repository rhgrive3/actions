import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, bossSetup } from './contact-provenance-fixture.mjs';

// Real production-composed NetMatch admission; world and damage sink are the
// existing fixture's stubs. These cases measure admission budgets, not browser
// combat or complete protection against an owner fabricating its action stream.
const contactCount = x => x.state()?.contacts.size ?? 0;
const pendingCount = x => x.state()?.pending.get('peer')?.length ?? 0;

for (const queued of [false, true]) {
  test(`PvP wrong victim life preserves contact and the same hit ID (${queued ? 'queued' : 'direct'})`, async t => {
    const x = await setup(t);
    x.f.clock.set(100);
    if (!queued) x.tick();
    x.hit({ l: 1 });
    assert.equal(pendingCount(x), 0, 'invalid life must not reserve a deferred hit ID');
    if (queued) x.tick();
    assert.equal(x.calls.length, 0);
    assert.equal(contactCount(x), 0, 'native rejection must not spend contact cooldown');
    assert.equal(pendingCount(x), 0, 'invalid life must not reserve a deferred hit ID');
    assert.equal(x.nm.peers.get('peer')?.lastHit, undefined);
    x.hit();
    assert.equal(x.calls.length, 1);
    assert.equal(x.nm.peers.get('peer').lastHit, 1);
  });

  test(`Boss wrong attacker life preserves contact and the same nonce (${queued ? 'queued' : 'direct'})`, async t => {
    const x = await setup(t), b = bossSetup(x);
    x.f.clock.set(100);
    if (!queued) x.tick();
    b.hit({ l: 1 });
    assert.equal(pendingCount(x), 0, 'invalid life must not reserve a deferred nonce');
    if (queued) x.tick();
    assert.equal(b.hits, 0);
    assert.equal(contactCount(x), 0, 'native rejection must not spend contact cooldown');
    assert.equal(pendingCount(x), 0, 'invalid life must not reserve a deferred nonce');
    assert.equal(x.nm.peers.get('peer')?.lastBossHit, undefined);
    b.hit();
    assert.equal(b.hits, 1);
    assert.equal(x.nm.peers.get('peer').lastBossHit, 1);
  });
}

test('PvP replay cannot spend a newly available contact before a genuine next hit', async t => {
  const x = await setup(t);
  x.tick(); x.hit();
  assert.equal(x.calls.length, 1);
  x.f.clock.set(100.5);
  x.hit();
  assert.equal([...x.state().contacts.values()][0].at, 100, 'replay must not renew contact cooldown');
  x.hit({ h: 2, seq: 2 });
  assert.equal(x.calls.length, 2);
});

test('Boss replay cannot spend a newly available contact before a genuine next hit', async t => {
  const x = await setup(t), b = bossSetup(x);
  x.tick(); b.hit();
  assert.equal(b.hits, 1);
  x.f.clock.set(100.5);
  b.hit();
  assert.equal([...x.state().contacts.values()][0].at, 100, 'replay must not renew contact cooldown');
  b.hit({ q: 2 });
  assert.equal(b.hits, 2);
});

for (const type of ['pvp', 'boss']) {
  test(`${type} deferred valid claim is rechecked after its authoritative life changes`, async t => {
    const x = await setup(t), b = type === 'boss' ? bossSetup(x) : null;
    x.tick(1000, 100, { a: [x.f.packActor(x.remote, { f: 1 })] });
    if (b) b.hit(); else x.hit();
    assert.equal(pendingCount(x), 1, 'valid claim waits for its late action');
    if (b) x.remote.netLife = 1; else x.local.netLife = 1;
    x.tick(1000.1, 100.1, { u: 106, l: { 17: b ? 1 : 0 }, e: [x.proof(1000.1)] });
    assert.equal(b ? b.hits : x.calls.length, 0);
    assert.equal(contactCount(x), 0, 'queued old life must not consume the new contact');
    assert.equal(x.state().proofs.get('peer')[0].uses, 0, 'queued old life must not consume the late action');
    assert.equal(pendingCount(x), 0);
    if (b) b.hit({ l: 1 }); else x.hit({ l: 1 });
    assert.equal(b ? b.hits : x.calls.length, 1);
  });
}

test('legitimate claim may wait for its first owner tick without allocating a peer', async t => {
  const x = await setup(t);
  x.f.clock.set(100);
  assert.equal(x.nm.peers.has('peer'), false);
  x.hit();
  assert.equal(pendingCount(x), 1);
  assert.equal(x.nm.peers.has('peer'), false, 'read-only receipt preflight must not allocate native state');
  x.tick(1000, 100, { e: [x.proof()] });
  assert.equal(x.calls.length, 1);
});
