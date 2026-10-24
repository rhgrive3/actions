import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnOwnerFixture,installDryFloor,prepareSpawn,launchSpawn,spawnOwnerRow,assertReady} from './respawn-spawn-owner-fixture.mjs';
let cached;
const fixture=()=>cached??=spawnOwnerFixture();
test('lost support over a lower dry floor never releases ready before native supported touchdown',async()=>{
  const f=await fixture();
  for(const dt of [1/30,1/60,1/120]){
    const a=await prepareSpawn(f);launchSpawn(f,a);installDryFloor(f,-8);
    let pending=0,retiredWhilePending=0;
    for(let i=0;i<300&&a.s3.squidSpawn;i++){
      f.tick(a,dt);const row=spawnOwnerRow(f,a);
      assert.equal(row.alive,true,'dry lower floor does not manufacture a water death');
      assert.equal(row.projectiles,0);assert.equal(row.turf,0);assert.equal(row.ink,100);
      if(row.spawn?.phase==='landing'){
        pending++;assert.equal(row.grounded,false);assert.equal(row.groundHit,false);
        if(row.pose?.phase==='off')retiredWhilePending++;
        assert.equal(row.eligible,false,JSON.stringify(row));
        assert.notDeepEqual(row.rotation,[-2.5,Math.fround(.04),1]);
      }
    }
    assert(pending>0);assert(retiredWhilePending>0,'native presentation expires before this delayed landing');
    assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.grounded,true);assert.equal(a.ground.hit,true);
    assert(Math.abs(a.pos.y+8)<1e-6);assert(a.character.tr[f.CHARACTER_TIMERS.T_SPAWN]<1.4);
    f.tick(a,dt);assertReady(f,a.character);
  }
});
test('native aim and flight keep ownership; a supported landing releases ready immediately',async()=>{
  const f=await fixture(),a=await prepareSpawn(f),c=a.character;
  for(let i=0;i<100;i++){f.tick(a);assert.equal(a.s3.squidSpawn.phase,'aim');assert.equal(f.spawnMotionAllowsAction(c,true),false);}
  launchSpawn(f,a);
  for(let i=0;i<90&&a.s3.squidSpawn;i++){
    f.tick(a);if(a.s3.squidSpawn)assert.equal(f.spawnMotionAllowsAction(c,true),false);
  }
  assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.grounded,true);
  f.tick(a);assert(c.tr[f.CHARACTER_TIMERS.T_SPAWN]<1.4);assertReady(f,c);
});
test('helper reads only its bound active local/remote lifecycle and respects reuse and reset',async()=>{
  const f=await fixture(),installed=Symbol.for('inkwave.s3.spawn-pose-motion.v1');
  for(const remote of [false,true]){
    const states=new WeakMap(),ch={[installed]:{states},_ownT:17,_owner(){throw Error('helper must not resolve/cache ownership');}};
    const owner={character:ch,remote,alive:true,s3:{}};ch.actor=owner;states.set(ch,{phase:'off'});
    for(const phase of ['aim','flight','landing']){
      owner.s3.squidSpawn={phase};owner.grounded=phase==='aim';
      const before=JSON.stringify(owner.s3);assert.equal(f.spawnMotionAllowsAction(ch,true),false,phase);
      assert.equal(JSON.stringify(owner.s3),before);assert.equal(ch._ownT,17);
      for(const key of ['s3SpawnPoseMotionEnabled','s3HitSpawnMotionEnabled']){ch[key]=false;assert.equal(f.spawnMotionAllowsAction(ch,true),false,'active lifecycle survives disabled overlay');delete ch[key];}
      states.delete(ch);assert.equal(f.spawnMotionAllowsAction(ch,true),false,'active lifecycle does not depend on overlay state');states.set(ch,{phase:'off'});
    }
    delete owner.s3.squidSpawn;assert.equal(f.spawnMotionAllowsAction(ch,false),true);
    owner.s3.squidSpawn={phase:'landing'};owner.character={};assert.equal(f.spawnMotionAllowsAction(ch,false),true,'stale unrelated owner ignored');
    ch.actor={character:ch,remote,alive:true,s3:{}};assert.equal(f.spawnMotionAllowsAction(ch,false),true,'reused character has no retired owner lock');
    states.delete(ch);assert.equal(f.spawnMotionAllowsAction(ch,false),false,'absent/reset presentation keeps caller fallback');
  }
});
test('detached ordinary air/hold and disabled presentation retain their existing fallback and pose gates',async()=>{
  const f=await fixture(),installed=Symbol.for('inkwave.s3.spawn-pose-motion.v1'),states=new WeakMap(),ch={[installed]:{states}};
  assert.equal(f.spawnMotionAllowsAction(ch,false),false);assert.equal(f.spawnMotionAllowsAction(ch,true),true);
  for(const absent of [null,undefined]){assert.equal(f.spawnMotionAllowsAction(absent,false),false);assert.equal(f.spawnMotionAllowsAction(absent,true),true);}
  for(const phase of ['hold','launch','flight','recovery']){states.set(ch,{phase});assert.equal(f.spawnMotionAllowsAction(ch,true),false);}
  states.set(ch,{phase:'off'});assert.equal(f.spawnMotionAllowsAction(ch,false),true);
  for(const key of ['s3SpawnPoseMotionEnabled','s3HitSpawnMotionEnabled']){
    ch[key]=false;assert.equal(f.spawnMotionAllowsAction(ch,false),false);assert.equal(f.spawnMotionAllowsAction(ch,true),true);delete ch[key];
  }
});
