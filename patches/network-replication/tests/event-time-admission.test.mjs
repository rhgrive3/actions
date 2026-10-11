import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const exports = `
  export { installIssueFiveHotfixA } from './patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
  export { installIssueFiveHotfixB } from './patches/splatoon3/runtime/issue-five-hotfix-b.mjs';
  export { installIssueFiveHotfixC } from './patches/splatoon3/runtime/issue-five-hotfix-c.mjs';
  export { installDisconnectFidelity } from './patches/splatoon3/runtime/disconnect-fidelity.mjs';
  export { installSlosherIntermediatePaint } from './patches/splatoon3/runtime/slosher-intermediate-paint.mjs';
  export { installQuality } from './patches/local-quality/install.mjs';
  export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  export { installIssueEightFollowup } from './patches/splatoon3/runtime/issue-eight-followup.mjs';
`;
async function rig({ negative = false } = {}) {
  const adapt = (rel, code) => {
    const out = adaptBuildSource(rel, code);
    if (!negative || rel !== 'src/net/netmatch.js') return out;
    if (negative === 'tick-type') {
      const gate = '        if (!Number.isSafeInteger(tick) || tick < 0 || Number.isSafeInteger(d.u) && tick > d.u) continue;\n        e._netTick = tick;';
      assert.ok(out.includes(gate));
      return out.replace(gate, `        if (Number.isSafeInteger(tick)) {
          if (tick < 0 || Number.isSafeInteger(d.u) && tick > d.u) continue;
          e._netTick = tick;
        }`);
    }
    const gate = '!validSnapshotTimestamp(e[0]) || e[0] > d.ts';
    assert.ok(out.includes(gate), 'counterfactual removes the event timestamp check only');
    return out.replace(gate, '!Number.isFinite(e[0])')
      .replace('if (!Number.isSafeInteger(tick) || tick < 0 || Number.isSafeInteger(d.u) && tick > d.u) continue;', '');
  };
  const f = await fixture({ fullRuntime: true, adapt, adaptRuntime: adapt, extraExports: exports });
  const source = fs.readFileSync(new URL('../../splatoon3/bootstrap.mjs', import.meta.url), 'utf8');
  let previous = source.indexOf('const context = install(profile);'); assert.ok(previous >= 0);
  for (const name of ['installIssueFiveHotfixA', 'installIssueFiveHotfixB', 'installIssueFiveHotfixC',
    'installDisconnectFidelity', 'installSlosherIntermediatePaint', 'installQuality',
    'installWeaponsFidelity', 'installIssueEightFollowup']) {
    const index = source.indexOf(`  ${name}(`, previous); assert.ok(index > previous); previous = index;
    if (name === 'installQuality') f[name](f.profile); else f[name](f.installedRuntime, f.profile);
  }
  const actor = f.make('dualies'); actor.nid = 7; actor.owner = 'p2'; actor.remote = true; actor.isLocal = false;
  const session = {myId:'host',hostId:'host',isHost:true,_members:new Map([['host','Host'],['p2','Owner']]),tr:{broadcast(){},sendTo(){}}};
  const nm = new f.NetMatch(session, {id:'events-scope',map:'map',difficulty:'normal'});
  nm.match = {actors:[actor],state:'playing',duration:180,time:100,removeActor(){}};
  nm.byNid.set(7,actor);nm._setupActor(actor);
  const owner = f.make('dualies'); owner.nid = 7; owner.owner = 'p2'; owner.remote = false;
  const sender={byNid:new Map([[7,owner]]),out:[],stats:{out:0},s:{tr:{broadcast(){}}}};
  function packet(ts, x, events) {
    let result; owner.pos.x=x;
    sender.s.tr.broadcast = message => {result=structuredClone(message);};
    f.NetMatch.prototype._sendTick.call(sender);result.ts=ts;
    if(events!==undefined)result.e=events;
    return result;
  }
  const played=[]; actor.character._netTrig = name => played.push(name);
  return {...f,nm,actor,packet,played};
}

function trigger(ts, tick, seq, name = 'jump') { return [ts, 'tr', 7, name, null, tick, seq]; }
function receive(f, ts, events, tick = 0, schema = 2) {
  const packet = f.packet(ts, f.actor.pos.x, events); packet.r = schema;
  if (tick == null) delete packet.u; else packet.u = tick;
  f.nm.onMessage('p2', packet);
  return f.nm.peers.get('p2');
}
function drain(f, ts = 1001, tick = 0) {
  const peer = f.nm.peers.get('p2'); peer.tr = ts; peer.sim = tick;
  f.nm._playEvents(); return peer;
}

