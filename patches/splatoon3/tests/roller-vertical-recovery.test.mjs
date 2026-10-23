import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVerticalRecoverySampler } from '../runtime/roller-vertical-recovery.mjs';
import { verticalRollerPose, VERTICAL_ROLLER_SWING, heavyRollerSwingEnd } from '../runtime/roller.mjs';
import { fixture } from './source-fixture.mjs';
import { nativeRollerGripGap } from './roller-support-contact.mjs';

const flat = p => [...p.anchor, ...p.rotation, p.weight, p.coil, p.whip];
const end = a => a.swingShape === 'heavy' ? heavyRollerSwingEnd(a.windup, a.interval) : a.interval;
const sampler = () => createVerticalRecoverySampler(verticalRollerPose, VERTICAL_ROLLER_SWING.ret, end);
const attack = () => ({ windup:31/60, interval:56/60, elapsed:0, holdRoll:false });

test('late landing / ZR destination changes retain position and velocity and finish on the original interval', () => {
  for (const [windup,interval,swingShape] of [[12,33,null],[31,56,null],[55,76,'heavy'],[42,63,null]])for (const held of [true, false]) {
    const a={...attack(),windup:windup/60,interval:interval/60,swingShape}, owner={}, read=sampler(), t=end(a)-4/60, h=1e-7;
    a.holdRoll=held; a.elapsed=t-h; const left=flat(read(owner,a));
    a.elapsed=t; const at=flat(read(owner,a)); a.holdRoll=!held;
    const switched=flat(read(owner,a));
    assert(at.every((v,i)=>Math.abs(v-switched[i])<1e-12),'no target jump at the same simulation time');
    a.elapsed=t+h; const right=flat(read(owner,a));
    assert(at.every((v,i)=>Math.abs((v-left[i])/h-(right[i]-v)/h)<.002),'C1 through the destination change');
    a.elapsed=end(a);
    assert.deepEqual(read(owner,a),verticalRollerPose(a.elapsed,a.windup,a.interval,swingShape,!held),'no duration extension');
  }
  const raw = [false,true].map(held=>flat(verticalRollerPose(52/60,31/60,56/60,null,held)));
  assert(Math.max(...raw[0].map((v,i)=>Math.abs(v-raw[1][i])))>.5,'original target switch exposes the regression');
});

test('unchanged holds are byte-identical; repeated interruption, rewind, new attack and explicit clear do not reuse offsets', () => {
  const read=sampler(), owner={}, a=attack();
  for (let i=0;i<56;i++) { a.elapsed=i/60; assert.deepEqual(read(owner,a),verticalRollerPose(a.elapsed,a.windup,a.interval)); }
  for (const [time,held] of [[48,true],[49,false],[50,true],[51,false]]) {
    a.elapsed=time/60; const before=flat(read(owner,a));a.holdRoll=held;
    assert.deepEqual(flat(read(owner,a)),before);
  }
  a.elapsed=0; assert.deepEqual(read(owner,a),verticalRollerPose(0,a.windup,a.interval));
  a.elapsed=49/60;a.holdRoll=true; read(owner,a);a.holdRoll=false;read(owner,a);
  read.clear(owner);
  assert.deepEqual(read(owner,a),verticalRollerPose(a.elapsed,a.windup,a.interval));
  assert.deepEqual(read(owner,{...a,holdRoll:true}),verticalRollerPose(a.elapsed,a.windup,a.interval,null,true));
});

let api;
async function production() { return api ??= await fixture({ fullRuntime:true,productionComposition:true,includeCharacter:true,
  realProjectiles:true, vmMathRandom:()=>.4, extraExports:"export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';" }); }
