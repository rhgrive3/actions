import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptMotionFkHotpath } from '../motion-fk-hotpath-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { sourceLoadedActorFixture } from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

const SOURCE_BANK_BEFORE = fs.readFileSync(new URL('./fixtures/source-bank-composed-before-direct-migration.mjs.txt', import.meta.url), 'utf8');
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
// Restore the original operations in an otherwise fully production-composed
// realm. Both sides load the real lossless packs and all other current patches.
export function baselineMotionSource(rel, raw) {
  let code = adaptBuildSource(rel, raw);
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code, '   // World transforms are evaluated after the remaining local blends.\n   if(stepAmplitude<1){', '   this.pose.fk();\n   if(stepAmplitude<1){', 'baseline pre-blend FK');
    code = replaceOnce(code, '    this.pose.mix(this.restGait,1-stepAmplitude);', '    this.pose.mix(this.restGait,1-stepAmplitude).fk();', 'baseline short-step FK');
    code = replaceOnce(code, '  // The pre-balance FK is still current unless transition changed local TRS.\n  if(transition<1)this.pose.fk();', '  this.pose.fk();', 'baseline final FK');
    code = replaceOnce(code, '.fk((sourceSampleFk(this),this._gaitFk));', '.fk();', 'baseline short-gait complete FK');
    for (const sample of ['special.name,special.frame,this.pose,false', 'clip,frame,this.tmp,true', 'name,frame,this.pose,undefined'])
      code = replaceOnce(code, `this.bank.sample(${sample},sourceSampleFk(this));`, `this.bank.sample(${sample});`, 'baseline complete sample FK');
  }
  // Both complete root-subtree updates at ground/pivot entry return.
  if (rel === 'src/game/motion/retarget.js') {
    assert.equal(code.split('  this._rootWorld();').length, 3, 'two root world entries');
    code = code.replaceAll('  this._rootWorld();', '  c.root.updateWorldMatrix(true,true);');
  }
  if (rel === 'src/game/motion/body-balance.js') code = replaceOnce(code,
    '  if(!this._soleCenter)this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);',
    '  this.center.fk();', 'baseline complete centre FK');
  // The pre-migration bank ignores FK ranges: every sample and fk() call is a
  // complete FK, the hint-free curve search and per-sample rotations return.
  if (rel === 'src/game/motion/source-bank.js') code = replaceOnce(SOURCE_BANK_BEFORE,
    '        e[0] *= x; e[4] *= x; e[8] *= x;\n        e[1] *= y; e[5] *= y; e[9] *= y;\n        e[2] *= z; e[6] *= z; e[10] *= z;',
    '        for (const k of [0, 4, 8]) e[k] *= x;\n        for (const k of [1, 5, 9]) e[k] *= y;\n        for (const k of [2, 6, 10]) e[k] *= z;', 'baseline scale compensation');
  return code;
}

test('motion optimization is guarded, composed and excluded from browser payloads', () => {
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/motion-fk-hotpath-adapter.mjs'));
  for (const rel of ['src/game/motion/source-controller.js', 'src/game/motion/body-balance.js']) {
    const raw = read(rel), next = adaptMotionFkHotpath(rel, raw, replaceOnce);
    assert.notEqual(next, raw);
    assert.doesNotThrow(() => new vm.SourceTextModule(adaptBuildSource(rel, raw)));
    assert.throws(() => adaptMotionFkHotpath(rel, next, replaceOnce), /conflict/);
    assert.throws(() => adaptMotionFkHotpath(rel, '', replaceOnce), /conflict/);
  }
  assert.equal(adaptMotionFkHotpath('src/game/actor.js', 'unchanged', replaceOnce), 'unchanged');
});


function countFkCalls(proto, onCall) {
  const original = proto.fk;
  proto.fk = function (...args) { onCall.call(this,...args); return original.apply(this, args); };
  return () => { proto.fk = original; };
}

