import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptMotionFkHotpath } from '../motion-fk-hotpath-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { sourceLoadedActorFixture } from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
// Restore the original operations in an otherwise fully production-composed
// realm. Both sides load the real lossless packs and all other current patches.
export function baselineMotionSource(rel, raw) {
  let code = adaptBuildSource(rel, raw);
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code, '   // World transforms are evaluated after the remaining local blends.\n   if(stepAmplitude<1){', '   this.pose.fk();\n   if(stepAmplitude<1){', 'baseline pre-blend FK');
    code = replaceOnce(code, '    this.pose.mix(this.restGait,1-stepAmplitude);', '    this.pose.mix(this.restGait,1-stepAmplitude).fk();', 'baseline short-step FK');
    code = replaceOnce(code, '  // The pre-balance FK is still current unless transition changed local TRS.\n  if(transition<1)this.pose.fk();', '  this.pose.fk();', 'baseline final FK');
  }
  if (rel === 'src/game/motion/source-bank.js') code = replaceOnce(code,
    '        e[0] *= x; e[4] *= x; e[8] *= x;\n        e[1] *= y; e[5] *= y; e[9] *= y;\n        e[2] *= z; e[6] *= z; e[10] *= z;',
    '        for (const k of [0, 4, 8]) e[k] *= x;\n        for (const k of [1, 5, 9]) e[k] *= y;\n        for (const k of [2, 6, 10]) e[k] *= z;', 'baseline scale compensation');
  return code;
}

test('motion optimization is guarded, composed and excluded from browser payloads', () => {
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/motion-fk-hotpath-adapter.mjs'));
  for (const rel of ['src/game/motion/source-controller.js', 'src/game/motion/source-bank.js']) {
    const raw = read(rel), next = adaptMotionFkHotpath(rel, raw, replaceOnce);
    assert.notEqual(next, raw);
    assert.doesNotThrow(() => new vm.SourceTextModule(adaptBuildSource(rel, raw)));
    assert.throws(() => adaptMotionFkHotpath(rel, next, replaceOnce), /conflict/);
    assert.throws(() => adaptMotionFkHotpath(rel, '', replaceOnce), /conflict/);
  }
  assert.equal(adaptMotionFkHotpath('src/game/actor.js', 'unchanged', replaceOnce), 'unchanged');
});

const vector = v => v.toArray();
function poseSnapshot(p) {
  return p && {p:p.p.map(vector), q:p.q.map(vector), s:p.s.map(vector),
    world:p.world.map(m=>Array.from(m.elements)), wp:p.wp.map(vector), wq:p.wq.map(vector), flags:Array.from(p.flags)};
}
export function motionSnapshot(ch) {
  const c=ch.sourceMotion;
  return JSON.parse(JSON.stringify({pose:poseSnapshot(c.pose),body:poseSnapshot(c.bodyPose),
    nodes:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),
    skeleton:Array.from(ch.skeleton.boneMatrices),
    gait:c.gaitTargets.indices.map(i=>[...c.gaitTargets.wp[i].toArray(),...c.gaitTargets.wq[i].toArray()]),
    contact:c.contact,lift:c.lift,debug:c.debug,
    contacts:c.retarget.contacts.map(f=>({locked:f.locked,anchor:vector(f.anchor),actual:vector(f.actual),slip:f.slip,clearance:f.lastClearance})),
    muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray()}, (_key,value)=>{
      if(typeof value==='number')assert.ok(Number.isFinite(value),'finite motion snapshot');return value;
    }));
}

