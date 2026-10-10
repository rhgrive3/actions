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
    const gate = "    if (from === this.s.hostId && d.c != null && (!Array.isArray(d.c) || d.c.length !== 2 || typeof d.c[0] !== 'string' || !Number.isFinite(d.c[1]) || d.c[1] < 0)) return;";
    assert.ok(out.includes(gate), 'counterfactual removes only the host clock sidecar guard');
    return out.replace(gate, '');
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
  const session = {myId:'host',hostId:'p2',isHost:false,_members:new Map([['host','Host'],['p2','Owner']]),tr:{broadcast(){},sendTo(){}}};
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
  return {...f,nm,actor,packet,sender};
}

function receive(f, ts, c, from = 'p2', x = 1) {
  const d = f.packet(ts, x); if (c !== undefined) d.c = c;
  f.nm.onMessage(from, d); return f.nm.peers.get(from);
}

test('#1178 old clock sidecar destructuring throws after committing replay watermark and position', async () => {
  const f = await rig({negative:true}); receive(f,1000,undefined);
  assert.throws(() => receive(f,2000,{},'p2',40), /iterable/);
  assert.equal(f.nm.peers.get('p2').lastTs,2000);
  assert.equal(f.actor.net.buf.at(-1).x,40);
  receive(f,1000.1,undefined,'p2',7);
  assert.notEqual(f.actor.net.buf.at(-1).x,7);
  receive(f,2001,['playing',null]);
  assert.equal(f.nm.match.time,50,'JSON null coerces to zero in the old clock correction');
});

test('#1178 malformed host clocks cannot mutate peer, actor or match and the next normal snapshot recovers', async () => {
  const f = await rig(); receive(f,1000,undefined);
  const invalid = [{},true,false,1,'playing',[],['playing'],['playing',null],['playing','5'],
    ['playing',-1],['playing',NaN],['playing',Infinity],['playing',10,'extra'],[null,100]];
  let ts = 1000;
  for (const c of invalid) {
    const peer = f.nm.peers.get('p2');
    const before = structuredClone({peer,buf:f.actor.net.buf,time:f.nm.match.time,stats:f.nm.stats});
    assert.doesNotThrow(() => receive(f,2000,c,'p2',40));
    assert.deepEqual(structuredClone({peer,buf:f.actor.net.buf,time:f.nm.match.time,stats:f.nm.stats}),before);
    receive(f,ts += .1,['playing',100],'p2',7);
    assert.equal(peer.lastTs,ts); assert.equal(f.actor.net.buf.at(-1).x,7);
  }
});

test('#1178 invalid first host clock cannot create a peer; absent/null clocks remain compatible', async () => {
  const f = await rig(); receive(f,2000,{});
  assert.equal(f.nm.peers.has('p2'),false); assert.equal(f.actor.net.buf.length,0);
  receive(f,1000,undefined); receive(f,1000.1,null);
  assert.equal(f.nm.peers.get('p2').lastTs,1000.1); assert.equal(f.actor.net.buf.length,2);
});

test('#1178 host authority, native clock production and ordinary half correction are preserved', async () => {
  const f = await rig();
  f.nm.s._members.set('other','Other');
  receive(f,1000,{},'other'); receive(f,1001,['playing',0],'other');
  assert.equal(f.nm.match.time,100,'nonhost clock metadata cannot change the follower timer');
  assert.equal(f.nm.peers.get('other').lastTs,1001,'ignored nonhost sidecars do not reject independent actor snapshots');
  f.sender.isHost = true; f.sender.match = {state:'playing',time:80}; f.sender.clockT = 0;
  const native = f.packet(1000,2);
  assert.deepEqual(native.c,['playing',80]); f.nm.onMessage('p2',native);
  assert.equal(f.nm.match.time,90,'existing >0.2s half-correction formula remains native');
  receive(f,1000.1,['playing',90.1]); assert.equal(f.nm.match.time,90,'small jitter is still ignored');
  receive(f,1000.2,['finish',0]); assert.equal(f.nm.match.time,90,'periodic clock is not a state-transition message');
  receive(f,1000.3,['playing',0]); assert.equal(f.nm.match.time,45,'zero remaining time is valid');
});

test('#1178 rejected clock and subsequent correction are fixed-step identical at 30/60/120 Hz', async () => {
  const results = [];
  for (const hz of [30,60,120]) {
    const f = await rig(), clock = new f.FixedClock(), trace=[]; let tick=0;
    receive(f,1000,['playing',100]);
    for (let frame=0;frame<hz;frame++) clock.advance(1/hz,()=>{
      tick++; f.nm.match.time -= 1/60;
      if(tick===20) receive(f,2000,['playing',null]);
      if(tick===30) receive(f,1000.5,['playing',99.5]);
      trace.push(f.nm.match.time);
    });
    assert.equal(trace.length,60); results.push(trace);
  }
  assert.deepEqual(results[0],results[1]); assert.deepEqual(results[1],results[2]);
});
