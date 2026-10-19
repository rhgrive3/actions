import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { installRankedNetwork } from '../runtime/ranked/network.mjs';

const stage = {
  id: 'barrier-admission-stage',
  zones: [{ center: [0,0,0], size: [6,6] }],
  tower: { path: [[0,0,-10],[0,0,0],[0,0,10]], centerIndex: 1, checkpoints: [[],[]], speed: 1.2, halfSize: 1.4 },
  rainmaker: { center: [0,0,0], goals: [[0,0,10],[0,0,-10]], checkpoints: [[[0,0,5]],[[0,0,-5]]], retreatZ: [-8,8] },
  clams: { spawns: [[0,0,0]], goals: [[0,0,10],[0,0,-10]] },
};
function fixture(position = {x:0,y:0,z:-8}) {
  const outgoing=[];
  const actor = { nid:'G', owner:'guest', team:0, alive:true, pos:position, weapon:{
    id:'shooter', kind:'shooter', damage:36, range:19, fireInterval:0.1, sub:'bomb',
  }};
  class NetMatch {
    constructor() {
      this.cfg={id:'queue-room'};
      this.myId='host';
      this.s={isHost:true,hostId:'host',tr:{broadcast:d=>outgoing.push(d),sendTo(){}}};
      this.match={state:'playing',mode:'rainmaker',actors:[actor],ranked:new RankedEngine('rainmaker',stage),
        rankedBarrierHits:[],rankedGains:[0,0]};
    }
    get isHost() {return this.s.isHost;}
    _sendNow(d){outgoing.push(d);}
    _sendTick(){}
    onMessage(from,d){this.native={from,d};}
    _hostClock(){}
    onLeave(){}
    dispose(){}
  }
  const G={time:10,netm:null};
  installRankedNetwork({G,NetMatch,emit(){}});
  const nm=G.netm=new NetMatch();
  return {nm,G,actor,outgoing,barrier:nm.match.ranked.rule.state.barrier,hits:nm.match.rankedBarrierHits};
}
function proposal(seq=1, damage=36,kind='spoofed-chargerfull') {
  return {k:'rkhit',match:'queue-room',id:'G',seq,damage,kind,pos:[0,0,-1.5]};
}
function shooterBirth(at=9.95, dir=[0,0,25]) {
  return [at,'p','G','shot','shooter',0,1,-8,...dir,0,1.1,0.06,.16,.1,0,0,0,1];
}
const tick = (...events)=>({k:'t',e:events});
test('a remote rkhit without any verified shot cannot damage a Rainmaker barrier',()=>{
  const f=fixture();
  f.nm.onMessage('guest',proposal(1));
  assert.equal(f.hits.length,0);
  assert.equal(f.barrier.health,1000);
  assert.equal(f.nm.rankedHitSeq?.get('guest')||0,0);
  f.nm.onMessage('guest',proposal(1)); // duplicate pending claim
  assert.equal(f.nm.rankedBarrierPending?.get('guest')?.length,1);
  f.G.time+=1; // expire an unmatched proposal
  f.nm.onMessage('guest',tick());
  assert.equal(f.hits.length,0);
  assert.equal(f.nm.rankedBarrierPending?.size||0,0);
});
test('an actor ~141m away cannot pop the shield even with a forged impact and 2000 damage',()=>{
  const f=fixture({x:100,y:0,z:100});
  f.nm.onMessage('guest',{...proposal(1,2000),pos:[0,0,0]});
  assert.equal(f.hits.length,0);
  f.nm.onMessage('guest',tick([9.95,'p','G','shot','shooter',100,1,100,0,0,-30]));
  assert.equal(f.hits.length,0);
  assert.equal(f.barrier.health,1000);
});
test('corroborated near-shield shooter birth admits one hit with host-derived kind and honest damage',()=>{
  const f=fixture();
  f.nm.onMessage('guest',proposal(1));
  assert.equal(f.hits.length,0,'an immediate rkhit must wait for a 20Hz owner birth');
  f.nm.onMessage('guest',tick(shooterBirth()));
  assert.deepEqual(f.hits,[{id:'G',team:0,damage:36,kind:'shooter'}]);
  f.nm.onMessage('guest',proposal(1));
  f.nm.onMessage('guest',proposal(2));
  f.nm.onMessage('guest',tick(shooterBirth()));
  assert.equal(f.hits.length,1,'a replayed shot can never authenticate a second hit');
  f.nm.match.ranked.rule._applyBarrierHits(f.hits);
  assert.equal(f.barrier.health,964);
  assert.equal(f.barrier.active,true);
});
test('an inflated claim, wrong-owner event, wrong equipped weapon and backwards shot all fail admission',()=>{
  const f=fixture();
  f.nm.onMessage('guest',proposal(1,2000)); // invalid even with apparently valid shot
  f.nm.onMessage('guest',proposal(2,120));  // still below protocol ceiling, but > trusted shooter damage
  f.nm.onMessage('guest',tick(shooterBirth()));
  assert.equal(f.hits.length,0);
  f.nm.onMessage('guest',proposal(3,36));
  f.nm.onMessage('intruder',tick(shooterBirth(9.96)));
  f.nm.onMessage('guest',tick([9.97,'p','G','shot','charger',0,1,-8,0,0,25]));
  f.nm.onMessage('guest',tick(shooterBirth(9.98,[0,0,-25])));
  assert.equal(f.hits.length,1, 'only an actual accepted owner birth can release a matching honest hit');
  assert.equal(f.hits[0].damage,36);
  assert.equal(f.hits[0].kind,'shooter');
});
test('valid near-shield bomb uses trusted equipped sub and no forged impact type',()=>{
  const f=fixture();
  f.nm.onMessage('guest',{...proposal(1,180,'Gachihoko_BombCore'),pos:[0,0,-1]});
  f.nm.onMessage('guest',tick([9.95,'b','G','bomb',0,1,-5,0,3,5]));
  assert.equal(f.hits.length,1);
  assert.equal(f.hits[0].kind,'bomb');
  assert.equal(f.hits[0].damage,180);
  f.nm.onMessage('guest',proposal(2,180,'bomb'));
  assert.equal(f.hits.length,1);
});
test('a host handoff invalidates outstanding shot evidence and pending hit proposals',()=>{
  const f=fixture();
  f.nm.onMessage('guest',tick(shooterBirth()));
  assert.equal(f.nm.rankedBarrierProofs?.get('guest')?.length,1);
  f.nm.onLeave('other',true);
  assert.equal(f.nm.rankedBarrierProofs?.size||0,0);
  assert.equal(f.nm.rankedBarrierPending?.size||0,0);
  f.nm.onMessage('guest',proposal(1));
  assert.equal(f.hits.length,0,'prior shot must not authorize an after-migration hit');
});