test('FK instrumentation preserves the range; the old argument-dropping wrapper is rejected', () => {
  const proto = { fk(count) { return { receiver: this, count: count ?? 66 }; } };
  let calls = 0;
  const restore = countFkCalls(proto, () => { calls++; });
  for (const count of [16, 22, 30, true, undefined]) {
    const result = proto.fk(count);
    assert.equal(result.receiver, proto);
    assert.equal(result.count, count ?? 66, 'FK range reaches the original implementation');
  }
  assert.equal(calls, 5); restore();
  const original = proto.fk;
  proto.fk = function () { return original.call(this); };
  assert.throws(() => assert.equal(proto.fk(16).count, 16),
    /Expected values/, 'the previous wrapper masks ranged FK by silently evaluating every bone');
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


async function heldRollerReleaseParity(apis) {
  const actors = await Promise.all(apis.map(api => api.make()));
  const dt = 1 / 120, states = [], ranged = [0, 0];
  const restores = actors.map((a, k) => countFkCalls(a.character.sourceMotion.pose.constructor.prototype,
    count => { if (typeof count === 'number') ranged[k]++; }));
  let supportFrames = 0, maxGap = 0, release;
  try {
    actors.forEach((a, k) => {
      const ch = a.character; a.setWeapon('roller'); ch.onEvent = null;
      a.weaponRunner.reset(); ch.tr.fill(99); ch.root.position.set(0, 0, 0);
      ch.rootInit = false; ch.replant = true; a.pos.set(0, 0, 0); a.vel.set(0, 0, 0);
      a.grounded = true; a.ink = 100; apis[k].G.time = 0;
      states[k] = { form:'kid', grounded:true, speed:0, vy:0, firing:false,
        rolling:false, localMove:{x:0,z:0}, ink:1, hp:1 };
    });
    // Same natural settle, early landing and held-fire release recipe as the
    // 120Hz support boundary, now with both production source banks awaited.
    for (let i = 0; i < 180; i++) actors.forEach((a, k) => {
      apis[k].G.time += dt; a.character.update(dt, states[k]);
    });
    actors.forEach((a, k) => {
      const ch = a.character; ch.weapon.drumW = 0; ch.fidget = -1; ch.idleT = 0; ch.shufT = 99;
      states[k].grounded = a.grounded = false; apis[k].recordMovementLaunch(a);
      a.intent.move.set(0, 0, 1); a.weaponRunner.update(dt, {fire:true, firePressed:true});
    });
    for (let i = 0; i < 156; i++) {
      const fire = i * dt < 1.25;
      const rows = actors.map((a, k) => {
        const api = apis[k], ch = a.character, state = states[k], runner = a.weaponRunner;
        if (i === 40) { state.grounded = a.grounded = true; ch.trigger('land', 7.5); }
        if (i) runner.update(dt, {fire, firePressed:false});
        state.rolling = runner.rolling; state.firing = fire;
        state.speed = runner.rolling ? a.weapon.rollSpeed : 2; state.localMove = {x:0,z:1};
        ch.root.position.z += state.speed * dt; a.pos.copy(ch.root.position); a.vel.z = state.speed;
        api.G.time += dt; ch.update(dt, state); ch.root.updateMatrixWorld(true); ch.skeleton.update();
        const w = ch.weapon, d = w.def, advance = ch._s3RollerSupportAdvance;
        let gap = null;
        if (Number.isFinite(advance)) {
          const preferred = Math.max(0, (d.gripR.pos.z + d.fold.pivot.z) * .5 - d.gripL.pos.z) * .15 *
            (ch._s3RollerGripBlend || 0);
          assert.ok(advance >= 0 && advance <= preferred, `support stays on the admitted shaft segment: frame ${i}, side ${k}, advance ${advance}, preferred ${preferred}`);
          const hole = d.gripL.pos.clone().sub(d.handL.pos).applyQuaternion(d.handL.quat.clone().invert());
          const socket = d.gripL.pos.clone(); socket.z += advance;
          gap = ch.bones.handL.localToWorld(hole).distanceTo(w.off.localToWorld(socket));
          assert.ok(gap <= .0005, 'held and released left palm remains within native 0.5mm contact budget');
          const right = ch.bones.handR.getWorldPosition(new api.THREE.Vector3())
            .distanceTo(w.off.localToWorld(d.handR.pos.clone().add(new api.THREE.Vector3(0, 0, ch._s3RollerRightAdvance || 0))));
          assert.ok(right < .002, 'right hand retains its strict effective socket bound');
          if (k === 1) { supportFrames++; maxGap = Math.max(maxGap, gap); }
        }
        return { motion:motionSnapshot(ch), weapon:Array.from(w.off.matrixWorld.elements),
          drum:Array.from(w.drum.matrixWorld.elements), spin:[w.drumA,w.drumW],
          feedback:[ch.ikErrPre,ch.lReach], rolling:runner.rolling, contact:!!ch._s3RollerContactPose,
          advance, gap };
      });
      assert.deepEqual(rows[1], rows[0], '120Hz held Roller release frame ' + i);
      if (i === 150) {
        assert.equal(fire, false); assert.equal(rows[1].rolling, false);
        assert.equal(rows[1].contact, false); assert.ok(Number.isFinite(rows[1].advance));
        release = {frame:i, advance:rows[1].advance, gap:rows[1].gap};
      }
    }
    assert.ok(supportFrames > 0 && release, 'actual held support and first released support are both exercised');
    assert.ok(ranged[1] > 0, 'the optimized source bank receives real FK range arguments');
    console.log(JSON.stringify({fixture:'held Roller release with awaited source banks; no rendered-motion claim',
      hz:120, frames:156, supportFrames, maxGap, release, rangedCalls:ranged}));
  } finally { restores.forEach(f => f()); apis.forEach(api => api.reset()); }
}

test('real source motion preserves every frame at 30/60/120 Hz and irregular/paused ticks', async () => {
  const extraExports = "export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';";
  const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baselineMotionSource,random:()=>.4,extraExports}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports})]);
  await heldRollerReleaseParity(apis);
  const totals=[0,0], fkBoneTotals=[0,0], states=new Set(),clips=new Set();let compared=0;
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
    const counts=[0,0], fkBoneCounts=[0,0],restores=chars.map((ch,k)=>countFkCalls(
      ch.sourceMotion.pose.constructor.prototype,function(count=true){
        counts[k]++;
        // SourcePose.fk evaluates [0,count) on a parent-first bank. A ranged
        // call is not a complete FK pass; measure actual visited bones.
        const all=this.bank.bones.length;
        const evaluated=typeof count==='number'&&this.bank.parentsFirst
          ? Math.max(0,Math.min(all,Math.ceil(count))):all;
        fkBoneCounts[k]+=evaluated;
      }));
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
    totals.forEach((_,i)=>{totals[i]+=counts[i];fkBoneTotals[i]+=fkBoneCounts[i];});
  }
  assert.ok(states.has('move')&&states.has('idle')&&states.has('air'),JSON.stringify([...states]));
  assert.ok(clips.size>=8, 'real clip coverage');assert.ok(fkBoneTotals[1]<fkBoneTotals[0]*.95,`at least 5% fewer evaluated FK bones: before=${fkBoneTotals[0]}, after=${fkBoneTotals[1]}`);
  console.log(JSON.stringify({fixture:'real source-loaded Character; exact before/after, not device FPS',compared,states:[...states],clips:clips.size,fkBefore:totals[0],fkAfter:totals[1],fkBonesBefore:fkBoneTotals[0],fkBonesAfter:fkBoneTotals[1],reduction:1-fkBoneTotals[1]/fkBoneTotals[0],callReduction:1-totals[1]/totals[0]}));
});
