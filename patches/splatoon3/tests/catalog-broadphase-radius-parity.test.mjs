import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { capsuleEntry } from '../runtime/weapons-collision.mjs';
import { hurtboxRadius, hurtboxHeight } from '../runtime/player-hurtbox.mjs';

const PLAYER = {
  radius: 0.38,
  s3HumanoidHurtRadius: 0.35,
  s3SwimHurtRadius: 0.675,
  s3HumanoidHurtHeight: 1.65,
  s3SwimHurtSegmentHeight: 0,
  height: 1.45,
};
const src = fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs', import.meta.url), 'utf8');
const culls = (from, to, actor, r0, r1, reach) => {
  const pr = Math.max(r0,r1);
  return actor.pos.x < Math.min(from.x,to.x)-pr-reach ||
    actor.pos.x > Math.max(from.x,to.x)+pr+reach ||
    actor.pos.z < Math.min(from.z,to.z)-pr-reach ||
    actor.pos.z > Math.max(from.z,to.z)+pr+reach;
};
const entry = (from,to,a,r0,r1) => capsuleEntry(
  from,to,a.pos,hurtboxRadius(a,PLAYER),hurtboxHeight(a,PLAYER),r0,r1);

test('CMB-02 catalog broadphase uses exact body hurtbox (not terrain radius)',()=>{
  assert.match(src, /const reach=hurtboxRadius\(a,PLAYER\)\+1e-4;/);
  assert.doesNotMatch(src, /const reach=\(Number\.isFinite\(PLAYER\?\.radius\)/);
});

test('squid graze narrowphase hit must not be excluded by outer AABB',()=>{
  const from={x:0,y:0.675,z:0},to={x:1,y:0.675,z:0};
  const a={form:'squid',pos:{x:0.5,y:0,z:0.85}};
  const pr=0.2;
  assert.notEqual(entry(from,to,a,pr,pr),null,'actual swept capsule collides');
  assert.equal(culls(from,to,a,pr,pr,PLAYER.radius+0.25),true,
    'old terrain-radius AABB incorrectly skips the collision');
  assert.equal(culls(from,to,a,pr,pr,hurtboxRadius(a,PLAYER)+1e-4),false,
    'new broadphase must retain valid hit');
});

test('conservative AABB cannot reject swept-capsule hits in deterministic randomized cases',()=>{
  let seed=0x51a7d03d;
  const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  let realHits=0;
  for(let i=0;i<20000;i++){
    const form=i%2?'squid':'kid';
    const a={form,pos:{x:(rnd()-0.5)*5,y:(rnd()-0.5),z:(rnd()-0.5)*3}};
    const from={x:(rnd()-0.5)*3,y:rnd()*2,z:(rnd()-0.5)*3};
    const to={x:from.x+(rnd()-0.5)*4,y:from.y+(rnd()-0.5),z:from.z+(rnd()-0.5)*4};
    const r0=0.01+rnd()*0.5,r1=0.01+rnd()*0.5;
    const t=entry(from,to,a,r0,r1);
    if(t!==null){
      realHits++;
      assert.equal(culls(from,to,a,r0,r1,hurtboxRadius(a,PLAYER)+1e-4),false,
        'new broadphase must not reject a real hit at sample '+i);
    }
  }
  assert.ok(realHits>100,'random trial should exercise actual contacts');
});