function rig(f,id) {
  const {G,THREE}=f;G.scene=new THREE.Scene();
  G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-30,-.5,-30],max:[30,0,30]}]});G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);
  const a=new f.Actor({team:0,name:'vertical recovery regression',isLocal:true,weapon:id,CharacterClass:f.Character,
    style:{hair:0,skin:2,outfit:0,eyes:0}}),c=a.character;
  c.actor=a;c.onEvent=null;G.actors=[a];G.scene.add(c.root);a.pos.set(0,0,0);a.grounded=a.ground.hit=true;
  // Admit the real catalogue runner before its first swing; its pose observer
  // must see swingCount=0 rather than joining an already started attack.
  for(let i=0;i<100;i++){a.weaponRunner.update(1/60,{fire:false});a._finishFrame(1/60);}
  return {a,c,close(){c.dispose();G.actors=[];G.scene=null;}};
}

test('production pose hook prevents the old late recovery jump in both directions, before the native arm IK', async () => {
  const f=await production(),{a,c,close}=rig(f,'roller'), C=f.CHARACTER_CHANNELS;
  try {
    for(const held of [false,true]) {
      const s={...attack(),vertical:true,released:true,rolling:false,holdRoll:held,elapsed:52/60};c.s3RollerFlick=s;
      const base=c.P.slice(), before=base.slice(),after=base.slice();
      c._poseFlick(before,0);s.holdRoll=!held;c._poseFlick(after,0);
      for(const k of [C.ANC,C.ANCR,C.IKR,C.IKL,C.SPINE,C.CHEST])
        assert(Math.abs(before[k]-after[k])<1e-6,'same-time destination switch must not teleport presentation channel '+k);
      assert.equal(a.weaponRunner.flick,-1,'pose read never starts gameplay');
    }
  } finally {close();}
});

test('real per-weapon recovery, landing, held/released edges, reset and restart retain finite native grips at 30/60/120Hz', async () => {
  const f=await production(), traces=[];
  for(const id of ['roller','s3-roller-compact','s3-roller-heavy','s3-roller-hunter'])for(const hz of [30,60,120]) {
    const r=rig(f,id),{a,c}=r,clock=new f.FixedClock(),rows=[];let tick=0;
    try {
      f.recordMovementLaunch(a);
      for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,dt=>{
        const first=tick===0, restart=tick===95;
        if(restart){a.weaponRunner.reset();f.recordMovementLaunch(a);}
        a.pos.set(0,tick<70||tick>=95?2:0,0);a.grounded=tick>=70&&tick<95;a.vel.set(0,0,0);
        const held=tick<77||tick>=95; a.intent.fire=held;
        a.weaponRunner.update(dt,{fire:held,firePressed:first||restart});f.G.time+=dt;a._finishFrame(dt);c.root.updateMatrixWorld(true);
        assert(Array.from(c.P).every(Number.isFinite),'finite full pose');
        assert(nativeRollerGripGap(c,f.THREE,'handR',f.CHARACTER_CHANNELS)<.002,'right grip');
        assert(nativeRollerGripGap(c,f.THREE,'handL',f.CHARACTER_CHANNELS)<.02,'support grip');
        rows.push({pose:Array.from(c.P),cooldown:a.weaponRunner.cooldown,ink:a.ink,
          flick:a.weaponRunner.flick,rolling:a.weaponRunner.rolling,
          attack:c.s3RollerFlick?{windup:c.s3RollerFlick.windup,interval:c.s3RollerFlick.interval,elapsed:c.s3RollerFlick.elapsed}:null});
        tick++;
      });
      assert.equal(tick,120);traces.push({id,hz,rows});
    }finally{r.close();}
  }
  for(const id of new Set(traces.map(x=>x.id))){const set=traces.filter(x=>x.id===id);assert.deepEqual(set[0].rows,set[1].rows);assert.deepEqual(set[1].rows,set[2].rows);}
  if(process.env.INKWAVE_ROLLER_RECOVERY_TRACE)fs.writeFileSync(process.env.INKWAVE_ROLLER_RECOVERY_TRACE,JSON.stringify(traces));
  const windups=traces.filter(x=>x.hz===60).map(x=>x.rows.find(r=>r.attack)?.attack.windup);
  assert(new Set(windups).size>=3,'Carbon, ordinary, Dynamo and Flingza keep their own source clocks');
});
