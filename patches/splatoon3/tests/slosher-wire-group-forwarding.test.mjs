import test from 'node:test';
import assert from 'node:assert/strict';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';

test('negative legacy four-argument forwarding loses the Slosher wire budget identity', async () => {
  const sender=await combatWorld('A',{network:true});
  const receiver=await combatWorld('B',{network:true});
  try {
    const {G,attacker,victim}=sender;
    const hit=G.projectiles.applyHit;
    G.projectiles.applyHit=function(a,v,d,w){return hit.call(this,a,v,d,w);};
    const p={owner:attacker,s3Weapon:{kind:'slosher'},damage:70,
      s3DamageGroup:new Map(),s3DamageGroupId:'lost:volley',wid:'slosher'};
    receiver.victim.invuln=0; receiver.victim.hp=100; receiver.victim.alive=true;
    for(let i=0;i<2;i++){
      sender.applyProjectileHit(G.projectiles,p,victim,70,victim.pos);
      const packet=sender.wire.at(-1).data;
      assert.equal(packet.k,'hit'); assert.equal(packet.g,undefined);
      receiver.net.onMessage('A',packet);
    }
    assert.equal(receiver.G.projectiles._s3SlosherOwnerGroups,undefined,
      'the receiving owner cannot maintain the per-volley maximum without its identity');
  } finally {sender.dispose();receiver.dispose();}
});
