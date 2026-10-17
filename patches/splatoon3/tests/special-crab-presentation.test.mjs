import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

let cached;
async function boot() {
  if (cached) return cached;
  const f = await fixture({ fullRuntime: true, realProjectiles: true, includeCharacter: true, productionComposition: true,
    extraExports: "export * from './patches/splatoon3/runtime/crab-tank-aim.mjs'; export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';" });
  f.G.scene = new f.THREE.Scene(); f.G.settings = { quality: 'high' }; f.G.mode = 'match'; f.G.match.state = 'playing';
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  return cached = f;
}
function rig(f) {
  const a = new f.Actor({ team: 0, name: 'Crab presentation', weapon: 'shooter', CharacterClass: f.Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.grounded = a.ground.hit = true; a.character.actor = a; a.character.onEvent = null;
  a.pos.set(3, 2, -4); a.aimPoint.copy(a.pos); a.yaw = -0.8;
  f.G.actors.push(a); f.G.scene.add(a.character.root);
  const step = (dt = 1 / 60) => { f.G.time += dt; a._finishFrame(dt); a.character.root.updateWorldMatrix(true, true); };
  for (let i = 0; i < 30; i++) step();
  a.weapon = { ...a.weapon, special: 'crabTank', specialCost: 100 };
  a.specialActive = { id: 'crabTank', phase: 'active', t: 0 }; step();
  const d = a.character.s3SpecialDevices().find(x => x.spec.crab);
  return { a, ch: a.character, d, step, close() { a.specialActive = null; step(); a.character.dispose(); f.G.actors = f.G.actors.filter(x => x !== a); } };
}
function aim(a, yaw, pitch) {
  a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  // Deliberately leave the legacy scalar aim fields stale: the actual vector
  // must drive the barrels even during body turning and remote interpolation.
  a.aimYaw = 0; a.aimPitch = 0;
}
function socket(f, d, mode) {
  const gun = f.CRAB_TANK_RIG[mode], part = d.model.groups[gun.group];
  const point = new f.THREE.Vector3(...gun.muzzle).sub(new f.THREE.Vector3(...gun.pivot));
  return part.localToWorld(point);
}
function axis(f, d, mode) {
  return new f.THREE.Vector3(0, 0, 1).applyQuaternion(d.model.groups[f.CRAB_TANK_RIG[mode].group].getWorldQuaternion(new f.THREE.Quaternion()));
}
function closeVector(actual, expected, message) { assert.ok(actual.distanceTo(expected) < 1e-8, `${message}: ${actual.toArray()} vs ${expected.toArray()}`); }

test('production Crab gun pivots and model sockets follow all four headings and both pitch signs', async () => {
  const f = await boot(), r = rig(f);
  try {
    assert.equal(r.d.holder.parent, r.ch.root, 'chassis is independent of the animated kid pose');
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const pitch of [-1.2, 0, 1.2]) {
      aim(r.a, yaw, pitch); r.step();
      for (const mode of ['shooter', 'cannon']) {
        closeVector(axis(f, r.d, mode), r.a.aimDir, `${mode} bore follows current aim vector`);
        closeVector(socket(f, r.d, mode), f.crabTankMuzzle(r.a, mode, new f.THREE.Vector3()), `${mode} mesh and shared neutral socket agree`);
      }
    }
  } finally { r.close(); }
});

test('crosshair convergence uses each actual muzzle, including height and lateral offset', async () => {
  const f = await boot(), r = rig(f);
  try {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const pitch of [-0.65, 0, 0.65]) {
      aim(r.a, yaw, pitch);
      r.a.aimPoint.copy(r.a.pos).add(new f.THREE.Vector3(0, 1.3, 0)).addScaledVector(r.a.aimDir, 12);
      r.step();
      for (const mode of ['shooter', 'cannon']) {
        const origin = new f.THREE.Vector3(), dir = new f.THREE.Vector3();
        f.crabTankShotGeometry(r.a, mode, origin, dir);
        closeVector(origin, socket(f, r.d, mode), 'corrected socket remains on the model');
        closeVector(dir, axis(f, r.d, mode), 'corrected launch axis remains on the bore');
        closeVector(dir, r.a.aimPoint.clone().sub(origin).normalize(), 'target is measured from muzzle');
      }
      closeVector(f.crabTankAimDirection(r.a, new f.THREE.Vector3()), r.a.aimDir, 'unconverged aim preserves current pitch');
    }
    r.a.aimPoint.copy(r.a.pos).addScaledVector(r.a.aimDir, -20); r.step();
    closeVector(axis(f, r.d, 'shooter'), r.a.aimDir, 'a stale target behind the gun cannot reverse aim');
  } finally { r.close(); }
});

test('cannon socket remains on the authored pod surface rather than a guessed actor-height origin', async () => {
  const f = await boot(), r = rig(f);
  try {
    const gun = r.d.model.groups.clawR, skin = gun.children.find(m => m.userData.s3Finish === 'yellow');
    const muzzle = socket(f, r.d, 'cannon'), forward = axis(f, r.d, 'cannon');
    const hit = new f.THREE.Raycaster(muzzle.clone().add(forward), forward.clone().negate()).intersectObject(skin)[0];
    assert.ok(hit, 'ray reaches closed pod front surface');
    assert.ok(hit.point.distanceTo(muzzle) < 1e-7, 'shared cannon socket is the actual existing surface sample');
  } finally { r.close(); }
});