test('#1178 counterfactual impossible future event blocks subsequent native trigger playback', async () => {
  for (const bad of [trigger(1e308, 0, 1), trigger(1000, Number.MAX_SAFE_INTEGER, 1)]) {
    const f = await rig({ negative: true });
    receive(f, 1000, [bad]); receive(f, 1000.1, [trigger(1000.1, 0, 2)]);
    const peer = drain(f);
    assert.equal(peer.events.length, 2); assert.deepEqual(f.played, []);
  }
});

test('#1178 invalid event time never blocks the next valid event or consumes its sequence', async () => {
  for (const bad of [trigger(1e308, 0, 1), trigger(1000.001, 0, 1), trigger(-1, 0, 1),
    trigger(1000, Number.MAX_SAFE_INTEGER, 1), trigger(1000, 1, 1), trigger(1000, -1, 1)]) {
    const f = await rig();
    const peer = receive(f, 1000, [bad]);
    assert.equal(peer.events.length, 0, `invalid timestamp/tick ${bad[0]}/${bad.at(-2)} is not queued`);
    assert.equal(peer._lastEventSeq, undefined);
    receive(f, 1000.1, [trigger(1000.1, 0, 1)]);
    drain(f); assert.equal(peer.events.length, 0); assert.deepEqual(f.played, ['jump']);
    assert.equal(peer._lastEventSeq, 1, 'rejected temporal metadata never burns sequence 1');
  }
});

test('#1178 valid delayed and same-envelope events retain order and exactly-once playback', async () => {
  const f = await rig();
  receive(f, 1000, [trigger(999.9, 2, 1), trigger(1000, 3, 2, 'land')], 3);
  drain(f, 999.8, 1); assert.deepEqual(f.played, []);
  drain(f, 1000, 3); assert.deepEqual(f.played, ['jump', 'land']);
  receive(f, 1000.1, [trigger(999.9, 2, 1), trigger(1000, 3, 2, 'land')], 3);
  drain(f, 1000.1, 3); assert.deepEqual(f.played, ['jump', 'land']);
});

test('#1178 legacy envelopes without an outer simulation tick retain admission', async () => {
  for (const schema of [null, 2]) {
    const f = await rig();
    const event = schema === 2 ? trigger(1000, 2, 1) : [1000, 'tr', 7, 'jump', null];
    receive(f, 1000, [event], null, schema); drain(f, 1000, 2);
    assert.deepEqual(f.played, ['jump']);
  }
});

test('#1178 native recording and send envelope keep both event clocks within the enclosing tick', async () => {
  const f = await rig(); let packet;
  f.nm.s.tr.broadcast = data => { packet = structuredClone(data); };
  f.G.time = 10; f.nm._rec(['tr', 7, 'jump', null]);
  f.G.time += 1 / 60; f.nm._rec(['tr', 7, 'land', null]);
  f.nm._sendTick();
  assert.equal(packet.r, 2); assert.equal(packet.e.length, 2);
  for (const event of packet.e) {
    assert(event[0] >= 0 && event[0] <= packet.ts);
    assert(event.at(-2) >= 0 && event.at(-2) <= packet.u);
  }
});

test('#1178 valid queued playback after a rejected future event is fixed-step equivalent at 30/60/120 Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await rig(), clock = new f.FixedClock(), trace = []; let frame = 0;
    receive(f, 1001, [trigger(1e308, 0, 1), trigger(999.9, 1, 2), trigger(1000.01, 2, 3, 'land')], 60);
    for (let render = 0; render < hz; render++) clock.advance(1 / hz, () => {
      frame++; drain(f, 1000 + frame / 60, frame);
      trace.push([...f.played]);
    });
    assert.deepEqual(trace[0], ['jump']); assert.deepEqual(trace[1], ['jump', 'land']);
    traces.push(trace);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});


test('#1178 old R2 tick-type fallback plays before the owner simulation tick is ready', async () => {
  const old = await rig({negative:'tick-type'});
  receive(old,1000,[trigger(1000,null,1)]);drain(old,1000,-1);
  assert.deepEqual(old.played,['jump']);
  const valid = await rig();receive(valid,1000,[trigger(1000,0,1)]);drain(valid,1000,-1);
  assert.deepEqual(valid.played,[]);assert.equal(valid.nm.peers.get('p2').events.length,1);
  drain(valid,1000,0);assert.deepEqual(valid.played,['jump']);
});

test('#1178 R2 noninteger ticks never queue or burn the next valid event sequence', async () => {
  const f=await rig();let ts=1000,seq=0;
  for(const tick of [null,'0',0.5,NaN,Infinity,{},[],Number.MAX_SAFE_INTEGER+1]) {
    const peer=receive(f,ts,[trigger(ts,tick,seq+1)]);
    assert.equal(peer.events.length,0);assert.equal(peer._lastEventSeq||0,seq);
    ts+=.1;receive(f,ts,[trigger(ts,0,++seq)]);drain(f,ts,0);
    assert.equal(f.played.length,seq);assert.equal(peer._lastEventSeq,seq);ts+=.1;
  }
});
