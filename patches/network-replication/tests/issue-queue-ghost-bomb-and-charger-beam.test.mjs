import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import {
  validForwardedEventPayload, REMOTE_GHOST_BOMB_LIMITS, REMOTE_GHOST_STORM_RESERVE, allowGhostBombBirth,
} from '../snapshot-guard.mjs';

const fire = (changes = {}) => ({
  actor: { n: 17 }, weapon: 'charger', muzzle: [0, 2, 0],
  dir: [0, 0, 1], charge: .7, len: 20, ...changes,
});

test('queued Charger fix rejects toxic scalars at forwarded admission without breaking a real shot', () => {
  for (const charge of ['invalid', null, NaN, Infinity, -1, 1e200, 1.251, [], {}])
    assert.equal(validForwardedEventPayload('weapon:fire', fire({charge})), false,
      'bad charge accepted: ' + String(charge));
  for (const len of ['20', null, NaN, Infinity, -1, 0, 128.01, [], {}])
    assert.equal(validForwardedEventPayload('weapon:fire', fire({len})), false,
      'bad length accepted: ' + String(len));
  for (const charge of [0, .01, .7, 1, 1.25])
    assert.equal(validForwardedEventPayload('weapon:fire', fire({charge})), true);
  assert.equal(validForwardedEventPayload('weapon:fire', fire({len:128})), true);
  assert.equal(validForwardedEventPayload('weapon:fire', fire({dir:[0,Infinity,1]})), false);
  assert.equal(validForwardedEventPayload('weapon:fire', fire({muzzle:null})), false);
  // Legacy non-Charger weapon:fire events have no charge or range scalar.
  assert.equal(validForwardedEventPayload('weapon:fire', {actor:{n:17},dir:[0,0,1]}), true);
});

test('queued Charger fix blocks a poison before the playback clock, retires beams, and continues with valid shots', async () => {
  const f = await fixture();
  const net = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const a = f.makeActor({nid:17, owner:'p2', remote:true, roller:false});
  a.weapon = f.WEAPONS.charger;
  f.bind(net, [a]);
  const peer = net._peer('p2');
  try {
    f.clock.set(1000);
    net.onMessage('p2', {k:'t',ts:1000,u:100,r:2,e:[
      [1000,'ev','weapon:fire',fire({charge:'invalid'}),100,1],
    ]});
    assert.equal(peer.events.length, 0, 'bad event never reserves FIFO space');
    assert.equal(peer._lastEventSeq ?? 0, 0, 'bad event never poisons replay identity');
    assert.equal(f.projectiles.beams.length, 0);

    f.clock.advance(.05);
    net.onMessage('p2', {k:'t',ts:1000.05,u:103,r:2,e:[
      [1000.05,'ev','weapon:fire',fire(),103,2],
    ]});
    peer.tr=1000.05; peer.sim=103;
    net._playEvents();
    assert.equal(peer._lastEventSeq, 2);
    assert.equal(f.projectiles.beams.length, 1, 'valid network Charger shot still displays');
    const shot=f.projectiles.beams[0];
    assert.ok(Number.isFinite(shot.life) && Number.isFinite(shot.th));
    // Remote beams age on the sender's confirmed simulation timeline, not on
    // an arbitrary amount of local rendering time while that sender is stalled.
    f.projectiles._updateBeams(1);
    assert.equal(f.projectiles.beams.length, 1, 'stalled remote beam stays on owner time');
    peer.sim += Math.ceil(shot.life / (1 / 60)) + 2;
    peer.tr += 1;
    f.clock.advance(1);
    f.projectiles._updateBeams(1 / 60);
    assert.equal(f.projectiles.beams.length, 0, 'valid shot expires after owner time advances');
    assert.ok(f.projectiles.beamPool.length > 0);

    const m=new f.THREE.Vector3(0,2,0), d=new f.THREE.Vector3(0,0,1);
    const sceneCount=f.projectiles.scene.children.length;
    f.projectiles._ghostBeam(a,m,d,20,'invalid',false);
    f.projectiles._ghostBeam(a,m,d,Infinity,.8,false);
    f.projectiles._ghostBeam(a,m,new f.THREE.Vector3(),20,.8,false);
    assert.equal(f.projectiles.beams.length, 0, 'defense rejects all direct toxic calls');
    assert.equal(f.projectiles.scene.children.length,sceneCount, 'rejected calls allocate no meshes');

    f.projectiles._ghostBeam(a,m,d,20,.8,false);
    f.projectiles.beams[0].life=NaN; // legacy/mutated record
    f.projectiles._updateBeams(.016);
    assert.equal(f.projectiles.beams.length,0, 'pre-existing NaN life is culled');
    assert.ok(f.projectiles.beamPool.every(mesh=>!mesh.visible));
  } finally { net.dispose(); }
});

