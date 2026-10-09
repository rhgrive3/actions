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
    if (negative === 'row' && rel === 'src/net/netmatch.js')
      return out.replace('e => Array.isArray(e) && (', 'e => (');
    return negative && rel === 'src/net/netmatch.js'
      ? out.replace('    if (d.e != null && !Array.isArray(d.e)) return;\n', '') : out;
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
  return {...f,nm,actor,packet};
}

test('#1178 negative control: malformed event container throws after poisoning peer watermark', async () => {
  const f=await rig({negative:true}); f.nm.onMessage('p2',f.packet(1000,1));
  const peer=f.nm.peers.get('p2'), bad=f.packet(2000,40,{});
  assert.throws(()=>f.nm.onMessage('p2',bad), /filter is not a function/);
  assert.equal(peer.lastTs,2000); assert.equal(f.actor.net.buf.at(-1).x,40);
  f.nm.onMessage('p2',f.packet(1000.1,7));
  assert.equal(f.actor.net.buf.at(-1).x,40,'later normal snapshot is suppressed by rejected packet clock');
});

test('#1178 malformed event containers leave clock/actor state unchanged and next owner packet works', async () => {
  for(const value of [{},'events',42,true,false,'']) {
    const f=await rig(); f.nm.onMessage('p2',f.packet(1000,1));
    const peer=f.nm.peers.get('p2'), previous=structuredClone({peer,buffer:f.actor.net.buf});
    assert.doesNotThrow(()=>f.nm.onMessage('p2',f.packet(2000,40,value)));
    assert.deepEqual(structuredClone({peer,buffer:f.actor.net.buf}),previous);
    f.nm.onMessage('p2',f.packet(1000.1,7));
    assert.equal(peer.lastTs,1000.1);assert.equal(f.actor.net.buf.at(-1).x,7);
  }
});

test('#1178 negative control: early credit filter must not dereference null before the later row validator', async () => {
  const f=await rig({negative:'row'}); f.nm.onMessage('p2',f.packet(1000,1));
  assert.throws(()=>f.nm.onMessage('p2',f.packet(2000,40,[null])), /null/);
  assert.equal(f.nm.peers.get('p2').lastTs,2000);
});

test('#1178 missing/null/empty event lists and bad individual rows retain existing snapshot admission', async () => {
  const f=await rig();let seq=0;
  for(const events of [undefined,null,[],[null,{},'bad',[NaN,'x']]]) {
    const ts=1000+ ++seq;
    assert.doesNotThrow(()=>f.nm.onMessage('p2',f.packet(ts,seq,events)));
    assert.equal(f.actor.net.buf.at(-1).x,seq);
    assert.equal(f.nm.peers.get('p2').events.length,0);
  }
  const valid=[1006,'tr',7,'jump',null,0,1];
  const packet=f.packet(1006,6,[valid]);packet.r=2;
  f.nm.onMessage('p2',packet);
  assert.equal(f.nm.peers.get('p2').events.length,1,'existing valid event still enters native queue');
  assert.equal(f.actor.net.buf.at(-1).x,6);
  const death=(owner)=>[1007,'ev','splatted',{victimOwner:owner,victim:{n:7}},0,2];
  const forged=f.packet(1007,7,[death('foreign')]);forged.r=2;f.nm.onMessage('p2',forged);
  assert.equal(f.nm.peers.get('p2').events.length,1,'terminal credit still requires the authenticated victim owner');
  const legitimate=f.packet(1008,8,[death('p2')]);legitimate.e[0][0]=1008;legitimate.r=2;
  f.nm.onMessage('p2',legitimate);
  assert.equal(f.nm.peers.get('p2').events.length,2,'valid victim-owned terminal credit is still queued');
});
