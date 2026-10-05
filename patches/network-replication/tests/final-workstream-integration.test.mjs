import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { stepGroundVelocity, rollingMovementSpeed } from '../../splatoon3/runtime/movement-physics.mjs';
import { SUB_SPECIAL_FIDELITY } from '../../splatoon3/runtime/sub-special-fidelity.mjs';

const close=(a,b,e=1e-3)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

test('combined critical gameplay constants stay pinned', () => {
  assert.equal(SUB_SPECIAL_FIDELITY.bomb.splashAroundCount,15);
  assert.equal(SUB_SPECIAL_FIDELITY.storm.dps,24);
  assert.equal(SUB_SPECIAL_FIDELITY.storm.duration,8);
});

test('Kid, Squid and Roller owner trajectories survive snapshot reconstruction at the same owner tick', async () => {
  const modes=['kid','squid','roller'];
  for(const mode of modes){
    const f=await fixture();
    const session=f.makeSession('me','me',[['me','Me'],['p2','P2']]);
    const nm=f.makeNetMatch(session);
    const remote=f.makeActor({nid:7,owner:'p2',remote:true,roller:mode==='roller'});
    f.bind(nm,[remote]);
    const source=f.makeActor({nid:7,owner:'p2',remote:false,roller:mode==='roller'});
    source.pos.set(0,2,0);source.vel.set(0,0,0);
    let lastTs=1000;
    for(let tick=1;tick<=120;tick++){
      let speed=f.profile.player.runSpeed;
      if(mode==='squid') speed=f.profile.player.swimSpeed;
      if(mode==='roller') speed=rollingMovementSpeed({a:{weapon:f.profile.weapons.roller},rollT:(tick-1)/60});
      const phase=tick<=30?[0,1]:tick<=60?[1,0]:tick<=90?[0,-1]:[0,0];
      stepGroundVelocity(source.vel,phase[0],phase[1],speed,f.profile.player.s3GroundAccel,1/60);
      source.pos.x+=source.vel.x/60;source.pos.z+=source.vel.z/60;
      if(tick%3===0){
        lastTs=1000+tick/60;f.clock.set(lastTs);
        nm.onMessage('p2',{k:'t',ts:lastTs,u:tick,a:[f.packActor(source)],l:{7:source.netLife??0}});
      }
    }
    const peer=nm.peers.get('p2');assert(peer,'remote peer missing');peer.tr=lastTs;peer.rate=1;peer.delay=.1;
    nm._sample(remote,lastTs,1/60);nm.applyRemote(remote,1/60);
    close(remote.pos.x,Math.round(source.pos.x*1000)/1000);
    close(remote.pos.z,Math.round(source.pos.z*1000)/1000);
    close(remote.vel.x,Math.round(source.vel.x*1000)/1000);
    close(remote.vel.z,Math.round(source.vel.z*1000)/1000);
  }
});
