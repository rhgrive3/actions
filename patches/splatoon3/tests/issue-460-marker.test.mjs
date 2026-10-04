import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const { ownerJumpProgress, remoteJumpProgress, jumpMarkerSnapshot, liveJumpMarker } =
  await import('../issue-460-marker.mjs');
const { adaptIssue460Source } = await import('../issue-460-adapter.mjs');

test('marker progress is monotonic at 25/50/75% of a fixed flight duration', () => {
  const dur = 2.3;
  const p25 = ownerJumpProgress({ phase: 'flight', t: 0.25 * dur, dur });
  const p50 = ownerJumpProgress({ phase: 'flight', t: 0.50 * dur, dur });
  const p75 = ownerJumpProgress({ phase: 'flight', t: 0.75 * dur, dur });
  assert.ok(Math.abs(p25 - 0.25) < 1e-12);
  assert.ok(Math.abs(p50 - 0.50) < 1e-12);
  assert.ok(Math.abs(p75 - 0.75) < 1e-12);
  const r25 = jumpMarkerSnapshot({ progress: p25, dur, jumper: 'jumper-a' });
  const r50 = jumpMarkerSnapshot({ progress: p50, dur, jumper: 'jumper-a' });
  const r75 = jumpMarkerSnapshot({ progress: p75, dur, jumper: 'jumper-a' });
  assert.ok(r25.countdown > r50.countdown && r50.countdown > r75.countdown);
  assert.ok(r25.remaining > r50.remaining && r50.remaining > r75.remaining);
  assert.equal(r50.label, 'jumper-a');
  assert.equal(remoteJumpProgress(0.5 * dur, dur), 0.5);
});

test('main control: charge/cancel/land collapse the marker, stealth hook hides cue', () => {
  assert.equal(ownerJumpProgress({ phase: 'charge', t: 9, dur: 2.3 }), 0);
  assert.equal(ownerJumpProgress(null, 2.3), 0);
  assert.equal(ownerJumpProgress({ phase: 'flight', t: 1, dur: 0 }), 0);
  assert.equal(remoteJumpProgress(NaN, 2.3), 0);
  assert.equal(liveJumpMarker(false, { progress: 0.5 }), null);
  const hidden = jumpMarkerSnapshot({ progress: 0.5, dur: 2.3, jumper: 'x', concealed: true });
  assert.equal(hidden.countdown, 0);
  assert.equal(hidden.label, '');
  assert.equal(hidden.concealed, true);
});

test('owner/remote isolation: equal progress semantics from separate clocks', () => {
  const dur = 2.3;
  const owner = jumpMarkerSnapshot({ progress: ownerJumpProgress({ phase: 'flight', t: 1.15, dur }), dur, jumper: 'owner' });
  const remote = jumpMarkerSnapshot({ progress: remoteJumpProgress(1.15, dur), dur, jumper: 'remote' });
  assert.equal(owner.progress, remote.progress);
  assert.equal(owner.remaining, remote.remaining);
  assert.equal(owner.countdown, remote.countdown);
  assert.equal(owner.label, 'owner');
  assert.equal(remote.label, 'remote');
});

test('adapter wires actual gauge render/clear calls at native anchors without gameplay edits', () => {
  const actor = adaptIssue460Source('src/game/actor.js', read('inkwave-public/src/game/actor.js'));
  assert.match(actor, /phase: 'flight', to: s\.to\.clone\(\), dur: s\.dur/);
  assert.match(actor, /renderJumpGauge460\(G, this, m460, s\.to, this\.color, THREE\)/);
  assert.match(actor, /this\.s3\.jumpMarker460 = m460/);
  assert.match(actor, /clearJumpGauge460\(this\);\n        this\.superJumpState = null;/);
  const clears460 = actor.split('\n').filter((l) => /clearJumpGauge460\(this\)/.test(l));
  assert.ok(clears460.length >= 4, 'land, cancel, splat and reset each detach the gauge');
  const lines460 = actor.split('\n').filter((l) => l.includes('460') || l.includes('p460') || l.includes('m460'));
  assert.ok(lines460.length >= 6);
  assert.ok(!lines460.some((l) => /s\.dur\s*=|invuln|damage\.|paint\.splat|_resolve/.test(l)));
  const net = adaptIssue460Source('src/net/netmatch.js', read('inkwave-public/src/net/netmatch.js'));
  assert.match(net, /sjDur460: 0, sjT460: 0, sjMarker460: null/);
  assert.match(net, /a\.net\.sjDur460 = Number\(e\.dur\)/);
  assert.match(net, /n\.sjT460 = \(Number\(n\.sjT460\) \|\| 0\) \+ dt/);
  assert.match(net, /renderJumpGauge460\(G, a, n\.sjMarker460, n\.sjTo, a\.color, THREE\)/);
  assert.match(net, /clearJumpGauge460\(a\)/);
  assert.match(net, /clearJumpGauge460\(victim\)/);
  const net460 = net.split('\n').filter((l) => l.includes('460') || l.includes('p460'));
  assert.ok(net460.length >= 6);
  assert.ok(!net460.some((l) => /packActor|unpackActor|F\.sjFlight\s*[:=]/.test(l)));
  assert.throws(() => adaptIssue460Source('src/game/actor.js', actor), /issue-460 patch conflict/);
});
