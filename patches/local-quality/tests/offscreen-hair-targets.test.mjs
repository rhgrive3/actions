import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptOffscreenHairTargets} from '../offscreen-hair-target-adapter.mjs';
import {replaceOnce,qualityIdentity} from '../adapter.mjs';

test('#845 deferred hair has exact full-rate inputs before state transitions and first visible accessories', async () => {
  const f=await sourceLoadedActorFixture({random:()=>.4});
  const counts=[];
  let unreadHiddenFrames=0,unreadVisibleFrames=0,detachedInputChecks=0;
  for(const hz of [30,60,120]){
    const actors=[await f.make(),await f.make()],motion=actors.map(a=>a.character.sourceMotion);
    const adds=[0,0];
    for(let side=0;side<2;side++){
      const h=motion[side].hairTargets,add=h.add;
      h.add=function(...args){adds[side]++;return add.apply(this,args);};
    }
    const body=m=>JSON.stringify({time:m.time,phase:m.phase,distance:m.distance,state:m.state,
      contact:Array.from(m.contact),clips:m.currentClips,pose:m.pose.p.map(p=>p.toArray()),
      rotations:m.pose.q.map(q=>q.toArray()),world:m.pose.wp.map(p=>p.toArray())});
    const hair=h=>JSON.stringify({total:h.total,q:h.indices.map(i=>h.q[i].toArray())});
    const states=new Set();
    for(let frame=0;frame<2*hz;frame++){
      const phase=Math.floor(frame/(hz/4));
      const state={form:'kid',grounded:phase!==4&&phase!==5,firing:phase===3,localMove:{x:0,z:1}};
      for(let side=0;side<2;side++){
        const c=actors[side].character;
        c._oobBudget=side===0;c.root.position.z=phase===1||phase===2?frame*.02:.25;
        if(phase===4)c.root.position.y=(frame-hz)*.01;else c.root.position.y=0;
        motion[side].advance(1/hz,state);
      }
      for(let side=0;side<2;side++){
        const frame=motion[side]._iwMotionClipFrame?.();
        if(frame){
          assert.equal(frame.ready,false,'hair tracking does not materialize unread public motion descriptors');
          if(side===0)unreadHiddenFrames++;else unreadVisibleFrames++;
        }
      }
      states.add(motion[0].state);
      assert.equal(body(motion[0]),body(motion[1]),`${hz}Hz frame ${frame}: body and clocks`);
      assert.equal(hair(motion[0].previousHairTargets),hair(motion[1].previousHairTargets),`${hz}Hz frame ${frame}: previous state`);
      // Recover before rendering midway through every phase, then defer again.
      if(frame%Math.max(1,Math.floor(hz/4))===Math.floor(hz/8)){
        const before=body(motion[0]);
        // Deferred inputs must survive reuse or mutation of diagnostic rows.
        // The full-rate hair path already consumed these semantic scalars.
        const current=motion[0].currentClips[0],savedFrame=current.frame;
        assert.notEqual(motion[0]._iwHairClips[0],current,'hair owns its saved scalar row');
        current.frame+=13;
        motion[0]._ensureHairTargets();
        current.frame=savedFrame;detachedInputChecks++;
        assert.equal(hair(motion[0].hairTargets),hair(motion[1].hairTargets),`${hz}Hz frame ${frame}: first-draw targets`);
        assert.equal(body(motion[0]),before,'recovery never advances body, clip phase or clocks');
        assert.ok(motion[0]._iwHairClips.slice(0,motion[0]._iwHairClipCount).every(row=>row.name===null),'completed reconstruction releases clip names');
        const n=adds[0];motion[0]._ensureHairTargets();assert.equal(adds[0],n,'recovery is idempotent');
      }
    }
    assert.ok(states.has('idle')&&states.has('move')&&states.has('air')&&states.has('land'));
    assert.ok(adds[0]<adds[1]/2,'stable hidden frames avoid evaluating hair targets');
    const n=adds[0];
    motion[0].manual={name:motion[0].currentClips[0].name,frame:0,loop:true};
    motion[0].sampleManual();motion[0]._ensureHairTargets();
    assert.equal(adds[0],n,'manual presentation drops deferred automatic clips');
    assert.equal(motion[0]._iwHairClips.length,0,'manual presentation releases saved rows');
    motion[0].manual=null;motion[0].clearBankCaches();motion[0]._ensureHairTargets();
    assert.equal(adds[0],n,'bank cleanup drops pending references');
    assert.equal(motion[0]._iwHairClips.length,0,'bank cleanup releases saved rows');
    counts.push({hz,deferredAdds:adds[0],fullRateAdds:adds[1]});
    f.reset();
  }
  console.log(JSON.stringify({scope:'exact source hair inputs/body clocks; no device FPS claim',counts,unreadHiddenFrames,unreadVisibleFrames,detachedInputChecks}));
});

test('#845 adapter is identity-sealed, strict and remains after prior source-motion adapters',()=>{
  const rel='src/game/motion/source-controller.js';
  const raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
  const code=adaptBuildSource(rel,raw);
  assert.ok(code.includes('_ensureHairTargets(){'));
  assert.ok(qualityIdentity()['offscreen-hair-target-adapter.mjs']);
  assert.throws(()=>adaptOffscreenHairTargets(rel,code,replaceOnce),/expected exactly one connection/);
  assert.equal(adaptOffscreenHairTargets('src/game/actor.js','unrelated',replaceOnce),'unrelated');
});