test('pilot step smoothing cannot separate the live model muzzle from its physical launch socket', async () => {
  const f = await boot(), r = rig(f);
  try {
    r.a.smoothY = .2; r.a.smoothYV = 0; r.step(0);
    assert.equal(r.ch.root.position.y, r.a.pos.y + .2, 'native pilot root still uses its step smoothing');
    for (const mode of ['shooter', 'cannon']) closeVector(socket(f, r.d, mode), f.crabTankMuzzle(r.a, mode, new f.THREE.Vector3()), mode + ' stays on the physical shared socket');
  } finally { r.a.smoothY = 0; r.close(); }
});

test('accepted shooter and cannon marks recoil their own barrel along its bore at 30/60/120 Hz', async () => {
  const f = await boot();
  for (const hz of [30, 60, 120]) {
    const r = rig(f);
    try {
      aim(r.a, Math.PI / 2, -0.5); r.step();
      for (const mode of ['shooter', 'cannon']) {
        r.a._s3SpecialMarks = {}; r.step();
        const before = socket(f, r.d, mode), other = mode === 'shooter' ? 'cannon' : 'shooter', otherBefore = socket(f, r.d, other);
        const clock = r.a.specialActive.t, position = r.a.pos.clone();
        const mark = mode === 'shooter' ? 'shot' : 'cannon';
        r.a._s3SpecialMarks[mark] = f.G.time; r.step(0);
        const retract = before.clone().sub(socket(f, r.d, mode));
        assert.ok(retract.dot(r.a.aimDir) > 0, `${mode} retracts immediately on its emission mark`);
        closeVector(retract.clone().normalize(), r.a.aimDir, 'recoil follows bore at side yaw and negative pitch');
        closeVector(socket(f, r.d, other), otherBefore, 'other gun stays independent');
        const paused = socket(f, r.d, mode); r.step(0); closeVector(socket(f, r.d, mode), paused, 'paused updates do not advance recoil');
        r.step(1 / hz); assert.ok(before.distanceTo(socket(f, r.d, mode)) < retract.length(), 'recoil recovers with elapsed time');
        assert.equal(r.a.specialActive.t, clock); closeVector(r.a.pos, position, 'presentation cannot move actor');
      }
    } finally { r.close(); }
  }
});

test('ball transition hides the live rig and cancellation removes the root-mounted chassis', async () => {
  const f = await boot(), r = rig(f);
  try {
    r.a.specialActive.pose = 'ball'; r.step(); assert.equal(r.d.holder.visible, false);
    r.a.specialActive.pose = 'tank'; aim(r.a, Math.PI, 0.5); r.step(); assert.equal(r.d.holder.visible, true);
    closeVector(axis(f, r.d, 'cannon'), r.a.aimDir, 'returning from ball uses current aim');
    r.a.specialActive = null; r.step(); assert.equal(r.d.holder.parent, null); assert.equal(r.ch.s3SpecialDevices(), null);
  } finally { r.close(); }
});

test('actual accepted emissions animate recoil with the optional FX system absent', async () => {
  const f = await boot(), r = rig(f);
  try {
    f.G.fx = null; r.a.specialActive = null; r.step();
    r.a._integrate = () => {}; // This focused emission check has fixture physics; the browser harness retains real Physics.
    r.a.special = 100; r.a._startSpecial();
    for (let i = 0; i < 20; i++) { f.G.time += 1 / 60; r.a._updateSpecial(1 / 60); }
    r.a.intent.fire = true; f.G.time += 1 / 60; r.a._updateSpecial(1 / 60); r.step(0);
    const d = r.ch.s3SpecialDevices().find(x => x.spec.crab), gun = d.model.groups.clawL;
    assert.equal(r.a._s3SpecialMarks.shot, f.G.time, 'mark comes from gameplay emission even without FX');
    assert.ok(gun.position.distanceTo(gun.userData.rest) > 0, 'accepted emission immediately retracts shooter');
    assert.ok(f.G.projectiles.list.some(p => p.owner === r.a && p.s3AllSpecialMode === 'shooter'), 'native projectile was emitted');
  } finally { f.G.projectiles.clear(); r.close(); }
});

test('accepted remote replay drives recoil without FX while duplicates and invalid events do not',async()=>{
  const f=await boot(),r=rig(f);
  try{
    r.a.remote=true;f.G.fx=null;
    const event={actor:r.a,id:'crabTank',activation:1,action:'shot',pos:r.a.pos.toArray(),seed:1};
    f.G.time+=1;assert.equal(f.replaySpecial(f.installedRuntime,event),true);r.step(0);
    const mark=r.a._s3SpecialMarks.shot;
    assert.ok(r.d.model.groups.clawL.position.distanceTo(r.d.model.groups.clawL.userData.rest)>0);
    f.G.time+=1;assert.equal(f.replaySpecial(f.installedRuntime,event),false);
    assert.equal(f.replaySpecial(f.installedRuntime,{...event,seed:NaN}),false);
    assert.equal(r.a._s3SpecialMarks.shot,mark,'rejected replay cannot restart recoil');
    assert.equal(f.replaySpecial(f.installedRuntime,{...event,action:'cannon',seed:2}),true);r.step(0);
    assert.ok(r.d.model.groups.clawR.position.distanceTo(r.d.model.groups.clawR.userData.rest)>0);
  }finally{r.close();}
});