test('real source motion preserves every frame at 30/60/120 Hz and irregular/paused ticks', async () => {
  const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baselineMotionSource,random:()=>.4}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]);
  const totals=[0,0], states=new Set(),clips=new Set();let compared=0;
  for (const variant of ['Player00','Player01']) for (const hz of [30,60,120]) {
    const actors=await Promise.all(apis.map(api=>api.make()));
    const chars=actors.map(a=>a.character);
    for(const ch of chars){if(variant==='Player01')await ch.sourceMotion.setVariant(variant);ch.onEvent=null;}
    if(hz===30){
      const banks=chars.map(ch=>ch.sourceMotion.bank),squid=chars.map(ch=>ch.sourceMotion.squidBank);
      for(const pair of [banks,...(variant==='Player00'?[squid]:[])]){
        const poses=pair.map((b,k)=>new chars[k].sourceMotion.pose.constructor(b));
        for(const clip of pair[0].clips.values())for(const frame of [-2.5,clip.frames/2+.125,clip.frames]){
          pair.forEach((b,k)=>b.sample(clip.name,frame,poses[k],false));
          assert.equal(JSON.stringify(poseSnapshot(poses[1])),JSON.stringify(poseSnapshot(poses[0])),variant+' '+clip.name+' '+frame);
        }
        // Exercise compensation's zero/tiny/negative parent scales explicitly.
        for(const scale of [0,1e-13,-1e-13,-2,3]){
          poses.forEach(p=>{p.flags.fill(1<<23);p.s.forEach(s=>s.set(scale,-scale,scale));p.fk();});
          assert.equal(JSON.stringify(poseSnapshot(poses[1])),JSON.stringify(poseSnapshot(poses[0])),'compensated scale '+scale);
        }
      }
    }
    const counts=[0,0],restores=chars.map((ch,k)=>{const proto=ch.sourceMotion.pose.constructor.prototype,original=proto.fk;proto.fk=function(){counts[k]++;return original.call(this);};return()=>{proto.fk=original;};});
    try {
      // Motion speed/direction, short strides, overlays, pivots, airborne/land,
      // squid transitions, native weapon ownership, manual seeking and reset.
      const phases=[['shooter',0,0,1,false],['shooter',.35,0,1,false],['shooter',5.76,0,1,true],
        ['charger',2.4,1,0,true],['slosher',2.4,0,-1,true],['splatling',1.2,-1,0,true],
        ['dualies',3,0,1,true],['roller',2,0,1,false],['shooter',0,0,1,false]];
      for(let phase=0;phase<phases.length;phase++)for(let frame=0;frame<Math.ceil(hz*.3);frame++){
        const [weapon,speed,x,z,firing]=phases[phase],dt=frame===3?0:frame===5?.1:frame===7?1/144:1/hz;
        for(let k=0;k<2;k++){
          const ch=chars[k],api=apis[k];if(frame===0)ch.setWeapon(weapon);
          ch.root.position.x+=x*speed*dt;ch.root.position.z+=z*speed*dt;
          if(phase===3)ch.root.rotation.y+=dt*.8;
          const air=phase===6&&frame<Math.ceil(hz*.15),form=phase===7?'squid':'kid';
          if(frame===0&&phase===6)ch.trigger('jump');if(phase===6&&frame===Math.ceil(hz*.15))ch.trigger('land');
          if(firing&&frame%6===0)ch.trigger(weapon==='slosher'?'slosh':'shoot');
          const state={form,grounded:!air,speed,localMove:{x,z},firing,charge:firing?.7:0,ink:1,hp:1,vy:air?2:0,aimPitch:.12};
          api.G.time+=dt;ch.update(dt,state);ch.root.updateMatrixWorld(true);ch.skeleton.update();
        }
        assert.deepEqual(motionSnapshot(chars[1]),motionSnapshot(chars[0]),`${variant} ${hz}Hz phase ${phase} frame ${frame}`);
        states.add(chars[1].sourceMotion.state);for(const c of chars[1].sourceMotion.currentClips)clips.add(c.name);compared++;
      }
      for(const frame of [0,12.25,5,-1,1000]){
        for(const ch of chars){ch.sourceMotion.playClip('WalkHold_Nrml',{frame});ch.update(0,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},ink:1,hp:1});ch.root.updateMatrixWorld(true);ch.skeleton.update();}
        assert.deepEqual(motionSnapshot(chars[1]),motionSnapshot(chars[0]),'manual seek '+frame);compared++;
      }
    } finally { restores.forEach(f=>f());apis.forEach(api=>api.reset()); }
    totals.forEach((_,i)=>totals[i]+=counts[i]);
  }
  assert.ok(states.has('move')&&states.has('idle')&&states.has('air'),JSON.stringify([...states]));
  assert.ok(clips.size>=8, 'real clip coverage');assert.ok(totals[1]<totals[0]*.95,'fewer complete FK evaluations');
  console.log(JSON.stringify({fixture:'real source-loaded Character; exact before/after, not device FPS',compared,states:[...states],clips:clips.size,fkBefore:totals[0],fkAfter:totals[1],reduction:1-totals[1]/totals[0]}));
});
