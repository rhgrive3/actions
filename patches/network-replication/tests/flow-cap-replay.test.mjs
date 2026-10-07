import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

// Real installed Flow listeners + composed native NetMatch event replay.
// Paint is counted at its API boundary; this is logic evidence, not transport/GPU evidence.
test('#893 capped owner Flow burst is not reapplied by delayed, duplicate or spoofed remote death replay', async () => {
  const f = await fixture({ flow: true });
  const session = f.makeSession('host', 'host');
  const nm = f.makeNetMatch(session);
  const attacker = f.makeActor({ nid: 0, owner: 'host', team: 0, roller: false });
  const victim = f.makeActor({ nid: 1, owner: 'p2', team: 1, roller: false });
  f.G.match = f.bind(nm, [attacker, victim]);
  nm._peer('p2');
  const calls = [], flowCalls = () => calls.filter(args =>
    args[1] === f.profile.flow.paintRadius && args[3]?.kind === 'trail' && args[3]?.seed === 0.5);
  f.G.paint.splat = (...args) => { calls.push(args); return 0; };
  attacker.s3 = { flow: { active: true, remaining: f.profile.flow.maxDuration, score: 0, idleTime: 0 } };
  f.emit('splatted', { attacker, victim, cause: 'shooter' });
  assert.equal(flowCalls().length, 1, 'owner-side qualifying event paints one Flow burst even at cap');
  assert.equal(attacker.s3.flow.remaining, f.profile.flow.maxDuration);
  for (const delay of [0.1, 0.25, 0.5]) {
    f.clock.advance(delay);
    const event = [f.G.time, 'ev', 'splatted', { victim: { n: 1 }, attacker: { n: 0 }, cause: 'shooter', victimOwner: 'p2', victimLife: 0, burstArea: '0' }];
    event._netSeq = 1;
    nm._play('spoof', event);
    if (delay === 0.1) assert.equal(victim.alive, true, 'foreign peer cannot apply the victim event');
    nm._play('p2', event);
    nm._play('p2', event);
    assert.equal(victim.alive, false, 'real owner replay applies native remote death');
    assert.equal(flowCalls().length, 1, 'replay/sequence/alive guards cannot create a second Flow paint');
    assert.equal(attacker.s3.flow.remaining, f.profile.flow.maxDuration);
  }
});
