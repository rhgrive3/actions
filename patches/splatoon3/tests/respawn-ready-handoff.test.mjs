import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {prepareSpawn, launchSpawn, installDryFloor, spawnOwnerRow, assertReady} from './respawn-spawn-owner-fixture.mjs';

let cached;
const fixture = () => cached ??= sourceLoadedActorFixture({random: () => .314159, extraExports: `
  export {spawnMotionAllowsAction, spawnPoseSnapshot} from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
  export {ROLLER_POSE} from './patches/splatoon3/runtime/roller.mjs';
  export {weaponHandoffSnapshot, HANDOFF_FADE} from './patches/splatoon3/runtime/weapon-handoff-motion.mjs';
`});
const rotation = (f, c) => c.weapon.pivot.getWorldQuaternion(new f.THREE.Quaternion());
function touchdown(f, a, dt) {
  for (let i = 0; i < 300 && a.s3.squidSpawn; i++) f.tick(a, dt);
  assert.equal(a.s3.squidSpawn, undefined);
  assert.equal(a.grounded, true);
  assert.equal(a.ground.hit, true);
}
function nativeRow(f, a) {
  const c = a.character;
  return JSON.parse(JSON.stringify({
    ...spawnOwnerRow(f, a),
    muzzle: c.getMuzzle(new f.THREE.Vector3()).toArray(),
    channels: Array.from(c.P),
    projectiles: f.G.projectiles.list.map(p => ({pos:p.pos?.toArray(), vel:p.vel?.toArray(), age:p.age, life:p.life, damage:p.damage})),
  }));
}

test('native respawn ready handoff starts immediately without a one-tick half-turn, at 30/60/120 Hz', async () => {
  const f = await fixture();
  for (const hz of [30, 60, 120]) {
    const dt = 1/hz, a = await prepareSpawn(f), c = a.character;
    launchSpawn(f, a); touchdown(f, a, dt);
    const before = rotation(f, c);
    f.tick(a, dt);
    const first = rotation(f, c), degrees = before.angleTo(first)*180/Math.PI;
    assert(degrees > .01, 'display starts moving immediately, rather than holding the old carry');
    assert(degrees < 45*60/hz, `${hz}Hz first ready step ${degrees} degrees`);
    assert(f.weaponHandoffSnapshot(c).weight > .1, 'existing bounded display fade is active');
    assertReady(f, c); // canonical ready/action is immediate, display only is faded
    assert.equal(f.spawnMotionAllowsAction(c, false), true);
    assert(c.tr[f.CHARACTER_TIMERS.T_SPAWN] < 1.4);
    for (let i=0; i<Math.ceil(f.HANDOFF_FADE/dt)+2; i++) {
      f.tick(a, dt);assertReady(f, c);
      assert.equal(a.ink,100);assert.equal(a.stats.turf,0);assert.equal(f.G.projectiles.list.length,0);
      assert.equal(a.weaponRunner.rolling,false);assert.equal(a.weaponRunner.flick,-1);
    }
    assert.equal(f.weaponHandoffSnapshot(c).weight, 0, 'settles within existing .2s return plus frame rounding');
  }
});