test('remote bomb floods bound live scene allocation and pending native attacks separately', async () => {
  const f=await fixture();
  const net=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['p2','P2'],['p3','P3']]));
  const a=f.makeActor({nid:17,owner:'p2',remote:true,team:0,roller:false});
  const b=f.makeActor({nid:18,owner:'p3',remote:true,team:1,roller:false});
  f.bind(net,[a,b]);
  const sceneBefore=f.projectiles.scene.children.length;
  try {
    for (let batch=0;batch<10;batch++) {
      const ts=1000+batch*.05, tick=100+batch*3;
      f.clock.set(ts);
      const e=Array.from({length:256},(_,index)=>
        [ts,'b',17,'bomb',0,2,0,0,0,0,tick,batch*256+index+1]);
      net.onMessage('p2',{k:'t',ts,u:tick,r:2,e});
      const peer=net._peer('p2');
      peer.tr=ts; peer.sim=tick;
      net._playEvents();
      assert.equal(peer.events.length,Math.min(512,(batch+1)*256-22), 'pending attacks stay in the existing bounded FIFO');
      assert.ok(f.projectiles.bombs.filter(item=>item.ghost && item.owner===a).length
        <= REMOTE_GHOST_BOMB_LIMITS.actor, 'no over-budget replay');
    }
    const ghosts=f.projectiles.bombs.filter(item=>item.ghost);
    assert.equal(ghosts.length,REMOTE_GHOST_BOMB_LIMITS.actor-REMOTE_GHOST_STORM_RESERVE);
    assert.equal(f.projectiles.scene.children.length-sceneBefore,ghosts.length,
      'no excess remote Group/Mesh allocations');
    assert.equal(net._peer('p2')._lastEventSeq,22, 'unallocated gameplay attacks do not consume identity');

    // An independent owner still has fair space despite the flooded actor.
    const event=[1000.6,'b',18,'bomb',1,2,0,0,0,0,136,1];
    event._netTick=136; event._netSeq=1;
    net._peer('p3');
    net._play('p3',event);
    assert.equal(f.projectiles.bombs.filter(item=>item.ghost && item.owner===b).length,1);

    // Retirement and projectiles.clear release all active capacity immediately,
    // without counters surviving across a new match/owner handoff.
    f.projectiles.clear();
    assert.equal(f.projectiles.bombs.length,0);
    assert.equal(allowGhostBombBirth(f.projectiles.bombs,a,'p2'),true);
    net._playEvents();
    assert.equal(f.projectiles.bombs.filter(item=>item.ghost && item.owner===a).length,22,
      'capacity released by clear replays the waiting native attacks');
    assert.equal(net._peer('p2')._lastEventSeq,44);
    assert.equal(net._peer('p2').events.length,490);
  } finally { net.dispose(); }
});

test('remote bomb budgets count ghost-only records, reserve peer fairness, and free after removal', () => {
  const p2a={owner:'p2'}, p2b={owner:'p2'}, p3={owner:'p3'};
  const ghosts=[];
  for(let i=0;i<REMOTE_GHOST_BOMB_LIMITS.actor-REMOTE_GHOST_STORM_RESERVE;i++) ghosts.push({ghost:true,owner:p2a});
  assert.equal(allowGhostBombBirth(ghosts,p2a,'p2'),false);
  assert.equal(allowGhostBombBirth(ghosts,p2b,'p2'),true);
  ghosts.pop();
  assert.equal(allowGhostBombBirth(ghosts,p2a,'p2'),true);
  while(ghosts.filter(x=>x.owner?.owner==='p2').length<REMOTE_GHOST_BOMB_LIMITS.peer)
    ghosts.push({ghost:true,owner:p2b});
  assert.equal(allowGhostBombBirth(ghosts,p2a,'p2'),false);
  assert.equal(allowGhostBombBirth(ghosts,p3,'p3'),true);
  while(ghosts.length<REMOTE_GHOST_BOMB_LIMITS.total) ghosts.push({ghost:true,owner:p3});
  assert.equal(allowGhostBombBirth(ghosts,{owner:'p4'},'p4'),false);
  ghosts.pop();
  assert.equal(allowGhostBombBirth(ghosts,{owner:'p4'},'p4'),true);
  ghosts.push({ghost:false,owner:p2a});
  assert.equal(allowGhostBombBirth(ghosts,{owner:'p4'},'p4'),true,
    'local gameplay bomb does not consume remote-only resource allowance');
});
