import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { validOwnerTickAdvance } from '../snapshot-guard.mjs';

// Exact identity-free terminal actor row from official 5f2d job120130984852,
// host sequence27/tick1688 at23:18:48.916Z. Receiver timing was not recorded.
// This regression MODELS delayed receipt, not the cause of that browser run.
const completed = { k:'t', ts:167.648, u:1688,
  a:[[0,.11,0,-27.2,0,0,0,-.07,0,-.12,12582929,100,100,0,0,0,1,0,0,0,0,0,0,
    ['inkwave-adoption-v1',1,27,1688,['inkwave-protection-v1',60,0,true,[30,2.9000000000000035,null]],null,null,null,0,null],
    null,['inkwave-hit-authority-v1',1,0]]], l:{0:1} };

test('actual completed opening row advances native receiver after modeled delayed aim receipt; future/replay remain rejected', async () => {
  const f = await fixture({ productionComposition:true });
  const session = f.makeSession(), sent = [];
  session.ownerClockVersion = 1;
  session.tr.sendTo = (to,data) => { sent.push({to,data}); return true; };
  f.clock.set(100);
  const nm = f.makeNetMatch(session), a = f.makeActor({nid:0,owner:'p2',remote:true,roller:false});
  nm.bind({actors:[a],state:'playing',time:180});
  try {
    const query=sent.find(x=>x.to==='p2'&&x.data.k==='ocq').data;
    nm.onMessage('p2',{...query,k:'oca',ts:117.648});
    nm.onMessage('p2',{k:'t',ts:93.644,u:1400,oc:1,ocm:'fixture-match',a:[]});
    const peer=nm.peers.get('p2');
    // Model the already accepted aim state from the official start snapshot.
    // Do not pretend the fixture's flat floor reproduces Tidewater aim support.
    a.net._adoptionSeq=7;a.net._adoptionTick=1400;a.net._adoptionTickOwner='p2';a.netLife=1;
    a.s3={squidSpawn:{phase:'aim',ownerReplicated:true}};
    f.clock.set(150);
    assert.equal(validOwnerTickAdvance(completed.ts,93.644,150,100),false,'old guard permanently rejects this modeled queue delay');
    const future={...structuredClone(completed),ts:200,oc:1,ocm:'fixture-match'};
    nm.onMessage('p2',future);
    assert.equal(peer.lastTs,93.644);assert.equal(a.net._adoptionSeq,7);assert.equal(a.s3.squidSpawn.phase,'aim');
    const current={...structuredClone(completed),oc:1,ocm:'fixture-match'};
    nm.onMessage('p2',current);
    assert.equal(peer.lastTs,completed.ts);
    assert.equal(a.net._adoptionSeq,27);assert.equal(a.net._adoptionTick,1688);
    assert.equal(a.net.buf.at(-1).adoption.squidSpawn,null,'native decoder retains the actual terminal owner state');
    const before=JSON.stringify(a.net.buf);
    nm.onMessage('p2',current);
    assert.equal(JSON.stringify(a.net.buf),before,'replay cannot re-adopt completion');
    // Native playback, not test-side deletion, must retire the previous phase.
    peer.tr=completed.ts;peer.sim=completed.u;
    nm._sample(a,150,1/60);
    nm.applyRemote(a,1/60);
    assert.equal(a.s3.squidSpawn,undefined);
    assert.equal(a.net.cur.adoption.sequence,27);
  } finally {nm.dispose();}
});

test('real Session rejects previous gameplay COMPAT before building or sending readiness', async () => {
  const f=await fixture({productionComposition:true,includeSession:true});
  for(const previousCompat of ['iw-gameplay-20261022-owner-clock-v1','iw-gameplay-20261023-start-admission-v1','iw-gameplay-20261023-spawn-exclusion-v1']) {
  const session=new f.NetSession();let starts=0,sends=0;
  f.G.net=session;
  f.G.game={settings:{},startNetMatch(){starts++;}};
  session.myId='guest';session.hostId='host';session.state='lobby';
  session.tr={sendTo(){sends++;return true;},broadcast(){sends++;return true;},close(){}};
  await session._begin({id:'mixed-version',proto:f.PROTO,compat:previousCompat,
    mode:'turf',map:'reef',difficulty:'normal',roster:[
      {owner:'host',nid:0,bot:false,weapon:'shooter',team:0,slot:0},
      {owner:'guest',nid:1,bot:false,weapon:'shooter',team:1,slot:0},
    ]});
  assert.equal(starts,0);assert.equal(sends,0);assert.equal(session.match,null);
  assert.equal(session.state,'error');
  assert.equal(f.COMPAT,'iw-gameplay-20261024-spawn-start-admission-v1');
  }
});