test('display fade preserves every canonical channel, gameplay muzzle, native state and real shot trajectory', async () => {
  const f = await fixture();
  async function run(enabled, attackAt, held=false) {
    const a=await prepareSpawn(f),c=a.character;c.s3WeaponHandoffEnabled=enabled;
    const paint=[];f.G.paint.splat=(...args)=>{paint.push(JSON.parse(JSON.stringify(args,(_key,value)=>value===a?'owner':value)));return 0;};
    launchSpawn(f,a);if(held)a.intent.fire=true;touchdown(f,a,1/60);
    const rows=[], snapshots=[];
    for(let i=0;i<90;i++){
      if(i===attackAt)a.intent.fire=true;
      // Include actual moving contact paint after the stationary landing and
      // attack window; a stationary held drum need not issue a new stripe.
      if(i===45&&attackAt>=0)a.intent.move.set(0,0,1);
      f.tick(a);f.G.projectiles.update(1/60);rows.push({...nativeRow(f,a),paint:JSON.parse(JSON.stringify(paint))});snapshots.push(f.weaponHandoffSnapshot(c));
      if(enabled&&(held||i>=attackAt)&&attackAt>=0)assert.equal(snapshots.at(-1).weight,0,'attack pose has immediate priority over spawn display fade');
    }
    return {rows,snapshots};
  }
  for(const [at,held] of [[-1,false],[0,false],[2,false],[5,false],[0,true]]){
    const raw=await run(false,at,held),shown=await run(true,at,held);
    assert.equal(shown.rows.length,raw.rows.length);
    for(let i=0;i<raw.rows.length;i++)for(const key of Object.keys(raw.rows[i]))assert.deepEqual(shown.rows[i][key],raw.rows[i][key],`attackAt=${at} held=${held} frame=${i} ${key}: exact canonical/gameplay output`);
    if(at>0)assert(shown.snapshots.slice(0,at).some(s=>s.weight>0));
    if(at>=0)assert(shown.rows.some(r=>r.rolling||r.projectiles.length>0),'intentional attack is actually admitted');
    if(at>=0&&!held)assert(shown.rows.some(r=>r.projectiles.length>0),'a fresh flick emits actual native projectiles');
    if(at>=0)assert(shown.rows.at(-1).paint.length>0,`intentional attack/moving contact makes native paint calls (at=${at}, held=${held})`);
  }
});

test('missed support retains native spawn ownership, then fades only after actual supported touchdown', async () => {
  const f=await fixture(),a=await prepareSpawn(f),c=a.character;
  launchSpawn(f,a);installDryFloor(f,-8);let retiredAir=0;
  for(let i=0;i<300&&a.s3.squidSpawn;i++){
    f.tick(a);
    if(a.s3.squidSpawn?.phase==='landing'){
      assert.equal(f.spawnMotionAllowsAction(c,true),false);
      assert.equal(f.weaponHandoffSnapshot(c).weight,0);
      if(f.spawnPoseSnapshot(c).phase==='off')retiredAir++;
    }
  }
  assert(retiredAir>0);assert.equal(a.grounded,true);assert.equal(a.pos.y,-8);
  f.tick(a);assertReady(f,c);assert.equal(f.spawnMotionAllowsAction(c,false),true);
  assert(f.weaponHandoffSnapshot(c).weight>0);
  assert.equal(a.ink,100);assert.equal(a.stats.turf,0);assert.equal(f.G.projectiles.list.length,0);
});

test('ordinary jump and weapon/life reuse cannot inherit a spawn display transition', async () => {
  const f=await fixture(),a=await prepareSpawn(f),c=a.character;
  launchSpawn(f,a);touchdown(f,a,1/60);f.tick(a);
  assert(f.weaponHandoffSnapshot(c).weight>0);
  a.intent.jump=true;f.tick(a);assert.equal(f.weaponHandoffSnapshot(c).weight,0);
  a.intent.jump=false;for(let i=0;i<100;i++)f.tick(a);
  assert.equal(f.weaponHandoffSnapshot(c).weight,0);
  a.setWeapon('shooter');a.setWeapon('roller');f.tick(a);
  assert.equal(f.weaponHandoffSnapshot(c).weight,0);
  a.reset();f.tick(a);assert.equal(f.weaponHandoffSnapshot(c).weight,0);
  f.reset();assert.equal(f.weaponHandoffSnapshot(c),null);
});

test('direct remote post-touchdown presentation uses the same display return without proxy attacks', async () => {
  const f=await fixture(),a=await prepareSpawn(f),c=a.character;
  launchSpawn(f,a);touchdown(f,a,1/60);
  // Real supported native touchdown, then the existing sampled-remote pose
  // entry point. This exercises representation, not transport or authority.
  a.remote=true;a._finishFrame(1/60);
  assertReady(f,c);assert.equal(f.spawnMotionAllowsAction(c,false),true);
  assert(f.weaponHandoffSnapshot(c).weight>0);
  assert.equal(a.ink,100);assert.equal(a.stats.turf,0);assert.equal(f.G.projectiles.list.length,0);
  c.setVisible(false);c.setWeapon('shooter');c.setWeapon('roller');c.setVisible(true);
  a._finishFrame(1/60);assert.equal(f.weaponHandoffSnapshot(c).weight,0);
});
