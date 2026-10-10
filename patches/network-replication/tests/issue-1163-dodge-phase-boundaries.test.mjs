import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRemoteDodgeClock, remoteDodgePresentation, syncRemoteDodgeClock } from '../../splatoon3/runtime/remote-dodge-clock.mjs';

test('remote dodge enters recovery and expires at absolute sender-time boundaries', () => {
  for (const epoch of [0, 10, 10000]) {
    for (const hz of [30, 60, 120]) {
      const actor = { remote: true, owner: 'owner', alive: true,
        weapon: { kind: 'dualies', rollTime: 0.2 }, net: {} };
      const meta = { token: 1, start: epoch, life: 0, tp: 0,
        startupDur: 0.05, dur: 0.2, lockDur: 0.1, dir: [1, 0] };
      assert.equal(acceptRemoteDodgeClock(actor, 'owner', epoch, meta, epoch), true);
      for (let frame = 0; frame < Math.ceil(0.35 * hz); frame++) {
        const age = frame / hz;
        syncRemoteDodgeClock(actor, epoch + age, null, false, false);
        const pose = remoteDodgePresentation(actor);
        assert.equal(pose.phase, age < 0.05 ? 'startup' : age < 0.25 ? 'roll' : 'plant',
          `epoch=${epoch}, hz=${hz}, age=${age}`);
      }
      syncRemoteDodgeClock(actor, epoch + 0.35, null, false, false);
      assert.equal(remoteDodgePresentation(actor), null);
      assert.equal(actor.remoteDodgeClock, undefined);
    }
  }
});
