import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('a late host decision still awards the observed first pair after another remote splat', async () => {
  const h = await fixture({ flow: true }), g = await fixture({ flow: true }), sent = [];
  const hs = h.makeSession('host', 'host', [['host','Host'],['guest','Guest']]);
  const gs = g.makeSession('guest', 'host', [['host','Host'],['guest','Guest']]);
  hs.tr.broadcast = packet => sent.push(packet);
  const hn = h.makeNetMatch(hs, { id: 'interleaved-first' });
  const gn = g.makeNetMatch(gs, { id: 'interleaved-first' });
  const actors = f => [
    f.makeActor({ nid: 0, owner: 'host', team: 0, roller: false }),
    f.makeActor({ nid: 1, owner: 'guest', team: 1, roller: false }),
    f.makeActor({ nid: 2, owner: 'guest', team: 1, roller: false }),
    f.makeActor({ nid: 3, owner: 'host', team: 0, roller: false }),
  ];
  const ha = actors(h), ga = actors(g);
  h.G.match = h.bind(hn, ha); g.G.match = g.bind(gn, ga);
  h.G.match.mode = g.G.match.mode = 'turf';
  hn._remoteSplat(ha[1], ha[0], 'shooter');
  g.emit('splatted', { attacker: ga[0], victim: ga[1] });
  gn._remoteSplat(ga[3], ga[2], 'shooter');
  const confirmation = sent.find(packet => packet.k === 'fs');
  assert.ok(confirmation);
  assert.equal(ga[0].s3.flow.score, 1, 'ordinary local award precedes host decision');
  gn.onMessage('host', confirmation);
  assert.ok(Math.abs(ga[0].s3.flow.score - 1.3) < 1e-9, 'interleaved remote pair cannot erase the first observation');
  assert.ok(Math.abs(ha[0].s3.flow.score - 0.3) < 1e-9, 'host applies its one first-splat bonus');
  gn.onMessage('host', confirmation);
  gn._remoteSplat(ga[1], ga[0], 'shooter');
  assert.ok(Math.abs(ga[0].s3.flow.score - 1.3) < 1e-9, 'confirmation and observation repeats never grant the bonus twice');
  assert.equal(ga[2].s3?.flow?.score || 0, 0, 'the intervening remote attacker does not gain the first bonus');
});

test('host serializes one first splat for opposing same-frame candidates, even when its attacker is dead', async () => {
  for (const firstBlue of [false, true]) {
    const f = await fixture(), sent = [];
    const session = f.makeSession('host', 'host', [['host', 'Host'], ['p2', 'P2'], ['p3', 'P3']]);
    session.tr.broadcast = packet => sent.push(packet);
    const nm = f.makeNetMatch(session, { id: `opposed-${firstBlue}` });
    const red = f.makeActor({ nid: 0, owner: 'host', team: 0, roller: false });
    const blue = f.makeActor({ nid: 1, owner: 'p2', team: 1, roller: false });
    const red2 = f.makeActor({ nid: 2, owner: 'host', team: 0, roller: false });
    const blueBot = f.makeActor({ nid: 3, owner: 'p2', team: 1, roller: false }); blueBot.isBot = true;
    const match = f.bind(nm, [red, blue, red2, blueBot]); f.G.match = match;
    const first = firstBlue ? [blueBot, red2] : [red, blue];
    const second = firstBlue ? [red, blue] : [blueBot, red2];
    first[0].alive = false;
    assert.equal(nm.claimFirstSplat(...first), true);
    nm._remoteRespawn(first[0]);
    assert.equal(nm.claimFirstSplat(...second), false);
    assert.deepEqual(JSON.parse(JSON.stringify(sent.filter(packet => packet.k === 'fs'))), [{ k: 'fs', m: `opposed-${firstBlue}`, a: first[0].nid, v: first[1].nid }]);
  }
});

test('only the current host can confirm a valid enemy pair once for the current match', async () => {
  const f = await fixture(), requests = [];
  const session = f.makeSession('guest', 'host', [['host', 'Host'], ['guest', 'Guest'], ['p3', 'P3']]);
  session.tr.sendTo = (to, packet) => requests.push({ to, packet });
  const nm = f.makeNetMatch(session, { id: 'valid-match' });
  const attacker = f.makeActor({ nid: 10, owner: 'guest', team: 0, roller: false });
  const victim = f.makeActor({ nid: 11, owner: 'host', team: 1, roller: false });
  const ally = f.makeActor({ nid: 12, owner: 'p3', team: 0, roller: false });
  const match = { actors: [attacker, victim, ally], state: 'playing', time: 0, follower: false };
  nm.bind(match); f.G.match = match;
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { to: 'host', packet: { k: 'fsq', m: 'valid-match' } });
  const decisions = []; f.on('flow:first-splat-confirmed', event => decisions.push(event));

  nm.onMessage('attacker', { k: 'fs', m: 'valid-match', a: 10, v: 11 });
  nm.onMessage('host', { k: 'fs', m: 'stale-match', a: 10, v: 11 });
  nm.onMessage('host', { k: 'fs', m: 'valid-match', a: 10, v: 12 });
  assert.equal(decisions.length, 0);
  nm.onMessage('host', { k: 'fs', m: 'valid-match', a: 10, v: 11 });
  nm.onMessage('host', { k: 'fs', m: 'valid-match', a: 10, v: 11 });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].match, match);
  assert.equal(decisions[0].attacker, attacker);
  assert.equal(decisions[0].victim, victim);
});

