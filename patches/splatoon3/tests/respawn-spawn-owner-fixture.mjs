import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
export const spawnOwnerFixture = options => sourceLoadedActorFixture({
  ...options,
  extraExports: `
    export { spawnMotionAllowsAction, spawnPoseSnapshot } from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
    export { ROLLER_POSE } from './patches/splatoon3/runtime/roller.mjs';
  `,
});
export function installDryFloor(f,y=0){
  const level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
    spawnPads:[[0,0,0],[0,0,20]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-100,y-.5,-100],max:[100,y,100]}]});
  f.G.level=level;f.G.physics=new f.Physics(level);
}
export async function prepareSpawn(f){
  f.reset();installDryFloor(f);f.G.time=0;
  f.G.match={mode:'turf',opts:{},state:'playing',playing:()=>true,canRespawn:()=>true};
  const a=await f.make();a.setWeapon('roller');a.slot=0;a.splat(null);
  for(let i=0;i<900&&!a.alive;i++)f.tick(a);
  assert.equal(a.s3.squidSpawn?.phase,'aim');
  return a;
}
export function launchSpawn(f,a){
  a.intent.fire=false;f.tick(a);a.intent.fire=true;f.tick(a);a.intent.fire=false;
  assert.equal(a.s3.squidSpawn?.phase,'flight');
}
export function spawnOwnerRow(f,a){
  const c=a.character,C=f.CHARACTER_CHANNELS,T=f.CHARACTER_TIMERS;
  return {time:f.G.time,position:a.pos.toArray(),velocity:a.vel.toArray(),alive:a.alive,
    grounded:a.grounded,groundHit:a.ground.hit,form:a.form,
    spawn:a.s3.squidSpawn?JSON.parse(JSON.stringify(a.s3.squidSpawn)):null,
    spawnTime:c.tr[T.T_SPAWN],landTime:c.tr[T.T_LAND],
    invuln:a.invuln===Infinity?'Infinity':a.invuln,armor:a.s3.spawnArmor?{...a.s3.spawnArmor}:null,
    fire:a.intent.fire,previous:a._prevIntent.fire,physical:a.s3.physicalRespawnHeld??null,
    ink:a.ink,turf:a.stats.turf,rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick,
    projectiles:f.G.projectiles.list.length,pose:f.spawnPoseSnapshot(c),
    eligible:f.spawnMotionAllowsAction(c,c.tr[T.T_SPAWN]>=1.4),
    anchor:Array.from(c.P.slice(C.ANC,C.ANC+3)),rotation:Array.from(c.P.slice(C.ANCR,C.ANCR+3))};
}
export function assertReady(f,c){
  const C=f.CHARACTER_CHANNELS;
  for(const [channel,expected] of [['ANC',f.ROLLER_POSE.READY_ANCHOR],['ANCR',f.ROLLER_POSE.READY_ROTATION]])
    for(let i=0;i<3;i++)assert.ok(Math.abs(c.P[C[channel]+i]-expected[i])<1e-6,channel+' ready target');
}
