import test from 'node:test';
import assert from 'node:assert/strict';
import {absorbSpawnDamage, spawnProtectionRemaining, advanceSpawnProtection} from '../runtime/respawn-lifecycle.mjs';

const tuning={maxAbsorb:100,breakDelay:20/60};
const owner=()=>({alive:true,invuln:0,hp:100,s3:{spawnArmorManaged:true,spawnArmor:{hp:30,remaining:1,breakRemaining:null}}});
const attacker=()=>({team:1});

test('#999 90 then 60 grouped Roller damage penetrates for 50 regardless of order',()=>{
  for(const order of [[90,60],[150]]) {
    const victim=owner(), enemy=attacker();victim.s3PendingHitGroup=1234;
    let hpLoss=0;
    for(const damage of order) {
      const passed=absorbSpawnDamage(victim,damage,'roller',tuning,enemy);
      hpLoss+=passed;victim.hp-=passed;
    }
    assert.equal(hpLoss,50,'logical 150 HP swing penetrates one 100-HP threshold');
    assert.equal(victim.hp,50);
    assert.equal(victim.s3.spawnArmor.hp,0);
    assert.equal(victim.s3.spawnArmor.breakRemaining,20/60);
  }
});

test('#999 sub-100 grouped damage remains absorbed, separate hits retain 20F break shield',()=>{
  const victim=owner(),enemy=attacker();
  victim.s3PendingHitGroup=1;
  assert.equal(absorbSpawnDamage(victim,90,'roller',tuning,enemy),0);
  victim.s3PendingHitGroup=2;
  assert.equal(absorbSpawnDamage(victim,60,'roller',tuning,enemy),0,'separate hit is protected during break');
  assert.ok(spawnProtectionRemaining(victim)>0);
  advanceSpawnProtection(victim,20/60);
  assert.equal(victim.s3.spawnArmor,null);
  assert.equal(absorbSpawnDamage(victim,150,'roller',tuning,enemy),150,'after expiry no shield remains');
});

test('#999 group accounting never crosses attacker or new respawn activation',()=>{
  const victim=owner(),first=attacker(),second=attacker();victim.s3PendingHitGroup=1;
  assert.equal(absorbSpawnDamage(victim,90,'roller',tuning,first),0);
  assert.equal(absorbSpawnDamage(victim,60,'roller',tuning,second),0,'other source attack remains protected');
  victim.s3.spawnArmor={hp:30,remaining:1,breakRemaining:null};
  assert.equal(absorbSpawnDamage(victim,90,'roller',tuning,first),0,'fresh spawn reset group ledger');
  assert.equal(absorbSpawnDamage(victim,60,'roller',tuning,first),50);
});

test('#999 one 160 hit and enemy-ink bypass preserve native armor behavior',()=>{
  const victim=owner(),enemy=attacker();
  assert.equal(absorbSpawnDamage(victim,160,'roller',tuning,enemy),60);
  const second=owner();
  assert.equal(absorbSpawnDamage(second,5,'ink',tuning,enemy),5);
  assert.equal(second.s3.spawnArmor.hp,30);
});

test('#999 owner handoff retires same-numbered Roller swing before new owner penetration', () => {
  const victim = owner(), a = { team: 1, owner: 'player-a' };
  victim.s3PendingHitGroup = 7;
  assert.equal(absorbSpawnDamage(victim, 90, 'roller', tuning, a), 0);
  assert.equal(victim.s3.spawnArmor.hp, 0);
  // The same live Actor instance receives a new network owner, which may
  // restart its local damage-group counter from the same integer.
  a.owner = 'player-b';
  assert.equal(absorbSpawnDamage(victim, 90, 'roller', tuning, a), 0,
    'new owner must not receive prior owner\'s already consumed budget');
  assert.equal(absorbSpawnDamage(victim, 60, 'roller', tuning, a), 50,
    'one 150-damage logical swing still penetrates exactly 50');
  // Returning control to the prior owner is a third generation, not a
  // resurrection of its first owner-era group #7.
  a.owner = 'player-a';
  assert.equal(absorbSpawnDamage(victim, 150, 'roller', tuning, a), 50,
    'return handoff cannot resurrect retired first-era group #7');
});