test('host decision survives NetMatch reconstruction for reconnect and resets on a new match id', async () => {
  const f = await fixture(), sent = [];
  const session = f.makeSession('host', 'host', [['host', 'Host'], ['guest', 'Guest']]);
  session.tr.broadcast = packet => sent.push({ kind: 'broadcast', packet });
  session.tr.sendTo = (to, packet) => sent.push({ kind: 'direct', to, packet });
  const actors = [
    f.makeActor({ nid: 0, owner: 'host', team: 0, roller: false }),
    f.makeActor({ nid: 1, owner: 'guest', team: 1, roller: false }),
    f.makeActor({ nid: 2, owner: 'guest', team: 1, roller: false }),
  ];
  const first = f.makeNetMatch(session, { id: 'reconnect-match' });
  f.G.match = f.bind(first, actors);
  assert.equal(first.claimFirstSplat(actors[2], actors[0]), true);

  const resumed = f.makeNetMatch(session, { id: 'reconnect-match' });
  f.G.match = f.bind(resumed, actors);
  assert.equal(resumed.claimFirstSplat(actors[0], actors[1]), false);
  resumed.onMessage('guest', { k: 'fsq', m: 'reconnect-match' });
  assert.ok(sent.some(item => item.kind === 'direct' && item.to === 'guest'
    && item.packet.k === 'fs' && item.packet.a === actors[2].nid && item.packet.v === actors[0].nid));

  const next = f.makeNetMatch(session, { id: 'next-match' });
  f.G.match = f.bind(next, actors);
  assert.equal(next.claimFirstSplat(actors[0], actors[1]), true);
});

test('remote splat observation fires only after the native alive guard and only once', async () => {
  const f = await fixture(), nm = f.makeNetMatch(f.makeSession('host', 'host'));
  const victim = f.makeActor({ nid: 1, owner: 'p2', team: 1, roller: false });
  const attacker = f.makeActor({ nid: 2, owner: 'p3', team: 0, roller: false }); attacker.isBot = true;
  f.G.match = f.bind(nm, [victim, attacker]);
  const seen = []; f.on('flow:splat-observed', event => seen.push(event));
  nm._remoteSplat(victim, attacker, 'shooter');
  nm._remoteSplat(victim, attacker, 'shooter');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].victim, victim);
  assert.equal(seen[0].attacker, attacker);
  assert.equal(victim.alive, false);
});

test('host first-splat claims are isolated from Range and attract matches', async () => {
  const f = await fixture(), sent = [], session = f.makeSession('host', 'host');
  session.tr.broadcast = packet => sent.push(packet);
  const nm = f.makeNetMatch(session, { id: 'isolated-match' });
  const attacker = f.makeActor({ nid: 0, owner: 'host', team: 0, roller: false });
  const victim = f.makeActor({ nid: 1, owner: 'p2', team: 1, roller: false });
  const match = f.bind(nm, [attacker, victim]); f.G.match = match;
  match.range = {};
  assert.equal(nm.claimFirstSplat(attacker, victim), false);
  match.range = null; match.attract = true;
  assert.equal(nm.claimFirstSplat(attacker, victim), false);
  match.attract = false;
  assert.equal(nm.claimFirstSplat(attacker, victim), true);
  assert.equal(sent.filter(packet => packet.k === 'fs').length, 1);
});

test('the existing event owner and sequence gates reject spoofed and duplicate splat events', async () => {
  const f = await fixture(), nm = f.makeNetMatch(f.makeSession('guest', 'host'));
  const victim = f.makeActor({ nid: 1, owner: 'p2', team: 1, roller: false });
  const attacker = f.makeActor({ nid: 2, owner: 'p3', team: 0, roller: false });
  f.G.match = f.bind(nm, [victim, attacker]);
  nm._peer('p2');
  let played = 0; nm._playEvent = () => { played++; };
  const event = [0, 'ev', 'splatted', { victim: { n: victim.nid }, attacker: { n: attacker.nid }, cause: 'shooter' }];
  event._netSeq = 1;
  nm._play('spoof', event); assert.equal(played, 0);
  nm._play('p2', event); assert.equal(played, 1);
  nm._play('p2', event); assert.equal(played, 1);
});
